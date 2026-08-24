/**
 * Customer 360 — SUCCESS METRICS  (Phase 9)
 * =========================================
 * Measurement, not prediction. No auto-tuning, no learned weights, no
 * predictive modelling — `metrics.predictiveModelling` is false and there is no
 * code here that would honour it being true.
 *
 * A metrics dashboard is the easiest place in a product to start lying, so every
 * metric below carries the caveat that makes it honest, and the caveat ships
 * WITH the number rather than in a footnote nobody reads:
 *
 *   Hours saved            an ESTIMATE from a constant. Never "measured".
 *   Accept / reject        denominator is recommendations WITH FEEDBACK, and the
 *                          response rate is shown next to it.
 *   False-positive rate    per rule, never only globally.
 *   At-risk identified     IDENTIFIED, not saved. No outcome is implied.
 *   Retention influenced   the weakest metric here. Correlation. We do not know
 *                          that the system saved the account, and saying so
 *                          would be the single most tempting lie available.
 *
 * A metric whose inputs do not exist reports `Not yet measurable` — the same
 * rule as Phase 2's missing categories. Never a zero, and never quietly dropped
 * from the dashboard, because a missing row and a zero row lead to opposite
 * conclusions.
 *
 * Pure: `asOf` injected.
 */

"use strict";

