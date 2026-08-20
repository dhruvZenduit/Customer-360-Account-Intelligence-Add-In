/**
 * Customer 360 — UI components
 * ============================
 * Small functions that return HTML strings. The app renders by building a
 * string per section and assigning it once, which keeps rendering cheap and
 * predictable without pulling in a framework.
 *
 * SAFETY: every value that came from a data source goes through
 * util.escapeHtml, and every link through util.safeUrl. External web research
 * is untrusted input — treat any new template here the same way.
 */

"use strict";

C360.components = (function () {

    var util = C360.util;
    var esc = util.escapeHtml;

    // -----------------------------------------------------------------
    // Source attribution — the thing that keeps internal and external
    // information visually distinct (spec sections 4 and 24).
    // -----------------------------------------------------------------

    /**
     * @param {string} sourceLabel printed text, e.g. "Internal CRM"
     * @param {string} sourceType  internal | website | external
     */
    function sourceBadge(sourceLabel, sourceType) {
        if (!sourceLabel) { return ""; }
        return '<span class="c360-source c360-source--' + esc(sourceType || "internal") + '">'
             + esc(sourceLabel) + '</span>';
    }

    /** Loud, deliberately ugly marker on invented sample data. */
    function mockBadge(isMock) {
        return isMock ? '<span class="c360-mock" title="Sample data — not a real record">MOCK</span>' : "";
    }

    function confidenceChip(level) {
        if (!level) { return ""; }
        return '<span class="c360-confidence c360-confidence--' + esc(util.slug(level)) + '">'
             + 'Confidence: ' + esc(level) + '</span>';
    }

    function severityChip(severity, basis) {
        if (!severity) { return ""; }
        return '<span class="c360-chip c360-chip--' + esc(util.slug(severity)) + '"'
             + (basis ? ' title="' + esc(basis) + '"' : "") + '>' + esc(severity) + '</span>';
    }

    function priorityChip(priority) {
        if (!priority) { return ""; }
        return '<span class="c360-chip c360-chip--' + esc(util.slug(priority)) + '">'
             + esc(priority) + '</span>';
    }

    function statusChip(status, tone) {
        if (!status) { return '<span class="c360-chip c360-chip--neutral">Not available</span>'; }
        return '<span class="c360-chip c360-chip--' + esc(tone || "neutral") + '">'
             + esc(status) + '</span>';
    }

    /** External link, or plain text when the URL is missing or unsafe. */
    function link(url, text) {
        var safe = util.safeUrl(url);
        if (!safe) { return esc(text); }
        return '<a class="c360-link" href="' + safe + '" target="_blank" rel="noopener noreferrer">'
             + esc(text) + '<span class="c360-link-icon" aria-hidden="true">&#8599;</span></a>';
    }

    // -----------------------------------------------------------------
    // Layout primitives
    // -----------------------------------------------------------------

    function section(spec) {
        return '<section class="c360-section" id="' + esc(spec.id) + '"'
             + (spec.filterTags ? ' data-filter-tags="' + esc(spec.filterTags.join(" ")) + '"' : "")
             + '>'
             + '<div class="c360-section-head">'
             + '<h2 class="c360-section-title">' + esc(spec.title) + '</h2>'
             + (spec.meta ? '<span class="c360-section-meta">' + spec.meta + '</span>' : "")
             + '</div>'
             + (spec.note ? '<p class="c360-section-note">' + esc(spec.note) + '</p>' : "")
             + '<div class="c360-section-body">' + spec.body + '</div>'
             + '</section>';
    }

    function card(spec) {
        return '<article class="c360-card' + (spec.tone ? ' c360-card--' + esc(spec.tone) : "") + '">'
             + (spec.eyebrow ? '<p class="c360-card-eyebrow">' + spec.eyebrow + '</p>' : "")
             + (spec.title ? '<h3 class="c360-card-title">' + esc(spec.title) + '</h3>' : "")
             + spec.body
             + (spec.footer ? '<div class="c360-card-foot">' + spec.footer + '</div>' : "")
             + '</article>';
    }

    /** Professional empty state — never a blank card (spec section 33). */
    function emptyState(message) {
        return '<p class="c360-empty">' + esc(message) + '</p>';
    }

    /** Label/value row. A null value always renders as "Not available". */
    function kv(label, value, extra) {
        var text = (value === null || value === undefined || value === "") ? "Not available" : value;
        var isMissing = text === "Not available";
        return '<div class="c360-kv">'
             + '<dt class="c360-kv-key">' + esc(label) + '</dt>'
             + '<dd class="c360-kv-value' + (isMissing ? ' c360-kv-value--missing' : "") + '">'
             + esc(text) + (extra ? " " + extra : "") + '</dd>'
             + '</div>';
    }

    /** Same as kv(), but the value is pre-built HTML. */
    function kvHtml(label, html) {
        return '<div class="c360-kv">'
             + '<dt class="c360-kv-key">' + esc(label) + '</dt>'
             + '<dd class="c360-kv-value">' + (html || '<span class="c360-kv-value--missing">Not available</span>') + '</dd>'
             + '</div>';
    }

    function statTile(label, value, tone) {
        return '<div class="c360-stat' + (tone ? ' c360-stat--' + esc(tone) : "") + '">'
             + '<span class="c360-stat-value">' + esc(String(value)) + '</span>'
             + '<span class="c360-stat-label">' + esc(label) + '</span>'
             + '</div>';
    }

    /**
     * Direction glyph. Always accompanied by a text label in the caller, so
     * the arrow is a second cue rather than the only one.
     */
    function directionGlyph(direction) {
        var glyphs = { up: "&#8593;", down: "&#8595;", warn: "&#9888;", flat: "&#8594;" };
        return '<span class="c360-dir c360-dir--' + esc(direction || "flat") + '" aria-hidden="true">'
             + (glyphs[direction] || glyphs.flat) + '</span>';
    }

    // -----------------------------------------------------------------
    // Evidence — the bridge between a claim and its sources
    // -----------------------------------------------------------------

    /**
     * Render the facts behind an interpretation.
     *
     * This is what makes the difference between FACT, SOURCE and DATE on one
     * side and AI-style interpretation on the other legible to the user
     * (spec section 24). Interpretations always sit above their evidence list,
     * never inside it.
     */
    function evidence(facts, label) {
        var list = util.list(facts);
        if (!list.length) {
            return '<p class="c360-evidence-none">No supporting record is available for this item.</p>';
        }

        var items = list.map(function (fact) {
            var when = fact.date ? util.formatDate(fact.date) : "Date not available";
            var text = fact.statement || fact.title || "";
            return '<li class="c360-evidence-item">'
                 + '<span class="c360-evidence-text">' + esc(text) + '</span>'
                 + '<span class="c360-evidence-meta">'
                 + sourceBadge(fact.sourceLabel, fact.source)
                 + '<span class="c360-evidence-date">' + esc(when) + '</span>'
                 + mockBadge(fact.mock)
                 + (util.safeUrl(fact.url) ? " " + link(fact.url, "Source") : "")
                 + '</span>'
                 + '</li>';
        }).join("");

        return '<details class="c360-evidence">'
             + '<summary class="c360-evidence-summary">'
             + esc(label || "Evidence") + ' (' + list.length + ')</summary>'
             + '<ul class="c360-evidence-list">' + items + '</ul>'
             + '</details>';
    }

    /** Bullet list, or nothing at all when there is nothing to list. */
    function bullets(items, emptyMessage) {
        var list = util.list(items);
        if (!list.length) {
            return emptyMessage ? '<p class="c360-empty-inline">' + esc(emptyMessage) + '</p>' : "";
        }
        return '<ul class="c360-bullets">'
             + list.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join("")
             + '</ul>';
    }

    /** Labelled group of bullets, omitted entirely when empty. */
    function bulletGroup(label, items) {
        if (!util.list(items).length) { return ""; }
        return '<div class="c360-bullet-group">'
             + '<h4 class="c360-bullet-title">' + esc(label) + '</h4>'
             + bullets(items) + '</div>';
    }

    return {
        sourceBadge: sourceBadge,
        mockBadge: mockBadge,
        confidenceChip: confidenceChip,
        severityChip: severityChip,
        priorityChip: priorityChip,
        statusChip: statusChip,
        link: link,
        section: section,
        card: card,
        emptyState: emptyState,
        kv: kv,
        kvHtml: kvHtml,
        statTile: statTile,
        directionGlyph: directionGlyph,
        evidence: evidence,
        bullets: bullets,
        bulletGroup: bulletGroup,
        esc: esc
    };
}());
