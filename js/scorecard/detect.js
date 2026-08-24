/**
 * Customer 360 — DETERMINISTIC TEXT DETECTION  (shared, Phases 2-3)
 * =================================================================
 * Keyword and phrase matching over unstructured source text, with the matched
 * span kept as evidence.
 *
 * This is how a cancellation request becomes a signal without a model. It is
 * also, honestly, the weakest component in the product: "we are evaluating our
 * routes" will match the competitor-switch pattern, and no amount of care in
 * this file changes that. Two things make it survivable:
 *
 *   1. Every match keeps its excerpt, so a false positive is visible at a
 *      glance rather than hidden behind a score.
 *   2. Every pattern lives in `scorecardConfig.priority.detection`, so tuning
 *      is a config change argued from Phase 9's per-rule false-positive rates —
 *      not a code change argued from a hunch.
 *
 * Phase 8 adds AI-assisted extraction on top. It does not replace this: an
 * AI-proposed signal enters as a proposal and is judged by the same rules,
 * so removing the model changes recall and nothing else.
 *
 * Pure. No clock, no I/O.
 */

"use strict";

C360.detect = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig.priority; }

    /**
     * Text fields a record exposes to detection, per config. Reading every
     * field would mean matching "cancel" inside a status of "Cancelled" on an
     * unrelated order, so the field list is explicit.
     */
    function textOf(record) {
        var fields = util.list(cfg().detectionFields);
        var parts = [];
        fields.forEach(function (field) {
            var value = record && record[field];
            if (typeof value === "string" && value) { parts.push(value); }
        });
        // Arrays of strings on review records (concerns, requests) are read too:
        // "customer raised cancellation" is most often written there.
        ["concerns", "requests", "topics", "commitments", "followUps"].forEach(function (field) {
            util.list(record && record[field]).forEach(function (item) {
                if (typeof item === "string" && item) { parts.push(item); }
            });
        });
        return parts.join(" — ");
    }

    /**
     * Excerpt around a match, so the user sees the sentence rather than the
     * keyword. Word-boundary trimmed at both ends.
     */
    function excerptAround(text, index, length) {
        var radius = 60;
        var start = Math.max(0, index - radius);
        var end = Math.min(text.length, index + length + radius);

        var slice = text.slice(start, end);
        if (start > 0) {
            var firstSpace = slice.indexOf(" ");
            if (firstSpace > 0 && firstSpace < 20) { slice = slice.slice(firstSpace + 1); }
            slice = "…" + slice;
        }
        if (end < text.length) {
            var lastSpace = slice.lastIndexOf(" ");
            if (lastSpace > slice.length - 20) { slice = slice.slice(0, lastSpace); }
            slice = slice + "…";
        }
        return slice.trim();
    }

    /**
     * Find configured patterns in one record.
     *
     * @param {object} record  any normalised record with text fields
     * @param {string[]} patterns
     * @returns {Array<{pattern, excerpt, index}>}
     */
    function inRecord(record, patterns) {
        var text = textOf(record);
        if (!text) { return []; }
        var haystack = text.toLowerCase();
        var out = [];

        util.list(patterns).forEach(function (pattern) {
            var needle = String(pattern).toLowerCase();
            if (!needle) { return; }
            var index = haystack.indexOf(needle);
            if (index === -1) { return; }
            out.push({
                pattern: String(pattern),
                excerpt: excerptAround(text, index, needle.length),
                index: index
            });
        });

        return out;
    }

    /**
     * Find a named pattern set across a list of records.
     *
     * @param {Array} records
     * @param {string} patternKey key in scorecardConfig.priority.detection
     * @param {object} spec { type, sourceLabel } for the evidence rows
     * @returns {Array<{record, pattern, excerpt, evidence}>}
     */
    function across(records, patternKey, spec) {
        var patterns = util.list(cfg().detection[patternKey]);
        if (!patterns.length) { return []; }
        var options = spec || {};
        var out = [];

        util.list(records).forEach(function (record) {
            var matches = inRecord(record, patterns);
            if (!matches.length) { return; }

            // One hit per record. Three keywords in one email is still one
            // email, and counting it three times would inflate every rule that
            // reads the match count.
            var best = matches[0];
            out.push({
                record: record,
                pattern: best.pattern,
                excerpt: best.excerpt,
                evidence: C360.evidence.make({
                    label: options.label || (record.subject || record.title
                         || util.humanize(patternKey) + " language detected"),
                    type: options.type || record.type || "communication",
                    id: record.id,
                    date: record.date || null,
                    url: record.url || null,
                    source: record.source || "internal",
                    sourceLabel: record.sourceLabel || options.sourceLabel || null,
                    excerpt: best.excerpt,
                    mock: record.mock === true
                })
            });
        });

        return out;
    }

    /**
     * The record classes ONE pattern set is allowed to read, per
     * `priority.detectionScope`.
     *
     * Communications are the primary target for intent patterns, but a
     * cancellation is just as likely to be written into a review's "concerns"
     * array, and ignoring those is how the P0 override silently never fires.
     * Conversely the incident patterns must NOT read reviews — a QBR topic of
     * "Safety programme rollout" is a plan, not a collision.
     */
    function searchableRecords(bundle, patternKey) {
        var data = bundle || {};
        var scope = (cfg().detectionScope || {})[patternKey]
                 || util.list(cfg().defaultDetectionScope);

        return util.list(scope).reduce(function (all, key) {
            return all.concat(util.list(data[key]));
        }, []);
    }

    /**
     * Run one pattern set over the record classes its scope allows.
     * Convenience wrapper — the override rules all want exactly this.
     */
    function inBundle(bundle, patternKey, spec) {
        return across(searchableRecords(bundle, patternKey), patternKey, spec);
    }

    /**
     * Merge AI-proposed signals (Phase 8) into a detection result set.
     *
     * The proposals arrive already validated by `js/scorecard/ai.js`. They are
     * appended, marked `provenance: "model"`, and then judged by exactly the
     * same rule that judged the keyword matches. That is the whole contract:
     * the model widens recall, and decides nothing.
     */
    function withProposals(matches, proposals, patternKey) {
        var relevant = util.list(proposals).filter(function (proposal) {
            return proposal.signalKey === patternKey;
        });

        return util.list(matches).concat(relevant.map(function (proposal) {
            return {
                record: proposal.record || null,
                pattern: null,
                excerpt: proposal.excerpt || null,
                proposedByModel: true,
                evidence: C360.evidence.make({
                    label: proposal.text || util.humanize(patternKey) + " detected",
                    type: proposal.recordType || "communication",
                    id: proposal.recordId,
                    date: proposal.date || null,
                    source: "internal",
                    sourceLabel: proposal.sourceLabel || null,
                    excerpt: proposal.excerpt || null,
                    provenance: "model"
                })
            };
        }));
    }

    return {
        inRecord: inRecord,
        across: across,
        inBundle: inBundle,
        withProposals: withProposals,
        searchableRecords: searchableRecords,
        textOf: textOf
    };
}());
