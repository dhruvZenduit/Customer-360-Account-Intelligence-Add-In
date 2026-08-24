/**
 * Customer 360 — DATA CONFIDENCE  (Phase 2)
 * =========================================
 * Confidence is NOT health. It measures how complete and reliable the data
 * behind the scores is:
 *
 *     Health:     42 / 100
 *     Priority:   91 / 100
 *     Confidence: 84%
 *
 * Collapsing these into one figure is the single most tempting simplification
 * in the product and the most damaging. `Health 61 (confidence 54%)` tells a
 * user to go and look; `Health 46` — the same account with the device feed
 * silently scored as zero — tells them to escalate. Only one of those is true.
 *
 * Six weighted inputs, from `health.confidence.inputs`:
 *
 *     freshness           how stale the newest data per source is
 *     categoryCoverage    how many of the five health categories had data
 *     sourceReliability   internal record vs matched external article
 *     identityConfidence  the weakest attached link from Phase 1
 *     recentActivity      is anything happening on this account at all
 *     conflicts           sources that disagree with each other
 *
 * The methodology is transparent and the number is never back-solved to make a
 * score look more solid than it is.
 *
 * Pure: `asOf` injected, no clock.
 */

"use strict";

C360.confidence = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig.health.confidence; }

    /**
     * Freshness horizons reuse `config.cacheTtlMs` — that block already encodes
     * how quickly each source class goes stale, and inventing a second set of
     * horizons here would guarantee the two drift apart.
     *
     * A source is "recent" inside one TTL, "ageing" inside ten, "stale" beyond.
     */
    function freshnessState(dateValue, sourceClass, asOf) {
        if (!dateValue) { return "missing"; }
        var age = util.daysAgo(dateValue, asOf);
        if (age === null) { return "missing"; }

        var ttlMs = C360.config.cacheTtlMs[sourceClass] || C360.config.cacheTtlMs.internal;
        var ttlDays = Math.max(1, ttlMs / 86400000);

        if (age <= ttlDays * 10) { return "recent"; }
        if (age <= ttlDays * 60) { return "ageing"; }
        return "stale";
    }

    /** Score 0-1 for one freshness state. */
    var FRESHNESS_SCORE = { recent: 1, ageing: 0.6, stale: 0.25, partial: 0.6, missing: 0 };

    /**
     * Newest record date per source key, so freshness measures the data rather
     * than when we happened to fetch it. A cache hit on a six-month-old ticket
     * list is not fresh ticket data.
     */
    function newestDates(bundle, asOf) {
        var data = bundle || {};

        function newest(records) {
            var sorted = util.list(records).slice().sort(util.byDateDesc);
            return sorted.length ? sorted[0].date : null;
        }

        return {
            account: data.account ? (data.account.customerSince || null) : null,
            quotes: newest(data.quotes),
            orders: newest(data.orders),
            tickets: newest(data.tickets),
            billing: newest(data.billingIssues),
            technical: newest(data.technicalIssues),
            reviews: newest(data.reviews),
            contacts: newest(data.contacts),
            geotab: data.geotab && data.geotab.available ? (asOf || null) : null,
            deviceHealth: data.deviceHealth && data.deviceHealth.available
                ? (data.deviceHealth.asOf || null) : null,
            website: data.website ? data.website.fetchedAt : null,
            external: newest(data.external)
        };
    }

    /**
     * Per-source rows for the Phase 7 confidence drawer.
     *
     * Contact information gets special handling: a contact list where some
     * entries are unverified is `partial`, not `recent`. Presenting a scraped
     * name at the same confidence as a CRM contact is how a draft email ends up
     * addressed to somebody who left the company.
     */
    function sourceRows(bundle, asOf) {
        var data = bundle || {};
        var dates = newestDates(data, asOf);
        var classes = cfg().freshnessClassBySource || {};
        var labels = cfg().stateLabels || {};

        return util.list(cfg().sourceRows).map(function (row) {
            var state = freshnessState(dates[row.key], classes[row.key] || "internal", asOf);
            var note = null;

            if (row.key === "contacts" && state !== "missing") {
                var contacts = util.list(data.contacts);
                var unverified = contacts.filter(function (contact) {
                    return contact.confidence !== "Confirmed";
                });
                if (unverified.length) {
                    state = "partial";
                    note = util.plural(unverified.length, "contact")
                         + " not confirmed against a system of record.";
                }
            }

            if (state === "missing") {
                note = "No records available from this source.";
            }

            return {
                key: row.key,
                label: row.label,
                state: state,
                stateLabel: labels[state] || util.humanize(state),
                note: note
            };
        });
    }

    // -----------------------------------------------------------------
    // The six inputs
    // -----------------------------------------------------------------

    function freshnessInput(rows) {
        var present = rows.filter(function (row) { return row.state !== "missing"; });
        if (!present.length) { return 0; }
        var total = present.reduce(function (sum, row) {
            return sum + (FRESHNESS_SCORE[row.state] || 0);
        }, 0);
        return total / present.length;
    }

    function coverageInput(categories) {
        var list = util.list(categories);
        if (!list.length) { return 0; }
        var available = list.filter(function (item) { return item.available; });
        return available.length / list.length;
    }

    /**
     * Weighted by how much of the evidence came from which class of source.
     * An account whose picture rests mainly on external research is a less
     * reliable picture than one resting on CRM and ticket records — even when
     * both are equally fresh.
     */
    function reliabilityInput(bundle) {
        var data = bundle || {};
        var reliability = cfg().sourceReliability || {};

        var counts = {
            internal: util.list(data.quotes).length + util.list(data.orders).length
                     + util.list(data.tickets).length + util.list(data.reviews).length
                     + util.list(data.billingIssues).length
                     + util.list(data.technicalIssues).length,
            website: data.website ? util.list(data.website.growthSignals).length + 1 : 0,
            external: util.list(data.external).length
        };

        var total = counts.internal + counts.website + counts.external;
        if (!total) { return 0; }

        return (counts.internal * (reliability.internal || 0)
              + counts.website * (reliability.website || 0)
              + counts.external * (reliability.external || 0)) / total;
    }

    function identityInput(identity) {
        if (!identity || identity.confidencePct === null
            || identity.confidencePct === undefined) {
            return 0;
        }
        return Math.max(0, Math.min(1, identity.confidencePct / 100));
    }

    /**
     * Is anything happening on this account at all? An account whose newest
     * record of any kind is eight months old cannot support a confident reading,
     * however complete that old data is.
     */
    function recentActivityInput(bundle, asOf) {
        var data = bundle || {};
        var recentDays = C360.config.thresholds.recentActivityDays;

        var everything = util.list(data.quotes)
            .concat(util.list(data.orders))
            .concat(util.list(data.tickets))
            .concat(util.list(data.reviews))
            .concat(util.list(data.communications))
            .concat(util.list(data.billingIssues))
            .concat(util.list(data.technicalIssues));

        if (!everything.length) { return 0; }

        var newest = everything.slice().sort(util.byDateDesc)[0];
        var age = util.daysAgo(newest && newest.date, asOf);
        if (age === null) { return 0; }

        if (age <= recentDays) { return 1; }
        if (age <= recentDays * 3) { return 0.6; }
        if (age <= 365) { return 0.3; }
        return 0.1;
    }

    /**
     * Detected conflicts between sources. Returns 1 when nothing disagrees.
     *
     * Only genuine contradictions count. A website stating a larger fleet than
     * the platform records is a real conflict about a real number; two sources
     * describing the same thing differently is not.
     */
    function conflicts(bundle, signals, identity) {
        var found = [];

        util.list(signals).forEach(function (item) {
            if (item.key === "fleetGap") {
                found.push({
                    text: "Stated fleet size and recorded asset count disagree.",
                    detail: item.statement
                });
            }
        });

        // An unmatched source that claims to be this account is a conflict about
        // identity itself.
        util.list(identity && identity.unmatched).forEach(function (link) {
            if (link.confidencePct > 0) {
                found.push({
                    text: "A " + (link.label || link.system)
                        + " source could not be confidently matched to this account.",
                    detail: link.reason || null
                });
            }
        });

        return found;
    }

    function conflictsInput(found) {
        if (!found.length) { return 1; }
        // Each conflict costs a third, floored — three unresolved contradictions
        // is already "do not trust this without looking".
        return Math.max(0, 1 - (found.length / 3));
    }

    // -----------------------------------------------------------------
    // Build
    // -----------------------------------------------------------------

    /**
     * @param {object} bundle
     * @param {object} options { categories, identity, asOf, signals }
     * @returns {object} { pct, sources[], limitations[], inputs[], low }
     */
    function build(bundle, options) {
        var opts = options || {};
        var asOf = opts.asOf || null;
        var weights = cfg().inputs;

        var rows = sourceRows(bundle, asOf);
        var found = conflicts(bundle, opts.signals, opts.identity);

        var values = {
            freshness: freshnessInput(rows),
            categoryCoverage: coverageInput(opts.categories),
            sourceReliability: reliabilityInput(bundle),
            identityConfidence: identityInput(opts.identity),
            recentActivity: recentActivityInput(bundle, asOf),
            conflicts: conflictsInput(found)
        };

        var pct = 0;
        var inputs = Object.keys(weights).map(function (key) {
            var contribution = (values[key] || 0) * weights[key];
            pct += contribution;
            return {
                key: key,
                label: util.humanize(key),
                value: values[key],
                weight: weights[key],
                contribution: contribution * 100
            };
        });

        pct = Math.round(Math.max(0, Math.min(1, pct)) * 100);

        // ---- Limitations: the plain-language version of the number -----
        var limitations = [];

        util.list(opts.categories).forEach(function (item) {
            if (!item.available) {
                limitations.push("Limited " + item.label.toLowerCase() + " data available.");
            }
        });

        rows.forEach(function (row) {
            if (row.state === "missing") {
                limitations.push("No " + row.label.toLowerCase() + " found.");
            } else if (row.state === "stale") {
                limitations.push(row.label + " has not been updated recently.");
            } else if (row.state === "partial" && row.note) {
                limitations.push(row.label + ": " + row.note);
            }
        });

        found.forEach(function (conflict) { limitations.push(conflict.text); });

        if (opts.identity && opts.identity.confidencePct !== null
            && opts.identity.confidencePct < 100) {
            limitations.push("Account identity is matched at "
                + opts.identity.confidencePct + "% across attached sources.");
        }

        return {
            pct: pct,
            /** Per-source rows for the Phase 7 drawer. */
            sources: rows,
            limitations: limitations,
            /** The arithmetic, so the methodology can be rendered, not asserted. */
            inputs: inputs,
            conflicts: found,
            /** Below this the UI must lead with the limitation, not the score. */
            low: pct < cfg().lowConfidencePct,
            lowThresholdPct: cfg().lowConfidencePct
        };
    }

    return {
        build: build,
        freshnessState: freshnessState,
        sourceRows: sourceRows
    };
}());
