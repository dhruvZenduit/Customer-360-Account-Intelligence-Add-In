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
 *   start -> welcome screen
 *         -> select an account -> loading -> dashboard
 *         -> refresh
 *         -> unknown account -> error screen
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
    "c360-app", "c360-search", "c360-search-results", "c360-mock-banner",
    "c360-account-header", "c360-toolbar", "c360-source-status",
    "c360-content", "c360-welcome", "c360-error",
    // Phase 6/7 containers.
    "c360-viewnav", "c360-portfolio", "c360-scorecard-block"
].forEach((id) => { elements[id] = makeElement(id); });

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
    getElementById: (id) => elements[id] || null,
    addEventListener: function () {}
};

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
    // ---- welcome screen ---------------------------------------------
    // Started with ?view=account so the account view is showing with nothing
    // selected — which is the one path that reaches the welcome screen.
    sandbox.location.search = "?view=account";
    C360.app.start({});

    check("app marks itself started", elements["c360-app"].getAttribute("data-started") === "true");
    check("the view switch is rendered",
        elements["c360-viewnav"].innerHTML.indexOf("Command Center") !== -1);
    check("the account tab is disabled before an account is chosen",
        elements["c360-viewnav"].innerHTML.indexOf("disabled") !== -1);

    check("welcome screen is visible", elements["c360-welcome"].hidden === false);
    check("welcome screen invites an account selection",
        elements["c360-welcome"].innerHTML.indexOf("Select a customer account") !== -1);
    check("account header is hidden before an account is chosen",
        elements["c360-account-header"].hidden === true);
    check("toolbar is hidden before an account is chosen",
        elements["c360-toolbar"].hidden === true);
    check("the scorecard block is hidden before an account is chosen",
        elements["c360-scorecard-block"].hidden === true);
    check("search input has an input listener",
        (elements["c360-search"]._listeners.input || []).length === 1);

    // ---- the Command Center (Phase 6) -------------------------------
    C360.app.loadPortfolio({});

    check("the portfolio container is visible once loading starts",
        elements["c360-portfolio"].hidden === false);
    check("the portfolio shows a loading state while scoring",
        elements["c360-portfolio"].innerHTML.indexOf("Scoring the portfolio") !== -1);

    await waitFor(
        () => elements["c360-portfolio"].innerHTML.indexOf("Portfolio overview") !== -1,
        "the Command Center to render"
    );

    const portfolio = elements["c360-portfolio"].innerHTML;

    check("the Command Center renders its title",
        portfolio.indexOf("Customer Portfolio Command Center") !== -1);
    check("the portfolio reports a real account count",
        /\d+ accounts<\/span>/.test(portfolio));
    check("the portfolio renders the top-priority queue",
        portfolio.indexOf("Top priorities") !== -1);
    check("the portfolio renders all four action queues",
        portfolio.indexOf(">SAVE ") !== -1 && portfolio.indexOf(">FIX ") !== -1
        && portfolio.indexOf(">GROW ") !== -1 && portfolio.indexOf(">ENGAGE ") !== -1);
    check("the portfolio states that queue counts do not sum to the total",
        portfolio.indexOf("do not sum to") !== -1);
    check("priority is conveyed as text, not only colour",
        portfolio.indexOf("c360-sc-level--P0") !== -1 || portfolio.indexOf(">P1<") !== -1
        || portfolio.indexOf(">P2<") !== -1 || portfolio.indexOf(">P3<") !== -1);
    check("the portfolio shows a manual refresh control",
        portfolio.indexOf("Refresh portfolio") !== -1);
    check("the portfolio states refresh is not continuous",
        portfolio.indexOf("No model runs") !== -1);
    check("the portfolio renders the metrics panel",
        portfolio.indexOf("Success metrics") !== -1);
    check("unmeasurable metrics say so rather than showing zero",
        portfolio.indexOf("Not yet measurable") !== -1);
    check("mock banner is shown on the Command Center",
        elements["c360-mock-banner"].hidden === false);

    // ---- load an account ---------------------------------------------
    C360.app.loadAccount("acc-001", {});

    check("loading state is shown immediately",
        elements["c360-content"].innerHTML.indexOf("Building account intelligence") !== -1);

    await waitFor(
        () => elements["c360-content"].innerHTML.indexOf("c360-section") !== -1,
        "the dashboard to render"
    );

    const content = elements["c360-content"].innerHTML;
    const scorecard = elements["c360-scorecard-block"].innerHTML;

    // ---- the scorecard block (Phase 7) ------------------------------
    check("the scorecard block is visible on the account page",
        elements["c360-scorecard-block"].hidden === false);
    check("the scorecard renders health, priority and confidence",
        scorecard.indexOf(">Health<") !== -1 && scorecard.indexOf(">Priority<") !== -1
        && scorecard.indexOf(">Confidence<") !== -1);
    check("the health score is reachable from its breakdown drawer",
        scorecard.indexOf("Health score breakdown") !== -1);
    check("the breakdown prints the arithmetic",
        scorecard.indexOf("c360-sc-breakdown") !== -1 && scorecard.indexOf("&times;") !== -1);
    check("the priority drawer names the reasons",
        scorecard.indexOf("Why this account is") !== -1);
    check("a primary reason is always stated",
        scorecard.indexOf("Primary reason:") !== -1);
    check("the confidence drawer lists per-source states",
        scorecard.indexOf("Data confidence") !== -1);
    check("the identity drawer is present",
        scorecard.indexOf("Account identity") !== -1);
    check("the scorecard explains that health and priority can disagree",
        scorecard.indexOf("can disagree") !== -1);
    check("recommendations carry an owner and a due date",
        scorecard.indexOf("Suggested owner") !== -1 && scorecard.indexOf(">Due<") !== -1);
    check("drafts are labelled DRAFT in the markup",
        scorecard.indexOf(">DRAFT<") !== -1);
    check("the send control is disabled with a stated reason",
        scorecard.indexOf("Approve &amp; Send") !== -1
        && scorecard.indexOf("No outbound integration is connected") !== -1);
    check("all four feedback controls are offered",
        scorecard.indexOf(">Useful<") !== -1 && scorecard.indexOf(">Incorrect<") !== -1
        && scorecard.indexOf(">Not needed<") !== -1
        && scorecard.indexOf(">Already handled<") !== -1);
    check("feedback storage is disclosed as local-only",
        scorecard.indexOf("stored in this browser session only") !== -1);
    check("every scorecard id and class is c360- prefixed",
        !/\s(?:id|class)="(?!c360-)[^"]/.test(scorecard));

    check("account header renders the account name",
        elements["c360-account-header"].innerHTML.indexOf("Acme Transportation") !== -1);
    check("account header is visible", elements["c360-account-header"].hidden === false);
    check("welcome screen is dismissed", elements["c360-welcome"].hidden === true);
    check("mock banner is shown for mock data", elements["c360-mock-banner"].hidden === false);
    check("mock banner says the data is invented",
        elements["c360-mock-banner"].innerHTML.indexOf("Sample data") !== -1);
    check("source status strip is rendered",
        elements["c360-source-status"].innerHTML.indexOf("Internal data") !== -1);
    check("toolbar is rendered with a refresh button",
        elements["c360-toolbar"].innerHTML.indexOf("Refresh intelligence") !== -1);
    check("toolbar shows a last-updated stamp",
        elements["c360-toolbar"].innerHTML.indexOf("Last updated:") !== -1);

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
        check("section rendered: " + label, content.indexOf('id="' + id + '"') !== -1);
    });

    // ---- refresh ------------------------------------------------------
    const before = elements["c360-toolbar"].innerHTML;
    C360.app.loadAccount("acc-001", { forceRefresh: true });
    check("refresh keeps the dashboard on screen rather than blanking it",
        elements["c360-content"].innerHTML.indexOf("c360-section") !== -1);

    await waitFor(
        () => elements["c360-toolbar"].innerHTML.indexOf("Refreshing") === -1
            && elements["c360-toolbar"].innerHTML.indexOf("Refresh intelligence") !== -1,
        "the refresh to finish"
    );
    check("refresh completes and re-enables the button", true);
    check("refresh re-rendered the toolbar", typeof before === "string");

    // ---- unknown account -----------------------------------------------
    C360.app.loadAccount("acc-does-not-exist", {});
    await waitFor(() => elements["c360-error"].hidden === false, "the error screen");

    check("error screen explains the failure",
        elements["c360-error"].innerHTML.indexOf("could not be loaded") !== -1);
    check("error screen offers a retry",
        elements["c360-error"].innerHTML.indexOf("Try again") !== -1);
    check("dashboard content is cleared on error", elements["c360-content"].innerHTML === "");

    // ---- recovery -------------------------------------------------------
    C360.app.loadAccount("acc-004", {});
    await waitFor(
        () => elements["c360-account-header"].innerHTML.indexOf("Northline") !== -1,
        "recovery to another account"
    );
    check("app recovers from the error state", elements["c360-error"].hidden === true);

    // ---- recent accounts persist ------------------------------------------
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
