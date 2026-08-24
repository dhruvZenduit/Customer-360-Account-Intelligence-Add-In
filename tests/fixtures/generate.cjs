/**
 * Customer 360 — fixture generator
 * ================================
 *   node tests/fixtures/generate.cjs
 *
 * Writes tests/fixtures/accounts/*.json from the MOCK fixture set in
 * js/services/mockData.js, and the recorded AI responses in
 * tests/fixtures/ai-responses/.
 *
 * WHY GENERATE RATHER THAN HAND-WRITE. The account manifests describe which
 * sources each fixture carries. Hand-maintained, they would drift out of step
 * with mockData within a week, and a manifest that disagrees with the data it
 * describes is worse than no manifest. Generating them and then ASSERTING them
 * in tests/scorecard-tests.cjs means a fixture cannot quietly lose its device
 * feed and stop testing the unavailable-category path.
 *
 * The output is checked in on purpose: the point is to see, in a diff, that a
 * change to mockData changed which paths the fixtures exercise.
 *
 * Re-run this after editing the fixture set, and commit the result.
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..", "..");

const sandbox = { console, setTimeout, clearTimeout, Promise, URL, Intl, Date, Math, JSON, Object, Array, Number, String, isNaN };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
sandbox.location = { href: "http://localhost/x" };
const st = new Map();
sandbox.window.sessionStorage = { getItem: k => st.has(k) ? st.get(k) : null, setItem: (k, v) => st.set(k, String(v)), removeItem: k => st.delete(k) };
vm.createContext(sandbox);
["js/core/namespace.js", "js/core/config.js", "js/core/scorecardConfig.js", "js/core/util.js",
 "js/intelligence/normalize.js", "js/services/mockData.js"].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
});
const C = sandbox.C360;

/** What each fixture is meant to prove, per account. */
const PROVES = {
    "acc-001": "The fully-instrumented account: every source present, a cancellation signal in a customer email, a past-due balance, a renewal inside the window, an overdue commitment and a critical escalated ticket. The account that exercises the most rules at once.",
    "acc-002": "No device feed and no outcomes at all, so health re-normalises across the remaining categories and says so on the face of the breakdown. Also carries competitor-switch language and an approaching renewal.",
    "acc-003": "Almost nothing recorded. Too few categories have data to report a health score at all, so health is UNAVAILABLE with a reason rather than a low number, and confidence is correspondingly low. `commitments: null` — untracked, not empty.",
    "acc-004": "A large, healthy, well-instrumented enterprise account with a genuine acquisition and expansion signals. Proves a healthy account can still be actionable, and that a news item announcing a Director of Safety does NOT fire the P0 safety override.",
    "acc-010": "Healthy baseline with full stakeholder coverage — one of the accounts that lands in NO queue, which is what makes the portfolio's \"N accounts need no action today\" a real claim.",
    "acc-011": "Healthy mid-size account with measured outcomes and full coverage. Also lands in no queue.",
    "acc-012": "Healthy small-business account, perfect devices, full coverage. No queue.",
    "acc-020": "At-risk: repeat connectivity issues, an ageing escalated ticket, a stale review and corroborated negative sentiment. Proves corroborated sentiment scores materially worse than a single frustrated email.",
    "acc-021": "At-risk via competitor language in a customer email plus a near renewal. SAVE queue.",
    "acc-022": "At-risk enterprise account with a critical camera ticket past SLA and an overdue commitment. Both a SAVE and a FIX, so it proves the FIX evidence travels with a SAVE-classified account.",
    "acc-030": "High-value, healthy, strong outcomes. Proves account value raises strategic importance without inventing urgency.",
    "acc-031": "High-value with a review at the edge of its enterprise cadence.",
    "acc-032": "High-value with an HOS compliance problem ahead of a DOT audit — a P0 from the HOS pattern set, scoped to tickets.",
    "acc-040": "Recently cancelled: contract carries a cancelled date, so lifecycle resolves to churned from evidence rather than from the status string alone.",
    "acc-041": "Suspended seasonal account with no device or portal feed. Proves the suspended segment has no review cadence and therefore no review-overdue override.",
    "acc-050": "Expansion: rising order volume, a fresh quote and a new-quarry growth signal. GROW queue at P2/P3 — a healthy account that still deserves attention.",
    "acc-051": "Expansion via rising orders and a public port contract. GROW.",
    "acc-052": "Expansion via a second terminal opening plus an open quote. GROW.",
    "acc-060": "Technical problems: 25% of devices dark, four camera tickets across three yards, an open technical escalation with recorded customer impact. The worst FIX account in the set.",
    "acc-061": "Technical: safety alerts not triggering — fires the safety pattern from a TICKET, which is the scoped-correctly case.",
    "acc-062": "Technical: repeat reefer-alert tickets. Proves the repeat-issue signal drives support health without a single critical ticket.",
    "acc-070": "Billing problems: a disputed rate with a large past-due balance and recorded customer impact. FIX via the billing rule.",
    "acc-071": "Billing problems plus an angry customer email about duplicate charges. Proves billing and sentiment stack.",
    "acc-080": "Inactive: no recorded activity for months and a very stale review. ENGAGE.",
    "acc-081": "Inactive with no device or portal feed either — health unavailable AND inactive.",
    "acc-082": "Seasonal segment declared on the contract record, with a long gap in activity. Proves a declared segment overrides the asset-band fallback."
};

const outDir = path.join(ROOT, "tests", "fixtures", "accounts");
fs.mkdirSync(outDir, { recursive: true });

// Clear any previous generation so a removed fixture does not linger.
fs.readdirSync(outDir).filter(f => f.endsWith(".json"))
    .forEach(f => fs.unlinkSync(path.join(outDir, f)));

