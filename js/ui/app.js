/**
 * Customer 360 — application shell
 * ================================
 * Holds the page state, wires the controls, and decides which screen is
 * showing.
 *
 * TWO VIEWS since Phase 6:
 *
 *   portfolio  the Command Center — the whole portfolio at once
 *   account    the existing single-account dashboard, with the scorecard block
 *              inserted above the sections it always had
 *
 * The account view is unchanged in behaviour. The scorecard is additive: it
 * renders into its own container between the account header and `#c360-content`,
 * and every existing section keeps its order, its filters and its markup.
 *
 * State lives in one object. Every user action mutates it and then calls
 * render() — there is no partial DOM patching, which for a page this size is
 * both fast enough and far easier to reason about.
 *
 * Filter and sort state round-trips through the query string, extending the
 * pattern the add-in already uses for `?dataSource=` and `?gateway=` rather than
 * inventing a second mechanism. That is also what lets the Back button from an
 * account return to the portfolio with its filters intact.
 */

"use strict";

C360.app = (function () {

    var util = C360.util;
    var c = C360.components;

    var RECENT_KEY = "c360:recent-accounts";
    var HISTORY_KEY = "c360:scorecard-history";
    var MAX_RECENT = 5;
    var SEARCH_DEBOUNCE_MS = 220;

    var state = {
        /** "portfolio" | "account" */
        view: "portfolio",

        accountId: null,
        model: null,           // intelligence model from the engine
        scorecard: null,       // scorecard model from C360.scorecardEngine
        previous: null,        // the prior stored run, for score deltas
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
        sourceFilterId: "all",

        // ---- portfolio ----
        portfolioView: null,   // view model from C360.portfolio.build
        portfolioModels: [],
        portfolioFailures: [],
        portfolioLoading: false,
        portfolioLoaded: false,
        portfolioError: null,
        filters: {},
        sort: null,
        /** Built in rebuildPortfolioView; the view only renders them. */
        metrics: null,
        feedbackSummary: null
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
    // Score history — for "what changed"
    // -----------------------------------------------------------------

    /**
     * The previous run's scores per account, so "What changed" can show a real
     * delta.
     *
     * Until at least two runs have been stored there is nothing to compare
     * against, and the UI says the history is not yet available. It never
     * invents a previous value: a fabricated trend is worse than no trend,
     * because the user cannot tell which they are looking at.
     */
    function readHistory() {
        try {
            var raw = window.sessionStorage.getItem(HISTORY_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function previousRun(accountId) {
        var history = readHistory();
        return history[accountId] || null;
    }

    function rememberRun(scorecard) {
        if (!scorecard || !scorecard.accountId) { return; }
        try {
            var history = readHistory();
            history[scorecard.accountId] = {
                healthScore: scorecard.summary.healthScore,
                priorityLevel: scorecard.summary.priorityLevel,
                priorityScore: scorecard.summary.priorityScore,
                asOf: scorecard.asOf
            };
            window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch (e) {
            // Storage blocked in this embedding — deltas are a convenience only.
        }
    }

    // -----------------------------------------------------------------
    // URL state
    // -----------------------------------------------------------------

    /**
     * Reflect view, filters and sort into the query string so a view can be
     * shared or survive a reload — and so returning from an account restores
     * the portfolio exactly as it was left.
     */
    function syncUrl() {
        if (!window.history || typeof window.history.replaceState !== "function") { return; }
        try {
            var query = C360.portfolio.toQuery({
                filters: state.filters,
                sort: state.sort,
                view: state.view,
                accountId: state.view === "account" ? state.accountId : null
            });
            var base = String(window.location.pathname || "");
            window.history.replaceState(null, "", query ? base + "?" + query : base);
        } catch (e) {
            // Some embeddings disallow replaceState. The app still works; only
            // the shareable URL is lost.
        }
    }

    // -----------------------------------------------------------------
    // Loading
    // -----------------------------------------------------------------

    /**
     * PORTFOLIO REFRESH. A batch over the same per-account pipeline, with
     * bounded concurrency, run on demand — never a continuously running model.
     */
    function loadPortfolio(options) {
        var opts = options || {};

        // Loading the portfolio means showing it — otherwise a refresh from the
        // account view would fetch 26 accounts and render none of them.
        state.view = "portfolio";
        state.portfolioLoading = true;
        state.portfolioError = null;
        if (opts.forceRefresh) { state.refreshing = true; }
        render();

        return C360.accountService.search("").then(function (accounts) {
            var ids = C360.util.list(accounts).map(function (account) { return account.id; });

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

            // Store each run so the next one can show a real delta.
            result.models.forEach(rememberRun);

            rebuildPortfolioView();
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
     * Re-derive the view model. No fetching, so filtering and sorting are
     * instant.
     *
     * The metrics and the feedback aggregate are built HERE rather than in the
     * template: `C360.feedback.summary()` reads sessionStorage, and neither the
     * pure roll-up nor the view layer should own I/O. This is the layer that
     * already does.
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

    function loadAccount(accountId, options) {
        var opts = options || {};
        var token = ++loadToken;

        state.accountId = accountId;
        state.view = "account";
        state.error = null;
        // Read the prior run BEFORE this one overwrites it, or the delta is
        // always zero.
        state.previous = previousRun(accountId);
        if (opts.forceRefresh) {
            state.refreshing = true;
        } else {
            state.loading = true;
            state.model = null;
            state.scorecard = null;
        }
        render();

        C360.orchestrator.load(accountId, {
            forceRefresh: opts.forceRefresh === true,
            dateFilterId: state.dateFilterId
        }).then(function (result) {
            if (token !== loadToken) { return; }   // a newer load has started

            state.model = result.intelligence;
            state.scorecard = result.scorecard;
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
            rememberRun(result.scorecard);
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
    // View navigation
    // -----------------------------------------------------------------

    function renderViewNav() {
        var tabs = [
            { id: "portfolio", label: "Command Center" },
            { id: "account", label: "Account detail" }
        ];

        el.viewNav.hidden = false;
        el.viewNav.innerHTML = tabs.map(function (tab) {
            var active = state.view === tab.id;
            // The account tab is meaningless until an account is chosen, so it
            // is disabled rather than hidden — a tab that appears and disappears
            // is harder to learn than one that is visibly not yet available.
            var disabled = tab.id === "account" && !state.accountId;
            return '<button type="button" class="c360-viewtab'
                 + (active ? " is-active" : "") + '" data-view="' + tab.id + '"'
                 + (disabled ? " disabled" : "")
                 + ' aria-pressed="' + active + '">' + tab.label + '</button>';
        }).join("");
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
        // Shown on EITHER view. Gating this on the account model hid the banner
        // on the Command Center, which is the first screen a user sees and
        // therefore the first place invented data could be mistaken for real.
        var showingData = !!state.model || !!state.portfolioView;

        if (!showingData || !state.isMock) {
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
        renderViewNav();

        if (state.view === "portfolio") {
            renderPortfolioView();
            return;
        }

        el.portfolio.hidden = true;
        el.portfolio.innerHTML = "";

        renderAccountView();
    }

    /**
     * The Command Center. Everything it shows comes from the pure roll-up in
     * `js/scorecard/portfolio.js`; nothing is computed here.
     */
    function renderPortfolioView() {
        el.header.hidden = true;
        el.toolbar.hidden = true;
        el.status.hidden = true;
        el.welcome.hidden = true;
        el.scorecard.hidden = true;
        el.scorecard.innerHTML = "";
        el.content.innerHTML = "";
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
        el.error.hidden = true;

        if (state.portfolioLoading && !state.portfolioView) {
            el.portfolio.innerHTML =
                  '<div class="c360-loading" role="status" aria-live="polite">'
                + '<p class="c360-loading-title">Scoring the portfolio&hellip;</p>'
                + '<ul class="c360-loading-list">'
                + '<li>Loading accounts</li><li>Calculating health</li>'
                + '<li>Calculating priority</li><li>Generating actions</li>'
                + '</ul></div>';
            return;
        }

        el.portfolio.innerHTML = C360.portfolioUi.render(state.portfolioView, state);
    }

    /** The existing single-account dashboard, with the scorecard block above it. */
    function renderAccountView() {
        // --- error ---------------------------------------------------
        if (state.error) {
            el.header.hidden = true;
            el.toolbar.hidden = true;
            el.status.hidden = true;
            el.welcome.hidden = true;
            el.scorecard.hidden = true;
            el.scorecard.innerHTML = "";
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
            el.scorecard.hidden = true;
            el.scorecard.innerHTML = "";
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
            el.scorecard.hidden = true;
            el.scorecard.innerHTML = "";
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

        /**
         * The scorecard sits in its own container between the account header and
         * `#c360-content`. The existing sections below are rendered by exactly
         * the same call as before — same order, same markup, same filters. The
         * scorecard is additive, and nothing about it reaches into them.
         */
        if (state.scorecard) {
            el.scorecard.hidden = false;
            el.scorecard.innerHTML = C360.scorecardUi.render(state.scorecard, {
                previous: state.previous,
                intelligence: state.model,
                portfolioReturn: state.portfolioLoaded
            });
        } else {
            el.scorecard.hidden = true;
            el.scorecard.innerHTML = "";
        }

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

    /**
     * Toggle one filter value. OR within a group, AND across groups — so
     * clicking a second priority chip widens the priority set, and clicking a
     * queue chip narrows the result.
     */
    function toggleFilter(group, value) {
        var current = C360.util.list(state.filters[group]).slice();
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

    /** Drill into a portfolio signal: filter the list to exactly its accounts. */
    function applySignalFilter(key) {
        var signal = C360.util.list(state.portfolioView && state.portfolioView.signals)
            .filter(function (item) { return item.key === key; })[0];
        if (!signal) { return; }

        // Filtered by explicit account id, so the list can never disagree with
        // the count that was clicked.
        state.filters = { accountIds: signal.accountIds };
        rebuildPortfolioView();
        syncUrl();
        render();
    }

    // -----------------------------------------------------------------
    // Feedback + drafts
    // -----------------------------------------------------------------

    function findRecommendation(recommendationId) {
        if (!state.scorecard) { return null; }
        return C360.util.list(state.scorecard.recommendations).filter(function (rec) {
            return rec.id === recommendationId;
        })[0] || null;
    }

    function onFeedback(button) {
        var outcome = button.getAttribute("data-feedback-outcome");
        var recId = button.getAttribute("data-feedback-rec");
        var recommendation = findRecommendation(recId);
        if (!recommendation) { return; }

        var block = button.closest(".c360-fb");
        var reasonBox = block ? block.querySelector(".c360-fb-reason") : null;
        var reasonInput = block ? block.querySelector(".c360-fb-reason-input") : null;

        var result = C360.feedback.capture({
            outcome: outcome,
            reason: reasonInput && reasonInput.value ? reasonInput.value : null,
            recommendation: recommendation,
            model: state.scorecard,
            user: "Current user",
            asOf: state.lastUpdated
        });

        if (!result.recorded) {
            console.warn("Customer 360: feedback rejected — " + result.reason);
            return;
        }

        // Prompt for a reason, never require one: a user who marks something
        // incorrect and will not explain why has still told us something worth
        // counting, and blocking on the text box costs us the count.
        if (reasonBox && C360.feedbackUi.shouldPromptForReason(outcome)) {
            reasonBox.hidden = false;
            if (reasonInput) { reasonInput.focus(); }
        }

        // Re-render just this recommendation's controls, so the page does not
        // jump back to the top on every click.
        var article = button.closest(".c360-sc-rec");
        var controls = article ? article.querySelector(".c360-fb") : null;
        if (controls) {
            controls.outerHTML = C360.feedbackUi.controls(recommendation, state.scorecard);
        }

        // The per-rule aggregate and the accept/reject metrics have just changed.
        // Rebuilt now so returning to the Command Center shows the new numbers
        // rather than the ones from before the click.
        if (state.portfolioModels.length) { rebuildPortfolioView(); }
    }

    function onDraftAction(button) {
        var action = button.getAttribute("data-draft-action");
        var section = button.closest(".c360-ap-draft");
        if (!section) { return; }

        var recId = section.getAttribute("data-draft-rec");
        var kind = section.getAttribute("data-draft-kind");
        var recommendation = findRecommendation(recId);
        if (!recommendation) { return; }

        var original = C360.util.list(recommendation.drafts).filter(function (draft) {
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
                accountId: state.scorecard ? state.scorecard.accountId : null,
                draft: edited,
                asOf: state.lastUpdated
            });
            if (box) { box.innerHTML = C360.approvalUi.approvalMessage(result); }
            return;
        }

        if (action === "send") {
            // Unreachable through the UI: the button is disabled. Handled anyway
            // so that the single gated path is what refuses, rather than the
            // button's disabled attribute being the only thing standing between
            // a draft and a customer.
            var performed = C360.approval.perform("sendCustomerEmail",
                C360.approval.forRecommendation(recommendation.id)[0] || null);
            if (box) {
                box.innerHTML = '<p class="c360-ap-bad">' + c.esc(performed.reason) + '</p>';
            }
        }
    }

    function onClick(event) {
        var target = event.target;

        // ---- view switching ------------------------------------------
        var viewTab = target.closest("[data-view]");
        if (viewTab) {
            var wanted = viewTab.getAttribute("data-view");
            if (wanted === "account" && !state.accountId) { return; }
            state.view = wanted;
            if (wanted === "portfolio" && !state.portfolioLoaded && !state.portfolioLoading) {
                loadPortfolio({});
            } else {
                syncUrl();
                render();
            }
            return;
        }

        // ---- portfolio -> account ------------------------------------
        var portfolioAccount = target.closest("[data-portfolio-account]");
        if (portfolioAccount) {
            loadAccount(portfolioAccount.getAttribute("data-portfolio-account"), {});
            syncUrl();
            return;
        }

        // ---- account -> portfolio, filters intact --------------------
        if (target.closest("#c360-sc-back")) {
            state.view = "portfolio";
            syncUrl();
            render();
            return;
        }

        var portfolioFilter = target.closest("[data-portfolio-filter]");
        if (portfolioFilter) {
            toggleFilter(portfolioFilter.getAttribute("data-portfolio-filter"),
                portfolioFilter.getAttribute("data-portfolio-value"));
            return;
        }

        var portfolioSignal = target.closest("[data-portfolio-signal]");
        if (portfolioSignal) {
            applySignalFilter(portfolioSignal.getAttribute("data-portfolio-signal"));
            return;
        }

        if (target.closest("#c360-pf-clear")) {
            state.filters = {};
            rebuildPortfolioView();
            syncUrl();
            render();
            return;
        }

        if (target.closest("#c360-pf-refresh")) {
            loadPortfolio({ forceRefresh: true });
            return;
        }

        if (target.closest("#c360-pf-retry")) {
            loadPortfolio({ forceRefresh: true });
            return;
        }

        // ---- scorecard: feedback + drafts ---------------------------
        var feedbackButton = target.closest("[data-feedback-outcome]");
        if (feedbackButton) {
            onFeedback(feedbackButton);
            return;
        }

        var reasonSave = target.closest('[data-feedback-action="save-reason"]');
        if (reasonSave) {
            onFeedback(reasonSave);
            return;
        }

        var draftButton = target.closest("[data-draft-action]");
        if (draftButton) {
            onDraftAction(draftButton);
            return;
        }

        /**
         * Evidence jump. Scrolls to the existing Customer 360 section that lists
         * the record, which is what makes a source without a deep link still
         * reachable rather than a dead label.
         */
        var jump = target.closest("[data-scorecard-jump]");
        if (jump) {
            event.preventDefault();
            var section = document.getElementById(jump.getAttribute("data-scorecard-jump"));
            if (section && typeof section.scrollIntoView === "function") {
                section.hidden = false;
                section.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            return;
        }

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

    function onChange(event) {
        if (event.target && event.target.id === "c360-pf-sort") {
            state.sort = event.target.value;
            rebuildPortfolioView();
            syncUrl();
            render();
        }
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
        el.viewNav = document.getElementById("c360-viewnav");
        el.portfolio = document.getElementById("c360-portfolio");
        el.scorecard = document.getElementById("c360-scorecard-block");
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

            /**
             * Restore view, filters and sort from the URL, so a shared link or a
             * reload lands on the same screen. Same mechanism the add-in already
             * uses for `?dataSource=` and `?gateway=`.
             */
            var restored = C360.portfolio.fromQuery(
                String(window.location.search || "") + "&"
                + String(window.location.hash || "").replace(/^#/, ""));
            state.filters = restored.filters;
            state.sort = restored.sort;
            if (restored.view === "account" || restored.view === "portfolio") {
                state.view = restored.view;
            }

            el.search.addEventListener("input", onSearchInput);
            el.search.addEventListener("focus", function () {
                if (!state.searchResults.length) { runSearch(""); }
                else { state.searchOpen = true; renderSearchResults(); }
            });
            el.root.addEventListener("click", onClick);
            el.root.addEventListener("change", onChange);
            document.addEventListener("keydown", onKeydown);

            render();

            // The Command Center is the landing screen: the product's question
            // is "who should I care about today", which is a portfolio question.
            if (state.view === "portfolio") {
                loadPortfolio({});
            }

            if (restored.accountId && !opts.accountId) {
                loadAccount(restored.accountId, {});
            }
        }

        if (opts.accountId && opts.accountId !== state.accountId) {
            loadAccount(opts.accountId, {});
        }
    }

    return {
        start: start,
        loadAccount: loadAccount,
        loadPortfolio: loadPortfolio,
        // Exposed for debugging in the console; nothing reads it internally.
        _state: state
    };
}());
