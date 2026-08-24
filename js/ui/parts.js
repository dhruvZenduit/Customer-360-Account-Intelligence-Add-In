/**
 * Customer 360 — COMMAND CENTER PRIMITIVES
 * ========================================
 * The small pieces the command center, the account workspace and the brief all
 * render: a priority readout, a queue badge, a figure tile, a factor bar, a
 * sparkline.
 *
 * Written once because they encode rules that must not drift between screens:
 *
 *   A PRIORITY LEVEL IS ALWAYS A DOT PLUS ITS TEXT. `plevel()` cannot render a
 *   dot without "P0" beside it. Colour is a second cue everywhere or it is a
 *   trap somewhere.
 *
 *   AN UNAVAILABLE NUMBER IS NEVER A ZERO AND NEVER A DASH. `figure()` prints
 *   the configured unavailable label with its reason.
 *
 *   A SPARKLINE NEEDS TWO REAL POINTS. `sparkline()` refuses to draw a line
 *   from one stored run, because the only way to draw one would be to invent
 *   the other end.
 *
 * These are string builders. `escapeHtml` on every value that came from a data
 * source; external research reaches this layer and is untrusted input.
 */

"use strict";

C360.parts = (function () {

    var util = C360.util;
    var esc = util.escapeHtml;

    function display() { return C360.scorecardConfig.display; }

    // -----------------------------------------------------------------
    // Priority + queue
    // -----------------------------------------------------------------

    /**
     * `● P0 · 92` — dot, level, score.
     *
     * @param {string} level P0..P3
     * @param {number|null} score
     * @param {object} options { showScore, srPrefix }
     */
    function plevel(level, score, options) {
        var opts = options || {};
        var safeLevel = level || "P3";
        var labels = C360.scorecardConfig.priority.levelLabels;

        return '<span class="c360-plevel c360-plevel--' + esc(safeLevel) + '">'
             + '<span class="c360-pdot" aria-hidden="true"></span>'
             // The level word is available to screen readers even when the
             // visual shows only the code.
             + '<span class="c360-visually-hidden">Priority '
             + esc(labels[safeLevel] || safeLevel) + ': </span>'
             + esc(safeLevel)
             + (opts.showScore === false || score === null || score === undefined
                ? ""
                : ' · ' + Math.round(score))
             + '</span>';
    }

    /** `SAVE` / `FIX` / `GROW` / `ENGAGE`, or an explicit "no queue". */
    function qbadge(queue) {
        var labels = C360.scorecardConfig.queues.labels;
        if (!queue) {
            return '<span class="c360-qbadge c360-qbadge--none">No action</span>';
        }
        return '<span class="c360-qbadge c360-qbadge--' + esc(queue) + '">'
             + esc(labels[queue] || queue) + '</span>';
    }

    /** The health band as a word plus a tone, never a colour alone. */
    function band(health) {
        if (!health || !health.available) {
            return '<span class="c360-band c360-band--muted">'
                 + esc(display().unavailableLabel) + '</span>';
        }
        var tone = health.bandTone === "good" ? "good"
                 : health.bandTone === "watch" ? "watch" : "bad";
        return '<span class="c360-band c360-band--' + tone + '">'
             + '<span class="c360-pdot" aria-hidden="true"></span>'
             + esc(health.band) + '</span>';
    }

    // -----------------------------------------------------------------
    // Figures and facts
    // -----------------------------------------------------------------

    /**
     * One big monospace figure with a small label.
     *
     * `value: null` renders the unavailable label rather than a 0 or an em
     * dash — a dash reads as "nothing here", which is a different and more
     * flattering claim than "we could not measure this".
     */
    function figure(spec) {
        var s = spec || {};

        if (s.value === null || s.value === undefined) {
            return '<div class="c360-fig">'
                 + '<span class="c360-fig-value c360-fig-value--muted">'
                 + esc(display().unavailableLabel) + '</span>'
                 + '<span class="c360-fig-label">' + esc(s.label) + '</span>'
                 + (s.missingNote
                    ? '<span class="c360-fig-note">' + esc(s.missingNote) + '</span>'
                    : "")
                 + '</div>';
        }

        return '<div class="c360-fig">'
             + '<span class="c360-fig-value'
             + (s.tone ? " c360-fig-value--" + esc(s.tone) : "") + '">'
             + esc(String(s.value))
             + (s.unit ? '<span class="c360-fig-note">' + esc(s.unit) + '</span>' : "")
             + '</span>'
             + '<span class="c360-fig-label">' + esc(s.label) + '</span>'
             + (s.note ? '<span class="c360-fig-note">' + esc(s.note) + '</span>' : "")
             + '</div>';
    }

    /** A small label/value pair. `missing: true` styles it as an absence. */
    function fact(label, value, options) {
        var opts = options || {};
        var missing = value === null || value === undefined || value === "";

        return '<div class="c360-fact">'
             + '<span class="c360-fact-label">' + esc(label) + '</span>'
             + '<span class="c360-fact-value'
             + (missing ? " c360-fact-value--missing"
                        : (opts.text ? " c360-fact-value--text" : "")) + '">'
             + esc(missing ? (opts.missingLabel || "Not recorded") : String(value))
             + '</span></div>';
    }

    /** Compact money: $480K / $2.4M. Full precision belongs in the drawer. */
    function money(value) {
        if (value === null || value === undefined) { return null; }
        if (value >= 1000000) { return "$" + (value / 1000000).toFixed(1) + "M"; }
        if (value >= 1000) { return "$" + Math.round(value / 1000) + "K"; }
        return "$" + Math.round(value);
    }

    // -----------------------------------------------------------------
    // Factor bars
    // -----------------------------------------------------------------

    /**
     * The priority score decomposed into its factors.
     *
     * The bar length is the factor's CONTRIBUTION, not its raw score, so the
     * bars sum to the total printed underneath. Showing raw scores would give
     * four bars that look like they should add to 100 and do not.
     */
    function factorBars(priority) {
        if (!priority) { return ""; }

        var rows = util.list(priority.factors).map(function (factor) {
            if (!factor.available) {
                return '<div class="c360-bar c360-bar--unavailable">'
                     + '<span class="c360-bar-label">' + esc(factor.label) + '</span>'
                     + '<span class="c360-bar-value">n/a</span>'
                     + '<span class="c360-bar-track"></span>'
                     + '</div>';
            }

            // Scaled against the largest possible contribution so the bars are
            // comparable with each other rather than each filling its own row.
            var width = Math.max(0, Math.min(100, factor.contribution));
            var tone = factor.contribution >= 25 ? "bad"
                     : factor.contribution >= 12 ? "watch" : "";

            return '<div class="c360-bar">'
                 + '<span class="c360-bar-label">' + esc(factor.label) + '</span>'
                 + '<span class="c360-bar-value">'
                 + factor.contribution.toFixed(1) + '</span>'
                 + '<span class="c360-bar-track">'
                 + '<span class="c360-bar-fill' + (tone ? " c360-bar-fill--" + tone : "")
                 + '" style="width:' + width.toFixed(1) + '%"></span>'
                 + '</span></div>';
        }).join("");

        return '<div class="c360-bars">' + rows
             + '<div class="c360-bar-total">'
             + '<span class="c360-bar-total-label">Total</span>'
             + '<span class="c360-bar-total-value">'
             + Math.round(priority.score) + '</span>'
             + '</div>'
             + (priority.unavailableFactors.length
                ? '<p class="c360-answer-method">Weights re-normalised across the '
                  + 'factors that have data. Excluded: '
                  + esc(priority.unavailableFactors.join(", ")) + '.</p>'
                : "")
             + '</div>';
    }

    // -----------------------------------------------------------------
    // Sparkline
    // -----------------------------------------------------------------

    /**
     * A health trend, from stored runs only.
     *
     * With fewer than two points this returns the honest empty state and no
     * chart. That is the whole reason this function exists rather than a CSS
     * background: the tempting alternative is to seed a plausible starting
     * value so the line has somewhere to come from, and a fabricated trend is
     * worse than no trend because the user cannot tell which they are seeing.
     */
    function sparkline(trend, options) {
        var opts = options || {};
        var title = opts.title || "Health trend";

        if (!trend || !trend.available) {
            return '<div class="c360-trend">'
                 + '<div class="c360-trend-head">'
                 + '<span class="c360-trend-title">' + esc(title) + '</span>'
                 + '</div>'
                 + '<p class="c360-trend-empty">'
                 + esc(trend ? trend.reason : display().noHistoryLabel)
                 + '</p></div>';
        }

        var width = 100;
        var height = 34;
        var points = trend.points;

        // Padded band so a flat series is not drawn as a line along the floor.
        var low = Math.max(0, Math.min(trend.min, 100) - 8);
        var high = Math.min(100, Math.max(trend.max, 0) + 8);
        var span = Math.max(1, high - low);

        var coords = points.map(function (point, index) {
            var x = points.length === 1
                ? width / 2
                : (index / (points.length - 1)) * width;
            var y = height - ((point.value - low) / span) * height;
            return { x: x, y: y, value: point.value, label: point.label };
        });

        var line = coords.map(function (point, index) {
            return (index === 0 ? "M" : "L") + point.x.toFixed(2)
                 + " " + point.y.toFixed(2);
        }).join(" ");

        var area = line + " L" + width + " " + height + " L0 " + height + " Z";
        var last = coords[coords.length - 1];

        var deltaClass = trend.direction === "up" ? "up"
                       : trend.direction === "down" ? "down" : "flat";

        return '<div class="c360-trend">'
             + '<div class="c360-trend-head">'
             + '<span class="c360-trend-title">' + esc(title) + '</span>'
             + '<span class="c360-trend-delta c360-trend-delta--' + deltaClass + '">'
             + (trend.delta > 0 ? "+" : "") + Math.round(trend.delta)
             + ' over ' + util.plural(trend.runCount, "run") + '</span>'
             + '</div>'
             + '<svg class="c360-spark" viewBox="0 0 ' + width + ' ' + height
             + '" preserveAspectRatio="none" role="img"'
             + ' aria-label="' + esc(title + ": "
                 + coords.map(function (c) { return Math.round(c.value); }).join(", ")) + '">'
             + '<defs><linearGradient id="c360-sparkfill" x1="0" y1="0" x2="0" y2="1">'
             + '<stop offset="0%" stop-color="#3B82F6" stop-opacity="0.26"/>'
             + '<stop offset="100%" stop-color="#3B82F6" stop-opacity="0"/>'
             + '</linearGradient></defs>'
             + '<path class="c360-spark-area" d="' + area + '"/>'
             + '<path class="c360-spark-line" d="' + line
             + '" vector-effect="non-scaling-stroke"/>'
             + '<circle class="c360-spark-dot" cx="' + last.x.toFixed(2)
             + '" cy="' + last.y.toFixed(2) + '" r="1.8"/>'
             + '</svg>'
             + '<div class="c360-maxis-x">'
             + '<span class="c360-maxis-label">' + esc(points[0].label) + '</span>'
             + '<span class="c360-maxis-label">'
             + esc(points[points.length - 1].label) + '</span>'
             + '</div></div>';
    }

    // -----------------------------------------------------------------
    // Evidence
    // -----------------------------------------------------------------

    /**
     * A numbered evidence row for the intelligence panel.
     *
     * The excerpt is quoted where one exists. That quote is the single most
     * useful thing in the panel: it is how a user spots that "we are evaluating
     * our routes" was read as a competitor threat, without opening anything.
     */
    function evidenceRow(index, spec) {
        var s = spec || {};
        var ordinal = index < 9 ? "0" + (index + 1) : String(index + 1);

        return '<li class="c360-evi">'
             + '<span class="c360-evi-ord">' + ordinal + '</span>'
             + '<div>'
             + '<div class="c360-evi-title c360-evi-title--' + esc(s.tone || "info") + '">'
             + esc(s.title) + '</div>'
             + (s.text ? '<p class="c360-evi-text">' + esc(s.text) + '</p>' : "")
             + (s.excerpt
                ? '<blockquote class="c360-evi-quote">' + esc(s.excerpt) + '</blockquote>'
                : "")
             + (util.list(s.meta).length
                ? '<div class="c360-evi-meta">'
                  + util.list(s.meta).map(function (item) {
                        return '<span>' + esc(item) + '</span>';
                    }).join("")
                  + '</div>'
                : "")
             + '</div></li>';
    }

    /** A panel wrapper, so every panel has the same head/body rhythm. */
    function panel(spec) {
        var s = spec || {};
        return '<section class="c360-panel'
             + (s.modifier ? " c360-panel--" + esc(s.modifier) : "") + '"'
             + (s.id ? ' id="' + esc(s.id) + '"' : "") + '>'
             + '<div class="c360-panel-head">'
             + '<h2 class="c360-panel-title">' + esc(s.title) + '</h2>'
             + (s.meta ? '<span class="c360-panel-meta">' + esc(s.meta) + '</span>' : "")
             + '</div>'
             + (s.sub ? '<p class="c360-panel-sub">' + esc(s.sub) + '</p>' : "")
             + (s.raw || '<div class="c360-panel-body'
                + (s.flush ? " c360-panel-body--flush" : "") + '">'
                + (s.body || "") + '</div>')
             + '</section>';
    }

    function emptyPanel(message) {
        return '<p class="c360-empty-panel">' + esc(message) + '</p>';
    }

    /**
     * The display label for a rule.
     *
     * Prefers the explicit label in config; falls back to de-camelCasing only
     * for a rule nobody has named yet, so an unlabelled new rule is legible but
     * visibly unfinished.
     */
    function ruleLabel(rule) {
        var overrides = C360.scorecardConfig.priority.overrideLabels || {};
        if (overrides[rule]) { return overrides[rule]; }

        var queueLabels = C360.scorecardConfig.queues.actionLabels || {};
        if (queueLabels[rule]) { return queueLabels[rule]; }

        return util.humanize(String(rule).replace(/([A-Z])/g, " $1")).trim();
    }

    /** `12:26` from an ISO date, for the signal feed. */
    function clockOf(value) {
        var d = util.toDate(value);
        if (!d) { return "--:--"; }
        var hours = d.getHours();
        var minutes = d.getMinutes();
        return (hours < 10 ? "0" + hours : hours) + ":"
             + (minutes < 10 ? "0" + minutes : minutes);
    }

    return {
        plevel: plevel,
        qbadge: qbadge,
        band: band,
        figure: figure,
        fact: fact,
        money: money,
        factorBars: factorBars,
        sparkline: sparkline,
        evidenceRow: evidenceRow,
        ruleLabel: ruleLabel,
        panel: panel,
        emptyPanel: emptyPanel,
        clockOf: clockOf
    };
}());
