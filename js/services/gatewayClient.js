/**
 * Customer 360 — intelligence gateway client
 * ==========================================
 *
 * STATUS: NOT CONNECTED. No gateway is deployed. This file is the real client
 * for one, written against a contract, so that switching from mock data to
 * live data is a config change and not a rewrite.
 *
 * WHY A GATEWAY AT ALL
 * --------------------
 * This add-in is a static page served to the browser. A browser cannot hold a
 * CRM or helpdesk credential — anything shipped here is readable by anyone who
 * opens devtools. So every credentialed call has to happen server-side, and
 * this client only ever talks to our own gateway.
 *
 * THE CONTRACT
 * ------------
 * The gateway must expose these read-only JSON endpoints. All are GET.
 *
 *   GET  /accounts?q=<query>
 *        -> { accounts: [ Account ] }
 *   GET  /accounts/:id
 *        -> { account: Account }
 *   GET  /accounts/:id/quotes?days=<n>     -> { quotes: [ Quote ] }
 *   GET  /accounts/:id/orders?days=<n>     -> { orders: [ Order ] }
 *   GET  /accounts/:id/tickets?days=<n>    -> { tickets: [ Ticket ] }
 *   GET  /accounts/:id/billing-issues      -> { billingIssues: [ Escalation ] }
 *   GET  /accounts/:id/technical-issues    -> { technicalIssues: [ Escalation ] }
 *   GET  /accounts/:id/reviews             -> { reviews: [ Review ] }
 *   GET  /accounts/:id/contacts            -> { contacts: [ Contact ] }
 *
 *   GET  /research/website?domain=<domain>&company=<name>
 *        -> { website: WebsiteExtract }
 *   GET  /research/news?domain=<domain>&company=<name>&days=<n>
 *        -> { items: [ ExternalItem ] }
 *
 * Scorecard additions (all optional -- absent means `Data unavailable`, never 0):
 *
 *   GET  /accounts/:id/device-health       -> { deviceHealth: DeviceHealth }
 *   GET  /accounts/:id/portal-usage        -> { portalUsage: PortalUsage }
 *   GET  /accounts/:id/contract            -> { contract: Contract }
 *   GET  /accounts/:id/commitments         -> { commitments: [ Commitment ] }
 *   GET  /accounts/:id/communications?days=<n>
 *                                          -> { communications: [ Communication ] }
 *   GET  /accounts/:id/outcomes            -> { outcomes: Outcomes }
 *
 * Two POST endpoints, the only non-GET calls in the contract:
 *
 *   POST /ai/interpret                     -> { model, statements: [ Statement ] }
 *   POST /feedback                         -> { stored: true }
 *
 * THE MODEL CALL IS A GATEWAY ENDPOINT (Phase 8)
 * ----------------------------------------------
 * /ai/interpret exists so the model API key stays server-side like every other
 * credential. There is deliberately no provider SDK in this client: adding one
 * would mean shipping a key to the browser, which is the one thing this whole
 * file exists to prevent.
 *
 * The gateway is responsible for choosing the model and for refusing any task
 * outside `scorecardConfig.ai.allowedTasks`. `js/scorecard/ai.js` refuses
 * forbidden tasks before the call as well -- two independent checks, because
 * "the server will catch it" is how a client-side guard rots.
 *
 * Field shapes are the ones documented in intelligence/normalize.js — the
 * normaliser is the single source of truth for what the app consumes, and it
 * tolerates missing fields rather than assuming them.
 *
 * PRIVACY BOUNDARY (spec section 31)
 * ----------------------------------
 * The two /research/* endpoints reach the public internet on our behalf. They
 * are therefore only ever given the minimum identifying information about the
 * company: its public domain, its company name, and a day window. This client
 * enforces that with an allow-list — internal ticket, billing, quote, order,
 * note and contact data is structurally incapable of reaching them, because
 * buildResearchParams() will not copy any other key.
 */

"use strict";

