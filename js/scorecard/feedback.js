/**
 * Customer 360 — FEEDBACK LOOP  (Phase 9)
 * =======================================
 * The Phase 3 keyword lists and the Phase 2 thresholds are guesses. This file is
 * the mechanism by which they stop being guesses. It is not optional polish.
 *
 * FOUR DISTINCT OUTCOMES, and collapsing them into thumbs up/down destroys the
 * only genuinely useful information here:
 *
 *   Useful          right and wanted.
 *   Incorrect       the reasoning was WRONG — a false positive.
 *                   *This is the one that indicts a rule.*
 *   Not needed      the reasoning was right, the action was not warranted.
 *                   Indicts the action mapping, not the signal.
 *   Already handled both were right; the work was already done.
 *                   Indicts data freshness, not the rules.
 *
 * Feedback attaches to the RULE THAT FIRED, not just the account. "ACME got a
 * bad recommendation" is not actionable; "cancellationSignal produced twelve
 * false positives" is.
 *
 * FEEDBACK IS NEVER DESTRUCTIVE. Marking something `Incorrect` records a
 * judgment; it does not change a score and it does not suppress a rule.
 * Suppression is a deliberate config change a human makes after reading the
 * aggregate — `autoSuppressRules` is false and this file has no code that could
 * honour it being true.
 *
 * DISMISSING IS NOT DELETING. A dismissed recommendation moves to a dismissed
 * state with its feedback attached.
 *
 * Storage is `sessionStorage` via the existing `js/core/cache.js` until a
 * gateway write endpoint exists, and the UI SAYS SO. Implying persistence that
 * does not exist is how a team discovers six weeks of tuning data never left the
 * browser.
 */

"use strict";

