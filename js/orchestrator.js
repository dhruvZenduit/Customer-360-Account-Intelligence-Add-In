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
                reflect(C360.geotabService, accountId, ctx, opts, null),

                // Scorecard sources. Each falls back to null / [] so an
                // unavailable feed becomes "Data unavailable" downstream rather
                // than a failed page load.
                reflect(C360.deviceHealthService, accountId, ctx, opts, null),
                reflect(C360.portalUsageService, accountId, ctx, opts, null),
                reflect(C360.contractService, accountId, ctx, opts, null),
                // null, not [] — "not a tracked source" is not "none outstanding".
                reflect(C360.commitmentService, accountId, ctx, opts, null),
                reflect(C360.communicationService, accountId, ctx, opts, []),
                reflect(C360.outcomeService, accountId, ctx, opts, null)
            ]).then(function (results) {
                var by = {};
                results.forEach(function (result) { by[result.source] = result; });

                var website = by.website.value;

                // Website leadership becomes contacts only where a person was
                // actually named — see contactService.mergeWebsiteLeadership.
                var contacts = C360.contactService.mergeWebsiteLeadership(
                    by.contacts.value, website
                );

                var intelligenceInput = {
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
                };

                var intelligence = C360.intelligenceEngine.run(intelligenceInput);

                /**
                 * The scorecard runs over the SAME bundle plus the six extended
                 * sources, and reuses the intelligence model rather than
                 * recomputing signals, risks and opportunities — one derivation,
                 * two readings of it.
                 *
                 * `asOf` is passed explicitly. Every scorecard engine is pure
                 * and none of them reads the clock, which is what makes the
                 * scenario suite deterministic.
                 */
                var asOf = new Date();
                var scorecard = C360.scorecardEngine.run(
                    Object.keys(intelligenceInput).reduce(function (all, key) {
                        all[key] = intelligenceInput[key];
                        return all;
                    }, {
                        deviceHealth: by.deviceHealth.value,
                        portalUsage: by.portalUsage.value,
                        contract: by.contract.value,
                        commitments: by.commitments.value,
                        communications: by.communications.value,
                        outcomes: by.outcomes.value
                    }),
                    { asOf: asOf, intelligence: intelligence }
                );

                return {
                    intelligence: intelligence,
                    scorecard: scorecard,
                    sources: [accountStatus].concat(results),
                    lastUpdated: asOf,
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
              members: ["account", "quotes", "orders", "tickets", "billing", "technical",
                        "reviews", "contacts", "geotab", "deviceHealth", "portalUsage",
                        "contract", "commitments", "communications", "outcomes"] },
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

    /**
     * PORTFOLIO REFRESH (Phase 6)
     * ---------------------------
     * A batch over the existing per-account pipeline — deliberately not a
     * parallel fetch path, so caching, failure isolation and the manual-refresh
     * bypass all behave exactly as they do on the account page.
     *
     * Two properties matter at portfolio scale:
     *
     *   BOUNDED CONCURRENCY. 127 accounts must not open 127 simultaneous
     *   requests. `portfolio.refresh.maxConcurrentAccounts` caps the window, and
     *   `_peakConcurrency` on the result is what the test asserts against —
     *   a cap nobody measures is a cap that drifts.
     *
     *   PARTIAL FAILURE IS NORMAL. One account failing to load must never blank
     *   the screen. Each account is reflected into a result or a failure entry,
     *   and the caller renders what succeeded alongside a list of what did not.
     *
     * This is a controlled refresh, run on demand or on a schedule. Nothing here
     * runs a model, and nothing here runs continuously.
     *
     * @param {string[]} accountIds
     * @param {object} options { forceRefresh, dateFilterId, onProgress }
     * @returns {Promise<{models, failures, lastUpdated, _peakConcurrency}>}
     */
    function loadPortfolio(accountIds, options) {
        var opts = options || {};
        var ids = util.list(accountIds);
        var limit = Math.max(1, C360.scorecardConfig.portfolio.refresh.maxConcurrentAccounts);

        var models = [];
        var failures = [];
        var next = 0;
        var inFlight = 0;
        var peak = 0;
        var done = 0;

        return new Promise(function (resolve) {
            if (!ids.length) {
                resolve({ models: [], failures: [], lastUpdated: new Date(), _peakConcurrency: 0 });
                return;
            }

            function finish() {
                resolve({
                    models: models,
                    failures: failures,
                    lastUpdated: new Date(),
                    /** Observed peak, so the concurrency bound is testable. */
                    _peakConcurrency: peak
                });
            }

            function pump() {
                while (inFlight < limit && next < ids.length) {
                    var accountId = ids[next++];
                    inFlight++;
                    if (inFlight > peak) { peak = inFlight; }

                    /* eslint-disable no-loop-func */
                    (function (id) {
                        load(id, {
                            forceRefresh: opts.forceRefresh === true,
                            dateFilterId: opts.dateFilterId
                        }).then(function (result) {
                            models.push(result.scorecard);
                            // Per-source failures inside a successfully loaded
                            // account are reported too — the account rendered,
                            // but the user should know its picture is partial.
                            util.list(result.sources).forEach(function (source) {
                                if (source.ok) { return; }
                                failures.push({
                                    accountId: id,
                                    accountName: result.scorecard
                                        ? result.scorecard.accountName : null,
                                    source: source.source,
                                    label: source.label,
                                    error: source.error,
                                    fatal: false
                                });
                            });
                        }).catch(function (error) {
                            // The account itself could not be identified. Listed
                            // and skipped; the other accounts still render.
                            failures.push({
                                accountId: id,
                                accountName: null,
                                source: "account",
                                label: "Account record",
                                error: error && error.message ? error.message : "Unavailable",
                                fatal: true
                            });
                        }).then(function () {
                            inFlight--;
                            done++;
                            if (typeof opts.onProgress === "function") {
                                opts.onProgress({ done: done, total: ids.length });
                            }
                            if (done === ids.length) { finish(); } else { pump(); }
                        });
                    }(accountId));
                    /* eslint-enable no-loop-func */
                }
            }

            pump();
        });
    }

    return {
        load: load,
        loadPortfolio: loadPortfolio,
        summariseSources: summariseSources,
        daysForFilter: daysForFilter
    };
}());
