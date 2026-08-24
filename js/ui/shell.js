/**
 * Customer 360 — APPLICATION SHELL
 * ================================
 * The chrome: a thin icon rail, a compact command header, and the portfolio
 * status strip.
 *
 * All three are deliberately small. A command center is opened every morning by
 * someone who already knows what product they are in, so the chrome's job is to
 * orient and get out of the way — the workspace below it is what they came for.
 * Anything spent here is spent twice: once in pixels, and once in the attention
 * it takes to skip past.
 *
 * The rail is collapsed by default and expands on hover OR focus-within. Hover
 * alone would strand keyboard users, and the labels are always in the DOM
 * rather than being revealed by CSS, so a screen reader reads "Command Center"
 * whether or not the rail is visually open.
 *
 * Returns HTML strings. Computes nothing.
 */

"use strict";

C360.shell = (function () {

    var util = C360.util;
    var esc = util.escapeHtml;

    /**
     * The five destinations from the design.
     *
     * `screen` is what app.js routes on. Accounts and Signals are views over the
     * portfolio the Command Center already holds; Intelligence is the account
     * workspace, which needs an account selected first — so it is disabled
     * rather than hidden until there is one. A nav item that appears and
     * disappears is harder to learn than one that is visibly not yet available.
     */
    var NAV = [
        { id: "command", icon: "◉", label: "Command Center",
          hint: "Portfolio operations" },
        { id: "accounts", icon: "◇", label: "Accounts",
          hint: "Full account list" },
        { id: "signals", icon: "◎", label: "Signals",
          hint: "Portfolio signal feed" },
        { id: "intelligence", icon: "◌", label: "Intelligence",
          hint: "Account detail workspace", needsAccount: true },
        { id: "settings", icon: "⚙", label: "Settings",
          hint: "Scoring configuration", pinBottom: true }
    ];

    function rail(state) {
        var items = NAV.filter(function (item) { return !item.pinBottom; });
        var bottom = NAV.filter(function (item) { return item.pinBottom; });

        function button(item) {
            var active = state.screen === item.id;
            var disabled = item.needsAccount && !state.accountId;

            return '<button type="button" class="c360-rail-item'
                 + (active ? " is-active" : "") + '"'
                 + ' data-screen="' + esc(item.id) + '"'
                 + (disabled ? " disabled" : "")
                 + ' aria-current="' + (active ? "page" : "false") + '"'
                 + ' title="' + esc(item.label + " — " + item.hint) + '">'
                 + '<span class="c360-rail-icon" aria-hidden="true">'
                 + item.icon + '</span>'
                 + '<span class="c360-rail-label">' + esc(item.label) + '</span>'
                 + '</button>';
        }

        return '<div class="c360-rail-mark">'
             + '<span class="c360-rail-glyph" aria-hidden="true">Z</span>'
             + '<span class="c360-rail-wordmark">Zenduone</span>'
             + '</div>'
             + items.map(button).join("")
             + '<div class="c360-rail-spacer"></div>'
             + bottom.map(button).join("");
    }

    // -----------------------------------------------------------------
    // Header
    // -----------------------------------------------------------------

    /** Title and subtitle per screen, so the header states where you are. */
    var TITLES = {
        command: { title: "Command Center", sub: "Portfolio Operations" },
        accounts: { title: "Accounts", sub: "Full Portfolio List" },
        signals: { title: "Signals", sub: "Portfolio Signal Feed" },
        intelligence: { title: "Account Intelligence", sub: "Detail Workspace" },
        settings: { title: "Settings", sub: "Scoring Configuration" }
    };

    /**
     * The header.
     *
     * The clock is real and ticks; the status lamp reflects whether a refresh is
     * in flight. "SYSTEM READY" rather than anything implying continuous
     * processing, because nothing here runs continuously — the scoring engines
     * run when the portfolio is refreshed and not otherwise.
     *
     * The search input keeps its existing id and ARIA wiring. Phase 6 is
     * explicit that there must not be a second search box, so this is the same
     * combobox moved into the header, not a new one.
     */
    function header(state) {
        var titles = TITLES[state.screen] || TITLES.command;
        var syncing = state.refreshing || state.portfolioLoading;

        var clock = '<div class="c360-cmd-clock">'
            + '<span class="c360-cmd-time" id="c360-clock">'
            + esc(state.clock || "--:--:--") + '</span>'
            + '<span class="c360-cmd-status">'
            + '<span class="c360-livedot' + (syncing ? " c360-livedot--syncing" : "")
            + '" aria-hidden="true"></span>'
            + (syncing ? "Syncing" : "System ready")
            + '</span></div>';

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

        return '<div class="c360-cmd-left">'
             + '<p class="c360-cmd-eyebrow">Zenduone / Customer Intelligence</p>'
             + '<h1 class="c360-cmd-title">' + esc(titles.title) + '</h1>'
             + '<p class="c360-cmd-sub">' + esc(titles.sub) + '</p>'
             + '</div>'
             + '<div class="c360-cmd-right">'
             + clock
             + search
             + '<button type="button" class="c360-button c360-button--ai" id="c360-ask-ai">'
             + 'Ask Portfolio AI</button>'
             + '<button type="button" class="c360-button c360-button--quiet" '
             + 'id="c360-pf-refresh"' + (syncing ? " disabled" : "") + '>'
             + (syncing ? "Refreshing…" : "Refresh") + '</button>'
             + '</div>';
    }

    // -----------------------------------------------------------------
    // Status strip
    // -----------------------------------------------------------------

    /**
     * Five figures, one row, monospace. Every one is computed by the pure
     * roll-up; there is no placeholder path in this function.
     *
     * ARR states its coverage when it does not cover the whole portfolio.
     * `$6.0M PORTFOLIO` implies all 26 accounts; if only 24 record a contract
     * value, saying so is the difference between a figure and a claim.
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

    /** Live clock text. The one place in the UI that reads the wall clock. */
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
        rail: rail,
        header: header,
        strip: strip,
        clockText: clockText,
        NAV: NAV,
        TITLES: TITLES
    };
}());
