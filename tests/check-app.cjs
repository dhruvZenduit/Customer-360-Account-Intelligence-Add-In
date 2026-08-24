/**
 * Customer 360 — app shell smoke test
 * ===================================
 *   node tests/check-app.cjs
 *
 * app.js is the one layer that touches the DOM, so the pure-function tests in
 * run-tests.cjs cannot reach it. Rather than pull in a DOM library (this
 * project has no dependencies and should keep none), this file provides the
 * few DOM methods app.js actually uses and drives the real screen flow:
 *
 *   start                 -> the Command Center, scored and rendered
 *   openAccount           -> the account workspace + the legacy sections
 *   openBrief             -> the composed account brief
 *   askAi                 -> a contextual portfolio answer
 *   unknown account       -> the error screen
 *
 * The DOM stub is deliberately minimal. Anything app.js reaches for that the
 * stub does not provide is a signal that the app has started depending on real
 * browser behaviour, which is worth knowing about.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

// ---------------------------------------------------------------------
// Minimal DOM
// ---------------------------------------------------------------------

function makeElement(id) {
    return {
        id: id,
        innerHTML: "",
        value: "",
        hidden: false,
        _attrs: {},
        _listeners: {},
        addEventListener: function (type, fn) {
            this._listeners[type] = this._listeners[type] || [];
            this._listeners[type].push(fn);
        },
        setAttribute: function (name, value) { this._attrs[name] = String(value); },
        getAttribute: function (name) {
            return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null;
        },
        // app.js only queries for sections to toggle; returning an empty list
        // exercises the same code path without needing an HTML parser.
        querySelectorAll: function () { return []; },
        querySelector: function () { return null; },
        closest: function () { return null; },
        scrollIntoView: function () {}
    };
}

const elements = {};
[
    "c360-app", "c360-mock-banner",
    "c360-account-header", "c360-toolbar", "c360-source-status",
    "c360-content", "c360-error",
    // Command-center shell.
    "c360-rail", "c360-cmdhead", "c360-strip", "c360-portfolio",
    "c360-scorecard-block", "c360-modal", "c360-aidrawer"
].forEach((id) => { elements[id] = makeElement(id); });

/*
 * The header renders its own search input and clock, so app.js re-reads those
 * ids after every chrome render. The stub returns a persistent element for any
 * id it is asked for, which mirrors the browser closely enough to exercise the
 * re-cache-and-rebind path rather than skipping it.
 */
function elementFor(id) {
    if (!elements[id]) { elements[id] = makeElement(id); }
    return elements[id];
}

const sandbox = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Promise: Promise,
    URL: URL,
    Intl: Intl,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    isNaN: isNaN
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.location = { href: "http://localhost/index.html", pathname: "/index.html", search: "", hash: "" };
sandbox.window.location = sandbox.location;
// app.js reflects filter + sort state into the URL. Stubbed rather than omitted
// so the syncUrl() path is actually exercised.
sandbox.window.history = { replaceState: function () {} };

const storage = new Map();
sandbox.window.sessionStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k)
};

sandbox.document = {
    getElementById: (id) => elementFor(id),
    addEventListener: function () {}
};

// The header carries a live clock, so app.js sets an interval. Stubbed rather
// than left undefined: an unhandled ReferenceError here would mask whatever the
// test was actually checking.
sandbox.setInterval = function () { return 0; };
sandbox.clearInterval = function () {};
sandbox.navigator = { clipboard: undefined };
sandbox.window.navigator = sandbox.navigator;

vm.createContext(sandbox);

// Same order as index.html, minus addin.js (the MyGeotab lifecycle, which is
// driven by MyGeotab rather than by this test).
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const scripts = [];
const re = /<script\s+src="([^"]+)"><\/script>/g;
let hit;
while ((hit = re.exec(html)) !== null) {
    if (hit[1] !== "js/addin.js") { scripts.push(hit[1]); }
}

