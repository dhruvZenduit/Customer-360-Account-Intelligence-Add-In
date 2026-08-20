/**
 * Customer 360 — application shell
 * ================================
 * Holds the page state, wires the controls, and decides which of the four
 * screens is showing: choose-an-account, loading, error, or the dashboard.
 *
 * State lives in one object. Every user action mutates it and then calls
 * render() — there is no partial DOM patching, which for a page this size is
 * both fast enough and far easier to reason about.
 */

"use strict";

C360.app = (function () {

    var util = C360.util;
    var c = C360.components;

    var RECENT_KEY = "c360:recent-accounts";
    var MAX_RECENT = 5;
    var SEARCH_DEBOUNCE_MS = 220;

    var state = {
        accountId: null,
        model: null,           // intelligence model from the engine
        sources: [],           // per-source load statuses
        sourceGroups: [],      // the three-category rollup
        lastUpdated: null,
        isMock: true,
        loading: false,
        refreshing: false,
        error: null,
        searchResults: [],
        searchOpen: false,
        searching: false,
        dateFilterId: null,
        sourceFilterId: "all"
    };

    var el = {};
    var searchTimer = null;
    /** Guards against a slow response for an account the user has left. */
    var loadToken = 0;

    // -----------------------------------------------------------------
    // Recently viewed accounts
    // -----------------------------------------------------------------

    function readRecent() {
        try {
            var raw = window.sessionStorage.getItem(RECENT_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function rememberRecent(account) {
        try {
            var recent = readRecent().filter(function (item) { return item.id !== account.id; });
            recent.unshift({ id: account.id, name: account.name, industry: account.industry });
            window.sessionStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
        } catch (e) {
            // Storage blocked in this embedding — recents are a convenience only.
        }
    }

    // -----------------------------------------------------------------
    // Loading
    // -----------------------------------------------------------------

    function loadAccount(accountId, options) {
        var opts = options || {};
        var token = ++loadToken;

        state.accountId = accountId;
        state.error = null;
        if (opts.forceRefresh) {
            state.refreshing = true;
        } else {
            state.loading = true;
            state.model = null;
        }
        render();

        C360.orchestrator.load(accountId, {
            forceRefresh: opts.forceRefresh === true,
            dateFilterId: state.dateFilterId
        }).then(function (result) {
            if (token !== loadToken) { return; }   // a newer load has started

            state.model = result.intelligence;
            state.sources = result.sources;
            state.sourceGroups = C360.orchestrator.summariseSources(result.sources);
            state.lastUpdated = result.lastUpdated;
            state.isMock = result.isMock;
            state.loading = false;
            state.refreshing = false;
            state.error = null;

            if (result.intelligence.account) {
                rememberRecent(result.intelligence.account);
            }
            render();
        }).catch(function (error) {
            if (token !== loadToken) { return; }

            console.error("Customer 360: account load failed.", error);
            state.loading = false;
            state.refreshing = false;
            // Only a failure to identify the account lands here; individual
            // source failures are handled inside the orchestrator.
            state.error = error && error.message ? error.message : "The account could not be loaded.";
            render();
        });
    }

    // -----------------------------------------------------------------
    // Search
    // -----------------------------------------------------------------

    function runSearch(query) {
        state.searching = true;
        renderSearchResults();

        C360.accountService.search(query).then(function (accounts) {
            state.searchResults = accounts;
            state.searching = false;
            state.searchOpen = true;
            renderSearchResults();
        }).catch(function (error) {
            console.warn("Customer 360: account search failed.", error);
            state.searchResults = [];
            state.searching = false;
            state.searchOpen = true;
            renderSearchResults();
        });
    }

    function onSearchInput() {
        var query = el.search.value.trim();
        if (searchTimer) { clearTimeout(searchTimer); }
        searchTimer = setTimeout(function () { runSearch(query); }, SEARCH_DEBOUNCE_MS);
    }

    function renderSearchResults() {
        if (!state.searchOpen) {
            el.searchResults.hidden = true;
            el.searchResults.innerHTML = "";
            el.search.setAttribute("aria-expanded", "false");
            return;
        }

        var html;
        if (state.searching) {
            html = '<li class="c360-result c360-result--note">Searching&hellip;</li>';
        } else if (!state.searchResults.length) {
            html = '<li class="c360-result c360-result--note">No accounts match that search.</li>';
        } else {
            html = state.searchResults.map(function (account) {
                return '<li role="option" aria-selected="false">'
                     + '<button type="button" class="c360-result" data-account-id="'
                     + c.esc(account.id) + '">'
                     + '<span class="c360-result-name">' + c.esc(account.name) + '</span>'
                     + '<span class="c360-result-industry">'
                     + c.esc(account.industry || "Industry not available") + '</span>'
                     + '</button></li>';
            }).join("");
        }

        el.searchResults.innerHTML = html;
        el.searchResults.hidden = false;
        el.search.setAttribute("aria-expanded", "true");
    }

    function closeSearch() {
        state.searchOpen = false;
        renderSearchResults();
    }

    // -----------------------------------------------------------------
    // Toolbar
    // -----------------------------------------------------------------

    function renderToolbar() {
        if (!state.model) {
            el.toolbar.hidden = true;
            return;
        }
        el.toolbar.hidden = false;

        var dateButtons = C360.config.dateFilters.map(function (filter) {
            var active = filter.id === state.dateFilterId;
            return '<button type="button" class="c360-filter' + (active ? " is-active" : "")
                 + '" data-date-filter="' + c.esc(filter.id) + '" aria-pressed="' + active + '">'
                 + c.esc(filter.label) + '</button>';
        }).join("");

        var sourceButtons = C360.config.sourceFilters.map(function (filter) {
            var active = filter.id === state.sourceFilterId;
            return '<button type="button" class="c360-filter' + (active ? " is-active" : "")
                 + '" data-source-filter="' + c.esc(filter.id) + '" aria-pressed="' + active + '">'
                 + c.esc(filter.label) + '</button>';
        }).join("");

        el.toolbar.innerHTML =
              '<div class="c360-filter-group">'
            + '<span class="c360-filter-label" id="c360-view-label">View</span>'
            + '<div class="c360-filter-set" role="group" aria-labelledby="c360-view-label">'
            + sourceButtons + '</div></div>'
            + '<div class="c360-filter-group">'
            + '<span class="c360-filter-label" id="c360-period-label">Period</span>'
            + '<div class="c360-filter-set" role="group" aria-labelledby="c360-period-label">'
            + dateButtons + '</div></div>'
            + '<div class="c360-toolbar-right">'
            + '<span class="c360-updated">Last updated: '
            + c.esc(state.lastUpdated ? util.formatDateTime(state.lastUpdated) : "Not available")
            + '</span>'
            + '<button type="button" class="c360-button" id="c360-refresh"'
            + (state.refreshing ? " disabled" : "") + '>'
            + (state.refreshing ? "Refreshing&hellip;" : "Refresh intelligence") + '</button>'
            + '</div>';
    }

    /**
     * Source filtering hides whole sections rather than reflowing the page,
     * so the reading order and section anchors stay stable.
     */
    function applySourceFilter() {
        var wanted = state.sourceFilterId;
        var sections = el.content.querySelectorAll(".c360-section");

        Array.prototype.forEach.call(sections, function (section) {
            var tags = (section.getAttribute("data-filter-tags") || "").split(" ");
            section.hidden = wanted !== "all" && tags.indexOf(wanted) === -1;
        });
    }

    // -----------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------

    function renderMockBanner() {
        if (!state.model || !state.isMock) {
            el.mockBanner.hidden = true;
            return;
        }
        el.mockBanner.hidden = false;
        el.mockBanner.innerHTML =
              '<strong>Sample data.</strong> No CRM, helpdesk, billing or web-research backend is '
            + 'connected to this add-in yet, so every record below is invented sample data used to '
            + 'develop the interface. Nothing here describes a real customer. '
            + 'MyGeotab asset counts are the only live figures, and only when this add-in is open '
            + 'inside MyGeotab on the matching database.';
    }

    function render() {
        renderMockBanner();

        // --- error ---------------------------------------------------
        if (state.error) {
            el.header.hidden = true;
            el.toolbar.hidden = true;
            el.status.hidden = true;
            el.welcome.hidden = true;
            el.content.innerHTML = "";
            el.error.hidden = false;
            el.error.innerHTML =
                  '<h2 class="c360-error-title">This account could not be loaded</h2>'
                + '<p class="c360-error-text">' + c.esc(state.error) + '</p>'
                + '<button type="button" class="c360-button" id="c360-retry">Try again</button>';
            return;
        }
        el.error.hidden = true;

        // --- nothing selected yet ------------------------------------
        if (!state.accountId) {
            el.header.hidden = true;
            el.toolbar.hidden = true;
            el.status.hidden = true;
            el.content.innerHTML = "";
            el.welcome.hidden = false;
            renderWelcome();
            return;
        }
        el.welcome.hidden = true;

        // --- loading --------------------------------------------------
        if (state.loading) {
            el.header.hidden = true;
            el.toolbar.hidden = true;
            el.status.hidden = true;
            el.content.innerHTML =
                  '<div class="c360-loading" role="status" aria-live="polite">'
                + '<p class="c360-loading-title">Building account intelligence&hellip;</p>'
                + '<ul class="c360-loading-list">'
                + '<li>Internal records</li><li>Customer website</li><li>External web research</li>'
                + '</ul></div>';
            return;
        }

        if (!state.model) { return; }

        // --- dashboard -------------------------------------------------
        el.header.hidden = false;
        el.header.innerHTML = C360.render.accountHeader(state.model, {
            lastUpdated: state.lastUpdated
        });

        el.status.hidden = false;
        el.status.innerHTML = C360.render.sourceStatus(state.sourceGroups);

        renderToolbar();

        el.content.innerHTML = C360.render.dashboard(state.model, {
            dateFilterDays: C360.orchestrator.daysForFilter(state.dateFilterId),
            sourceGroups: state.sourceGroups
        });

        applySourceFilter();
    }

    function renderWelcome() {
        var recent = readRecent();

        var recentHtml = recent.length
            ? '<ul class="c360-recent">' + recent.map(function (account) {
                return '<li><button type="button" class="c360-recent-item" data-account-id="'
                     + c.esc(account.id) + '">'
                     + '<span class="c360-result-name">' + c.esc(account.name) + '</span>'
                     + '<span class="c360-result-industry">'
                     + c.esc(account.industry || "Industry not available") + '</span>'
                     + '</button></li>';
              }).join("") + '</ul>'
            : '<p class="c360-empty">No accounts viewed yet in this session.</p>';

        el.welcome.innerHTML =
              '<h2 class="c360-welcome-title">Select a customer account</h2>'
            + '<p class="c360-welcome-text">Search above to load an account’s full intelligence '
            + 'picture: internal activity, customer website, public research, contacts, risks, '
            + 'opportunities and recommended next actions.</p>'
            + '<h3 class="c360-sub-title">Recent accounts</h3>'
            + recentHtml;
    }

    // -----------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------

    function onClick(event) {
        var target = event.target;

        var accountButton = target.closest("[data-account-id]");
        if (accountButton) {
            closeSearch();
            el.search.value = "";
            loadAccount(accountButton.getAttribute("data-account-id"), {});
            return;
        }

        var dateFilter = target.closest("[data-date-filter]");
        if (dateFilter) {
            // Display-only: the data already covers the widest window, so
            // changing the period never triggers another fetch.
            state.dateFilterId = dateFilter.getAttribute("data-date-filter");
            render();
            return;
        }

        var sourceFilter = target.closest("[data-source-filter]");
        if (sourceFilter) {
            state.sourceFilterId = sourceFilter.getAttribute("data-source-filter");
            renderToolbar();
            applySourceFilter();
            return;
        }

        if (target.closest("#c360-refresh")) {
            loadAccount(state.accountId, { forceRefresh: true });
            return;
        }

        if (target.closest("#c360-retry")) {
            loadAccount(state.accountId, { forceRefresh: true });
            return;
        }

        // A click anywhere else dismisses the search results.
        if (!target.closest(".c360-search")) {
            closeSearch();
        }
    }

    function onKeydown(event) {
        if (event.key === "Escape") { closeSearch(); }
    }

    // -----------------------------------------------------------------
    // Start-up
    // -----------------------------------------------------------------

    function cacheElements() {
        el.root = document.getElementById("c360-app");
        el.search = document.getElementById("c360-search");
        el.searchResults = document.getElementById("c360-search-results");
        el.mockBanner = document.getElementById("c360-mock-banner");
        el.header = document.getElementById("c360-account-header");
        el.toolbar = document.getElementById("c360-toolbar");
        el.status = document.getElementById("c360-source-status");
        el.content = document.getElementById("c360-content");
        el.welcome = document.getElementById("c360-welcome");
        el.error = document.getElementById("c360-error");
    }

    /**
     * Boot the app. Safe to call more than once — MyGeotab calls focus() on
     * every navigation back to the page.
     */
    function start(options) {
        var opts = options || {};

        if (!el.root) {
            cacheElements();
            // Marks the app as wired, so the standalone fallback in addin.js
            // knows MyGeotab has already started us.
            el.root.setAttribute("data-started", "true");
            state.dateFilterId = C360.config.defaultDateFilterId;

            el.search.addEventListener("input", onSearchInput);
            el.search.addEventListener("focus", function () {
                if (!state.searchResults.length) { runSearch(""); }
                else { state.searchOpen = true; renderSearchResults(); }
            });
            el.root.addEventListener("click", onClick);
            document.addEventListener("keydown", onKeydown);

            render();
        }

        if (opts.accountId && opts.accountId !== state.accountId) {
            loadAccount(opts.accountId, {});
        }
    }

    return {
        start: start,
        loadAccount: loadAccount,
        // Exposed for debugging in the console; nothing reads it internally.
        _state: state
    };
}());
