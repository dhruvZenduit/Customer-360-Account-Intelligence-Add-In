/**
 * Customer 360 — ADD-IN CHROME
 * ============================
 * The toolbar and status strip at the top of the add-in.
 *
 * THIS IS A PANEL INSIDE MYGEOTAB, NOT AN APPLICATION.
 *
 * MyGeotab injects this page into its own document. It already supplies the
 * product frame: a left navigation rail, a header, the database name, the signed
 * in user, breadcrumbs, and the add-in's own menu entry ("Customer 360"). So
 * this file deliberately does NOT render:
 *
 *   - a left icon rail. MyGeotab has one three pixels away, and two primary
 *     navigation rails side by side is the single clearest way to look like a
 *     web app that got embedded by accident.
 *   - a product wordmark or an eyebrow. "ZENDUONE / CUSTOMER INTELLIGENCE" over
 *     the top of a page already titled Customer 360 is the add-in shouting its
 *     own name at somebody who just clicked its menu item.
 *   - a large screen title. The vertical space it costs is space MyGeotab's own
 *     chrome already spent.
 *
 * What is left is one compact row: which view, how fresh the data is, and the
 * four things a user does. Screen switching is a segmented control — tabs
 * WITHIN a page, which is what these five views actually are.
 *
 * Returns HTML strings. Computes nothing.
 */

"use strict";

C360.shell = (function () {

    var util = C360.util;
    var esc = util.escapeHtml;

    /**
     * The five views.
     *
     * `intelligence` needs an account selected, so it is disabled rather than
     * hidden until there is one — a tab that appears and disappears is harder
     * to learn than one that is visibly not yet available.
     */
    var VIEWS = [
        { id: "command", label: "Command", hint: "Portfolio operations" },
        { id: "accounts", label: "Accounts", hint: "Full account list" },
        { id: "signals", label: "Signals", hint: "Portfolio signal feed" },
        { id: "intelligence", label: "Account", hint: "Account detail workspace",
          needsAccount: true },
        { id: "settings", label: "Config", hint: "Scoring configuration" }
    ];

    /** The segmented view switcher. */
    function viewTabs(state) {
        return '<div class="c360-views" role="tablist" aria-label="View">'
             + VIEWS.map(function (view) {
                   var active = state.screen === view.id;
                   var disabled = view.needsAccount && !state.accountId
                               && !state.selectedAccountId;

                   return '<button type="button" role="tab"'
                        + ' class="c360-view' + (active ? " is-active" : "") + '"'
                        + ' data-screen="' + esc(view.id) + '"'
                        + (disabled ? " disabled" : "")
                        + ' aria-selected="' + active + '"'
                        + ' title="' + esc(view.hint) + '">'
                        + esc(view.label) + '</button>';
               }).join("")
             + '</div>';
    }

    /**
     * The toolbar.
     *
     * One row. The clock and lamp are a DATA FRESHNESS readout, not decoration:
     * "SYSTEM READY" means the last refresh finished, "SYNCING" means one is in
     * flight, and the timestamp beside them is when the portfolio was last
     * scored. Nothing here implies a process that runs on its own, because
     * nothing does.
     *
     * The search input keeps its existing id and ARIA wiring — Phase 6 is
     * explicit that there must not be a second search box, so this is the same
     * combobox, moved.
     */
    function toolbar(state) {
        var syncing = state.refreshing || state.portfolioLoading;

        var status = '<div class="c360-freshness">'
            + '<span class="c360-freshness-lamp'
            + (syncing ? " is-syncing" : "") + '" aria-hidden="true"></span>'
            + '<span class="c360-freshness-text">'
            + (syncing
               ? "Syncing"
               : (state.lastUpdated
                  ? "Scored " + esc(util.formatDateTime(state.lastUpdated))
                  : "Not yet scored"))
            + '</span>'
            + (state.clock
               ? '<span class="c360-freshness-clock" id="c360-clock">'
                 + esc(state.clock) + '</span>'
               : "")
            + '</div>';

        var search = '<div class="c360-search">'
            + '<label class="c360-visually-hidden" for="c360-search">'
            + 'Search accounts, contacts and issues</label>'
            + '<input type="search" id="c360-search" class="c360-search-input"'
            + ' placeholder="Search accounts, contacts, issues…" autocomplete="off"'
            + ' role="combobox" aria-expanded="false" aria-controls="c360-search-results"'
            + ' aria-autocomplete="list" />'
            + '<ul id="c360-search-results" class="c360-search-results" role="listbox"'
            + ' aria-label="Search results" hidden></ul>'
            + '</div>';

        return '<div class="c360-cmdbar-left">'
             + viewTabs(state)
             + status
             + '</div>'
             + '<div class="c360-cmdbar-right">'
             + search
             + '<button type="button" class="c360-button c360-button--ai" id="c360-ask-ai"'
             + ' aria-pressed="' + (state.aiOpen === true) + '">'
             + 'Ask Portfolio AI</button>'
             + '<button type="button" class="c360-button c360-button--quiet" '
             + 'id="c360-pf-refresh"' + (syncing ? " disabled" : "") + '>'
             + (syncing ? "Refreshing…" : "Refresh") + '</button>'
             + '</div>';
    }

    /**
     * The portfolio status strip: five figures, one row, monospace.
     *
     * Not five KPI cards. Cards would take four times the vertical space to say
     * the same thing, and vertical space inside an embedded panel is the
     * scarcest thing there is.
     *
     * ARR states its own coverage. `$8.2M PORTFOLIO` implies all 26 accounts; if
     * only 24 record a contract value, saying so is the difference between a
     * figure and a claim.
     */
    function strip(view) {
        if (!view || view.empty) { return ""; }
        var s = view.summary;

        function item(value, label, tone) {
            return '<div class="c360-strip-item'
                 + (tone ? " c360-strip-item--" + esc(tone) : "") + '">'
                 + '<span class="c360-strip-value">' + esc(String(value)) + '</span>'
                 + '<span class="c360-strip-label">' + esc(label) + '</span>'
                 + '</div>';
        }

        var arr = s.arrTotal === null
            ? "—"
            : (s.arrTotal >= 1000000
                ? "$" + (s.arrTotal / 1000000).toFixed(1) + "M"
                : "$" + Math.round(s.arrTotal / 1000) + "K");

        return item(s.total, "Accounts")
             + item(s.urgent, "P0 / P1", s.urgent ? "critical" : null)
             + item(s.bands.critical, "Critical health", s.bands.critical ? "warning" : null)
             + item(s.needAction, "Need action")
             + item(arr, "Portfolio ARR")
             + '<p class="c360-strip-note">'
             + (s.arrCoversAll
                ? "ARR across all " + s.total + " accounts."
                : "ARR covers " + s.arrKnownFor + " of " + s.total
                  + " accounts; the rest record no contract value.")
             + '</p>';
    }

    /**
     * Clock text.
     *
     * The one place in the interface that reads the wall clock — and the timer
     * behind it runs only while the add-in has focus. See `app.suspend()`: an
     * interval that survives navigating away is a leak that compounds every
     * time the user comes back.
     */
    function clockText(date) {
        var d = util.toDate(date) || new Date();
        var hours = d.getHours();
        var suffix = hours >= 12 ? "PM" : "AM";
        var display = hours % 12;
        if (display === 0) { display = 12; }

        function pad(value) { return value < 10 ? "0" + value : String(value); }

        return display + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds())
             + " " + suffix;
    }

    return {
        toolbar: toolbar,
        viewTabs: viewTabs,
        strip: strip,
        clockText: clockText,
        VIEWS: VIEWS
    };
}());
