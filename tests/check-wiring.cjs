/**
 * Customer 360 — wiring check
 * ===========================
 *   node tests/check-wiring.cjs
 *
 * With no build step there is no compiler to catch a renamed file or a
 * mistyped element id — the page just silently half-works in the browser.
 * This script closes that gap by checking the three things a bundler would:
 *
 *   1. every <script src> in index.html exists on disk
 *   2. every document.getElementById(...) in the JS has a matching id in the
 *      HTML
 *   3. the script load order actually satisfies the C360.* dependencies
 *      (a module must be defined before another module calls into it at
 *      load time)
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const problems = [];
let checks = 0;

// ---------------------------------------------------------------------
// 1. Script files exist
// ---------------------------------------------------------------------

const scriptSrcs = [];
const scriptRe = /<script\s+src="([^"]+)"><\/script>/g;
let match;
while ((match = scriptRe.exec(html)) !== null) {
    scriptSrcs.push(match[1]);
}

if (!scriptSrcs.length) {
    problems.push("index.html references no scripts at all");
}

scriptSrcs.forEach((src) => {
    checks++;
    if (!fs.existsSync(path.join(ROOT, src))) {
        problems.push("index.html loads a script that does not exist: " + src);
    }
});

// Stylesheet too.
const cssMatch = html.match(/<link\s+rel="stylesheet"\s+href="([^"]+)"/);
checks++;
if (!cssMatch || !fs.existsSync(path.join(ROOT, cssMatch[1]))) {
    problems.push("index.html references a stylesheet that does not exist");
}

// Every .js file in js/ should be loaded by the page — an orphan file is
// either dead code or a forgotten <script> tag.
function walk(dir, out) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full, out); }
        else if (entry.name.endsWith(".js")) {
            out.push(path.relative(ROOT, full).split(path.sep).join("/"));
        }
    });
    return out;
}

walk(path.join(ROOT, "js"), []).forEach((file) => {
    checks++;
    if (scriptSrcs.indexOf(file) === -1) {
        problems.push("js file is never loaded by index.html: " + file);
    }
});

// ---------------------------------------------------------------------
// 2. Element ids referenced from JS exist in the HTML
// ---------------------------------------------------------------------

const htmlIds = new Set();
const idRe = /\sid="([^"]+)"/g;
while ((match = idRe.exec(html)) !== null) {
    htmlIds.add(match[1]);
}

/*
 * Ids created at render time rather than sitting in the static HTML.
 *
 * Listed explicitly, and each one is verified below to be produced by some
 * script — so a genuine typo still fails this check, but the header, the
 * clock, the brief and the AI drawer are allowed to be rendered by their own
 * templates rather than being pre-declared in index.html.
 */
const RUNTIME_IDS = new Set([
    "c360-retry",
    // Rendered by js/ui/shell.js — the header owns the search combobox and the
    // clock, so they move with it.
    "c360-search",
    "c360-search-results",
    "c360-clock",
    // Rendered by js/ui/portfolioAi.js and js/ui/brief.js.
    "c360-ai-input",
    "c360-brief-status"
]);

scriptSrcs.forEach((src) => {
    const code = fs.readFileSync(path.join(ROOT, src), "utf8");
    const getRe = /getElementById\("([^"]+)"\)/g;
    let hit;
    while ((hit = getRe.exec(code)) !== null) {
        checks++;
        const id = hit[1];
        if (!htmlIds.has(id) && !RUNTIME_IDS.has(id)) {
            problems.push(src + " looks up #" + id + ", which index.html does not define");
        }
    }
});

// The runtime ids must actually be produced somewhere, or the click handlers
// that target them are dead.
RUNTIME_IDS.forEach((id) => {
    checks++;
    const produced = scriptSrcs.some((src) => {
        const code = fs.readFileSync(path.join(ROOT, src), "utf8");
        return code.indexOf('id="' + id + '"') !== -1;
    });
    if (!produced) {
        problems.push("runtime id #" + id + " is handled but never rendered");
    }
});

// ---------------------------------------------------------------------
// 3. Load order satisfies load-time dependencies
// ---------------------------------------------------------------------

/**
 * Which C360.* module each file DEFINES, and which it USES at load time
 * (outside a function body). Calls inside functions are fine at any order,
 * because they only run after every script has loaded.
 */
const definedAt = {};
scriptSrcs.forEach((src, index) => {
    const code = fs.readFileSync(path.join(ROOT, src), "utf8");
    const defRe = /^C360\.(\w+)\s*=/gm;
    let hit;
    while ((hit = defRe.exec(code)) !== null) {
        if (definedAt[hit[1]] === undefined) { definedAt[hit[1]] = index; }
    }
});

scriptSrcs.forEach((src, index) => {
    const code = fs.readFileSync(path.join(ROOT, src), "utf8");

    // Load-time usage: a C360.x reference on the right-hand side of a
    // top-level assignment, e.g. `C360.quoteService = C360.cachedService.create(`
    const useRe = /^C360\.\w+\s*=\s*C360\.(\w+)/gm;
    let hit;
    while ((hit = useRe.exec(code)) !== null) {
        checks++;
        const dependency = hit[1];
        const definedIndex = definedAt[dependency];
        if (definedIndex === undefined) {
            problems.push(src + " uses C360." + dependency + " at load time, but nothing defines it");
        } else if (definedIndex > index) {
            problems.push(src + " uses C360." + dependency + " at load time, but it is defined later ("
                + scriptSrcs[definedIndex] + ")");
        }
    }
});

// ---------------------------------------------------------------------

console.log("");
console.log("Customer 360 wiring check");
console.log("-------------------------");
console.log("scripts:  " + scriptSrcs.length);
console.log("checks:   " + checks);
console.log("problems: " + problems.length);

if (problems.length) {
    console.log("");
    problems.forEach((p) => console.log("  FAIL  " + p));
    process.exit(1);
}

console.log("");
console.log("Wiring is consistent.");