C360.feedback = (function () {

    var util = C360.util;

    var STORE_KEY = "c360:scorecard-feedback";

    function cfg() { return C360.scorecardConfig.feedback; }

    function labels() { return cfg().labels; }

    /** The four valid outcomes. Anything else is rejected, not coerced. */
    function outcomes() {
        return Object.keys(labels());
    }

    // -----------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------

    /**
     * Read the store. Never throws — a blocked sessionStorage costs the tuning
     * data, not the dashboard.
     */
    function read() {
        try {
            var raw = window.sessionStorage.getItem(STORE_KEY);
            var parsed = raw ? JSON.parse(raw) : null;
            return parsed && Array.isArray(parsed.records) ? parsed : { records: [] };
        } catch (error) {
            return { records: [] };
        }
    }

    function write(store) {
        try {
            window.sessionStorage.setItem(STORE_KEY, JSON.stringify(store));
            return true;
        } catch (error) {
            console.warn("Customer 360: feedback could not be stored.", error);
            return false;
        }
    }

    /** Where feedback actually lives, and whether that is durable. */
    function storageState() {
        return {
            mode: cfg().storage,
            durable: cfg().storage !== "local",
            notice: cfg().storage === "local" ? cfg().localOnlyNotice : null
        };
    }

    // -----------------------------------------------------------------
    // Capture
    // -----------------------------------------------------------------

    /**
     * Record feedback on one recommendation.
     *
     * @param {object} input
     *   outcome        one of `feedback.labels` keys
     *   reason         optional free text; prompted for on the configured outcomes
     *   recommendation the recommendation being judged
     *   model          the scorecard model, so the SCORES AT THE TIME are captured
     *   approver/user  who gave the feedback
     *   asOf           injected timestamp
     * @returns {object} { recorded, record, reason, needsReason }
     */
    function capture(input) {
        var data = input || {};
        var outcome = data.outcome;

        if (outcomes().indexOf(outcome) === -1) {
            return {
                recorded: false,
                record: null,
                reason: "\"" + outcome + "\" is not one of the four feedback outcomes."
            };
        }

        var recommendation = data.recommendation || {};
        var model = data.model || {};
        var summary = model.summary || {};

        /**
         * Everything needed to reproduce the decision later. Without these,
         * feedback six weeks old is a number with no context — you cannot tell
         * whether the rule was wrong or the config has since changed.
         */
        var context = {
            ruleId: recommendation.rule || null,
            evidenceIds: util.list(recommendation.evidenceIds),
            healthScore: summary.healthScore === undefined ? null : summary.healthScore,
            priorityScore: summary.priorityScore === undefined ? null : summary.priorityScore,
            priorityLevel: summary.priorityLevel || null,
            queue: recommendation.queue || null,
            configVersion: model.configVersion || C360.scorecardConfig.version,
            asOfDate: model.asOf || (data.asOf
                ? (util.toDate(data.asOf) || new Date()).toISOString()
                : new Date().toISOString())
        };

        var store = read();

        var record = {
            id: "fb-" + store.records.length + "-" + util.slug(recommendation.id || outcome),
            outcome: outcome,
            outcomeLabel: labels()[outcome],
            /** Which layer this outcome indicts. Drives the Phase 9 aggregate. */
            indicts: cfg().indicts[outcome] || null,
            reason: data.reason || null,
            reasonRequested: util.list(cfg().promptForReasonOn).indexOf(outcome) !== -1,
            recommendationId: recommendation.id || null,
            accountId: model.accountId || data.accountId || null,
            accountName: model.accountName || null,
            givenBy: data.user || null,
            givenAt: context.asOfDate,
            /** Dismissal is a separate flag; the record itself is never removed. */
            dismissed: data.dismiss === true,
            context: context
        };

        store.records.push(record);
        var stored = write(store);

        return {
            recorded: true,
            record: record,
            stored: stored,
            /** The UI prompts for a reason on these; it does not require one. */
            needsReason: record.reasonRequested && !record.reason,
            storage: storageState()
        };
    }

    /**
     * Dismiss a recommendation. It moves to a dismissed state WITH its feedback
     * attached — nothing is deleted, because a deleted recommendation cannot be
     * counted in the aggregate that would have justified changing the rule.
     */
    function dismiss(input) {
        var data = input || {};
        var result = capture({
            outcome: data.outcome || "notNeeded",
            reason: data.reason || null,
            recommendation: data.recommendation,
            model: data.model,
            user: data.user,
            asOf: data.asOf,
            dismiss: true
        });

        if (!result.recorded) { return result; }

        return {
            recorded: true,
            record: result.record,
            stored: result.stored,
            retained: cfg().retainDismissed === true,
            storage: storageState()
        };
    }

    // -----------------------------------------------------------------
    // Retrieval
    // -----------------------------------------------------------------

    function all() {
        return read().records.slice();
    }

    function forRecommendation(recommendationId) {
        return all().filter(function (record) {
            return record.recommendationId === recommendationId;
        });
    }

    function forAccount(accountId) {
        return all().filter(function (record) { return record.accountId === accountId; });
    }

    /** Dismissed recommendations, retained rather than deleted. */
    function dismissed() {
        return all().filter(function (record) { return record.dismissed; });
    }

    // -----------------------------------------------------------------
    // Aggregation
    // -----------------------------------------------------------------

    /**
     * Per-rule aggregate — the output the tuning loop actually reads.
     *
     * PER RULE, never only globally. A global false-positive rate of 14% tells
     * you nothing about which of twelve rules to fix, and the average is always
     * dragged toward acceptable by the rules that work.
     */
    function byRule(records) {
        var source = records || all();
        var out = {};

        source.forEach(function (record) {
            var rule = record.context.ruleId || "unknown";
            if (!out[rule]) {
                out[rule] = {
                    rule: rule,
                    total: 0,
                    useful: 0,
                    incorrect: 0,
                    notNeeded: 0,
                    alreadyHandled: 0,
                    reasons: []
                };
            }
            var entry = out[rule];
            entry.total++;
            if (entry[record.outcome] !== undefined) { entry[record.outcome]++; }
            if (record.reason) {
                entry.reasons.push({ outcome: record.outcome, reason: record.reason });
            }
        });

        return Object.keys(out).map(function (rule) {
            var entry = out[rule];
            return {
                rule: entry.rule,
                total: entry.total,
                useful: entry.useful,
                incorrect: entry.incorrect,
                notNeeded: entry.notNeeded,
                alreadyHandled: entry.alreadyHandled,

                /**
                 * `Incorrect` divided by recommendations WITH feedback. Not by
                 * all recommendations — the denominator has to be what was
                 * actually judged, or a rule nobody reviewed looks perfect.
                 */
                falsePositiveRate: entry.total ? entry.incorrect / entry.total : null,
                usefulRate: entry.total ? entry.useful / entry.total : null,
                reasons: entry.reasons,

                /**
                 * Stated explicitly, because it is the thing a reader most wants
                 * to assume happened and the thing that must not.
                 */
                ruleSuppressed: false,
                autoSuppressEnabled: cfg().autoSuppressRules === true
            };
        }).sort(function (a, b) {
            return (b.falsePositiveRate || 0) - (a.falsePositiveRate || 0);
        });
    }

    /** Portfolio-level counts, with the response rate that makes them readable. */
    function summary(recommendationTotal) {
        var records = all();
        var counts = { useful: 0, incorrect: 0, notNeeded: 0, alreadyHandled: 0 };

        records.forEach(function (record) {
            if (counts[record.outcome] !== undefined) { counts[record.outcome]++; }
        });

        var withFeedback = records.length;
        var total = recommendationTotal === undefined ? null : recommendationTotal;

        return {
            counts: counts,
            withFeedback: withFeedback,
            recommendationTotal: total,
            /**
             * Shown ALONGSIDE the accept/reject rates. Without it, "80%
             * accepted" from five responses out of two hundred reads as a
             * verdict on the product.
             */
            responseRate: total ? withFeedback / total : null,
            byRule: byRule(records),
            storage: storageState()
        };
    }

    /** Test hook. Not called by the app. */
    function reset() {
        write({ records: [] });
    }

    return {
        capture: capture,
        dismiss: dismiss,
        all: all,
        forRecommendation: forRecommendation,
        forAccount: forAccount,
        dismissed: dismissed,
        byRule: byRule,
        summary: summary,
        outcomes: outcomes,
        storageState: storageState,
        reset: reset
    };
}());
