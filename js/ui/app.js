/**
 * Customer 360 — application shell
 * ================================
 * State, events, and which screen is showing.
 *
 * FIVE SCREENS, one workspace column:
 *
 *   command       the three-panel Command Center — the landing screen
 *   accounts      the filterable account list + the queue tabs that drive it
 *   signals       the portfolio signal feed and the matrix, at full width
 *   intelligence  one account's detail workspace, plus the legacy Customer 360
 *                 sections beneath it, unchanged
 *   settings      the scoring configuration, read-only
 *
 * TWO SELECTION CONCEPTS, deliberately distinct:
 *
 *   selectedAccountId  which account the Command Center's centre and right
 *                      panels are describing. Changing it re-renders from
 *                      models already in memory — no fetch, so the loop of
 *                      scan-select-read is instant.
 *   accountId          which account the Intelligence screen is opened on.
 *
 * Conflating them would mean clicking a queue row navigated away from the queue,
 * which is exactly the interaction this layout exists to avoid.
 *
 * State lives in one object. Every action mutates it and calls render(); there
 * is no partial DOM patching except where re-rendering would lose the user's
 * place (the feedback controls, the draft validation message).
 */

"use strict";

C360.app = (function () {

    var util = C360.util;
    var c = C360.components;

    var RECENT_KEY = "c360:recent-accounts";
    var MAX_RECENT = 5;
    var SEARCH_DEBOUNCE_MS = 180;
    var CLOCK_MS = 1000;

    var state = {
        /** command | accounts | signals | intelligence | settings */
        screen: "command",

        /** Which account the Command Center panels describe. No fetch to change. */
        selectedAccountId: null,

        /** Which account the Intelligence screen is opened on. */
        accountId: null,
        model: null,           // legacy intelligence model, for the sections below
        scorecard: null,
        sources: [],
        sourceGroups: [],
        lastUpdated: null,
        isMock: true,
        loading: false,
        refreshing: false,
        error: null,

        clock: null,

        searchResults: [],
        searchOpen: false,
        searching: false,
        dateFilterId: null,
        sourceFilterId: "all",

        // ---- portfolio ----
        portfolioView: null,
        portfolioModels: [],
        portfolioFailures: [],
        portfolioLoading: false,
        portfolioLoaded: false,
        portfolioError: null,
        filters: {},
        sort: null,
        metrics: null,
        feedbackSummary: null,

        // ---- overlays ----
        brief: null,
        aiOpen: false,
        aiQuestion: "",
        aiAnswer: null
    };

    var el = {};
    var searchTimer = null;
    var clockTimer = null;
    var loadToken = 0;

    // -----------------------------------------------------------------
    // Recently viewed
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
            var recent = readRecent().filter(function (item) {
                return item.id !== account.id;
            });
            recent.unshift({ id: account.id, name: account.name,
                industry: account.industry });
            window.sessionStorage.setItem(RECENT_KEY,
                JSON.stringify(recent.slice(0, MAX_RECENT)));
        } catch (e) {
            // Storage blocked in this embedding — recents are a convenience only.
        }
    }

    // -----------------------------------------------------------------
    // URL state
    // -----------------------------------------------------------------

    function syncUrl() {
        if (!window.history || typeof window.history.replaceState !== "function") {
            return;
        }
        try {
            var query = C360.portfolio.toQuery({
                filters: state.filters,
                sort: state.sort,
                view: state.screen,
                accountId: state.screen === "intelligence"
                    ? state.accountId : state.selectedAccountId
            });
            var base = String(window.location.pathname || "");
            window.history.replaceState(null, "", query ? base + "?" + query : base);
        } catch (e) {
            // Some embeddings disallow replaceState. Only the shareable URL is lost.
        }
    }

    // -----------------------------------------------------------------
    // Portfolio loading
    // -----------------------------------------------------------------

    /**
     * The portfolio refresh: a bounded batch over the same per-account pipeline.
     * Manual or scheduled — nothing here runs continuously.
     */
    function loadPortfolio(options) {
        var opts = options || {};

        state.portfolioLoading = true;
        state.portfolioError = null;
        if (opts.forceRefresh) { state.refreshing = true; }
        render();

        return C360.accountService.search("").then(function (accounts) {
            var ids = util.list(accounts).map(function (account) {
                return account.id;
            });
            return C360.orchestrator.loadPortfolio(ids, {
                forceRefresh: opts.forceRefresh === true,
                dateFilterId: state.dateFilterId
            });
        }).then(function (result) {
            state.portfolioModels = result.models;
            state.portfolioFailures = result.failures;
            state.lastUpdated = result.lastUpdated;
            state.isMock = C360.dataSource.isMock();
            state.portfolioLoading = false;
            state.refreshing = false;
            state.portfolioLoaded = true;

            // Record every run, so the trend and "what changed" have real
            // stored values to compare. A second refresh is what makes a
            // sparkline appear; nothing is invented to make it appear sooner.
            C360.history.recordAll(result.models);

            rebuildPortfolioView();

            // Default the selection to the most urgent account, so the
            // Command Center is answering a question the moment it loads
            // rather than showing three empty panels.
            if (!state.selectedAccountId) {
                var first = util.list(state.portfolioView.urgent)[0]
                         || util.list(state.portfolioView.rows)[0];
                if (first) { state.selectedAccountId = first.accountId; }
            }

            render();
        }).catch(function (error) {
            console.error("Customer 360: portfolio load failed.", error);
            state.portfolioLoading = false;
            state.refreshing = false;
            state.portfolioError = error && error.message
                ? error.message
                : "The portfolio could not be loaded.";
            render();
        });
    }

    /**
     * Re-derive the view model. No fetching, so filtering and selection are
     * instant.
     *
     * Metrics and the feedback aggregate are built here rather than in a
     * template: `C360.feedback.summary()` reads sessionStorage, and neither the
     * pure roll-up nor the view layer should own I/O.
     */
    function rebuildPortfolioView() {
        state.portfolioView = C360.portfolio.build(state.portfolioModels, {
            filters: state.filters,
            sort: state.sort,
            failures: state.portfolioFailures,
            lastUpdated: state.lastUpdated
        });

        var recommendationTotal = util.list(state.portfolioModels).reduce(
            function (total, model) {
                return total + util.list(model.recommendations).length;
            }, 0);

        state.feedbackSummary = C360.feedback.summary(recommendationTotal);
        state.metrics = C360.metrics.build({
            models: state.portfolioModels,
            feedback: state.feedbackSummary,
            approvals: C360.approval.all()
        });
    }

    /** The scorecard model for an account, from what is already loaded. */
    function modelFor(accountId) {
        return util.list(state.portfolioModels).filter(function (model) {
            return model.accountId === accountId;
        })[0] || null;
    }

    function rowFor(accountId) {
        return C360.portfolio.rowFor(state.portfolioView, accountId);
    }

    // -----------------------------------------------------------------
    // Account loading (the legacy sections below the workspace)
    // -----------------------------------------------------------------

    /**
     * Open the Intelligence screen for an account.
     *
     * The workspace renders IMMEDIATELY from the already-loaded scorecard model.
     * The fetch that follows only populates the legacy Customer 360 sections
     * underneath, so the screen is useful before the network settles.
     */
    function openAccount(accountId) {
        var token = ++loadToken;

        state.screen = "intelligence";
        state.accountId = accountId;
        state.selectedAccountId = accountId;
        state.error = null;
        state.scorecard = modelFor(accountId);
        state.loading = !state.scorecard;
        syncUrl();
        render();

        C360.orchestrator.load(accountId, {
            forceRefresh: false,
            dateFilterId: state.dateFilterId
        }).then(function (result) {
            if (token !== loadToken) { return; }

            state.model = result.intelligence;
            state.scorecard = result.scorecard;
            state.sources = result.sources;
            state.sourceGroups = C360.orchestrator.summariseSources(result.sources);
            state.isMock = result.isMock;
            state.loading = false;
            state.error = null;

            if (result.intelligence.account) {
                rememberRecent(result.intelligence.account);
            }
            C360.history.record(result.scorecard);
            render();
        }).catch(function (error) {
            if (token !== loadToken) { return; }
            console.error("Customer 360: account load failed.", error);
            state.loading = false;
            state.error = error && error.message
                ? error.message
                : "The account could not be loaded.";
            render();
        });
    }

    /** Backwards-compatible entry point (MyGeotab deep links, tests). */
    function loadAccount(accountId, options) {
        var opts = options || {};
        if (opts.forceRefresh) { C360.cache.clearAccount(accountId); }
        openAccount(accountId);
    }

    // -----------------------------------------------------------------
    // Search
    // -----------------------------------------------------------------

    /**
     * Searches the LOADED portfolio where possible, so a hit carries its match
     * reason ("matched contact: Dana Reyes") and can be selected without a
     * fetch. Falls back to the account service before the portfolio has loaded.
     */
    function runSearch(query) {
        var text = String(query || "").trim();

        if (state.portfolioView && text) {
            state.searchResults = C360.portfolio.search(state.portfolioView.allRows, text);
            state.searching = false;
            state.searchOpen = true;
            renderSearchResults();
            return;
        }

        if (!text && state.portfolioView) {
            state.searchResults = util.list(state.portfolioView.allRows)
                .slice(0, 8)
                .map(function (row) {
                    return {
                        accountId: row.accountId,
                        accountName: row.accountName,
                        priorityLevel: row.priorityLevel,
                        matchReason: row.headline || "No signal"
                    };
                });
            state.searching = false;
            state.searchOpen = true;
            renderSearchResults();
            return;
        }

        state.searching = true;
        renderSearchResults();

        C360.accountService.search(text).then(function (accounts) {
            state.searchResults = util.list(accounts).map(function (account) {
                return {
                    accountId: account.id,
                    accountName: account.name,
                    priorityLevel: null,
                    matchReason: account.industry || "Industry not available"
                };
            });
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
        var query = el.search ? el.search.value.trim() : "";
        if (searchTimer) { clearTimeout(searchTimer); }
        searchTimer = setTimeout(function () { runSearch(query); }, SEARCH_DEBOUNCE_MS);
    }

    function renderSearchResults() {
        if (!el.searchResults) { return; }

        if (!state.searchOpen) {
            el.searchResults.hidden = true;
            el.searchResults.innerHTML = "";
            if (el.search) { el.search.setAttribute("aria-expanded", "false"); }
            return;
        }

        var html;
        if (state.searching) {
            html = '<li class="c360-result c360-result--note">Searching&hellip;</li>';
        } else if (!state.searchResults.length) {
            html = '<li class="c360-result c360-result--note">'
                 + 'Nothing matches that search.</li>';
        } else {
            html = state.searchResults.map(function (hit) {
                return '<li role="option" aria-selected="false">'
                     + '<button type="button" class="c360-result" '
                     + 'data-open-account="' + c.esc(hit.accountId) + '">'
                     + '<span class="c360-result-name">'
                     + c.esc(hit.accountName) + '</span>'
                     + '<span class="c360-result-why">'
                     + (hit.priorityLevel ? c.esc(hit.priorityLevel) + " · " : "")
                     + c.esc(hit.matchReason || "") + '</span>'
                     + '</button></li>';
            }).join("");
        }

        el.searchResults.innerHTML = html;
        el.searchResults.hidden = false;
        if (el.search) { el.search.setAttribute("aria-expanded", "true"); }
    }

    function closeSearch() {
        state.searchOpen = false;
        renderSearchResults();
    }

    // -----------------------------------------------------------------
    // Filters
    // -----------------------------------------------------------------

    /** OR within a group, AND across groups. */
    function toggleFilter(group, value) {
        var current = util.list(state.filters[group]).slice();
        var at = current.indexOf(value);

        if (at === -1) { current.push(value); } else { current.splice(at, 1); }

        if (current.length) {
            state.filters[group] = current;
        } else {
            delete state.filters[group];
        }

        rebuildPortfolioView();
        syncUrl();
        render();
    }

    function applySignalFilter(key) {
        var signal = util.list(state.portfolioView && state.portfolioView.signals)
            .filter(function (item) { return item.key === key; })[0];
        if (!signal) { return; }
        state.filters = { accountIds: signal.accountIds };
        state.screen = "accounts";
        rebuildPortfolioView();
        syncUrl();
        render();
    }

    // -----------------------------------------------------------------
    // Navigation + selection
    // -----------------------------------------------------------------
    //
    // Every user action is a named function, and the click handler only maps a
    // DOM target onto one of them. That keeps the handler a router rather than
    // a place where behaviour accumulates, and it means the smoke test drives
    // the same code path a click does instead of reaching into state.

    /**
     * Change which account the Command Center panels describe.
     *
     * No fetch and no navigation: every model is already in memory, so the
     * scan-select-read loop is instant. That immediacy is the reason the
     * three-panel layout works at all.
     */
    function selectAccount(accountId) {
        state.selectedAccountId = accountId;

        // Selecting from the feed, the matrix or the AI drawer should land the
        // user where the selection is actually visible.
        if (state.screen !== "command" && state.screen !== "accounts") {
            state.screen = "command";
        }
        closeSearch();
        syncUrl();
        render();
    }

    /** Switch screen. `intelligence` needs an account, so it opens one. */
    function goTo(screen) {
        if (screen === "intelligence") {
            var id = state.selectedAccountId || state.accountId;
            if (id) { openAccount(id); }
            return;
        }

        state.screen = screen;
        if (!state.portfolioLoaded && !state.portfolioLoading) {
            loadPortfolio({});
        } else {
            syncUrl();
            render();
        }
    }

    function clearFilters() {
        state.filters = {};
        rebuildPortfolioView();
        syncUrl();
        render();
    }

    // -----------------------------------------------------------------
    // Overlays: brief and Portfolio AI
    // -----------------------------------------------------------------

    function openBrief(accountId) {
        var model = modelFor(accountId);
        var row = rowFor(accountId);
        if (!model) { return; }

        state.brief = C360.brief.build(model, row, { asOf: model.asOf });
        render();
    }

    function closeBrief() {
        state.brief = null;
        render();
    }

    function setSort(sortId) {
        state.sort = sortId;
        rebuildPortfolioView();
        syncUrl();
        render();
    }

    function closeAi() {
        state.aiOpen = false;
        render();
    }

    function askAi(question) {
        state.aiOpen = true;
        state.aiQuestion = question;
        state.aiAnswer = C360.portfolioQuery.ask(question, state.portfolioView);
        render();
    }

    // -----------------------------------------------------------------
    // Feedback + drafts
    // -----------------------------------------------------------------

    function findRecommendation(recommendationId) {
        var model = state.scorecard || modelFor(state.selectedAccountId);
        if (!model) { return null; }
        return util.list(model.recommendations).filter(function (rec) {
            return rec.id === recommendationId;
        })[0] || null;
    }

    function onFeedback(button) {
        var outcome = button.getAttribute("data-feedback-outcome");
        var recId = button.getAttribute("data-feedback-rec");
        var recommendation = findRecommendation(recId);
        if (!recommendation) { return; }

        var model = state.scorecard || modelFor(state.selectedAccountId);
        var block = button.closest(".c360-fb");
        var reasonBox = block ? block.querySelector(".c360-fb-reason") : null;
        var reasonInput = block ? block.querySelector(".c360-fb-reason-input") : null;

        var result = C360.feedback.capture({
            outcome: outcome,
            reason: reasonInput && reasonInput.value ? reasonInput.value : null,
            recommendation: recommendation,
            model: model,
            user: "Current user",
            asOf: state.lastUpdated
        });

        if (!result.recorded) {
            console.warn("Customer 360: feedback rejected — " + result.reason);
            return;
        }

        // Prompt for a reason, never require one.
        if (reasonBox && C360.feedbackUi.shouldPromptForReason(outcome)) {
            reasonBox.hidden = false;
            if (reasonInput) { reasonInput.focus(); }
        }

        // Patch just these controls, so the page does not jump to the top.
        var article = button.closest(".c360-sc-rec");
        var controls = article ? article.querySelector(".c360-fb") : null;
        if (controls) {
            controls.outerHTML = C360.feedbackUi.controls(recommendation, model);
        }

        if (state.portfolioModels.length) { rebuildPortfolioView(); }
    }

    function onDraftAction(button) {
        var action = button.getAttribute("data-draft-action");
        var section = button.closest(".c360-ap-draft");
        if (!section) { return; }

        var recommendation = findRecommendation(section.getAttribute("data-draft-rec"));
        if (!recommendation) { return; }

        var kind = section.getAttribute("data-draft-kind");
        var original = util.list(recommendation.drafts).filter(function (draft) {
            return draft.kind === kind;
        })[0];
        if (!original) { return; }

        var edited = C360.approvalUi.readDraft(section, original);
        var box = section.querySelector(".c360-ap-validation");

        if (action === "validate") {
            var check = C360.approval.revalidate(edited, recommendation);
            if (box) { box.innerHTML = C360.approvalUi.validationMessage(check); }
            return;
        }

        if (action === "approve") {
            var result = C360.approval.approve({
                action: "sendCustomerEmail",
                approver: "Current user",
                recommendation: recommendation,
                accountId: state.accountId,
                draft: edited,
                asOf: state.lastUpdated
            });
            if (box) { box.innerHTML = C360.approvalUi.approvalMessage(result); }
            return;
        }

        if (action === "send") {
            // Unreachable through the UI — the button is disabled. Handled so
            // the single gated path is what refuses, rather than the disabled
            // attribute being the only thing between a draft and a customer.
            var performed = C360.approval.perform("sendCustomerEmail",
                C360.approval.forRecommendation(recommendation.id)[0] || null);
            if (box) {
                box.innerHTML = '<p class="c360-ap-bad">'
                    + c.esc(performed.reason) + '</p>';
            }
        }
    }

    // -----------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------

    function renderMockBanner() {
        var showingData = !!state.model || !!state.portfolioView || !!state.scorecard;

        if (!showingData || !state.isMock) {
            el.mockBanner.hidden = true;
            return;
        }
        el.mockBanner.hidden = false;
        el.mockBanner.innerHTML =
              '<strong>Sample data.</strong> No CRM, helpdesk, billing, device-health or '
            + 'web-research backend is connected, so every record here is invented sample '
            + 'data used to develop the interface. Nothing describes a real customer. '
            + 'MyGeotab asset counts are the only live figures, and only inside MyGeotab '
            + 'on the matching database.';
    }

    /** The chrome, which is present on every screen. */
    function renderChrome() {
        el.rail.innerHTML = C360.shell.rail(state);
        el.head.innerHTML = C360.shell.header(state);

        // The search element is recreated with the header, so re-cache it and
        // re-bind. Cheap, and it keeps the header a pure string builder.
        el.search = document.getElementById("c360-search");
        el.searchResults = document.getElementById("c360-search-results");
        if (el.search && !el.search._c360bound) {
            el.search._c360bound = true;
            el.search.addEventListener("input", onSearchInput);
            el.search.addEventListener("focus", function () {
                runSearch(el.search.value);
            });
        }

        var strip = state.portfolioView ? C360.shell.strip(state.portfolioView) : "";
        el.strip.innerHTML = strip;
        el.strip.hidden = !strip;
    }

    function renderOverlays() {
        if (state.brief) {
            el.modal.hidden = false;
            el.modal.innerHTML = C360.briefUi.render(state.brief);
        } else {
            el.modal.hidden = true;
            el.modal.innerHTML = "";
        }

        if (state.aiOpen) {
            el.drawer.hidden = false;
            el.drawer.innerHTML = C360.portfolioAiUi.render(state, state.portfolioView);
        } else {
            el.drawer.hidden = true;
            el.drawer.innerHTML = "";
        }
    }

    /** Hide every screen container; each screen shows what it needs. */
    function hideAll() {
        el.portfolio.hidden = true;
        el.header.hidden = true;
        el.toolbar.hidden = true;
        el.status.hidden = true;
        el.scorecard.hidden = true;
        el.error.hidden = true;
        el.content.innerHTML = "";
    }

    function render() {
        renderChrome();
        renderMockBanner();
        renderOverlays();

        if (state.screen === "intelligence") {
            renderAccountScreen();
            return;
        }

        if (state.screen === "settings") {
            renderSettingsScreen();
            return;
        }

        renderPortfolioScreen();
    }

    /** Command Center, Accounts, Signals — all views over the same roll-up. */
    function renderPortfolioScreen() {
        hideAll();
        el.portfolio.hidden = false;

        if (state.portfolioError) {
            el.error.hidden = false;
            el.error.innerHTML =
                  '<h2 class="c360-error-title">The portfolio could not be loaded</h2>'
                + '<p class="c360-error-text">' + c.esc(state.portfolioError) + '</p>'
                + '<button type="button" class="c360-button" id="c360-pf-retry">'
                + 'Try again</button>';
            el.portfolio.innerHTML = "";
            return;
        }

        if (state.portfolioLoading && !state.portfolioView) {
            el.portfolio.innerHTML =
                  '<div class="c360-loading" role="status" aria-live="polite">'
                + '<p class="c360-loading-title">Scoring the portfolio&hellip;</p>'
                + '<ul class="c360-loading-list">'
                + '<li>Loading accounts</li><li>Resolving identity</li>'
                + '<li>Calculating health</li><li>Calculating priority</li>'
                + '<li>Generating actions</li>'
                + '</ul></div>';
            return;
        }

        el.portfolio.innerHTML = C360.portfolioUi.render(state.portfolioView, state);
    }

    /**
     * The account workspace, plus the legacy Customer 360 sections beneath it.
     *
     * The workspace renders from the already-loaded scorecard model, so it is on
     * screen before the section fetch returns. The sections keep their existing
     * order, markup and filters — nothing about the redesign reaches into them.
     */
    function renderAccountScreen() {
        hideAll();

        if (state.error) {
            el.error.hidden = false;
            el.error.innerHTML =
                  '<h2 class="c360-error-title">This account could not be loaded</h2>'
                + '<p class="c360-error-text">' + c.esc(state.error) + '</p>'
                + '<button type="button" class="c360-button" id="c360-retry">'
                + 'Try again</button>';
            return;
        }

        var row = rowFor(state.accountId);

        if (!row && !state.scorecard) {
            el.portfolio.hidden = false;
            el.portfolio.innerHTML =
                  '<div class="c360-loading" role="status" aria-live="polite">'
                + '<p class="c360-loading-title">Building account intelligence&hellip;</p>'
                + '<ul class="c360-loading-list">'
                + '<li>Internal records</li><li>Customer website</li>'
                + '<li>External web research</li></ul></div>';
            return;
        }

        // Synthesise a row when the account was opened directly rather than
        // from the portfolio (a MyGeotab deep link, or a reloaded URL).
        if (!row && state.scorecard) { row = C360.portfolio.row(state.scorecard); }

        el.portfolio.hidden = false;
        el.portfolio.innerHTML = C360.accountWorkspace.render(row, {
            intelligence: state.model || {}
        });

        if (state.model) {
            el.status.hidden = false;
            el.status.innerHTML = C360.render.sourceStatus(state.sourceGroups);

            renderToolbar();

            el.content.innerHTML = C360.render.dashboard(state.model, {
                dateFilterDays: C360.orchestrator.daysForFilter(state.dateFilterId),
                sourceGroups: state.sourceGroups
            });
            applySourceFilter();
        } else if (state.loading) {
            el.content.innerHTML =
                  '<div class="c360-loading" role="status" aria-live="polite">'
                + '<p class="c360-loading-title">Loading source records&hellip;</p>'
                + '</div>';
        }
    }

    /**
     * Settings: the scoring configuration, read-only.
     *
     * Read-only on purpose. Every one of these is a judgement call that should
     * be argued about in `js/core/scorecardConfig.js` and reviewed as a change,
     * not nudged from a screen at 8am — which is exactly what an editable
     * weights panel would invite.
     */
    function renderSettingsScreen() {
        hideAll();
        el.portfolio.hidden = false;

        var health = C360.scorecardConfig.health.weights;
        var priority = C360.scorecardConfig.priority.weights;

        function weightRows(weights, labels) {
            return Object.keys(weights).map(function (key) {
                return '<tr><th scope="row">'
                     + c.esc(labels[key] || util.humanize(key)) + '</th>'
                     + '<td class="c360-sc-num">'
                     + Math.round(weights[key] * 100) + '%</td></tr>';
            }).join("");
        }

        el.portfolio.innerHTML =
              '<div class="c360-cc" style="grid-template-columns:repeat(auto-fit,'
            + 'minmax(300px,1fr))">'
            + C360.parts.panel({
                  title: "Health Weights",
                  sub: "Five categories, weighted to 100%",
                  body: '<table class="c360-sc-breakdown"><tbody>'
                      + weightRows(health, C360.scorecardConfig.health.categoryLabels)
                      + '</tbody></table>'
                      + '<p class="c360-answer-method">An unavailable category is '
                      + 'excluded and these re-normalise across the rest. It is never '
                      + 'scored zero.</p>'
              })
            + C360.parts.panel({
                  title: "Priority Weights",
                  sub: "Five factors, weighted to 100%",
                  body: '<table class="c360-sc-breakdown"><tbody>'
                      + weightRows(priority, C360.scorecardConfig.priority.factorLabels)
                      + '</tbody></table>'
                      + '<p class="c360-answer-method">Health is not an input. Overrides '
                      + 'apply a floor on top of the scored level and can only raise '
                      + 'it.</p>'
              })
            + C360.parts.panel({
                  title: "Operational Policy",
                  body: '<div class="c360-facts" style="border:0">'
                      + C360.parts.fact("AI layer",
                            C360.scorecardConfig.ai.enabled ? "Enabled" : "Off",
                            { text: true })
                      + C360.parts.fact("Outbound sending",
                            C360.scorecardConfig.approval.sendingEnabled
                                ? "Enabled" : "Disabled", { text: true })
                      + C360.parts.fact("Bulk approval",
                            C360.scorecardConfig.approval.allowBulkApproval
                                ? "Allowed" : "Refused", { text: true })
                      + C360.parts.fact("Auto-suppress rules",
                            C360.scorecardConfig.feedback.autoSuppressRules
                                ? "On" : "Off", { text: true })
                      + C360.parts.fact("Predictive modelling",
                            C360.scorecardConfig.metrics.predictiveModelling
                                ? "On" : "Off", { text: true })
                      + C360.parts.fact("Refresh mode",
                            C360.scorecardConfig.portfolio.refresh.mode, { text: true })
                      + C360.parts.fact("Max concurrent accounts",
                            C360.scorecardConfig.portfolio.refresh.maxConcurrentAccounts)
                      + C360.parts.fact("Config version",
                            C360.scorecardConfig.version)
                      + '</div>'
                      + '<p class="c360-answer-method">Read-only by design. Every value '
                      + 'here is a judgement call that belongs in a reviewed change to '
                      + 'js/core/scorecardConfig.js, not a control on a dashboard.</p>'
              })
            + '</div>';
    }

    function renderToolbar() {
        if (!state.model) {
            el.toolbar.hidden = true;
            return;
        }
        el.toolbar.hidden = false;

        var dateButtons = C360.config.dateFilters.map(function (filter) {
            var active = filter.id === state.dateFilterId;
            return '<button type="button" class="c360-filter'
                 + (active ? " is-active" : "") + '" data-date-filter="'
                 + c.esc(filter.id) + '" aria-pressed="' + active + '">'
                 + c.esc(filter.label) + '</button>';
        }).join("");

        var sourceButtons = C360.config.sourceFilters.map(function (filter) {
            var active = filter.id === state.sourceFilterId;
            return '<button type="button" class="c360-filter'
                 + (active ? " is-active" : "") + '" data-source-filter="'
                 + c.esc(filter.id) + '" aria-pressed="' + active + '">'
                 + c.esc(filter.label) + '</button>';
        }).join("");

        el.toolbar.innerHTML =
              '<div class="c360-filter-group">'
            + '<span class="c360-filter-label" id="c360-view-label">View</span>'
            + '<div class="c360-filter-set" role="group" aria-labelledby="c360-view-label">'
            + sourceButtons + '</div></div>'
            + '<div class="c360-filter-group">'
            + '<span class="c360-filter-label" id="c360-period-label">Period</span>'
            + '<div class="c360-filter-set" role="group" '
            + 'aria-labelledby="c360-period-label">'
            + dateButtons + '</div></div>'
            + '<div class="c360-toolbar-right">'
            + '<span class="c360-updated">Records as of '
            + c.esc(state.lastUpdated
                ? util.formatDateTime(state.lastUpdated) : "Not available")
            + '</span></div>';
    }

    function applySourceFilter() {
        var wanted = state.sourceFilterId;
        var sections = el.content.querySelectorAll(".c360-section");

        Array.prototype.forEach.call(sections, function (section) {
            var tags = (section.getAttribute("data-filter-tags") || "").split(" ");
            section.hidden = wanted !== "all" && tags.indexOf(wanted) === -1;
        });
    }

    // -----------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------

    function onClick(event) {
        var target = event.target;

        // ---- rail navigation -----------------------------------------
        var screenButton = target.closest("[data-screen]");
        if (screenButton) {
            goTo(screenButton.getAttribute("data-screen"));
            return;
        }

        // ---- select (no navigation, no fetch) ------------------------
        var selectButton = target.closest("[data-select-account]");
        if (selectButton) {
            selectAccount(selectButton.getAttribute("data-select-account"));
            return;
        }

        // ---- open the workspace --------------------------------------
        var openButton = target.closest("[data-open-account]");
        if (openButton) {
            closeSearch();
            if (el.search) { el.search.value = ""; }
            state.brief = null;
            openAccount(openButton.getAttribute("data-open-account"));
            return;
        }

        if (target.closest("#c360-aw-back")) {
            state.screen = "command";
            syncUrl();
            render();
            return;
        }

        // ---- brief ---------------------------------------------------
        var briefButton = target.closest("[data-brief-account]");
        if (briefButton) {
            openBrief(briefButton.getAttribute("data-brief-account"));
            return;
        }

        if (target.closest("#c360-modal-close")) { closeBrief(); return; }

        if (target.closest("#c360-brief-copy")) {
            copyBrief();
            return;
        }

        // A click on the overlay backdrop, but not the modal itself, closes it.
        if (target === el.modal) { closeBrief(); return; }

        // ---- escalate ------------------------------------------------
        var escalate = target.closest("[data-escalate-account]");
        if (escalate) {
            // Escalation is an internal draft, which is a gated action like any
            // other. It opens the brief rather than doing anything outbound,
            // because nothing outbound is possible.
            openBrief(escalate.getAttribute("data-escalate-account"));
            return;
        }

        // ---- Portfolio AI --------------------------------------------
        if (target.closest("#c360-ask-ai")) {
            state.aiOpen = !state.aiOpen;
            render();
            return;
        }

        if (target.closest("#c360-ai-close")) {
            closeAi();
            return;
        }

        var askAbout = target.closest("[data-ask-about]");
        if (askAbout) {
            askAi("Why is " + askAbout.getAttribute("data-ask-about") + " a priority?");
            return;
        }

        var suggestion = target.closest("[data-ai-ask]");
        if (suggestion) {
            askAi(suggestion.getAttribute("data-ai-ask"));
            return;
        }

        if (target.closest("#c360-ai-send")) {
            var input = document.getElementById("c360-ai-input");
            askAi(input ? input.value : "");
            return;
        }

        // ---- filters -------------------------------------------------
        var filterButton = target.closest("[data-portfolio-filter]");
        if (filterButton) {
            toggleFilter(filterButton.getAttribute("data-portfolio-filter"),
                filterButton.getAttribute("data-portfolio-value"));
            return;
        }

        var signalButton = target.closest("[data-portfolio-signal]");
        if (signalButton) {
            applySignalFilter(signalButton.getAttribute("data-portfolio-signal"));
            return;
        }

        if (target.closest("#c360-pf-clear")) {
            clearFilters();
            return;
        }

        if (target.closest("#c360-pf-refresh") || target.closest("#c360-pf-retry")) {
            loadPortfolio({ forceRefresh: true });
            return;
        }

        if (target.closest("#c360-retry")) {
            loadAccount(state.accountId, { forceRefresh: true });
            return;
        }

        // ---- legacy dashboard controls -------------------------------
        var dateFilter = target.closest("[data-date-filter]");
        if (dateFilter) {
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

        // ---- scorecard: feedback + drafts ----------------------------
        var feedbackButton = target.closest("[data-feedback-outcome]");
        if (feedbackButton) { onFeedback(feedbackButton); return; }

        var reasonSave = target.closest('[data-feedback-action="save-reason"]');
        if (reasonSave) { onFeedback(reasonSave); return; }

        var draftButton = target.closest("[data-draft-action]");
        if (draftButton) { onDraftAction(draftButton); return; }

        // ---- evidence jump -------------------------------------------
        var jump = target.closest("[data-scorecard-jump]");
        if (jump) {
            event.preventDefault();
            var section = document.getElementById(
                jump.getAttribute("data-scorecard-jump"));
            if (section && typeof section.scrollIntoView === "function") {
                section.hidden = false;
                section.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            return;
        }

        // Legacy account buttons (recents, older markup).
        var accountButton = target.closest("[data-account-id]");
        if (accountButton) {
            closeSearch();
            openAccount(accountButton.getAttribute("data-account-id"));
            return;
        }

        if (!target.closest(".c360-search")) { closeSearch(); }
    }

    /**
     * Copy the brief.
     *
     * Reports what actually happened rather than optimistically claiming
     * success — a "copied" message on a clipboard call that silently failed is
     * worse than no message, because the user pastes nothing into their notes.
     */
    function copyBrief() {
        var status = document.getElementById("c360-brief-status");
        var text = C360.brief.toText(state.brief);

        function done(message) {
            if (status) { status.textContent = message; }
        }

        if (window.navigator && window.navigator.clipboard
            && typeof window.navigator.clipboard.writeText === "function") {
            window.navigator.clipboard.writeText(text).then(function () {
                done("Brief copied to the clipboard.");
            }, function () {
                done("The clipboard is not available in this embedding.");
            });
            return;
        }
        done("The clipboard is not available in this embedding.");
    }

    function onKeydown(event) {
        if (event.key === "Escape") {
            if (state.brief) { closeBrief(); return; }
            if (state.aiOpen) { closeAi(); return; }
            closeSearch();
            return;
        }

        if (event.key === "Enter" && event.target
            && event.target.id === "c360-ai-input") {
            askAi(event.target.value);
        }
    }

    function onChange(event) {
        if (event.target && event.target.id === "c360-pf-sort") {
            setSort(event.target.value);
        }
    }

    // -----------------------------------------------------------------
    // Clock
    // -----------------------------------------------------------------

    /**
     * The one place in the interface that reads the wall clock.
     *
     * It patches the clock node directly rather than re-rendering: a full
     * re-render every second would rebuild the whole workspace and lose focus,
     * scroll position and any open drawer once per tick.
     */
    function startClock() {
        function tick() {
            state.clock = C360.shell.clockText(new Date());
            var node = document.getElementById("c360-clock");
            if (node) { node.textContent = state.clock; }
        }
        tick();
        if (clockTimer) { clearInterval(clockTimer); }
        clockTimer = setInterval(tick, CLOCK_MS);
    }

    // -----------------------------------------------------------------
    // Start-up
    // -----------------------------------------------------------------

    function cacheElements() {
        el.root = document.getElementById("c360-app");
        el.rail = document.getElementById("c360-rail");
        el.head = document.getElementById("c360-cmdhead");
        el.strip = document.getElementById("c360-strip");
        el.mockBanner = document.getElementById("c360-mock-banner");
        el.portfolio = document.getElementById("c360-portfolio");
        el.header = document.getElementById("c360-account-header");
        el.toolbar = document.getElementById("c360-toolbar");
        el.status = document.getElementById("c360-source-status");
        el.scorecard = document.getElementById("c360-scorecard-block");
        el.content = document.getElementById("c360-content");
        el.error = document.getElementById("c360-error");
        el.modal = document.getElementById("c360-modal");
        el.drawer = document.getElementById("c360-aidrawer");
    }

    var SCREENS = ["command", "accounts", "signals", "intelligence", "settings"];

    function start(options) {
        var opts = options || {};

        if (!el.root) {
            cacheElements();
            el.root.setAttribute("data-started", "true");
            state.dateFilterId = C360.config.defaultDateFilterId;

            var restored = C360.portfolio.fromQuery(
                String(window.location.search || "") + "&"
                + String(window.location.hash || "").replace(/^#/, ""));
            state.filters = restored.filters;
            state.sort = restored.sort;
            if (SCREENS.indexOf(restored.view) !== -1) { state.screen = restored.view; }
            if (restored.accountId) { state.selectedAccountId = restored.accountId; }

            el.root.addEventListener("click", onClick);
            el.root.addEventListener("change", onChange);
            document.addEventListener("keydown", onKeydown);

            startClock();
            render();

            // The Command Center is the landing screen: "who should I care
            // about today" is a portfolio question.
            loadPortfolio({});

            if (restored.accountId && restored.view === "intelligence"
                && !opts.accountId) {
                openAccount(restored.accountId);
            }
        }

        if (opts.accountId && opts.accountId !== state.accountId) {
            openAccount(opts.accountId);
        }
    }

    return {
        start: start,

        /**
         * The named user actions. These are what the click handler calls, so a
         * caller here exercises exactly the path a click does.
         */
        goTo: goTo,
        selectAccount: selectAccount,
        openAccount: openAccount,
        toggleFilter: toggleFilter,
        clearFilters: clearFilters,
        setSort: setSort,
        openBrief: openBrief,
        closeBrief: closeBrief,
        askAi: askAi,
        closeAi: closeAi,
        loadPortfolio: loadPortfolio,

        /** Kept for MyGeotab deep links and older callers. */
        loadAccount: loadAccount,

        // Exposed for debugging in the console; nothing reads it internally.
        _state: state
    };
}());
