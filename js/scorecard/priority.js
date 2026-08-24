/**
 * Customer 360 — PRIORITY ENGINE  (Phase 3)
 * =========================================
 * Urgency as a SEPARATE output from health. This is the phase where the
 * product's core claim is either true or false, and the claim is this:
 *
 *     Health: 75    Priority: P1 / 91   healthy account, critical camera issue
 *     Health: 42    Priority: P3 / 48   unhealthy account, nothing urgent today
 *
 * Both of those must be producible. If they are not, priority is still a
 * function of health and the whole scorecard is one number wearing two hats.
 *
 * The mechanism that keeps them independent is negative: this file never reads
 * `health.score`. Not once. It reads risks, deadlines, segment, commitments and
 * opportunities — the same underlying signals health reads, weighted for a
 * different question. Two readings of one evidence base, not one score derived
 * from another.
 *
 *     Risk Severity                          35%
 *     Time Sensitivity                       25%
 *     Account Value / Strategic Importance   20%
 *     Overdue Commitments                    10%
 *     Expansion Readiness                    10%
 *
 * Note the last one. Expansion RAISES priority — a healthy account with a
 * strong expansion signal should surface, which is what the GROW queue is for.
 * Priority is not a synonym for risk.
 *
 * Pure: `asOf` injected.
 */

"use strict";

