/**
 * Customer 360 — ACTION QUEUES  (Phase 4)
 * =======================================
 * Priority says HOW URGENTLY. Queues say WHAT KIND OF WORK. They are
 * orthogonal: a P0 can be a SAVE or a FIX, and a P3 can be a GROW.
 *
 *     SAVE     retention and relationship risk
 *     FIX      operational and service issues
 *     GROW     qualified opportunities
 *     ENGAGE   relationship building
 *
 * Precedence when an account qualifies for more than one:
 *
 *     SAVE > FIX > GROW > ENGAGE
 *
 * Retention risk outranks an operational problem, which outranks an
 * opportunity, which outranks routine relationship work. But an account in
 * SAVE keeps its FIX evidence, because fixing the ticket is very often HOW you
 * save the account — dropping the FIX entry would hide the actual remedy.
 *
 * Three prohibitions carry most of the weight here:
 *
 *   A LOW HEALTH SCORE IS NOT A SAVE. Nothing in this file reads health.score.
 *   A SAVE needs a cancellation signal, a competitor threat, a renewal risk or
 *   measurable relationship deterioration — an actual thing that happened.
 *
 *   A PRODUCT GAP IS NOT A GROW. "No usage found for product X" is a fact about
 *   our own records. GROW requires a qualified opportunity.
 *
 *   AN ACCOUNT WITH NOTHING TO DO IS IN NO QUEUE. Manufacturing an ENGAGE item
 *   so a row is not empty is how a queue becomes noise. The portfolio summary is
 *   allowed to say most accounts need nothing today.
 *
 * Pure: `asOf` injected.
 */

"use strict";