/**
 * The four original fixtures predate the category labels, so they are
 * classified here rather than in mockData.
 */
const CATEGORY_FALLBACK = {
    "acc-001": "at-risk", "acc-002": "at-risk", "acc-003": "inactive", "acc-004": "high-value"
};

let written = 0;
C.mockData.accounts.forEach(account => {
    const bundle = C.mockData.forAccount(account.id);
    const category = C.mockData.fixtureCategories[account.id]
        || CATEGORY_FALLBACK[account.id] || "unclassified";

    const manifest = {
        id: account.id,
        name: account.name,
        category: category,
        mock: true,
        proves: PROVES[account.id] || "No description recorded.",
        account: {
            industry: account.industry,
            status: account.status,
            customerSince: account.customerSince,
            assetCount: account.assetCount,
            contactProfile: account.contactProfile,
            products: account.products,
            geotabDatabase: account.geotabDatabase || null
        },
        /**
         * Which sources this fixture DOES and does NOT carry. Asserted by
         * tests/scorecard-tests.cjs, so a fixture cannot silently lose its
         * device feed and quietly stop testing the unavailable-category path.
         */
        sources: {
            quotes: (bundle.quotes || []).length,
            orders: (bundle.orders || []).length,
            tickets: (bundle.tickets || []).length,
            billingIssues: (bundle.billingIssues || []).length,
            technicalIssues: (bundle.technicalIssues || []).length,
            reviews: (bundle.reviews || []).length,
            contacts: (bundle.contacts || []).length,
            external: (bundle.external || []).length,
            communications: (bundle.communications || []).length,
            website: bundle.website ? true : false,
            deviceHealth: bundle.deviceHealth ? true : false,
            portalUsage: bundle.portalUsage ? true : false,
            contract: bundle.contract ? true : false,
            outcomes: bundle.outcomes ? true : false,
            /** null = not a tracked source; a number = tracked, that many. */
            commitments: bundle.commitments === null || bundle.commitments === undefined
                ? null : bundle.commitments.length
        }
    };

    fs.writeFileSync(path.join(outDir, account.id + ".json"),
        JSON.stringify(manifest, null, 2) + "\n", "utf8");
    written++;
});
console.log("wrote " + written + " account manifests");

// ------------------------------------------------------------------ AI fixtures
const aiDir = path.join(ROOT, "tests", "fixtures", "ai-responses");
fs.mkdirSync(aiDir, { recursive: true });

const AI_FIXTURES = {
    "valid-summary.json": {
        note: "A well-formed response. Every statement cites a source record present in the supplied context and asserts nothing beyond it.",
        response: {
            model: "test-model",
            statements: [
                { text: "The customer confirmed all is well this month.",
                  sourceRecords: ["communication-bm"], confidence: "High" }
            ]
        },
        expect: { ok: true, kept: 1, dropped: 0 }
    },
    "no-source-records.json": {
        note: "A statement citing nothing. Dropped, not displayed — Phase 8 rule 2.",
        response: {
            model: "test-model",
            statements: [{ text: "The account seems to be going well." }]
        },
        expect: { ok: false, kept: 0, dropped: 1 }
    },
    "unknown-source-record.json": {
        note: "Cites a ticket that is not in the supplied context. Rejected as fabrication.",
        response: {
            model: "test-model",
            statements: [{ text: "Reviewed the open issue.",
                           sourceRecords: ["ticket-does-not-exist"] }]
        },
        expect: { ok: false, kept: 0, dropped: 1 }
    },
    "fabricated-figure.json": {
        note: "Invents a ticket number, a date and a monetary figure. All three are absent from the context, so the statement is DROPPED rather than corrected — repairing it would mean trusting the rest of a response that came from the same place.",
        response: {
            model: "test-model",
            statements: [
                { text: "Ticket 99999 breached SLA on Jan 1, 2001 and we owe $84,000.",
                  sourceRecords: ["communication-bm"] },
                { text: "The customer confirmed all is well this month.",
                  sourceRecords: ["communication-bm"] }
            ]
        },
        expect: { ok: true, kept: 1, dropped: 1 }
    },
    "invented-contact.json": {
        note: "Names a person who appears nowhere in the context. This is the most damaging fabrication available, because it is the one that ends up in the To: line of a draft.",
        response: {
            model: "test-model",
            statements: [{ text: "Spoke with Jordan Nakamura about the renewal.",
                           sourceRecords: ["communication-bm"] }]
        },
        expect: { ok: false, kept: 0, dropped: 1 }
    },
    "malformed.json": {
        note: "Not an object at all. Handled, falls back, nothing thrown to the user.",
        response: "the model returned prose instead of JSON",
        expect: { ok: false, kept: 0, dropped: 0 }
    },
    "truncated.json": {
        note: "Well-formed but empty — the response was cut off before any statement arrived.",
        response: { model: "test-model", statements: [] },
        expect: { ok: false, kept: 0, dropped: 0 }
    },
    "forbidden-task.json": {
        note: "What a compromised or confused gateway might return for a task the client must never send. The adapter refuses `calculateHealth` BEFORE any transport call, so this response is unreachable in practice — it is recorded to document that the refusal is the client's job too.",
        task: "calculateHealth",
        response: { model: "test-model", statements: [{ text: "Health is 78.", sourceRecords: ["communication-bm"] }] },
        expect: { refusedBeforeTransport: true }
    }
};

Object.keys(AI_FIXTURES).forEach(name => {
    fs.writeFileSync(path.join(aiDir, name),
        JSON.stringify(AI_FIXTURES[name], null, 2) + "\n", "utf8");
});
console.log("wrote " + Object.keys(AI_FIXTURES).length + " AI-response fixtures");