scripts.forEach((src) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, src), "utf8"), sandbox, { filename: src });
});

const C360 = sandbox.C360;

// ---------------------------------------------------------------------

let passed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) { passed++; }
    else { failures.push(name + (detail ? "  ->  " + detail : "")); }
}

/** Wait until a condition holds, or give up. */
function waitFor(predicate, label) {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + 5000;
        (function poll() {
            if (predicate()) { resolve(); return; }
            if (Date.now() > deadline) { reject(new Error("timed out waiting for " + label)); return; }
            setTimeout(poll, 25);
        }());
    });
}

// ---------------------------------------------------------------------

async function run() {
    // =================================================================
    // The Command Center is the landing screen
    // =================================================================
    C360.app.start({});

    check("app marks itself started",
        elements["c360-app"].getAttribute("data-started") === "true");

    // ---- the shell ---------------------------------------------------
    const rail = elements["c360-rail"].innerHTML;
    check("the navigation rail renders every destination",
        rail.indexOf("Command Center") !== -1 && rail.indexOf("Accounts") !== -1
        && rail.indexOf("Signals") !== -1 && rail.indexOf("Intelligence") !== -1
        && rail.indexOf("Settings") !== -1);
    check("the rail marks the current screen",
        rail.indexOf('aria-current="page"') !== -1);
    check("the Intelligence destination is disabled until an account is chosen",
        rail.indexOf("disabled") !== -1);
    check("rail labels are in the DOM, not revealed only by CSS",
        rail.indexOf("c360-rail-label") !== -1);

    const head = elements["c360-cmdhead"].innerHTML;
    check("the header shows the product line",
        head.indexOf("Customer Intelligence") !== -1);
    check("the header shows the screen title",
        head.indexOf("Command Center") !== -1);
    check("the header shows a live clock", head.indexOf('id="c360-clock"') !== -1);
    check("the header shows a system status lamp",
        head.indexOf("c360-livedot") !== -1);
    check("the header carries the single search combobox",
        head.indexOf('id="c360-search"') !== -1
        && head.indexOf('role="combobox"') !== -1);
    check("the header offers Portfolio AI", head.indexOf("Ask Portfolio AI") !== -1);
    check("the header offers Refresh", head.indexOf('id="c360-pf-refresh"') !== -1);
    check("the search input is bound after the header renders",
        (elements["c360-search"]._listeners.input || []).length === 1);

    check("the workspace shows a scoring state while the portfolio loads",
        elements["c360-portfolio"].innerHTML.indexOf("Scoring the portfolio") !== -1);

    await waitFor(
        () => elements["c360-portfolio"].innerHTML.indexOf("Priority Queue") !== -1,
        "the Command Center to render"
    );

    const cc = elements["c360-portfolio"].innerHTML;

    // ---- status strip ------------------------------------------------
    const strip = elements["c360-strip"].innerHTML;
    check("the status strip is visible", elements["c360-strip"].hidden === false);
    check("the strip reports the account count", strip.indexOf("Accounts") !== -1);
    check("the strip reports the urgent count", strip.indexOf("P0 / P1") !== -1);
    check("the strip reports portfolio ARR", strip.indexOf("Portfolio ARR") !== -1);
    check("the strip states what ARR actually covers",
        strip.indexOf("ARR covers") !== -1 || strip.indexOf("ARR across all") !== -1);
    check("strip numbers are monospace",
        strip.indexOf("c360-strip-value") !== -1);

    // ---- three panels ------------------------------------------------
    check("panel 1 is the priority queue", cc.indexOf("Priority Queue") !== -1);
    check("panel 2 is the active account", cc.indexOf("Active Account") !== -1);
    check("panel 3 is intelligence", cc.indexOf("Intelligence") !== -1);
    check("the intelligence panel asks why this account",
        cc.indexOf("Why this account?") !== -1);
    check("the queue splits P0 from P1",
        cc.indexOf("P0 · Immediate") !== -1 && cc.indexOf("P1 · High") !== -1);
    check("an account is selected by default, so the panels answer something",
        cc.indexOf("is-selected") !== -1);

    // ---- health and priority stay separate ---------------------------
    check("health and priority are separate figures",
        cc.indexOf(">Health<") !== -1 && cc.indexOf(">Priority<") !== -1);
    check("the intelligence panel says health is not an input to priority",
        cc.indexOf("Health is calculated separately") !== -1);
    check("the priority score is decomposed into weighted factors",
        cc.indexOf("c360-bar-total-value") !== -1);

    // ---- next best action -------------------------------------------
    check("NEXT BEST ACTION is rendered", cc.indexOf("Next best action") !== -1);
    check("the action carries an owner, a due date and a confidence",
        cc.indexOf(">Owner<") !== -1 && cc.indexOf(">Due<") !== -1
        && cc.indexOf(">Confidence<") !== -1);
    check("the action can be executed from this screen",
        cc.indexOf("data-brief-account") !== -1);

    // ---- queues, matrix, feed ---------------------------------------
    check("all four action queues are interactive filters",
        cc.indexOf('data-portfolio-value="save"') !== -1
        && cc.indexOf('data-portfolio-value="fix"') !== -1
        && cc.indexOf('data-portfolio-value="grow"') !== -1
        && cc.indexOf('data-portfolio-value="engage"') !== -1);
    check("the queue counts are not presented as a total",
        cc.indexOf("do not sum to") !== -1);
    check("the portfolio matrix is rendered", cc.indexOf("Portfolio Matrix") !== -1);
    check("matrix nodes are positioned from computed scores",
        /left:\d+\.\d+%;bottom:\d+\.\d+%/.test(cc));
    check("matrix nodes are clickable",
        cc.indexOf("c360-mnode") !== -1 && cc.indexOf("data-select-account") !== -1);
    check("matrix nodes carry a hover readout", cc.indexOf("c360-mtip") !== -1);
    check("the signal feed is rendered",
        cc.indexOf("Latest Portfolio Signals") !== -1);
    check("the feed says when it was last updated",
        cc.indexOf("Last updated") !== -1);
    check("feed timestamps are monospace", cc.indexOf("c360-feed-time") !== -1);

    // ---- honesty properties -----------------------------------------
    check("priority is never colour alone — every dot has its level text",
        cc.indexOf("c360-pdot") !== -1 && /c360-plevel--P[0-3]/.test(cc));
    check("the mock banner is shown on the Command Center",
        elements["c360-mock-banner"].hidden === false);
    check("no 'undefined' reaches the rendered Command Center",
        cc.indexOf("undefined") === -1);
    check("no 'NaN' reaches the rendered Command Center", cc.indexOf("NaN") === -1);
    check("every Command Center id and class is c360- prefixed",
        !/\s(?:id|class)="(?!c360-)[^"]/.test(cc));

    // A trend needs two stored runs. On the first load there is one, so the
    // honest empty state must be showing rather than a fabricated line.
    check("with one scoring run, no trend line is drawn",
        cc.indexOf("c360-trend-empty") !== -1);
    check("and it explains that a second run is needed",
        cc.indexOf("second refresh") !== -1 || cc.indexOf("scoring run") !== -1);

    // =================================================================
    // Selection updates the panels without navigating
    // =================================================================
    const firstSelected = C360.app._state.selectedAccountId;
    const other = C360.app._state.portfolioView.allRows
        .filter((row) => row.accountId !== firstSelected)[0];

    C360.app.selectAccount(other.accountId);

    check("selecting a different account keeps the user on the Command Center",
        C360.app._state.screen === "command");
    check("and the centre panel now describes it",
        elements["c360-portfolio"].innerHTML
            .indexOf(other.accountName) !== -1);
    check("selection required no refetch",
        C360.app._state.portfolioLoading === false);

    // =================================================================
    // Action queue filtering
    // =================================================================
    C360.app.goTo("accounts");
    C360.app.toggleFilter("queue", "save");
    await waitFor(
        () => elements["c360-portfolio"].innerHTML.indexOf("c360-pf-table") !== -1,
        "the filtered account list"
    );

    const listed = elements["c360-portfolio"].innerHTML;
    check("filtering by SAVE renders the account list", listed.indexOf("Accounts") !== -1);
    check("the active queue filter is marked pressed",
        listed.indexOf('aria-pressed="true"') !== -1);
    check("the filtered list offers a way to clear",
        listed.indexOf("Clear filters") !== -1);

    const saveCount = C360.app._state.portfolioView.summary.queues.save;
    check("the filtered row count matches the computed SAVE count",
        C360.app._state.portfolioView.rows.length === saveCount,
        C360.app._state.portfolioView.rows.length + " vs " + saveCount);

    C360.app.clearFilters();
    check("clearing filters restores every account",
        C360.app._state.portfolioView.rows.length
            === C360.app._state.portfolioView.allRows.length);

    // =================================================================
    // Signals screen
    // =================================================================
    C360.app.goTo("signals");
    check("the signals screen renders the feed at full width",
        elements["c360-portfolio"].innerHTML.indexOf("Latest Portfolio Signals") !== -1);

    // =================================================================
    // Settings screen
    // =================================================================
    C360.app.goTo("settings");
    const settings = elements["c360-portfolio"].innerHTML;
    check("settings shows the health weights", settings.indexOf("Health Weights") !== -1);
    check("settings shows the priority weights",
        settings.indexOf("Priority Weights") !== -1);
    check("settings discloses that sending is disabled",
        settings.indexOf("Disabled") !== -1);
    check("settings states it is read-only by design",
        settings.indexOf("Read-only by design") !== -1);

    C360.app.goTo("command");

    // =================================================================
    // Portfolio AI drawer
    // =================================================================
    C360.app.askAi("Who should I contact today?");

    const drawer = elements["c360-aidrawer"].innerHTML;
    check("the AI drawer opens", elements["c360-aidrawer"].hidden === false);
    check("it is a drawer, not a takeover",
        elements["c360-portfolio"].innerHTML.length > 0);
    check("the answer references real accounts",
        drawer.indexOf("c360-aref") !== -1);
    check("the answer shows how it was derived", drawer.indexOf("How:") !== -1);
    check("the drawer offers suggested questions", drawer.indexOf("c360-sug") !== -1);
    check("the drawer states the AI layer is off",
        drawer.indexOf("AI layer is off") !== -1);

    C360.app.askAi("what is the weather in paris");
    check("an unanswerable question says so rather than improvising",
        elements["c360-aidrawer"].innerHTML.indexOf("cannot be answered") !== -1);
    check("and offers what it can answer instead",
        elements["c360-aidrawer"].innerHTML.indexOf("What this panel can answer") !== -1);

    C360.app.closeAi();
    check("closing the drawer hides it", elements["c360-aidrawer"].hidden === true);

    // =================================================================
    // Generate Brief
    // =================================================================
    const briefTarget = C360.app._state.portfolioView.urgent[0];
    C360.app.openBrief(briefTarget.accountId);

    const brief = elements["c360-modal"].innerHTML;
    check("the brief modal opens", elements["c360-modal"].hidden === false);
    check("the brief has a situation section", brief.indexOf("Situation") !== -1);
    check("the brief states why it matters", brief.indexOf("Why it matters") !== -1);
    check("the brief lists customer concerns",
        brief.indexOf("Customer concerns") !== -1);
    check("the brief gives a recommended approach",
        brief.indexOf("Recommended approach") !== -1);
    check("the brief always lists open questions",
        brief.indexOf("Open questions") !== -1);
    check("the brief can be copied", brief.indexOf('id="c360-brief-copy"') !== -1);
    check("the brief states it was composed from cited records",
        brief.indexOf("Composed from the records cited above") !== -1);
    check("the brief is a document, not a chat transcript",
        brief.indexOf("c360-modal") !== -1 && brief.indexOf("typing") === -1);

    const briefText = C360.brief.toText(C360.app._state.brief);
    check("the copyable brief is plain text with the same sections",
        briefText.indexOf("SITUATION") !== -1
        && briefText.indexOf("OPEN QUESTIONS") !== -1);
    check("the copyable brief is labelled sample data",
        briefText.indexOf("Sample data") !== -1);

    C360.app.closeBrief();
    check("closing the brief hides the modal", elements["c360-modal"].hidden === true);

    // =================================================================
    // Account detail workspace
    // =================================================================
    C360.app.openAccount("acc-001");

    check("the workspace renders immediately from the loaded model",
        elements["c360-portfolio"].innerHTML.indexOf("ACME TRANSPORTATION") !== -1
        || elements["c360-portfolio"].innerHTML.indexOf("Acme Transportation") !== -1);

    const ws = elements["c360-portfolio"].innerHTML;
    check("the workspace offers a way back to the Command Center",
        ws.indexOf("c360-aw-back") !== -1);
    check("the workspace leads with health, priority and renewal",
        ws.indexOf(">Health<") !== -1 && ws.indexOf(">Priority<") !== -1
        && ws.indexOf(">Renewal<") !== -1);
    check("the workspace shows the next best action",
        ws.indexOf("Next best action") !== -1);
    check("the workspace splits signals from activity",
        ws.indexOf(">Signals<") !== -1 && ws.indexOf(">Activity<") !== -1);
    check("the workspace shows what changed since the previous run",
        ws.indexOf("What Changed") !== -1);
    check("every workspace id and class is c360- prefixed",
        !/\s(?:id|class)="(?!c360-)[^"]/.test(ws));

    await waitFor(
        () => elements["c360-content"].innerHTML.indexOf("c360-section") !== -1,
        "the legacy sections to load beneath the workspace"
    );

    const content = elements["c360-content"].innerHTML;
    const scorecard = elements["c360-scorecard-block"].innerHTML;

    // ---- the Phase 7 scorecard block, reused unchanged --------------
    check("the scorecard block renders inside the workspace",
        elements["c360-portfolio"].innerHTML.indexOf("Portfolio scorecard") !== -1
        || scorecard.indexOf("Portfolio scorecard") !== -1);

    const explain = elements["c360-portfolio"].innerHTML + scorecard;
    check("the health breakdown is still reachable",
        explain.indexOf("Health score breakdown") !== -1);
    check("the breakdown still prints the arithmetic",
        explain.indexOf("c360-sc-breakdown") !== -1
        && explain.indexOf("&times;") !== -1);
    check("the priority drawer still names the reasons",
        explain.indexOf("Why this account is") !== -1);
    check("a primary reason is still stated",
        explain.indexOf("Primary reason:") !== -1);
    check("the confidence drawer is still present",
        explain.indexOf("Data confidence") !== -1);
    check("drafts are still labelled DRAFT",
        explain.indexOf(">DRAFT<") !== -1);
    check("the send control is still disabled with a stated reason",
        explain.indexOf("Approve &amp; Send") !== -1
        && explain.indexOf("No outbound integration is connected") !== -1);
    check("all four feedback controls are still offered",
        explain.indexOf(">Useful<") !== -1 && explain.indexOf(">Incorrect<") !== -1
        && explain.indexOf(">Not needed<") !== -1
        && explain.indexOf(">Already handled<") !== -1);
    check("feedback storage is still disclosed as local-only",
        explain.indexOf("stored in this browser session only") !== -1);

    // ---- the legacy sections, unchanged -----------------------------
    check("source status strip is rendered",
        elements["c360-source-status"].innerHTML.indexOf("Internal data") !== -1);
    check("the toolbar still offers the period and view filters",
        elements["c360-toolbar"].innerHTML.indexOf("Period") !== -1
        && elements["c360-toolbar"].innerHTML.indexOf("View") !== -1);

    [
        ["What changed", "c360-what-changed"],
        ["Account summary", "c360-summary"],
        ["Account health", "c360-health"],
        ["Commercial activity", "c360-commercial"],
        ["Support", "c360-support"],
        ["Escalations", "c360-escalations"],
        ["Account reviews", "c360-reviews"],
        ["External intelligence", "c360-external"],
        ["Key contacts", "c360-contacts"],
        ["Opportunities", "c360-opportunities"],
        ["Risks", "c360-risks"],
        ["Timeline", "c360-timeline"],
        ["Recommended actions", "c360-actions"],
        ["Sources", "c360-sources"]
    ].forEach(([label, id]) => {
        check("legacy section still rendered: " + label,
            content.indexOf('id="' + id + '"') !== -1);
    });

    // =================================================================
    // Refresh records a second run, which unlocks the trend
    // =================================================================
    C360.history.reset();
    C360.history.recordAll(C360.app._state.portfolioModels);
    C360.app._state.portfolioModels.forEach((model) => {
        // A second run at a different asOf, so the trend has two real points.
        C360.history.record(Object.assign({}, model, {
            asOf: "2026-08-25T12:00:00.000Z",
            summary: Object.assign({}, model.summary, {
                healthScore: model.summary.healthAvailable
                    ? model.summary.healthScore - 6 : null
            })
        }));
    });

    C360.app.goTo("command");

    const withTrend = elements["c360-portfolio"].innerHTML;
    check("with two stored runs, a real trend line is drawn",
        withTrend.indexOf("c360-spark-line") !== -1);
    check("the trend reports its delta over the stored runs",
        withTrend.indexOf("c360-trend-delta") !== -1);

    // =================================================================
    // Unknown account
    // =================================================================
    C360.app.openAccount("acc-does-not-exist");
    await waitFor(() => elements["c360-error"].hidden === false, "the error screen");

    check("error screen explains the failure",
        elements["c360-error"].innerHTML.indexOf("could not be loaded") !== -1);
    check("error screen offers a retry",
        elements["c360-error"].innerHTML.indexOf("Try again") !== -1);

    // =================================================================
    // Recovery
    // =================================================================
    C360.app.openAccount("acc-004");

    // The workspace renders from the loaded model immediately, so waiting for
    // the name would pass before the source fetch settles. Wait for the thing
    // that only happens once it has: the account being remembered.
    await waitFor(
        () => JSON.parse(storage.get("c360:recent-accounts") || "[]")
            .some((item) => item.id === "acc-004"),
        "recovery to another account"
    );
    check("app recovers from the error state", elements["c360-error"].hidden === true);
    check("the recovered account is on screen",
        elements["c360-portfolio"].innerHTML.indexOf("NORTHLINE") !== -1
        || elements["c360-portfolio"].innerHTML.indexOf("Northline") !== -1);

    const recent = JSON.parse(storage.get("c360:recent-accounts") || "[]");
    check("viewed accounts are remembered", recent.length >= 2, JSON.stringify(recent));
    check("the most recent account is first", recent[0].id === "acc-004");

    report();
}

function report() {
    console.log("");
    console.log("Customer 360 app smoke test");
    console.log("---------------------------");
    console.log("passed: " + passed);
    console.log("failed: " + failures.length);
    if (failures.length) {
        console.log("");
        failures.forEach((f) => console.log("  FAIL  " + f));
        process.exit(1);
    }
    console.log("");
    console.log("All checks passed.");
}

run().catch((error) => {
    console.error("App smoke test threw: " + error.stack);
    process.exit(1);
});