C360.queues = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig.queues; }
    function ev() { return C360.evidence; }

    /**
     * A rule hit. Evidence is required — Phase 4's test 4.9 asserts every queue
     * entry has a rule, a reason and non-empty evidence, because a queue entry
     * you cannot justify is worse than no queue entry.
     */
    function hit(rule, reason, evidence) {
        return {
            rule: rule,
            reason: reason,
            evidence: util.list(evidence)
        };
    }

    /** Find fired overrides by rule name in the Phase 3 output. */
    function firedOverride(priority, rule) {
        return util.list(priority && priority.firedOverrides).filter(function (item) {
            return item.rule === rule;
        })[0] || null;
    }

    function signalsByKey(signals, key) {
        return util.list(signals).filter(function (signal) { return signal.key === key; });
    }

    // =================================================================
    // SAVE
    // =================================================================

    var RULES = {

        /** Reuses the Phase 3 override so one detection drives both. */
        cancellationSignal: function (ctx) {
            var override = firedOverride(ctx.priority, "explicitCancellationRequest");
            if (!override) { return null; }
            return hit("cancellationSignal", "Cancellation signal", override.evidence);
        },

        competitorThreat: function (ctx) {
            var override = firedOverride(ctx.priority, "explicitCompetitorSwitch");
            if (!override) { return null; }
            return hit("competitorThreat", "Competitor threat", override.evidence);
        },

        /**
         * Renewal inside the segment window with negative signals. The same rule
         * Phase 3 uses for its P1 floor — the queue and the priority agree
         * because they are reading the same evaluated rule, not two copies of it.
         */
        renewalRisk: function (ctx) {
            var override = firedOverride(ctx.priority, "renewalWindowWithNegativeSignals");
            if (!override) { return null; }
            return hit("renewalRisk", "Renewal risk", override.evidence);
        },

        /**
         * Deterioration needs corroboration —
         * `queues.relationshipDeteriorationMinSignals` of them. One frustrated
         * email is not a deteriorating relationship, and treating it as one puts
         * accounts in SAVE that simply had a bad Tuesday.
         */
        relationshipDeterioration: function (ctx) {
            var indicators = [];

            var sentiment = C360.detect.across(
                util.list(ctx.bundle.communications), "negativeSentiment",
                { type: "communication" });
            if (sentiment.length) {
                indicators.push({
                    text: "negative sentiment in customer communication",
                    evidence: sentiment.map(function (item) { return item.evidence; })
                });
            }

            signalsByKey(ctx.signals, "staleReview").forEach(function (signal) {
                indicators.push({
                    text: "account review overdue",
                    evidence: ev().fromFacts(signal.evidence)
                });
            });

            signalsByKey(ctx.signals, "repeatIssue").forEach(function (signal) {
                indicators.push({
                    text: (signal.label || "repeated issues").toLowerCase(),
                    evidence: ev().fromFacts(signal.evidence)
                });
            });

            var downgrade = C360.detect.inBundle(ctx.bundle, "downgrade",
                { type: "communication" });
            if (downgrade.length) {
                indicators.push({
                    text: "downgrade language on record",
                    evidence: downgrade.map(function (item) { return item.evidence; })
                });
            }

            if (indicators.length < cfg().relationshipDeteriorationMinSignals) { return null; }

            return hit("relationshipDeterioration", "Relationship deterioration",
                ev().dedupe(indicators.reduce(function (all, item) {
                    return all.concat(item.evidence);
                }, [])));
        },

        // =================================================================
        // FIX
        // =================================================================

        technicalEscalation: function (ctx) {
            var open = C360.signals.openEscalations(ctx.bundle.technicalIssues);
            if (!open.length) { return null; }
            return hit("technicalEscalation", "Technical escalation open",
                open.map(function (issue) {
                    return ev().fromRecord(issue, { type: "escalation" });
                }).filter(Boolean));
        },

        billingIssue: function (ctx) {
            var open = C360.signals.openEscalations(ctx.bundle.billingIssues);
            if (!open.length) { return null; }
            return hit("billingIssue", "Billing issue unresolved",
                open.map(function (issue) {
                    return ev().fromRecord(issue, { type: "escalation" });
                }).filter(Boolean));
        },

        /**
         * A device problem past the configured BAD threshold, not the warn one.
         * A 6% non-communicating rate is worth showing on the health breakdown;
         * it is not worth putting an account in a work queue.
         */
        deviceProblem: function (ctx) {
            var device = ctx.bundle.deviceHealth;
            if (!device || !device.available) { return null; }
            if (device.deviceCount === null || device.deviceCount === undefined
                || !device.deviceCount) { return null; }
            if (device.notCommunicating === null || device.notCommunicating === undefined) {
                return null;
            }

            var pct = (device.notCommunicating / device.deviceCount) * 100;
            var limit = C360.scorecardConfig.health.device.notCommunicatingBadPct;
            if (pct < limit) { return null; }

            return hit("deviceProblem",
                Math.round(pct) + "% of devices not communicating",
                [ev().make({
                    label: device.notCommunicating + " of " + device.deviceCount
                         + " devices not communicating",
                    type: "device",
                    id: device.id || "device-health",
                    date: device.asOf || null,
                    source: "internal",
                    sourceLabel: device.sourceLabel || "Device health",
                    mock: device.mock === true
                })]);
        },

        slaBreach: function (ctx) {
            var override = firedOverride(ctx.priority, "criticalTicketBeyondSla");
            if (!override) { return null; }
            return hit("slaBreach", "Critical ticket beyond SLA", override.evidence);
        },

        /**
         * Ageing open tickets that are NOT already an SLA breach — otherwise the
         * same ticket would justify two FIX entries and read as two problems.
         */
        overdueSupportIssue: function (ctx) {
            if (firedOverride(ctx.priority, "criticalTicketBeyondSla")) { return null; }
            var ageing = signalsByKey(ctx.signals, "ageingTickets");
            if (!ageing.length) { return null; }
            return hit("overdueSupportIssue", "Support issue overdue",
                ev().dedupe(ageing.reduce(function (all, signal) {
                    return all.concat(ev().fromFacts(signal.evidence));
                }, [])));
        },

        // =================================================================
        // GROW  — every rule here demands a QUALIFIED opportunity
        // =================================================================

        fleetExpansion: function (ctx) {
            return qualifiedOpportunity(ctx, "opp-fleet-expansion",
                "fleetExpansion", "Fleet expansion signal");
        },

        newFacility: function (ctx) {
            var growth = util.list(ctx.bundle.website && ctx.bundle.website.growthSignals)
                .filter(function (signal) {
                    var text = String((signal.title || "") + " " + (signal.detail || ""))
                        .toLowerCase();
                    return text.indexOf("terminal") !== -1 || text.indexOf("facility") !== -1
                        || text.indexOf("depot") !== -1 || text.indexOf("location") !== -1;
                });
            if (!growth.length) { return null; }
            if (!hasQualifiedOpportunity(ctx)) { return null; }

            return hit("newFacility", "New facility announced",
                growth.map(function (signal) {
                    return ev().fromRecord(signal, {
                        type: "website-signal",
                        label: signal.title
                    });
                }).filter(Boolean));
        },

        newVehicles: function (ctx) {
            var volume = signalsByKey(ctx.signals, "orderVolume")
                .filter(function (signal) { return signal.direction === "up"; });
            if (!volume.length) { return null; }
            return hit("newVehicles", "Increased vehicle purchasing",
                ev().dedupe(volume.reduce(function (all, signal) {
                    return all.concat(ev().fromFacts(signal.evidence));
                }, [])));
        },

        /**
         * Deliberately narrow. A product-catalogue gap on its own is NOT enough
         * (see `growRequiresQualifiedOpportunity`) — the customer must also be
         * showing declining adoption of something they already own, which makes
         * "targeted training" a response to observed behaviour rather than a
         * pitch dressed up as a recommendation.
         */
        unusedProductOpportunity: function (ctx) {
            if (cfg().growRequiresQualifiedOpportunity && !hasQualifiedOpportunity(ctx)) {
                return null;
            }

            var gaps = signalsByKey(ctx.signals, "productGap");
            if (!gaps.length) { return null; }

            var portal = ctx.bundle.portalUsage;
            var declining = portal && portal.available && portal.changePct !== null
                && portal.changePct <= -C360.scorecardConfig.health.device.portalUsageDeclinePct;
            if (!declining) { return null; }

            return hit("unusedProductOpportunity", "Unused product with declining adoption",
                [ev().make({
                    label: "Portal usage down "
                         + Math.abs(Math.round(portal.changePct)) + "%",
                    type: "device",
                    id: "portal-usage",
                    date: portal.asOf || null,
                    source: "internal",
                    sourceLabel: portal.sourceLabel || "Portal usage",
                    mock: portal.mock === true
                })]);
        },

        newMarketExpansion: function (ctx) {
            var expansion = util.list(ctx.bundle.external).filter(function (item) {
                return item.category === "expansion" || item.category === "acquisition";
            });
            if (!expansion.length) { return null; }
            if (!hasQualifiedOpportunity(ctx)) { return null; }

            return hit("newMarketExpansion", "Public market-expansion activity",
                ev().withIdentityConfidence(expansion.map(function (item) {
                    return ev().fromRecord(item, { type: "news", label: item.title });
                }).filter(Boolean), ctx.identity));
        },

        // =================================================================
        // ENGAGE
        // =================================================================

        accountReviewOverdue: function (ctx) {
            var override = firedOverride(ctx.priority, "accountReviewOverdue");
            if (!override) { return null; }
            // A review overdue with NO review on record has no source record to
            // point at, so the account's own record stands as the evidence.
            var evidence = override.evidence.length ? override.evidence : [ev().make({
                label: "No account review is recorded for this account",
                type: "review",
                id: "no-review",
                date: null,
                source: "internal",
                sourceLabel: "Internal CRM"
            })];
            return hit("accountReviewOverdue", "Account review overdue", evidence);
        },

        trainingRequired: function (ctx) {
            var portal = ctx.bundle.portalUsage;
            if (!portal || !portal.available) { return null; }
            if (portal.changePct === null || portal.changePct === undefined) { return null; }
            var limit = C360.scorecardConfig.health.device.portalUsageDeclinePct;
            if (portal.changePct > -limit) { return null; }

            return hit("trainingRequired", "Portal adoption declining",
                [ev().make({
                    label: "Portal usage down "
                         + Math.abs(Math.round(portal.changePct)) + "%",
                    type: "device",
                    id: "portal-usage",
                    date: portal.asOf || null,
                    source: "internal",
                    sourceLabel: portal.sourceLabel || "Portal usage",
                    mock: portal.mock === true
                })]);
        },

        /** Nothing recorded on the account in `queues.inactiveDays`. */
        inactiveCustomer: function (ctx) {
            var everything = util.list(ctx.bundle.tickets)
                .concat(util.list(ctx.bundle.orders))
                .concat(util.list(ctx.bundle.quotes))
                .concat(util.list(ctx.bundle.reviews))
                .concat(util.list(ctx.bundle.communications));

            if (!everything.length) {
                // No activity records at all is a data gap, not an inactive
                // customer. Reporting it as inactivity would put every account
                // with an unwired source into ENGAGE.
                return null;
            }

            var newest = everything.slice().sort(util.byDateDesc)[0];
            var age = util.daysAgo(newest && newest.date, ctx.asOf);
            if (age === null || age <= cfg().inactiveDays) { return null; }

            return hit("inactiveCustomer",
                "No recorded activity in " + age + " days",
                [ev().fromRecord(newest, {
                    type: newest.type,
                    label: "Most recent activity: "
                         + (newest.subject || newest.title || newest.type)
                         + " — " + util.formatDate(newest.date)
                })].filter(Boolean));
        },

        stakeholderCoverageGap: function (ctx) {
            var gaps = util.list(ctx.roleGaps);
            if (!gaps.length) { return null; }
            return hit("stakeholderCoverageGap",
                "No known contact for: " + gaps.join(", "),
                [ev().make({
                    label: util.plural(gaps.length, "priority stakeholder role")
                         + " with no known contact: " + gaps.join(", "),
                    type: "contact",
                    id: "role-gaps",
                    date: null,
                    source: "internal",
                    sourceLabel: "Internal CRM"
                })]);
        }
    };

    // -----------------------------------------------------------------
    // GROW qualification helpers
    // -----------------------------------------------------------------

    /**
     * Is there at least one opportunity that is genuinely qualified — the right
     * confidence, and not the product-catalogue gap?
     */
    function hasQualifiedOpportunity(ctx) {
        if (!cfg().growRequiresQualifiedOpportunity) { return true; }
        var accepted = util.list(cfg().qualifiedOpportunityConfidence);
        return util.list(ctx.opportunities).some(function (opp) {
            return opp.id !== "opp-product-gap" && accepted.indexOf(opp.confidence) !== -1;
        });
    }

    function qualifiedOpportunity(ctx, opportunityId, rule, reason) {
        var accepted = util.list(cfg().qualifiedOpportunityConfidence);
        var match = util.list(ctx.opportunities).filter(function (opp) {
            return opp.id === opportunityId && accepted.indexOf(opp.confidence) !== -1;
        })[0];
        if (!match) { return null; }
        return hit(rule, reason, ev().fromFacts(match.evidence));
    }

    // -----------------------------------------------------------------
    // Classify
    // -----------------------------------------------------------------

    /**
     * @param {object} account normalised account
     * @param {Array}  signals C360.signals.build output
     * @param {object} health  Phase 2 output — carried for the UI, NOT read here
     * @param {object} priority Phase 3 output
     * @param {object} options { bundle, opportunities, roleGaps, identity, asOf }
     * @returns {object} { primaryQueue, queues[] }
     */
    function classify(account, signals, health, priority, options) {
        var opts = options || {};
        var ctx = {
            account: account,
            bundle: opts.bundle || {},
            signals: util.list(signals),
            priority: priority,
            opportunities: util.list(opts.opportunities),
            roleGaps: util.list(opts.roleGaps),
            identity: opts.identity || null,
            asOf: opts.asOf || null
        };

        var precedence = util.list(cfg().precedence);
        var ruleMap = cfg().rules;
        var labels = cfg().labels;
        var actionLabels = cfg().actionLabels;

        var queues = [];

        precedence.forEach(function (queueKey) {
            var hits = [];

            util.list(ruleMap[queueKey]).forEach(function (ruleName) {
                var rule = RULES[ruleName];
                if (!rule) { return; }
                try {
                    var outcome = rule(ctx);
                    // A hit with no evidence is dropped rather than rendered —
                    // it would violate the "never unexplained" rule downstream.
                    if (outcome && outcome.evidence.length) { hits.push(outcome); }
                } catch (error) {
                    console.error("Customer 360: queue rule \"" + ruleName + "\" failed.", error);
                }
            });

            if (!hits.length) { return; }

            queues.push({
                key: queueKey,
                label: labels[queueKey] || queueKey.toUpperCase(),
                description: cfg().descriptions[queueKey] || null,
                rules: hits,
                /** Short card label. The full recommendation is Phase 5. */
                actionLabel: actionLabels[hits[0].rule] || null
            });
        });

        return {
            /** Exactly one, by config precedence. Null when nothing fired. */
            primaryQueue: queues.length ? queues[0].key : null,
            queues: queues
        };
    }

    // -----------------------------------------------------------------
    // Roll-up
    // -----------------------------------------------------------------

    /**
     * Counted by `primaryQueue` only, so the four queue counts plus `none`
     * equal the account total. The UI must SAY this, because four numbers
     * printed together are read as a total whether or not they are one.
     *
     * @param {Array} scoredAccounts [{ queues: { primaryQueue } }]
     */
    function rollup(scoredAccounts) {
        var counts = { none: 0, total: 0 };
        util.list(cfg().precedence).forEach(function (key) { counts[key] = 0; });

        util.list(scoredAccounts).forEach(function (entry) {
            counts.total++;
            var primary = entry && entry.queues ? entry.queues.primaryQueue : null;
            if (primary && counts[primary] !== undefined) {
                counts[primary]++;
            } else {
                counts.none++;
            }
        });

        return counts;
    }

    /**
     * Cards for one queue, ordered by priority score descending — the most
     * urgent work in that queue reads first.
     *
     * Accepts either a full scorecard model (`entry.priority`) or a flattened
     * portfolio row (`entry.priorityLevel`). Both callers exist, and reading
     * only one shape is how the cards silently lost their priority score.
     */
    function levelOf(entry) {
        if (entry.priority) { return entry.priority.level; }
        return entry.priorityLevel === undefined ? null : entry.priorityLevel;
    }

    function scoreOf(entry) {
        if (entry.priority) { return entry.priority.score; }
        return entry.priorityScore === undefined ? null : entry.priorityScore;
    }

    function cards(scoredAccounts, queueKey) {
        return util.list(scoredAccounts).filter(function (entry) {
            return entry.queues && entry.queues.primaryQueue === queueKey;
        }).map(function (entry) {
            var queue = util.list(entry.queues.queues).filter(function (item) {
                return item.key === queueKey;
            })[0];
            return {
                accountId: entry.accountId,
                accountName: entry.accountName,
                queue: queueKey,
                queueLabel: cfg().labels[queueKey] || queueKey.toUpperCase(),
                level: levelOf(entry),
                priorityScore: scoreOf(entry),
                healthScore: entry.healthAvailable === false ? null
                    : (entry.healthScore === undefined ? null : entry.healthScore),
                healthAvailable: entry.healthAvailable !== false,
                reason: queue && queue.rules.length ? queue.rules[0].reason : null,
                actionLabel: queue ? queue.actionLabel : null,
                evidence: queue && queue.rules.length ? queue.rules[0].evidence : []
            };
        }).sort(function (a, b) {
            return (b.priorityScore || 0) - (a.priorityScore || 0);
        });
    }

    return {
        classify: classify,
        rollup: rollup,
        cards: cards,
        RULES: RULES
    };
}());