C360.metrics = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig.metrics; }

    /**
     * One metric row.
     *
     * `measurable: false` means the inputs do not exist — value stays null and
     * the UI prints `notMeasurableLabel`.
     */
    function metric(key, spec) {
        var s = spec || {};
        var correlationOnly = util.list(cfg().correlationOnly).indexOf(key) !== -1;

        return {
            key: key,
            label: cfg().labels[key] || util.humanize(key),
            measurable: s.measurable !== false,
            value: s.measurable === false ? null : s.value,
            display: s.measurable === false ? cfg().notMeasurableLabel : s.display,
            /** Why it cannot be measured, so the gap is actionable. */
            unmeasurableReason: s.measurable === false ? (s.unmeasurableReason || null) : null,

            /** How the number was derived, in one line. */
            derivation: s.derivation || null,

            /** The caveat that must ship with this metric. */
            caveat: s.caveat || (correlationOnly ? cfg().correlationNotice : null),
            isEstimate: s.isEstimate === true,
            correlationOnly: correlationOnly,

            /** Supporting figures the UI shows beside the headline. */
            detail: util.list(s.detail)
        };
    }

    function detail(label, value) {
        return { label: label, value: value };
    }

    // -----------------------------------------------------------------
    // The metrics
    // -----------------------------------------------------------------

    /**
     * @param {object} input
     *   models        scorecard models across the portfolio
     *   feedback      C360.feedback.summary() output
     *   approvals     C360.approval.all()
     *   asOf          injected timestamp
     */
    function build(input) {
        var data = input || {};
        var models = util.list(data.models);
        var feedbackSummary = data.feedback || C360.feedback.summary();
        var approvals = util.list(data.approvals);
        var out = [];

        var allRecommendations = models.reduce(function (all, model) {
            return all.concat(util.list(model.recommendations));
        }, []);

        // ---- Hours saved -------------------------------------------------
        // An estimate from a constant, and labelled as one everywhere it
        // appears. Actions TAKEN means actions with feedback or an approval —
        // counting generated recommendations would credit the system for work
        // nobody did.
        var actionsTaken = feedbackSummary.counts.useful
                         + feedbackSummary.counts.alreadyHandled
                         + approvals.length;

        if (actionsTaken === 0) {
            out.push(metric("hoursSaved", {
                measurable: false,
                unmeasurableReason: "No recommendation has been acted on yet, so there is "
                                  + "nothing to estimate from.",
                isEstimate: true
            }));
        } else {
            var minutes = actionsTaken * cfg().estimatedMinutesSavedPerAction;
            out.push(metric("hoursSaved", {
                value: minutes / 60,
                display: (minutes / 60).toFixed(1) + " hours",
                isEstimate: true,
                derivation: util.plural(actionsTaken, "action") + " × "
                          + cfg().estimatedMinutesSavedPerAction + " minutes per action",
                caveat: cfg().estimateNotice,
                detail: [
                    detail("Actions counted", actionsTaken),
                    detail("Minutes per action (constant)", cfg().estimatedMinutesSavedPerAction)
                ]
            }));
        }

        // ---- Accepted / rejected -----------------------------------------
        var withFeedback = feedbackSummary.withFeedback;
        var responseRateDisplay = feedbackSummary.responseRate === null
            ? "response rate not available"
            : Math.round(feedbackSummary.responseRate * 100) + "% of recommendations reviewed";

        if (!withFeedback) {
            out.push(metric("recommendationsAccepted", {
                measurable: false,
                unmeasurableReason: "No feedback has been recorded yet."
            }));
            out.push(metric("recommendationsRejected", {
                measurable: false,
                unmeasurableReason: "No feedback has been recorded yet."
            }));
        } else {
            out.push(metric("recommendationsAccepted", {
                value: feedbackSummary.counts.useful,
                display: feedbackSummary.counts.useful + " of " + withFeedback + " reviewed",
                derivation: "Marked \"Useful\", over recommendations with feedback",
                caveat: "Denominator is recommendations with feedback, not all "
                      + "recommendations — " + responseRateDisplay + ".",
                detail: [
                    detail("Recommendations generated", allRecommendations.length),
                    detail("Recommendations reviewed", withFeedback),
                    detail("Response rate", responseRateDisplay)
                ]
            }));

            var rejected = feedbackSummary.counts.incorrect + feedbackSummary.counts.notNeeded;
            out.push(metric("recommendationsRejected", {
                value: rejected,
                display: rejected + " of " + withFeedback + " reviewed",
                derivation: "Marked \"Incorrect\" or \"Not needed\", over recommendations "
                          + "with feedback",
                caveat: "\"Incorrect\" indicts the signal rule; \"Not needed\" indicts the "
                      + "action mapping. They are counted together here but never merged "
                      + "in the per-rule breakdown.",
                detail: [
                    detail("Incorrect (false positive)", feedbackSummary.counts.incorrect),
                    detail("Not needed", feedbackSummary.counts.notNeeded),
                    detail("Already handled", feedbackSummary.counts.alreadyHandled)
                ]
            }));
        }

        // ---- False-positive rate, per rule -------------------------------
        var perRule = util.list(feedbackSummary.byRule);
        if (!perRule.length) {
            out.push(metric("falsePositivePriorityRate", {
                measurable: false,
                unmeasurableReason: "No feedback has been recorded against any rule yet."
            }));
        } else {
            var worst = perRule[0];
            out.push(metric("falsePositivePriorityRate", {
                value: worst.falsePositiveRate,
                display: Math.round(worst.falsePositiveRate * 100) + "% — " + worst.rule,
                derivation: "\"Incorrect\" ÷ recommendations with feedback, per rule",
                caveat: "Reported per rule. A single global rate would hide which rule is "
                      + "broken.",
                detail: perRule.map(function (entry) {
                    return detail(entry.rule,
                        Math.round(entry.falsePositiveRate * 100) + "% of "
                        + util.plural(entry.total, "response"));
                })
            }));
        }

        // ---- At-risk identified ------------------------------------------
        var atRisk = models.filter(function (model) {
            var level = model.summary ? model.summary.priorityLevel : null;
            var queue = model.summary ? model.summary.primaryQueue : null;
            return queue === "save" || level === "P0" || level === "P1";
        });

        out.push(metric("atRiskIdentified", {
            value: atRisk.length,
            display: String(atRisk.length),
            derivation: "Accounts in the SAVE queue, or at P0/P1",
            // Identified, not saved. The metric name is the whole risk here.
            caveat: "Identified, not retained. This says the system surfaced them; it says "
                  + "nothing about the outcome.",
            detail: [
                detail("In SAVE queue", models.filter(function (m) {
                    return m.summary && m.summary.primaryQueue === "save";
                }).length),
                detail("At P0", models.filter(function (m) {
                    return m.summary && m.summary.priorityLevel === "P0";
                }).length),
                detail("At P1", models.filter(function (m) {
                    return m.summary && m.summary.priorityLevel === "P1";
                }).length)
            ]
        }));

        // ---- Critical response time ---------------------------------------
        // Needs action timestamps, which do not exist until actions are tracked.
        var timedApprovals = approvals.filter(function (record) { return record.approvedAt; });
        if (!timedApprovals.length) {
            out.push(metric("criticalResponseTime", {
                measurable: false,
                unmeasurableReason: "Action timestamps are not tracked yet, so the interval "
                                  + "between P0/P1 detection and the first action cannot be "
                                  + "measured."
            }));
        } else {
            out.push(metric("criticalResponseTime", {
                value: timedApprovals.length,
                display: util.plural(timedApprovals.length, "action") + " timestamped",
                derivation: "First action timestamp − P0/P1 detection timestamp",
                caveat: "Only actions taken through the approval flow carry a timestamp; "
                      + "work done outside the add-in is invisible here."
            }));
        }

        // ---- Correlation-only metrics -------------------------------------
        // Each one needs a before/after observation the add-in does not yet
        // store. Reported unmeasurable rather than as a zero that reads as "the
        // system influenced nothing".
        [
            ["accountReviewsCompleted",
             "Reviews recorded after an ENGAGE recommendation require a stored prior run to "
             + "compare against."],
            ["quotesProgressed",
             "Quote state changes after a follow-up recommendation require a stored prior run "
             + "to compare against."],
            ["retentionInfluenced",
             "Renewals after a SAVE recommendation require renewal outcomes to be recorded "
             + "against the account."],
            ["expansionInfluenced",
             "Orders after a GROW recommendation require a stored prior run to compare "
             + "against."]
        ].forEach(function (entry) {
            out.push(metric(entry[0], {
                measurable: false,
                unmeasurableReason: entry[1]
            }));
        });

        // Keep the configured order, so the panel does not reshuffle between
        // runs as metrics become measurable.
        var order = util.list(cfg().tracked);
        out.sort(function (a, b) {
            return order.indexOf(a.key) - order.indexOf(b.key);
        });

        return {
            metrics: out,
            measurable: out.filter(function (item) { return item.measurable; }).length,
            notMeasurable: out.filter(function (item) { return !item.measurable; }).length,
            /** Stated on the panel, not assumed by the reader. */
            predictiveModelling: cfg().predictiveModelling === true,
            feedbackStorage: feedbackSummary.storage
        };
    }

    return {
        build: build
    };
}());
