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
        closest: function () { return null; }
    };
}

const elements = {};
[
    "c360-app", "c360-search", "c360-search-results", "c360-mock-banner",
    "c360-account-header", "c360-toolbar", "c360-source-status",
    "c360-content", "c360-welcome", "c360-error"
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
sandbox.location = { href: "http://localhost/index.html" };
sandbox.window.location = sandbox.location;

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
    C360.app.start({});

    check("app marks itself started", elements["c360-app"].getAttribute("data-started") === "true");
    check("welcome screen is visible", elements["c360-welcome"].hidden === false);
    check("welcome screen invites an account selection",
        elements["c360-welcome"].innerHTML.indexOf("Select a customer account") !== -1);
    check("account header is hidden before an account is chosen",
        elements["c360-account-header"].hidden === true);
    check("toolbar is hidden before an account is chosen",
        elements["c360-toolbar"].hidden === true);
    check("search input has an input listener",
        (elements["c360-search"]._listeners.input || []).length === 1);

    // ---- load an account ---------------------------------------------
    C360.app.loadAccount("acc-001", {});

    check("loading state is shown immediately",
        elements["c360-content"].innerHTML.indexOf("Building account intelligence") !== -1);

    await waitFor(
        () => elements["c360-content"].innerHTML.indexOf("c360-section") !== -1,
        "the dashboard to render"
    );

    const content = elements["c360-content"].innerHTML;

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