C360.gatewayClient = (function () {

    var util = C360.util;

    /** Anything slower than this is treated as a source failure. */
    var TIMEOUT_MS = 20000;

    /** The ONLY keys that may be sent to an external-research endpoint. */
    var RESEARCH_ALLOWED_KEYS = ["domain", "company", "days"];

    function baseUrl() {
        return (C360.config.gatewayBaseUrl || "").replace(/\/+$/, "");
    }

    /** True when a gateway URL is configured. */
    function isConfigured() {
        return baseUrl().length > 0;
    }

    function qs(params) {
        var parts = [];
        Object.keys(params || {}).forEach(function (key) {
            var value = params[key];
            if (value === null || value === undefined || value === "") { return; }
            parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
        });
        return parts.length ? "?" + parts.join("&") : "";
    }

    /**
     * Strip a params object down to the research allow-list.
     * Anything not on the list is dropped silently — the point is that an
     * accidental future caller cannot leak internal data outward.
     */
    function buildResearchParams(params) {
        var safe = {};
        RESEARCH_ALLOWED_KEYS.forEach(function (key) {
            if (params && params[key] !== undefined && params[key] !== null) {
                safe[key] = params[key];
            }
        });
        return safe;
    }

    /**
     * GET a gateway endpoint. Rejects on network error, timeout, non-2xx, or
     * unparseable body — the orchestrator turns any rejection into a
     * per-source "unavailable" state rather than a broken page.
     */
    function get(path, params) {
        if (!isConfigured()) {
            return Promise.reject(new Error("No intelligence gateway is configured."));
        }

        var url = baseUrl() + path + qs(params);
        var controller = typeof AbortController === "function" ? new AbortController() : null;
        var timer = null;

        var request = fetch(url, {
            method: "GET",
            // Session cookie for the gateway; no bearer token ever lives in JS.
            credentials: "include",
            headers: { "Accept": "application/json" },
            signal: controller ? controller.signal : undefined
        }).then(function (response) {
            if (!response.ok) {
                throw new Error("Gateway responded " + response.status + " for " + path);
            }
            return response.json();
        });

        if (!controller) {
            return request;
        }

        // Manual timeout: fetch has none of its own.
        return Promise.race([
            request,
            new Promise(function (_resolve, reject) {
                timer = setTimeout(function () {
                    controller.abort();
                    reject(new Error("Gateway timed out for " + path));
                }, TIMEOUT_MS);
            })
        ]).then(function (value) {
            if (timer) { clearTimeout(timer); }
            return value;
        }, function (error) {
            if (timer) { clearTimeout(timer); }
            throw error;
        });
    }

    /**
     * POST a gateway endpoint. Used only by /ai/interpret and /feedback -- the
     * two calls in the contract that are not reads.
     *
     * Same failure contract as get(): any rejection becomes a per-source
     * "unavailable" upstream rather than a broken page. In the AI case that
     * means the deterministic fallback renders with a visible notice.
     */
    function post(path, body) {
        if (!isConfigured()) {
            return Promise.reject(new Error("No intelligence gateway is configured."));
        }

        var url = baseUrl() + path;
        var controller = typeof AbortController === "function" ? new AbortController() : null;
        var timer = null;

        var request = fetch(url, {
            method: "POST",
            credentials: "include",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body || {}),
            signal: controller ? controller.signal : undefined
        }).then(function (response) {
            if (!response.ok) {
                throw new Error("Gateway responded " + response.status + " for " + path);
            }
            return response.json();
        });

        if (!controller) { return request; }

        return Promise.race([
            request,
            new Promise(function (_resolve, reject) {
                timer = setTimeout(function () {
                    controller.abort();
                    reject(new Error("Gateway timed out for " + path));
                }, TIMEOUT_MS);
            })
        ]).then(function (value) {
            if (timer) { clearTimeout(timer); }
            return value;
        }, function (error) {
            if (timer) { clearTimeout(timer); }
            throw error;
        });
    }

    function accountPath(accountId, suffix) {
        return "/accounts/" + encodeURIComponent(accountId) + suffix;
    }

    return {
        isConfigured: isConfigured,

        searchAccounts: function (query) {
            return get("/accounts", { q: query }).then(function (body) {
                return util.list(body && body.accounts);
            });
        },

        getAccount: function (accountId) {
            return get(accountPath(accountId, "")).then(function (body) {
                return (body && body.account) || null;
            });
        },

        getQuotes: function (accountId, days) {
            return get(accountPath(accountId, "/quotes"), { days: days }).then(function (body) {
                return util.list(body && body.quotes);
            });
        },

        getOrders: function (accountId, days) {
            return get(accountPath(accountId, "/orders"), { days: days }).then(function (body) {
                return util.list(body && body.orders);
            });
        },

        getTickets: function (accountId, days) {
            return get(accountPath(accountId, "/tickets"), { days: days }).then(function (body) {
                return util.list(body && body.tickets);
            });
        },

        getBillingIssues: function (accountId) {
            return get(accountPath(accountId, "/billing-issues")).then(function (body) {
                return util.list(body && body.billingIssues);
            });
        },

        getTechnicalIssues: function (accountId) {
            return get(accountPath(accountId, "/technical-issues")).then(function (body) {
                return util.list(body && body.technicalIssues);
            });
        },

        getReviews: function (accountId) {
            return get(accountPath(accountId, "/reviews")).then(function (body) {
                return util.list(body && body.reviews);
            });
        },

        getContacts: function (accountId) {
            return get(accountPath(accountId, "/contacts")).then(function (body) {
                return util.list(body && body.contacts);
            });
        },

        /**
         * Customer-website extraction. Only the public domain and company name
         * cross this boundary — see buildResearchParams.
         */
        getWebsiteExtract: function (domain, companyName) {
            return get("/research/website", buildResearchParams({
                domain: domain,
                company: companyName
            })).then(function (body) {
                return (body && body.website) || null;
            });
        },

        /** Public news/web research. Same minimal-parameter rule applies. */
        getExternalResearch: function (domain, companyName, days) {
            return get("/research/news", buildResearchParams({
                domain: domain,
                company: companyName,
                days: days
            })).then(function (body) {
                return util.list(body && body.items);
            });
        },

        // ---- Scorecard sources (Phases 1-2) --------------------------
        // Each resolves to null / [] rather than rejecting on an empty body, so
        // "the gateway has no device feed" reads as unavailable downstream
        // instead of as a source failure.

        getDeviceHealth: function (accountId) {
            return get(accountPath(accountId, "/device-health")).then(function (body) {
                return (body && body.deviceHealth) || null;
            });
        },

        getPortalUsage: function (accountId) {
            return get(accountPath(accountId, "/portal-usage")).then(function (body) {
                return (body && body.portalUsage) || null;
            });
        },

        getContract: function (accountId) {
            return get(accountPath(accountId, "/contract")).then(function (body) {
                return (body && body.contract) || null;
            });
        },

        /**
         * Commitments. Resolves to null -- NOT [] -- when the gateway does not
         * implement the endpoint, because "not a tracked source" and "none
         * outstanding" drive different behaviour in Phase 3.
         */
        getCommitments: function (accountId) {
            return get(accountPath(accountId, "/commitments")).then(function (body) {
                if (!body || body.commitments === undefined) { return null; }
                return util.list(body.commitments);
            });
        },

        getCommunications: function (accountId, days) {
            return get(accountPath(accountId, "/communications"), { days: days })
                .then(function (body) {
                    return util.list(body && body.communications);
                });
        },

        getOutcomes: function (accountId) {
            return get(accountPath(accountId, "/outcomes")).then(function (body) {
                return (body && body.outcomes) || null;
            });
        },

        // ---- Phase 8: the model call ---------------------------------

        /**
         * Ask the gateway to run an interpretation task.
         *
         * No key, no provider SDK, and no model name chosen here -- the gateway
         * owns all three. This client only forwards a task name and a context
         * that `js/scorecard/ai.js` assembled from records the user can see.
         */
        aiInterpret: function (path, payload) {
            return post(path || C360.scorecardConfig.ai.gatewayPath, payload);
        },

        // ---- Phase 9: feedback write ---------------------------------

        /**
         * Write feedback. Until this endpoint exists, `feedback.storage` stays
         * "local" and the UI says so -- see js/scorecard/feedback.js.
         */
        postFeedback: function (record) {
            return post(C360.scorecardConfig.feedback.gatewayPath, { feedback: record });
        },

        // Exported for the unit tests, which assert that the privacy
        // allow-list actually drops internal fields.
        _buildResearchParams: buildResearchParams
    };
}());
