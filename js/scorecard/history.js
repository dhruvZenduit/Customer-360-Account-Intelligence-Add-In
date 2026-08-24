/**
 * Customer 360 — RUN HISTORY
 * ==========================
 * Health and priority per account, per scoring run, so the command center can
 * draw a trend and say "priority raised P2 -> P0".
 *
 * THE HARD RULE: A TREND IS ONLY EVER DRAWN FROM STORED RUNS.
 *
 * Phase 7 forbids inventing a previous value to compute a delta against, and a
 * sparkline is the most tempting place in the whole product to break that —
 * one plausible-looking downward line is worth more to a demo than an honest
 * empty state, and the user cannot tell the difference. So:
 *
 *   0 stored runs   ->  no trend. `available: false`, and the UI prints the
 *                       "score history is not yet available" label.
 *   1 stored run    ->  a single point. Still no line, because one point is not
 *                       a direction.
 *   2+ stored runs  ->  a real trend, drawn from real stored numbers.
 *
 * History accumulates as the portfolio is refreshed. A fresh session therefore
 * starts with no trend, which is correct and is what the empty state says.
 *
 * Storage is `sessionStorage`, like `js/core/cache.js` and Phase 9 feedback —
 * it does not survive the tab, and nothing here implies it does.
 */

"use strict";