C360.priority = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig.priority; }
    function ev() { return C360.evidence; }

    function clamp(value) {
        return Math.max(0, Math.min(100, value));
    }

    /**
     * A factor result. `available: false` follows the same rule as a Phase 2
     * category: weights re-normalise, and it is never scored 0.
     */
    function factor(key, spec) {
        var s = spec || {};
        return {
            key: key,
            label: cfg().factorLabels[key] || util.humanize(key),
            score: s.available === false ? null : clamp(s.score),
            available: s.available !== false,
            unavailableReason: s.available === false ? (s.unavailableReason || null) : null,
            /** The named inputs that produced the score, for the drawer. */
            inputs: util.list(s.inputs),
            evidence: util.list(s.evidence),
            basis: s.basis || null
        };
    }

    function input(label, value, detail) {
        return { label: label, value: value, detail: detail || null };
    }

    // =================================================================
    // 1. Risk Severity — 35%
    // =================================================================

    /**
     * Severity and unresolved state of the WORST active risk, reusing
     * `js/intelligence/risks.js` rather than re-deriving severity here.
     *
     * The worst risk, not the average of them. Four Low risks is not one High
     * risk, and averaging would let a pile of minor problems outrank a single
     * serious one.
     */
    function riskSeverity(ctx) {
        var risks = util.list(ctx.risks);

        if (!risks.length) {
            return factor("riskSeverity", {
                score: 0,
                inputs: [input("Active risks", 0)],
                basis: "No active risk was derived for this account."
            });
        }

        var scores = cfg().factors.riskSeverityScore;
        var order = ["High", "Medium", "Low"];

        var worst = risks.slice().sort(function (a, b) {
            return order.indexOf(a.severity) - order.indexOf(b.severity);
        })[0];

        var base = scores[worst.severity];
        if (base === undefined) { base = scores.Low; }

        // Additional risks at the same severity add a little, capped — the
        // second High risk is worse than the first, but not twice as urgent.
        var sameSeverity = risks.filter(function (risk) {
            return risk.severity === worst.severity;
        }).length;
        var pileOn = Math.min(10, (sameSeverity - 1) * 5);

        return factor("riskSeverity", {
            score: base + pileOn,
            inputs: [
                input("Worst active risk", worst.severity, worst.title),
                input("Risks at that severity", sameSeverity),
                input("Total active risks", risks.length)
            ],
            evidence: ev().dedupe(risks.reduce(function (all, risk) {
                return all.concat(ev().fromFacts(risk.evidence));
            }, [])),
            basis: "Scored from the worst active risk (" + worst.severity + " — "
                 + worst.title + "), plus " + util.plural(sameSeverity - 1, "further risk")
                 + " at the same severity."
        });
    }

    // =================================================================
    // 2. Time Sensitivity — 25%
    // =================================================================

    /**
     * Days to the NEAREST hard deadline: renewal, SLA expiry, commitment date,
     * quote expiry. Nearer is higher.
     *
     * Floored rather than zeroed. An account with no deadline in sight is not
     * urgent, but "no deadline" is not the same as "no time pressure ever" —
     * and a hard zero here would make the factor discontinuous.
     */
    function timeSensitivity(ctx) {
        var deadlines = [];
        var slaHours = cfg().slaHours;

        // Renewal
        var contract = ctx.bundle.contract;
        if (contract && contract.renewalDate) {
            var renewalIn = C360.segments.daysUntil(contract.renewalDate, ctx.asOf);
            if (renewalIn !== null && renewalIn >= 0) {
                deadlines.push({
                    anchor: "renewal",
                    days: renewalIn,
                    label: "Renewal in " + renewalIn + " days",
                    evidence: ev().make({
                        label: "Renewal date " + util.formatDate(contract.renewalDate),
                        type: "renewal",
                        id: (contract.id || "contract") + "-renewal",
                        date: contract.renewalDate,
                        source: "internal",
                        sourceLabel: "Contract",
                        mock: contract.mock === true
                    })
                });
            }
        }

        // SLA expiry on the open tickets. A breached SLA is days: 0 — the
        // deadline is not approaching, it has gone.
        util.list(ctx.bundle.tickets).forEach(function (ticket) {
            if (!ticket.isOpen) { return; }
            var limit = slaHours[String(ticket.priority || "").toLowerCase()];
            if (limit === undefined) { return; }
            var ageHours = util.daysAgo(ticket.opened, ctx.asOf);
            if (ageHours === null) { return; }
            var remainingDays = (limit - (ageHours * 24)) / 24;
            deadlines.push({
                anchor: "sla",
                days: Math.max(0, remainingDays),
                label: remainingDays <= 0
                    ? "Ticket " + ticket.number + " past SLA"
                    : "Ticket " + ticket.number + " SLA in "
                      + Math.ceil(remainingDays) + " days",
                evidence: ev().make({
                    label: "Ticket " + ticket.number + " — " + (ticket.subject || "no subject"),
                    type: "sla",
                    id: ticket.id,
                    date: ticket.opened,
                    url: ticket.url,
                    source: "internal",
                    sourceLabel: ticket.sourceLabel,
                    mock: ticket.mock
                })
            });
        });

        // Commitment dates
        util.list(ctx.bundle.commitments).forEach(function (commitment) {
            if (commitment.completedDate || !commitment.dueDate) { return; }
            var until = C360.segments.daysUntil(commitment.dueDate, ctx.asOf);
            if (until === null) { return; }
            deadlines.push({
                anchor: "commitment",
                days: Math.max(0, until),
                label: until < 0
                    ? "Commitment overdue by " + Math.abs(until) + " days"
                    : "Commitment due in " + until + " days",
                evidence: ev().make({
                    label: (commitment.description || "Commitment")
                         + " — due " + util.formatDate(commitment.dueDate),
                    type: "commitment",
                    id: commitment.id,
                    date: commitment.dueDate,
                    source: "internal",
                    sourceLabel: commitment.sourceLabel || "Account review",
                    mock: commitment.mock === true
                })
            });
        });

        // Quote expiry
        util.list(ctx.bundle.quotes).forEach(function (quote) {
            if (!quote.isOpen || !quote.expiresAt) { return; }
            var until = C360.segments.daysUntil(quote.expiresAt, ctx.asOf);
            if (until === null || until < 0) { return; }
            deadlines.push({
                anchor: "quoteExpiry",
                days: until,
                label: "Quote " + quote.number + " expires in " + until + " days",
                evidence: ev().make({
                    label: "Quote " + quote.number + " expires "
                         + util.formatDate(quote.expiresAt),
                    type: "quote",
                    id: quote.id,
                    date: quote.expiresAt,
                    url: quote.url,
                    source: "internal",
                    sourceLabel: quote.sourceLabel,
                    mock: quote.mock
                })
            });
        });

        var floor = cfg().factors.timeSensitivityFloor;

        if (!deadlines.length) {
            return factor("timeSensitivity", {
                score: floor,
                inputs: [input("Hard deadlines found", 0)],
                basis: "No renewal date, SLA, commitment or quote expiry is within reach, so "
                     + "time sensitivity sits at the configured floor of " + floor + "."
            });
        }

        deadlines.sort(function (a, b) { return a.days - b.days; });
        var nearest = deadlines[0];

        var bands = util.list(cfg().factors.timeSensitivityBands);
        var band = bands.filter(function (entry) {
            return nearest.days <= entry.withinDays;
        })[0];

        return factor("timeSensitivity", {
            score: band ? band.score : floor,
            inputs: [
                input("Nearest deadline", nearest.label, nearest.anchor),
                input("Days remaining", Math.round(nearest.days)),
                input("Deadlines tracked", deadlines.length)
            ],
            evidence: ev().dedupe(deadlines.map(function (item) { return item.evidence; })),
            basis: "Scored from the nearest hard deadline: " + nearest.label + ".",
            anchor: nearest.anchor
        });
    }

    // =================================================================
    // 3. Strategic Importance — 20%
    // =================================================================

    /**
     * Segment plus account value. Never inferred from how loud the account has
     * been — a customer who emails constantly is not thereby strategic, and
     * letting volume drive this factor would make the noisiest account the most
     * important one.
     */
    function strategicImportance(ctx) {
        var segment = ctx.segment || {};
        var account = ctx.bundle.account || {};
        var segmentWeight = segment.rules ? segment.rules.strategicWeight : null;

        if (segmentWeight === null || segmentWeight === undefined) {
            return factor("strategicImportance", {
                available: false,
                unavailableReason: "No segment weight is configured for segment \""
                    + (segment.segment || "unknown") + "\"."
            });
        }

        var inputs = [input("Segment", segment.segmentLabel || segment.segment, segment.basis
            ? segment.basis.segment : null)];

        var score = segmentWeight;

        // Contract value nudges within the segment band, capped, so a large
        // mid-market account can out-rank a small one without leaping a band.
        var value = ctx.bundle.contract ? ctx.bundle.contract.annualValue : null;
        if (value !== null && value !== undefined) {
            var bonus = Math.min(15, value / 20000);
            score += bonus;
            inputs.push(input("Annual contract value",
                util.formatMoney(value, ctx.bundle.contract.currency)));
        } else {
            inputs.push(input("Annual contract value", "Not available"));
        }

        if (account.assetCount !== null && account.assetCount !== undefined) {
            inputs.push(input("Assets on account", account.assetCount));
        }

        return factor("strategicImportance", {
            score: score,
            inputs: inputs,
            basis: "Scored from the account's " + (segment.segmentLabel || "segment")
                 + " segment weight" + (value !== null && value !== undefined
                    ? ", adjusted for annual contract value." : "; no contract value recorded."),
            evidence: ctx.bundle.contract ? [ev().make({
                label: "Contract record",
                type: "contract",
                id: ctx.bundle.contract.id || "contract",
                date: ctx.bundle.contract.startDate || null,
                source: "internal",
                sourceLabel: "Contract",
                mock: ctx.bundle.contract.mock === true
            })] : []
        });
    }

    // =================================================================
    // 4. Overdue Commitments — 10%
    // =================================================================

    /**
     * Count and age of missed commitments.
     *
     * When commitments are not a tracked source, this reports UNAVAILABLE and
     * the remaining weights re-normalise. Scoring it 0 would quietly reward
     * every account in a deployment that does not track commitments.
     */
    function overdueCommitments(ctx) {
        var commitments = ctx.bundle.commitments;
        var weights = cfg().factors;

        if (commitments === null || commitments === undefined) {
            return factor("overdueCommitments", {
                available: false,
                unavailableReason: "Commitments are not a tracked source in this deployment."
            });
        }

        var overdue = util.list(commitments).filter(function (commitment) {
            if (commitment.completedDate || !commitment.dueDate) { return false; }
            var past = util.daysAgo(commitment.dueDate, ctx.asOf);
            return past !== null && past > 0;
        });

        if (!overdue.length) {
            return factor("overdueCommitments", {
                score: 0,
                inputs: [
                    input("Commitments tracked", util.list(commitments).length),
                    input("Overdue", 0)
                ],
                basis: "No commitment made to this customer is past its date."
            });
        }

        var oldest = overdue.reduce(function (worst, commitment) {
            var age = util.daysAgo(commitment.dueDate, ctx.asOf);
            return worst === null || age > worst ? age : worst;
        }, null);

        var score = weights.overdueCommitmentBase
                  + ((overdue.length - 1) * weights.overdueCommitmentPerCommitment)
                  + ((oldest / 7) * weights.overdueCommitmentAgeBonusPerWeek);

        return factor("overdueCommitments", {
            score: score,
            inputs: [
                input("Commitments tracked", util.list(commitments).length),
                input("Overdue", overdue.length),
                input("Oldest overdue by", oldest + " days")
            ],
            evidence: overdue.map(function (commitment) {
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
            }),
            basis: util.plural(overdue.length, "commitment") + " past its date, the oldest by "
                 + oldest + " days."
        });
    }

    // =================================================================
    // 5. Expansion Readiness — 10%
    // =================================================================

    /**
     * Qualified opportunity strength, reusing `js/intelligence/opportunities.js`.
     *
     * A product-catalogue gap is excluded. `opportunities.js` already words that
     * one as an absence of EVIDENCE of usage, and `config.productCatalogue` is
     * explicitly our own catalogue rather than a claim about the customer —
     * treating it as expansion readiness would fill the GROW queue with demand
     * nobody has expressed.
     */
    function expansionReadiness(ctx) {
        var scores = cfg().factors.expansionScore;
        var floor = cfg().factors.expansionFloor;

        var qualified = util.list(ctx.opportunities).filter(function (opp) {
            return opp.id !== "opp-product-gap";
        });

        if (!qualified.length) {
            return factor("expansionReadiness", {
                score: floor,
                inputs: [input("Qualified opportunities", 0)],
                basis: "No qualified expansion opportunity is on record, so this factor sits "
                     + "at the configured floor of " + floor + "."
            });
        }

        var order = ["High", "Medium", "Low"];
        var best = qualified.slice().sort(function (a, b) {
            return order.indexOf(a.confidence) - order.indexOf(b.confidence);
        })[0];

        var base = scores[best.confidence];
        if (base === undefined) { base = scores.Low; }

        return factor("expansionReadiness", {
            score: base + Math.min(10, (qualified.length - 1) * 5),
            inputs: [
                input("Qualified opportunities", qualified.length),
                input("Strongest", best.title, "Confidence: " + best.confidence)
            ],
            evidence: ev().dedupe(qualified.reduce(function (all, opp) {
                return all.concat(ev().fromFacts(opp.evidence));
            }, [])),
            basis: "Scored from " + util.plural(qualified.length, "qualified opportunity",
                    "qualified opportunities") + ", strongest: " + best.title
                 + " (" + best.confidence + " confidence)."
        });
    }

    // =================================================================
    // Weighting + level
    // =================================================================

    function weight(factors) {
        var declared = cfg().weights;
        var available = factors.filter(function (item) { return item.available; });

        var availableWeight = available.reduce(function (total, item) {
            return total + (declared[item.key] || 0);
        }, 0);

        factors.forEach(function (item) {
            item.weight = declared[item.key] || 0;
            if (!item.available) {
                item.effectiveWeight = 0;
                item.contribution = 0;
                return;
            }
            item.effectiveWeight = availableWeight > 0
                ? item.weight / availableWeight
                : item.weight;
            item.contribution = item.score * item.effectiveWeight;
        });

        return factors.reduce(function (total, item) {
            return total + item.contribution;
        }, 0);
    }

    function levelFromScore(score) {
        var bands = util.list(cfg().levelFromScore);
        for (var i = 0; i < bands.length; i++) {
            if (score >= bands[i].min) { return bands[i].level; }
        }
        return cfg().defaultLevel;
    }

    // =================================================================
    // Build
    // =================================================================

    /**
     * @param {object} bundle   scorecard bundle
     * @param {Array}  signals  C360.signals.build output
     * @param {object} health   Phase 2 output — carried through for the UI ONLY.
     *                          Nothing in this file reads health.score.
     * @param {object} identity Phase 1 output
     * @param {object} segment  Phase 1 output
     * @param {object} options  { asOf, risks, opportunities, proposals }
     */
    function build(bundle, signals, health, identity, segment, options) {
        var opts = options || {};
        var ctx = {
            bundle: bundle || {},
            signals: util.list(signals),
            risks: util.list(opts.risks),
            opportunities: util.list(opts.opportunities),
            segment: segment,
            identity: identity,
            asOf: opts.asOf || null,
            proposals: util.list(opts.proposals)
        };

        // ---- Step 1: the override engine, as a distinct step -----------
        var overrideResult = C360.overrides.evaluate(ctx);

        // ---- Step 2: the weighted score --------------------------------
        var factors = [
            riskSeverity(ctx),
            timeSensitivity(ctx),
            strategicImportance(ctx),
            overdueCommitments(ctx),
            expansionReadiness(ctx)
        ];

        var score = weight(factors);
        var scoredLevel = levelFromScore(score);

        // ---- Step 3: the floor, applied upward only --------------------
        var rank = cfg().levelRank;
        var level = scoredLevel;
        var levelSetBy = "score";

        if (overrideResult.floor !== null
            && rank[overrideResult.floor] < rank[scoredLevel]) {
            level = overrideResult.floor;
            levelSetBy = "override";
        }

        // ---- Reasons, ordered by contribution --------------------------
        var reasons = [];

        // Fired overrides lead, because they are the most concrete statements
        // available about why this account is where it is.
        overrideResult.fired.forEach(function (item) {
            reasons.push({
                text: item.reason,
                rule: item.rule,
                level: item.level,
                kind: "override",
                evidence: item.evidence
            });
        });

        factors.slice()
            .filter(function (item) { return item.available && item.contribution > 0; })
            .sort(function (a, b) { return b.contribution - a.contribution; })
            .forEach(function (item) {
                reasons.push({
                    text: item.label + ": " + item.basis,
                    rule: item.key,
                    kind: "factor",
                    contribution: item.contribution,
                    evidence: item.evidence
                });
            });

        // `reasons[]` must never be empty — a bare number with no "why?" is a
        // defect, not a styling gap. Even a quiet P3 account gets a sentence.
        if (!reasons.length) {
            reasons.push({
                text: "No risk, deadline, commitment or expansion signal is active on this "
                    + "account; it scores at the routine floor.",
                rule: "default",
                kind: "factor",
                evidence: []
            });
        }

        var primaryReason = overrideResult.floorRule
            ? overrideResult.floorRule.reason
            : reasons[0].text;

        return {
            level: level,
            levelLabel: cfg().levelLabels[level] || level,
            score: score,
            /** "override" | "score" — which mechanism actually set the level. */
            levelSetBy: levelSetBy,
            scoredLevel: scoredLevel,
            overrideFloor: overrideResult.floor,
            overrides: overrideResult.results,
            firedOverrides: overrideResult.fired,
            unavailableOverrides: overrideResult.unavailable,
            factors: factors,
            unavailableFactors: factors.filter(function (item) { return !item.available; })
                .map(function (item) { return item.key; }),
            renormalised: factors.some(function (item) { return !item.available; }),
            reasons: reasons,
            primaryReason: primaryReason
        };
    }

    return {
        build: build,
        levelFromScore: levelFromScore,
        /** Exposed for the per-factor tests. */
        factors: {
            riskSeverity: riskSeverity,
            timeSensitivity: timeSensitivity,
            strategicImportance: strategicImportance,
            overdueCommitments: overdueCommitments,
            expansionReadiness: expansionReadiness
        }
    };
}());
