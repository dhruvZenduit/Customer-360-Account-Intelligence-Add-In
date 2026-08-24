/**
 * Customer 360 — EVIDENCE  (shared by Phases 2-9)
 * ===============================================
 * One evidence shape, built one way, used by every scorecard engine.
 *
 * This file is not named in the phase plan. It exists because global rule G5
 * requires the pipeline to be traversable backwards —
 *
 *     ACTION -> WHY? -> SIGNALS -> EVIDENCE -> SOURCE
 *
 * — from six different engines (health, confidence, overrides, priority,
 * queues, actions). Six local copies of "turn a record into an evidence row"
 * is how the fifth copy quietly stops carrying the source date, and a
 * evidence row that cannot reach its record is the exact failure mode Phase 7
 * forbids. So it is written once, here.
 *
 * An evidence row always answers four questions: what claim, from which
 * record, on what date, and how do I get to it.
 */

"use strict";

C360.evidence = (function () {

    var util = C360.util;

    function display() { return C360.scorecardConfig.display; }

    /**
     * Build one evidence row.
     *
     * @param {object} spec
     *   label      required — what the user reads
     *   type       record type: ticket | quote | order | escalation | review |
     *              communication | device | sla | renewal | commitment | news |
     *              website-signal
     *   id         the source record id, so the UI can deep-link or scroll to it
     *   date       ISO date of the record
     *   excerpt    the matched span, for text-derived evidence. This is what
     *              lets a user spot a false positive at a glance.
     */
    function make(spec) {
        var s = spec || {};
        return {
            label: s.label || null,
            type: s.type || null,
            id: s.id === undefined || s.id === null ? null : String(s.id),
            date: s.date || null,
            url: s.url || null,
            /** internal | website | external — drives the source badge. */
            source: s.source || "internal",
            sourceLabel: s.sourceLabel || null,
            /** Matched text span for text-derived evidence, else null. */
            excerpt: s.excerpt || null,
            /** Phase 1 identity confidence, shown on external evidence. */
            confidencePct: s.confidencePct === undefined ? null : s.confidencePct,
            /** record | derived | model — Phase 8 provenance. */
            provenance: s.provenance || "record",
            /** Which existing Customer 360 section to scroll to as a fallback. */
            section: s.section || sectionFor(s.type),
            mock: s.mock === true
        };
    }

    /**
     * The existing dashboard section an evidence row can fall back to when the
     * source system has no deep link. Phase 7 counts "scroll to the section
     * that shows this record" as reaching the source; it does not count a dead
     * label.
     */
    var SECTIONS = {
        ticket: "c360-support",
        escalation: "c360-escalations",
        quote: "c360-commercial",
        order: "c360-commercial",
        renewal: "c360-commercial",
        contract: "c360-commercial",
        commitment: "c360-reviews",
        review: "c360-reviews",
        communication: "c360-timeline",
        email: "c360-timeline",
        device: "c360-health",
        sla: "c360-support",
        news: "c360-external",
        "website-signal": "c360-external",
        website: "c360-external",
        contact: "c360-contacts"
    };

    function sectionFor(type) {
        return SECTIONS[type] || null;
    }

    /**
     * Evidence from an already-built FACT (js/intelligence/facts.js).
     *
     * Preferred over `fromRecord` wherever a fact exists, because the fact
     * layer has already restated the record as one sentence with its
     * provenance attached — re-describing it here would let the two drift.
     */
    function fromFact(fact, label) {
        if (!fact) { return null; }
        return make({
            label: label || fact.statement,
            type: fact.recordType,
            id: fact.recordId,
            date: fact.date,
            url: fact.url,
            source: fact.source,
            sourceLabel: fact.sourceLabel,
            mock: fact.mock
        });
    }

    /** Evidence rows for a list of facts. Nulls are dropped, never rendered. */
    function fromFacts(facts, label) {
        return util.list(facts).map(function (fact) {
            return fromFact(fact, label);
        }).filter(Boolean);
    }

    /**
     * Evidence from a normalised record when no fact was built for it — the
     * scorecard reads sources (device health, contracts, commitments,
     * communications) that the fact layer does not cover.
     */
    function fromRecord(record, spec) {
        if (!record) { return null; }
        var s = spec || {};
        return make({
            label: s.label || record.subject || record.title || record.description || null,
            type: s.type || record.type || null,
            id: record.id,
            date: s.date || record.date || null,
            url: record.url || null,
            source: record.source || "internal",
            sourceLabel: record.sourceLabel || s.sourceLabel || null,
            excerpt: s.excerpt || null,
            mock: record.mock === true
        });
    }

    /**
     * Group evidence by source class for the Phase 7 drawer, in the configured
     * order. Groups with nothing in them are omitted rather than rendered
     * empty — but a component with NO evidence at all renders
     * `display.emptyEvidenceLabel`, which is the caller's job, not this one's.
     */
    function group(rows) {
        var byType = display().evidenceGroupByRecordType || {};
        var order = util.list(display().evidenceGroups);
        var labels = display().evidenceGroupLabels || {};

        var buckets = {};
        util.list(rows).forEach(function (row) {
            var key = byType[row.type] || (row.source === "external" ? "external" : "internal");
            buckets[key] = buckets[key] || [];
            buckets[key].push(row);
        });

        return order.filter(function (key) {
            return buckets[key] && buckets[key].length;
        }).map(function (key) {
            return {
                key: key,
                label: labels[key] || util.humanize(key),
                items: buckets[key]
            };
        });
    }

    /**
     * Stamp identity confidence onto external evidence. Phase 7 requires an
     * article matched at 90% to be SHOWN as matched at 90%, so the user can
     * discount it themselves rather than trusting it equally with a CRM record.
     */
    function withIdentityConfidence(rows, identity) {
        if (!identity) { return util.list(rows); }
        return util.list(rows).map(function (row) {
            if (row.source !== "external" && row.source !== "website") { return row; }
            if (row.confidencePct !== null) { return row; }
            var pct = C360.identity.confidenceFor(identity, row.source);
            if (pct === null) { return row; }
            var copy = {};
            Object.keys(row).forEach(function (key) { copy[key] = row[key]; });
            copy.confidencePct = pct;
            return copy;
        });
    }

    /** Distinct evidence ids, for the Phase 9 feedback record. */
    function ids(rows) {
        var seen = {};
        return util.list(rows).map(function (row) {
            return row.type + ":" + row.id;
        }).filter(function (key) {
            if (seen[key]) { return false; }
            seen[key] = true;
            return true;
        });
    }

    /** De-duplicate rows that describe the same record. */
    function dedupe(rows) {
        var seen = {};
        return util.list(rows).filter(function (row) {
            var key = row.type + ":" + row.id + ":" + (row.excerpt || "");
            if (seen[key]) { return false; }
            seen[key] = true;
            return true;
        });
    }

    return {
        make: make,
        fromFact: fromFact,
        fromFacts: fromFacts,
        fromRecord: fromRecord,
        group: group,
        withIdentityConfidence: withIdentityConfidence,
        sectionFor: sectionFor,
        ids: ids,
        dedupe: dedupe
    };
}());
