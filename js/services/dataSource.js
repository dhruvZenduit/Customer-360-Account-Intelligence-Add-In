/**
 * Customer 360 — data source adapter
 * ==================================
 * One switchboard in front of every internal and research data call.
 *
 * Two adapters implement the same interface:
 *
 *   mock     — bundled sample data (mockData.js). The default, because no
 *              backend exists yet. Every record it returns is flagged mock.
 *   gateway  — real HTTP calls to a server-side gateway (gatewayClient.js).
 *              Selected only when one is configured.
 *
 * Nothing above this layer knows which adapter is live. Services call
 * dataSource.getQuotes(...) and get a Promise either way.
 *
 * The active adapter can be overridden per page load without a redeploy:
 *   ?dataSource=gateway&gateway=https://intel.internal.example
 * which is how the gateway gets tested before it becomes the default.
 */

"use strict";

C360.dataSource = (function () {

    var util = C360.util;

    // -----------------------------------------------------------------
    // Query-string overrides
    // -----------------------------------------------------------------

    function queryParam(name) {
        try {
            return new URL(window.location.href).searchParams.get(name);
        } catch (e) {
            return null;
        }
    }

    (function applyOverrides() {
        var mode = queryParam("dataSource");
        if (mode === "mock" || mode === "gateway") {
            C360.config.dataSource = mode;
        }
        var gateway = queryParam("gateway");
        if (gateway) {
            C360.config.gatewayBaseUrl = gateway;
        }
    }());

    /**
     * Sources the caller asked to fail, for exercising the degraded-state UI:
     *   ?simulateFailure=external,website
     * Only honoured by the mock adapter.
     */
    var simulatedFailures = (function () {
        var raw = queryParam("simulateFailure");
        return raw ? raw.split(",").map(function (s) { return s.trim(); }) : [];
    }());

    // -----------------------------------------------------------------
    // Mock adapter
    // -----------------------------------------------------------------

    /** Resolve after a short delay, so loading states are actually visible. */
    function later(value, source) {
        return new Promise(function (resolve, reject) {
            setTimeout(function () {
                if (simulatedFailures.indexOf(source) !== -1) {
                    reject(new Error("Simulated failure for source: " + source));
                    return;
                }
                resolve(value);
            }, 120 + Math.floor(Math.random() * 220));
        });
    }

    var mockAdapter = {
        id: "mock",
        label: "Mock data",

        searchAccounts: function (query) {
            var q = String(query || "").toLowerCase().trim();
            var matches = C360.mockData.accounts.filter(function (account) {
                if (!q) { return true; }
                return account.name.toLowerCase().indexOf(q) !== -1
                    || String(account.industry || "").toLowerCase().indexOf(q) !== -1;
            });
            return later(matches, "accounts");
        },

        getAccount: function (accountId) {
            var found = C360.mockData.accounts.filter(function (a) { return a.id === accountId; })[0];
            return later(found || null, "account");
        },

        getQuotes: function (accountId) {
            return later(C360.mockData.forAccount(accountId).quotes, "quotes");
        },

        getOrders: function (accountId) {
            return later(C360.mockData.forAccount(accountId).orders, "orders");
        },

        getTickets: function (accountId) {
            return later(C360.mockData.forAccount(accountId).tickets, "tickets");
        },

        getBillingIssues: function (accountId) {
            return later(C360.mockData.forAccount(accountId).billingIssues, "billing");
        },

        getTechnicalIssues: function (accountId) {
            return later(C360.mockData.forAccount(accountId).technicalIssues, "technical");
        },

        getReviews: function (accountId) {
            return later(C360.mockData.forAccount(accountId).reviews, "reviews");
        },

        getContacts: function (accountId) {
            return later(C360.mockData.forAccount(accountId).contacts, "contacts");
        },

        getWebsiteExtract: function (accountId) {
            var site = C360.mockData.forAccount(accountId).website;
            return later(site, "website");
        },

        getExternalResearch: function (accountId) {
            return later(C360.mockData.forAccount(accountId).external, "external");
        },

        // ---- Scorecard sources -------------------------------------
        // The fixtures deliberately leave some of these out on some accounts,
        // so the "Data unavailable" path is reachable from the demo data rather
        // than only from a unit test.

        getDeviceHealth: function (accountId) {
            return later(C360.mockData.forAccount(accountId).deviceHealth || null, "deviceHealth");
        },

        getPortalUsage: function (accountId) {
            return later(C360.mockData.forAccount(accountId).portalUsage || null, "portalUsage");
        },

        getContract: function (accountId) {
            return later(C360.mockData.forAccount(accountId).contract || null, "contract");
        },

        /**
         * null means "not a tracked source", [] means "tracked, none
         * outstanding". The fixtures use both, because Phase 3 treats them
         * differently and only one of them can be tested by accident.
         */
        getCommitments: function (accountId) {
            var value = C360.mockData.forAccount(accountId).commitments;
            return later(value === undefined ? null : value, "commitments");
        },

        getCommunications: function (accountId) {
            return later(C360.mockData.forAccount(accountId).communications || [], "communications");
        },

        getOutcomes: function (accountId) {
            return later(C360.mockData.forAccount(accountId).outcomes || null, "outcomes");
        }
    };

    // -----------------------------------------------------------------
    // Gateway adapter
    //
    // Thin translation from the app-level call (which knows an accountId) to
    // the gateway call (which for research needs the public domain + name).
    // -----------------------------------------------------------------

    var gatewayAdapter = {
        id: "gateway",
        label: "Intelligence gateway",

        searchAccounts: function (query) { return C360.gatewayClient.searchAccounts(query); },
        getAccount: function (accountId) { return C360.gatewayClient.getAccount(accountId); },
        getQuotes: function (accountId, ctx) { return C360.gatewayClient.getQuotes(accountId, ctx && ctx.days); },
        getOrders: function (accountId, ctx) { return C360.gatewayClient.getOrders(accountId, ctx && ctx.days); },
        getTickets: function (accountId, ctx) { return C360.gatewayClient.getTickets(accountId, ctx && ctx.days); },
        getBillingIssues: function (accountId) { return C360.gatewayClient.getBillingIssues(accountId); },
        getTechnicalIssues: function (accountId) { return C360.gatewayClient.getTechnicalIssues(accountId); },
        getReviews: function (accountId) { return C360.gatewayClient.getReviews(accountId); },
        getContacts: function (accountId) { return C360.gatewayClient.getContacts(accountId); },

        getWebsiteExtract: function (accountId, ctx) {
            var account = (ctx && ctx.account) || {};
            if (!account.domain) {
                // No website on the account record: nothing to extract, and
                // guessing a domain from the company name would be fabrication.
                return Promise.resolve(null);
            }
            return C360.gatewayClient.getWebsiteExtract(account.domain, account.name);
        },

        getExternalResearch: function (accountId, ctx) {
            var account = (ctx && ctx.account) || {};
            if (!account.name) {
                return Promise.resolve([]);
            }
            return C360.gatewayClient.getExternalResearch(
                account.domain || null,
                account.name,
                (ctx && ctx.days) || 365
            );
        },

        // ---- Scorecard sources -------------------------------------

        getDeviceHealth: function (accountId) { return C360.gatewayClient.getDeviceHealth(accountId); },
        getPortalUsage: function (accountId) { return C360.gatewayClient.getPortalUsage(accountId); },
        getContract: function (accountId) { return C360.gatewayClient.getContract(accountId); },
        getCommitments: function (accountId) { return C360.gatewayClient.getCommitments(accountId); },
        getOutcomes: function (accountId) { return C360.gatewayClient.getOutcomes(accountId); },

        getCommunications: function (accountId, ctx) {
            return C360.gatewayClient.getCommunications(accountId, (ctx && ctx.days) || 365);
        }
    };

    // -----------------------------------------------------------------
    // Selection
    // -----------------------------------------------------------------

    /**
     * The adapter in force right now.
     *
     * "gateway" is honoured only when a base URL is actually configured;
     * otherwise we fall back to mock rather than firing requests at nothing.
     */
    function active() {
        if (C360.config.dataSource === "gateway" && C360.gatewayClient.isConfigured()) {
            return gatewayAdapter;
        }
        return mockAdapter;
    }

    /** True when the dashboard is showing invented sample data. */
    function isMock() {
        return active().id === "mock";
    }

    /**
     * Wrap every adapter method so callers never have to reach for active().
     * Each returns a Promise; each rejection is handled by the orchestrator.
     */
    function delegate(method) {
        return function (accountId, ctx) {
            var adapter = active();
            try {
                return Promise.resolve(adapter[method](accountId, ctx));
            } catch (error) {
                // A synchronous throw inside an adapter must still surface as
                // a rejected promise, not as a broken page load.
                return Promise.reject(error);
            }
        };
    }

    return {
        isMock: isMock,
        activeId: function () { return active().id; },
        activeLabel: function () { return active().label; },

        searchAccounts: function (query) {
            var adapter = active();
            try {
                return Promise.resolve(adapter.searchAccounts(query));
            } catch (error) {
                return Promise.reject(error);
            }
        },

        getAccount: delegate("getAccount"),
        getQuotes: delegate("getQuotes"),
        getOrders: delegate("getOrders"),
        getTickets: delegate("getTickets"),
        getBillingIssues: delegate("getBillingIssues"),
        getTechnicalIssues: delegate("getTechnicalIssues"),
        getReviews: delegate("getReviews"),
        getContacts: delegate("getContacts"),
        getWebsiteExtract: delegate("getWebsiteExtract"),
        getExternalResearch: delegate("getExternalResearch"),

        // Scorecard sources (Phases 1-2).
        getDeviceHealth: delegate("getDeviceHealth"),
        getPortalUsage: delegate("getPortalUsage"),
        getContract: delegate("getContract"),
        getCommitments: delegate("getCommitments"),
        getCommunications: delegate("getCommunications"),
        getOutcomes: delegate("getOutcomes")
    };
}());
