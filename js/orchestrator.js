/**
 * Customer 360 — ACCOUNT INTELLIGENCE ORCHESTRATOR
 * ================================================
 * Fans every source out in parallel, then hands the combined result to the
 * intelligence engine.
 *
 * FAILURE ISOLATION IS THE WHOLE POINT (spec section 32). Each source is
 * wrapped so that a rejection becomes a *status*, not an exception:
 *
 *     external web research fails  ->  external: []  + status "unavailable"
 *                                      everything else still renders
 *
 * The one exception is the account record itself. Without it there is no
 * account to show, so that failure does reject — and the UI shows an error
 * state for the page rather than a half-empty dashboard.
 */

"use strict";

C360.orchestrator = (function () {

    var util = C360.util;

    /**
     * Run one source and never reject.
     *
     * @returns {Promise<{source, label, ok, value, cached, storedAt,
     *                    lastSuccess, error}>}
     */
    function reflect(service, accountId, ctx, options, fallback) {
        return service.load(accountId, ctx, options).then(function (result) {
            return {
                source: service.source,
                label: service.label,
                ok: true,
                value: result.value === undefined || result.value === null ? fallback : result.value,
                cached: result.cached,
                storedAt: result.storedAt,
                lastSuccess: C360.cache.lastSuccess(accountId, service.source),
                error: null
            };
        }).catch(function (error) {
            // Detail goes to the console for developers; the UI shows a plain
            // "temporarily unavailable" and the date data was last good.
            console.warn("Customer 360: source \"" + service.source + "\" failed.", error);
            return {
                source: service.source,
                label: service.label,
                ok: false,
                value: fallback,
                cached: false,
                storedAt: null,
                lastSuccess: C360.cache.lastSuccess(accountId, service.source),
                error: error && error.message ? error.message : "Unavailable"
            };
        });
    }

    /** Days covered by the currently selected date filter. */
    function daysForFilter(filterId) {
        var match = C360.config.dateFilters.filter(function (filter) {
            return filter.id === filterId;
        })[0];
        return match ? match.days : 90;
    }

    /**
     * Load everything for one account.
     *
     * @param {string} accountId
     * @param {object} options { forceRefresh: bool, dateFilterId: string }
     * @returns {Promise<{intelligence, sources, lastUpdated, isMock}>}
     */
    function load(accountId, options) {
        var opts = options || {};

        // Always fetch the wide window; the date filter only narrows display.
        // See config.fetchWindowDays for why.
        var fetchDays = C360.config.fetchWindowDays;
        var displayDays = daysForFilter(opts.dateFilterId || C360.config.defaultDateFilterId);

        if (opts.forceRefresh) {
            // Manual refresh means "go and look again", so every cached entry
            // for this account is dropped before the fan-out starts.
            C360.cache.clearAccount(accountId);
        }

        // ---- Step 1: identify the account --------------------------------
        return C360.accountService.load(accountId, null, opts).then(function (accountResult) {
            var account = accountResult.value;
            if (!account) {
                throw new Error("Account " + accountId + " was not found.");
            }

            var ctx = { account: account, days: fetchDays };

            var accountStatus = {
                source: "account",
                label: "Account record",
                ok: true,
                value: account,
                cached: accountResult.cached,
                storedAt: accountResult.storedAt,
                lastSuccess: C360.cache.lastSuccess(accountId, "account"),
                error: null
            };

            // ---- Step 2: fan out ------------------------------------------
            // Independent by design: no source waits on another, and no source
            // can fail another.
            return Promise.all([
                reflect(C360.quoteService, accountId, ctx, opts, []),
                reflect(C360.orderService, accountId, ctx, opts, []),
                reflect(C360.ticketService, accountId, ctx, opts, []),
                reflect(C360.billingService, accountId, ctx, opts, []),
                reflect(C360.technicalService, accountId, ctx, opts, []),
                reflect(C360.accountReviewService, accountId, ctx, opts, []),
                reflect(C360.websiteResearchService, accountId, ctx, opts, null),
                reflect(C360.webResearchService, accountId, ctx, opts, []),
                reflect(C360.contactService, accountId, ctx, opts, []),
                // MyGeotab is best-effort and already never rejects, but it is
                // wrapped the same way so it appears in the source strip.
                reflect(C360.geotabService, accountId, ctx, opts, null)
            ]).then(function (results) {
                var by = {};
                results.forEach(function (result) { by[result.source] = result; });

                var website = by.website.value;

                // Website leadership becomes contacts only where a person was
                // actually named — see contactService.mergeWebsiteLeadership.
                var contacts = C360.contactService.mergeWebsiteLeadership(
                    by.contacts.value, website
                );

                var intelligence = C360.intelligenceEngine.run({
                    account: account,
                    quotes: by.quotes.value,
                    orders: by.orders.value,
                    tickets: by.tickets.value,
                    billingIssues: by.billing.value,
                    technicalIssues: by.technical.value,
                    reviews: by.reviews.value,
                    website: website,
                    external: by.external.value,
                    contacts: contacts,
                    geotab: by.geotab.value
                });

                return {
                    intelligence: intelligence,
                    sources: [accountStatus].concat(results),
                    lastUpdated: new Date(),
                    dateFilterDays: displayDays,
                    isMock: C360.dataSource.isMock()
                };
            });
        });
    }

    /**
     * Roll the per-source statuses up into the three categories the UI shows
     * (spec section 32): Internal data, Customer website, External web.
     */
    function summariseSources(sources) {
        var groups = [
            { id: "internal", label: "Internal data",
              members: ["account", "quotes", "orders", "tickets", "billing", "technical", "reviews", "contacts", "geotab"] },
            { id: "website", label: "Customer website", members: ["website"] },
            { id: "external", label: "External web", members: ["external"] }
        ];

        return groups.map(function (group) {
            var members = util.list(sources).filter(function (source) {
                return group.members.indexOf(source.source) !== -1;
            });
            var failed = members.filter(function (source) { return !source.ok; });
            var lastSuccess = members.map(function (source) { return source.lastSuccess; })
                .filter(Boolean)
                .sort(function (a, b) { return b - a; })[0] || null;

            return {
                id: group.id,
                label: group.label,
                ok: failed.length === 0,
                failedCount: failed.length,
                totalCount: members.length,
                failedLabels: failed.map(function (source) { return source.label; }),
                lastSuccess: lastSuccess
            };
        });
    }

    return {
        load: load,
        summariseSources: summariseSources,
        daysForFilter: daysForFilter
    };
}());