C360.history = (function () {

    var util = C360.util;

    var STORE_KEY = "c360:scorecard-history";

    /** Keep this many runs per account. Enough for a sparkline, not a database. */
    var MAX_RUNS = 24;

    function read() {
        try {
            var raw = window.sessionStorage.getItem(STORE_KEY);
            var parsed = raw ? JSON.parse(raw) : null;
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function write(store) {
        try {
            window.sessionStorage.setItem(STORE_KEY, JSON.stringify(store));
            return true;
        } catch (error) {
            // Storage blocked in this embedding. Trends are a convenience; the
            // scores themselves are unaffected.
            return false;
        }
    }

    /**
     * Record one scoring run for one account.
     *
     * Two rules, both of which exist to stop the series describing movement
     * that did not happen:
     *
     *   A RUN AT AN EXISTING `asOf` REPLACES IT, wherever it sits in the
     *   series — not just when it happens to be the newest. Comparing only
     *   against the last entry meant re-recording an earlier run appended it to
     *   the end, producing a series that ran A, B, A and a "trend" that was
     *   purely an artefact of the write order.
     *
     *   THE SERIES IS SORTED BY `asOf`. A sparkline reads left to right as
     *   time, so the array has to be in time order regardless of the order
     *   things were recorded in.
     */
    function record(model) {
        if (!model || !model.accountId) { return false; }

        var store = read();
        var runs = util.list(store[model.accountId]).slice();
        var summary = model.summary || {};

        var point = {
            asOf: model.asOf,
            healthScore: summary.healthAvailable ? summary.healthScore : null,
            healthBand: summary.healthBand || null,
            priorityScore: summary.priorityScore,
            priorityLevel: summary.priorityLevel,
            confidencePct: summary.confidencePct,
            primaryQueue: summary.primaryQueue || null
        };

        var existing = -1;
        for (var i = 0; i < runs.length; i++) {
            if (runs[i].asOf === point.asOf) { existing = i; break; }
        }

        if (existing !== -1) {
            runs[existing] = point;
        } else {
            runs.push(point);
        }

        runs.sort(function (a, b) {
            var da = util.toDate(a.asOf);
            var db = util.toDate(b.asOf);
            if (!da && !db) { return 0; }
            if (!da) { return -1; }
            if (!db) { return 1; }
            return da.getTime() - db.getTime();
        });

        store[model.accountId] = runs.slice(-MAX_RUNS);
        return write(store);
    }

    function recordAll(models) {
        util.list(models).forEach(record);
    }

    /** Every stored run for one account, oldest first. */
    function runsFor(accountId) {
        return util.list(read()[accountId]);
    }

    /** The run before the latest one, or null. What "what changed" compares against. */
    function previousRun(accountId) {
        var runs = runsFor(accountId);
        return runs.length >= 2 ? runs[runs.length - 2] : null;
    }

    /**
     * A trend series for one account.
     *
     * @returns {object}
     *   available   false until there are at least two stored runs
     *   points      [{ asOf, value, label }] — real stored values only
     *   direction   "up" | "down" | "flat" | null
     *   delta       change from first to last point, or null
     *   reason      why there is no trend, when there is not
     */
    function trend(accountId, key) {
        var field = key || "healthScore";
        var runs = runsFor(accountId);

        var points = runs.filter(function (run) {
            return run[field] !== null && run[field] !== undefined;
        }).map(function (run) {
            return {
                asOf: run.asOf,
                value: run[field],
                label: util.formatDate(run.asOf)
            };
        });

        if (points.length < 2) {
            return {
                available: false,
                points: points,
                direction: null,
                delta: null,
                runCount: runs.length,
                reason: runs.length === 0
                    ? "No scoring run has been recorded in this session yet."
                    : "Only one scoring run is recorded. A second refresh is needed "
                      + "before a trend can be shown — no previous value is invented "
                      + "to draw one sooner."
            };
        }

        var first = points[0].value;
        var last = points[points.length - 1].value;
        var delta = last - first;

        return {
            available: true,
            points: points,
            direction: delta > 1 ? "up" : (delta < -1 ? "down" : "flat"),
            delta: delta,
            runCount: runs.length,
            reason: null,
            min: points.reduce(function (low, p) { return Math.min(low, p.value); }, 100),
            max: points.reduce(function (high, p) { return Math.max(high, p.value); }, 0)
        };
    }

    /**
     * What changed for one account since the previous stored run.
     * Returns [] when there is nothing to compare against — never a fabricated
     * delta.
     */
    function changesFor(accountId, model) {
        var previous = previousRun(accountId);
        if (!previous || !model) { return []; }

        var out = [];
        var summary = model.summary || {};

        if (previous.priorityLevel && summary.priorityLevel
            && previous.priorityLevel !== summary.priorityLevel) {
            var rank = C360.scorecardConfig.priority.levelRank;
            out.push({
                kind: "priority",
                tone: rank[summary.priorityLevel] < rank[previous.priorityLevel]
                    ? "bad" : "good",
                text: "Priority " + previous.priorityLevel + " → " + summary.priorityLevel,
                from: previous.priorityLevel,
                to: summary.priorityLevel
            });
        }

        if (previous.healthScore !== null && previous.healthScore !== undefined
            && summary.healthAvailable) {
            var moved = Math.round(summary.healthScore) - Math.round(previous.healthScore);
            if (moved !== 0) {
                out.push({
                    kind: "health",
                    tone: moved < 0 ? "bad" : "good",
                    text: "Health " + Math.round(previous.healthScore) + " → "
                        + Math.round(summary.healthScore)
                        + " (" + (moved > 0 ? "+" : "") + moved + ")",
                    from: Math.round(previous.healthScore),
                    to: Math.round(summary.healthScore)
                });
            }
        }

        if (previous.primaryQueue !== summary.primaryQueue) {
            var labels = C360.scorecardConfig.queues.labels;
            out.push({
                kind: "queue",
                tone: "info",
                text: "Queue " + (previous.primaryQueue
                        ? labels[previous.primaryQueue] : "none")
                    + " → " + (summary.primaryQueue
                        ? labels[summary.primaryQueue] : "none")
            });
        }

        return out;
    }

    /** How many runs this session has recorded, across all accounts. */
    function runCount() {
        var store = read();
        return Object.keys(store).reduce(function (most, accountId) {
            return Math.max(most, util.list(store[accountId]).length);
        }, 0);
    }

    /** Test hook. Not called by the app. */
    function reset() {
        write({});
    }

    return {
        record: record,
        recordAll: recordAll,
        runsFor: runsFor,
        previousRun: previousRun,
        trend: trend,
        changesFor: changesFor,
        runCount: runCount,
        reset: reset,
        MAX_RUNS: MAX_RUNS
    };
}());
