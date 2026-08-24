/**
 * Customer 360 — CRITICAL OVERRIDE ENGINE  (Phase 3)
 * ==================================================
 * The weighted health score must not be the only mechanism determining urgency.
 * These rules run as a distinct step and set a FLOOR on the priority level:
 *
 *     level = max( levelFromScore(score), overrideFloor )      P0 > P1 > P2 > P3
 *
 * A floor, never an assignment. A P1 override on an account whose scored
 * priority is already P0 leaves it at P0 — overrides can only raise urgency.
 * Getting this backwards would mean a cancellation request DEMOTING an account
 * that was already screaming.
 *
 * Every rule is a named function with its own test, and every fired rule
 * records why and from where:
 *
 *     P0 OVERRIDE
 *     Reason:  Customer explicitly requested cancellation.
 *     Source:  Email — Aug 20, 2026
 *
 * A rule that fires without a reason and a source record is a defect, because
 * Phase 7 promised the user they could always ask "why?" and get an answer that
 * ends at a real record.
 *
 * Rules whose source is not tracked yet report themselves UNAVAILABLE rather
 * than never firing silently — an override that can never fire looks identical
 * to an override that never needed to.
 *
 * Pure: `asOf` injected.
 */

"use strict";

C360.overrides = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig.priority; }
    function ev() { return C360.evidence; }

    /**
     * @param {object} spec
     * @returns {object} an override result. `fired: false` still carries the
     *          rule name, so the Phase 7 drawer can show what was evaluated and
     *          not just what triggered.
     */
    function result(rule, spec) {
        var s = spec || {};
        return {
            rule: rule,
            level: s.level || null,
            fired: s.fired === true,
            /** true when the rule could not be evaluated for want of a source. */
            unavailable: s.unavailable === true,
            reason: s.reason || null,
            source: s.source || null,
            evidence: util.list(s.evidence)
        };
    }

    function notFired(rule) {
        return result(rule, { fired: false });
    }

    /** Source descriptor for the "Source: Email — Aug 20, 2026" line. */
    function sourceFrom(evidence) {
        if (!evidence) { return null; }
        return {
            type: evidence.type,
            id: evidence.id,
            date: evidence.date,
            excerpt: evidence.excerpt || null,
            label: evidence.sourceLabel || null
        };
    }

    /**
     * Fire a rule from the first of a set of text-detection hits.
     * Shared by the five detection-driven P0 rules.
     */
    function fireFromDetection(rule, level, hits, reason) {
        if (!hits.length) { return notFired(rule); }
        var first = hits[0];
        return result(rule, {
            fired: true,
            level: level,
            reason: reason,
            source: sourceFrom(first.evidence),
            evidence: hits.map(function (hit) { return hit.evidence; })
        });
    }

    // =================================================================
    // P0 — Immediate
    // =================================================================

    var RULES = {

        /**
         * An explicit cancellation request. The strongest signal in the
         * product, and the one most worth a false positive: missing a real
         * cancellation costs an account, while a false one costs a phone call.
         */
        explicitCancellationRequest: function (ctx) {
            var hits = C360.detect.withProposals(
                C360.detect.inBundle(ctx.bundle, "cancellation", { type: "communication" }),
                ctx.proposals, "cancellation");

            // A contract record flagging the request is stronger than any
            // keyword match and is treated as a hit in its own right.
            var contract = ctx.bundle.contract;
            if (contract && contract.cancellationRequested === true) {
                hits = hits.concat([{
                    evidence: ev().make({
                        label: "Contract record flags a cancellation request",
                        type: "contract",
                        id: contract.id || "contract",
                        date: contract.cancellationRequestedDate || null,
                        source: "internal",
                        sourceLabel: "Contract",
                        mock: contract.mock === true
                    })
                }]);
            }

            return fireFromDetection("explicitCancellationRequest", "P0", hits,
                "Customer explicitly requested cancellation.");
        },

        /**
         * A competitor-switch request. This pattern set is the known weak spot
         * in the product — "we are evaluating our routes" matches it — so the
         * excerpt travels with the override and Phase 9's per-rule
         * false-positive rate is what tunes it.
         */
        explicitCompetitorSwitch: function (ctx) {
            var hits = C360.detect.withProposals(
                C360.detect.inBundle(ctx.bundle, "competitorSwitch", { type: "communication" }),
                ctx.proposals, "competitorSwitch");
            return fireFromDetection("explicitCompetitorSwitch", "P0", hits,
                "Customer referenced switching to a competitor or running an evaluation.");
        },

        safetyCritical: function (ctx) {
            var hits = C360.detect.withProposals(
                C360.detect.inBundle(ctx.bundle, "safety", { type: "ticket" }),
                ctx.proposals, "safety");

            // Only unresolved safety matters for urgency. A collision reviewed
            // and closed last quarter is history, not an emergency.
            var live = hits.filter(function (hit) {
                var record = hit.record;
                if (!record) { return true; }
                if (record.isOpen === false) { return false; }
                if (record.state === "RESOLVED") { return false; }
                return true;
            });

            return fireFromDetection("safetyCritical", "P0", live,
                "A safety-critical issue is recorded and unresolved.");
        },

        hosComplianceCritical: function (ctx) {
            var hits = C360.detect.withProposals(
                C360.detect.inBundle(ctx.bundle, "hosCompliance", { type: "ticket" }),
                ctx.proposals, "hosCompliance");
            var live = hits.filter(function (hit) {
                return !hit.record || hit.record.isOpen !== false;
            });
            return fireFromDetection("hosComplianceCritical", "P0", live,
                "An HOS or compliance-critical problem is recorded and unresolved.");
        },

        executiveEscalation: function (ctx) {
            var hits = C360.detect.withProposals(
                C360.detect.inBundle(ctx.bundle, "executiveEscalation", { type: "communication" }),
                ctx.proposals, "executiveEscalation");
            return fireFromDetection("executiveEscalation", "P0", hits,
                "An executive escalation is recorded on this account.");
        },

        serviceOutage: function (ctx) {
            var hits = C360.detect.withProposals(
                C360.detect.inBundle(ctx.bundle, "outage", { type: "ticket" }),
                ctx.proposals, "outage");
            var live = hits.filter(function (hit) {
                return !hit.record || hit.record.isOpen !== false;
            });
            return fireFromDetection("serviceOutage", "P0", live,
                "A service outage is recorded and unresolved.");
        },

        // =================================================================
        // P1 — High
        // =================================================================

        /**
         * A critical ticket past its SLA. SLA hours come from
         * `priority.slaHours` per severity, never a literal.
         */
        criticalTicketBeyondSla: function (ctx) {
            var slaHours = cfg().slaHours;

            var breached = util.list(ctx.bundle.tickets).filter(function (ticket) {
                if (!ticket.isOpen) { return false; }
                var severity = String(ticket.priority || "").toLowerCase();
                var limit = slaHours[severity];
                if (limit === undefined) { return false; }
                var age = util.daysAgo(ticket.opened, ctx.asOf);
                return age !== null && (age * 24) > limit;
            });

            if (!breached.length) { return notFired("criticalTicketBeyondSla"); }

            // Worst first, so the reason names the ticket that matters.
            breached.sort(function (a, b) {
                var order = { critical: 0, high: 1, medium: 2, low: 3 };
                var sa = order[String(a.priority || "").toLowerCase()];
                var sb = order[String(b.priority || "").toLowerCase()];
                if (sa === undefined) { sa = 9; }
                if (sb === undefined) { sb = 9; }
                return sa - sb;
            });

            var worst = breached[0];
            var age = util.daysAgo(worst.opened, ctx.asOf);
            var limitHours = slaHours[String(worst.priority || "").toLowerCase()];

            var rows = breached.map(function (ticket) {
                return ev().make({
                    label: "Ticket " + ticket.number + " — " + (ticket.subject || "no subject")
                         + " (" + (ticket.priority || "priority not recorded") + ")",
                    type: "ticket",
                    id: ticket.id,
                    date: ticket.opened,
                    url: ticket.url,
                    source: "internal",
                    sourceLabel: ticket.sourceLabel,
                    mock: ticket.mock
                });
            });

            return result("criticalTicketBeyondSla", {
                fired: true,
                level: "P1",
                reason: util.humanize(String(worst.priority || "Open").toLowerCase())
                      + " ticket " + worst.number + " has been open " + age
                      + " days against a " + limitHours + "-hour SLA.",
                source: sourceFrom(rows[0]),
                evidence: rows
            });
        },

        /**
         * Renewal inside the SEGMENT's window, with at least one negative
         * signal. Both halves are required.
         *
         * "Negative signals" is an enumerated list in
         * `priority.negativeSignalKeys` — deliberately NOT "health is low".
         * Reading health here would recouple the two scores and quietly undo
         * the entire point of Phase 3.
         */
        renewalWindowWithNegativeSignals: function (ctx) {
            var contract = ctx.bundle.contract;
            if (!contract || !contract.renewalDate) {
                return result("renewalWindowWithNegativeSignals", {
                    fired: false,
                    unavailable: true,
                    reason: "No contract or renewal date is recorded for this account."
                });
            }

            var window = ctx.segment && ctx.segment.rules
                ? ctx.segment.rules.renewalWindowDays : null;
            if (window === null || window === undefined) {
                return notFired("renewalWindowWithNegativeSignals");
            }

            var renewalIn = C360.segments.daysUntil(contract.renewalDate, ctx.asOf);
            if (renewalIn === null || renewalIn < 0 || renewalIn > window) {
                return notFired("renewalWindowWithNegativeSignals");
            }

            var negativeKeys = util.list(cfg().negativeSignalKeys);
            var negatives = util.list(ctx.signals).filter(function (signal) {
                return negativeKeys.indexOf(signal.key) !== -1;
            });

            if (!negatives.length) { return notFired("renewalWindowWithNegativeSignals"); }

            var rows = [ev().make({
                label: "Renewal date " + util.formatDate(contract.renewalDate),
                type: "renewal",
                id: (contract.id || "contract") + "-renewal",
                date: contract.renewalDate,
                source: "internal",
                sourceLabel: "Contract",
                mock: contract.mock === true
            })].concat(negatives.reduce(function (all, signal) {
                return all.concat(ev().fromFacts(signal.evidence));
            }, []));

            return result("renewalWindowWithNegativeSignals", {
                fired: true,
                level: "P1",
                reason: "Renewal in " + renewalIn + " days (" + ctx.segment.segmentLabel
                      + " window: " + window + " days) with "
                      + util.plural(negatives.length, "negative signal") + " on record: "
                      + negatives.map(function (s) { return s.label; }).join(", ") + ".",
                source: sourceFrom(rows[0]),
                evidence: ev().dedupe(rows)
            });
        },

        /**
         * A commitment we made whose date has passed.
         *
         * `commitments: null` means the source is not tracked, and this rule
         * says so rather than sitting silent — a rule that can never fire is
         * indistinguishable from a rule with nothing to report, and the Phase 1
         * audit needs to know which it is.
         */
        overdueCommitment: function (ctx) {
            var commitments = ctx.bundle.commitments;

            if (commitments === null || commitments === undefined) {
                return result("overdueCommitment", {
                    fired: false,
                    unavailable: true,
                    reason: "Commitments are not a tracked source in this deployment, so this "
                          + "rule cannot be evaluated."
                });
            }

            var overdue = util.list(commitments).filter(function (commitment) {
                if (commitment.completedDate) { return false; }
                if (!commitment.dueDate) { return false; }
                var daysPast = util.daysAgo(commitment.dueDate, ctx.asOf);
                return daysPast !== null && daysPast > 0;
            });

            if (!overdue.length) { return notFired("overdueCommitment"); }

            var rows = overdue.map(function (commitment) {
                return ev().make({
                    label: (commitment.description || "Commitment")
                         + " — due " + util.formatDate(commitment.dueDate),
                    type: "commitment",
                    id: commitment.id,
                    date: commitment.dueDate,
                    source: "internal",
                    sourceLabel: commitment.sourceLabel || "Account review",
                    mock: commitment.mock === true
                });
            });

            return result("overdueCommitment", {
                fired: true,
                level: "P1",
                reason: util.plural(overdue.length, "commitment") + " made to this customer "
                      + (overdue.length === 1 ? "is" : "are") + " past the committed date.",
                source: sourceFrom(rows[0]),
                evidence: rows
            });
        },

        // =================================================================
        // P2 — Medium
        // =================================================================

        /** An open quote past `config.thresholds.staleQuoteDays`. */
        quoteAwaitingResponse: function (ctx) {
            var stale = util.list(ctx.signals).filter(function (signal) {
                return signal.key === "staleQuotes";
            });
            if (!stale.length) { return notFired("quoteAwaitingResponse"); }

            var rows = stale.reduce(function (all, signal) {
                return all.concat(ev().fromFacts(signal.evidence));
            }, []);

            return result("quoteAwaitingResponse", {
                fired: true,
                level: "P2",
                reason: stale[0].statement,
                source: sourceFrom(rows[0]),
                evidence: rows
            });
        },

        /** Account review overdue for THIS account's segment. */
        accountReviewOverdue: function (ctx) {
            var latest = C360.signals.latestReview(ctx.bundle);
            var cadence = ctx.segment && ctx.segment.rules
                ? ctx.segment.rules.reviewOverdueDays : null;

            if (cadence === null || cadence === undefined) {
                // Suspended accounts have no cadence: not overdue, not a gap.
                return notFired("accountReviewOverdue");
            }

            if (!latest) {
                return result("accountReviewOverdue", {
                    fired: true,
                    level: "P2",
                    reason: "No account review is recorded for this account, and the "
                          + ctx.segment.segmentLabel + " cadence is " + cadence + " days.",
                    source: null,
                    evidence: []
                });
            }

            var age = util.daysAgo(latest.date, ctx.asOf);
            if (age === null || age <= cadence) { return notFired("accountReviewOverdue"); }

            var row = ev().fromRecord(latest, {
                type: "review",
                label: (latest.reviewType || "Account review") + " — "
                     + util.formatDate(latest.date)
            });

            return result("accountReviewOverdue", {
                fired: true,
                level: "P2",
                reason: "The most recent account review was " + age + " days ago, past the "
                      + cadence + "-day cadence for a " + ctx.segment.segmentLabel + " account.",
                source: sourceFrom(row),
                evidence: [row].filter(Boolean)
            });
        },

        /**
         * A QUALIFIED expansion opportunity — which is why a healthy account can
         * be P2. Expansion raises urgency; priority is not a synonym for risk.
         *
         * A product-catalogue gap does not qualify. "No usage found for product
         * X" is a fact about our own records, not a customer intention.
         */
        qualifiedExpansion: function (ctx) {
            var accepted = util.list(C360.scorecardConfig.queues.qualifiedOpportunityConfidence);

            var qualified = util.list(ctx.opportunities).filter(function (opp) {
                if (opp.id === "opp-product-gap") { return false; }
                return accepted.indexOf(opp.confidence) !== -1;
            });

            if (!qualified.length) { return notFired("qualifiedExpansion"); }

            var rows = qualified.reduce(function (all, opp) {
                return all.concat(ev().fromFacts(opp.evidence));
            }, []);

            return result("qualifiedExpansion", {
                fired: true,
                level: "P2",
                reason: util.plural(qualified.length, "qualified expansion opportunity",
                        "qualified expansion opportunities") + " on record: "
                      + qualified.map(function (o) { return o.title; }).join(", ") + ".",
                source: rows.length ? sourceFrom(rows[0]) : null,
                evidence: ev().dedupe(rows)
            });
        }
    };

    // -----------------------------------------------------------------
    // Evaluate
    // -----------------------------------------------------------------

    /** All rule names, in the config's P0 -> P2 order. */
    function ruleNames() {
        var groups = cfg().overrides;
        return util.list(groups.p0)
            .concat(util.list(groups.p1))
            .concat(util.list(groups.p2));
    }

    /**
     * Run every override rule.
     *
     * @param {object} ctx { bundle, signals, opportunities, segment, asOf, proposals }
     * @returns {object} { results[], fired[], unavailable[], floor, floorRule }
     */
    function evaluate(ctx) {
        var context = ctx || {};
        var results = [];

        ruleNames().forEach(function (name) {
            var rule = RULES[name];
            if (!rule) { return; }
            try {
                results.push(rule(context));
            } catch (error) {
                // One broken rule must not cost the user the other eleven.
                console.error("Customer 360: override rule \"" + name + "\" failed.", error);
                results.push(result(name, {
                    fired: false,
                    unavailable: true,
                    reason: "This rule could not be evaluated."
                }));
            }
        });

        var fired = results.filter(function (item) { return item.fired; });
        var unavailable = results.filter(function (item) { return item.unavailable; });

        // The floor is the most urgent level anything fired at.
        var rank = cfg().levelRank;
        var floor = null;
        var floorRule = null;

        fired.forEach(function (item) {
            if (floor === null || rank[item.level] < rank[floor]) {
                floor = item.level;
                floorRule = item;
            }
        });

        return {
            results: results,
            fired: fired,
            unavailable: unavailable,
            /** null when nothing fired — P3 is the default, not an override. */
            floor: floor,
            floorRule: floorRule
        };
    }

    return {
        evaluate: evaluate,
        ruleNames: ruleNames,
        RULES: RULES
    };
}());
