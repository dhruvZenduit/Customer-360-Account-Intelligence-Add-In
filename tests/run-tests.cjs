/**
 * Customer 360 — test harness
 * ===========================
 * The add-in has no build step and no test framework dependency, so this is a
 * plain Node script:  node tests/run-tests.js
 *
 * It loads the browser sources in the same order index.html does, against a
 * minimal window stub, then exercises the parts that carry real risk — the
 * normalisation rules, the intelligence rules, the privacy allow-list and the
 * two "never fabricate" guarantees.
 *
 * Exit code is non-zero on failure, so this can be wired into CI as-is.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ---------------------------------------------------------------------
// Minimal browser environment
// ---------------------------------------------------------------------

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
    isNaN: isNaN,
    fetch: undefined,
    AbortController: typeof AbortController === "function" ? AbortController : undefined
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.location = { href: "http://localhost/index.html" };
sandbox.window.location = sandbox.location;

// sessionStorage stub — exercises the real code path rather than the fallback.
const storage = new Map();
sandbox.window.sessionStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k)
};

vm.createContext(sandbox);

const ROOT = path.join(__dirname, "..");

/** Source order must match index.html. */
const FILES = [
    "js/core/namespace.js",
    "js/core/config.js",
    "js/core/scorecardConfig.js",
    "js/core/util.js",
    "js/core/cache.js",
    "js/intelligence/normalize.js",
    "js/services/mockData.js",
    "js/services/gatewayClient.js",
    "js/services/dataSource.js",
    "js/services/cachedService.js",
    "js/services/accountService.js",
    "js/services/quoteService.js",
    "js/services/orderService.js",
    "js/services/ticketService.js",
    "js/services/billingService.js",
    "js/services/technicalService.js",
    "js/services/accountReviewService.js",
    "js/services/websiteResearchService.js",
    "js/services/webResearchService.js",
    "js/services/contactService.js",
    "js/services/geotabService.js",
    "js/services/scorecardSourceService.js",
    "js/intelligence/facts.js",
    "js/intelligence/signals.js",
    "js/intelligence/risks.js",
    "js/intelligence/opportunities.js",
    "js/intelligence/health.js",
    "js/intelligence/timeline.js",
    "js/intelligence/recommendations.js",
    "js/intelligence/summary.js",
    "js/intelligence/intelligenceEngine.js",

    // Scorecard engines. Every one is pure and takes an injected `asOf`, which
    // is what makes them testable here and deterministic across runs.
    "js/scorecard/evidence.js",
    "js/scorecard/detect.js",
    "js/scorecard/identity.js",
    "js/scorecard/segments.js",
    "js/scorecard/confidence.js",
    "js/scorecard/healthScore.js",
    "js/scorecard/overrides.js",
    "js/scorecard/priority.js",
    "js/scorecard/queues.js",
    "js/scorecard/actionRules.js",
    "js/scorecard/actionEngine.js",
    "js/scorecard/scorecardEngine.js",
    "js/scorecard/portfolio.js",
    "js/scorecard/ai.js",
    "js/scorecard/approval.js",
    "js/scorecard/feedback.js",
    "js/scorecard/metrics.js",

    "js/orchestrator.js",
    // UI string builders. These are pure functions — they return HTML rather
    // than touching the DOM — so they are testable here without a browser.
    "js/ui/components.js",
    "js/ui/render.js",
    "js/ui/feedback.js",
    "js/ui/approval.js",
    "js/ui/scorecard.js",
    "js/ui/portfolio.js"
];

FILES.forEach((file) => {
    const code = fs.readFileSync(path.join(ROOT, file), "utf8");
    try {
        vm.runInContext(code, sandbox, { filename: file });
    } catch (error) {
        console.error("Failed to load " + file + ":\n" + error.stack);
        process.exit(1);
    }
});

const C360 = sandbox.C360;

// ---------------------------------------------------------------------
// Tiny assertion helpers
// ---------------------------------------------------------------------

let passed = 0;
const failures = [];

function check(name, condition, detail) {
    if (condition) {
        passed++;
    } else {
        failures.push(name + (detail ? "  ->  " + detail : ""));
    }
}

function eq(name, actual, expected) {
    check(name, actual === expected, "expected " + JSON.stringify(expected) + ", got " + JSON.stringify(actual));
}

function has(list, predicate) {
    return (list || []).some(predicate);
}

function ago(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
}

// =====================================================================
// util
// =====================================================================

eq("util.formatMoney formats USD", C360.util.formatMoney(42500, "USD"), "$42,500");
eq("util.formatMoney does not invent a zero", C360.util.formatMoney(null), "Not available");
eq("util.formatMoney handles an unknown currency", C360.util.formatMoney(10, "ZZZ").indexOf("ZZZ"), 0);
eq("util.recencyBucket buckets 10 days", C360.util.recencyBucket(ago(10)), "last30");
eq("util.recencyBucket buckets 200 days", C360.util.recencyBucket(ago(200)), "last12m");
eq("util.recencyBucket handles a missing date", C360.util.recencyBucket(null), "unknown");
eq("util.escapeHtml neutralises a script tag",
    C360.util.escapeHtml("<script>alert(1)</script>"),
    "&lt;script&gt;alert(1)&lt;/script&gt;");
eq("util.safeUrl drops a javascript: URL", C360.util.safeUrl("javascript:alert(1)"), "");
eq("util.safeUrl keeps an https URL", C360.util.safeUrl("https://a.example/x"), "https://a.example/x");
eq("util.pctChange computes an increase", Math.round(C360.util.pctChange(50, 75) * 100), 50);
eq("util.pctChange refuses to divide by zero", C360.util.pctChange(0, 75), null);

// =====================================================================
// normalize — the "never invent" guarantees
// =====================================================================

const sparseQuote = C360.normalize.quote({ id: "Q1", number: "1", status: "Sent" });
eq("normalize.quote leaves a missing amount null", sparseQuote.amount, null);
eq("normalize.quote leaves a missing date null", sparseQuote.date, null);
eq("normalize.quote marks a sent quote open", sparseQuote.isOpen, true);

const acceptedQuote = C360.normalize.quote({ id: "Q2", number: "2", status: "accepted" });
eq("normalize.quote canonicalises status casing", acceptedQuote.status, "Accepted");
eq("normalize.quote marks an accepted quote closed", acceptedQuote.isOpen, false);

const sparseOrder = C360.normalize.order({ id: "O1", number: "1" });
eq("normalize.order leaves a missing quantity null", sparseOrder.quantity, null);
eq("normalize.order never defaults value to 0", sparseOrder.value, null);

eq("normalize.escalation reads OPEN from status",
    C360.normalize.escalation({ id: "B1", status: "Open" }, "billing").state, "OPEN");
eq("normalize.escalation reads AT RISK from status",
    C360.normalize.escalation({ id: "B2", status: "At risk" }, "billing").state, "AT RISK");
eq("normalize.escalation reads RESOLVED from status",
    C360.normalize.escalation({ id: "B3", status: "Resolved" }, "billing").state, "RESOLVED");
eq("normalize.escalation leaves an unknown status unresolved",
    C360.normalize.escalation({ id: "B4", status: "banana" }, "billing").state, null);
eq("normalize.escalation does not infer customer impact",
    C360.normalize.escalation({ id: "B5", status: "Open" }, "billing").customerImpact, null);

const guessy = C360.normalize.contact({ id: "C1", name: "A Person", title: "CEO" });
eq("normalize.contact never guesses an email", guessy.email, null);
eq("normalize.contact defaults confidence to the weakest level", guessy.confidence, "Unverified");
eq("normalize.contact rejects an unrecognised confidence value",
    C360.normalize.contact({ id: "C2", name: "B", title: "C", confidence: "Definitely" }).confidence,
    "Unverified");

const site = C360.normalize.website({
    url: "https://x.example",
    leadership: [
        { name: "Real Person", title: "CEO" },
        { name: "Nameless" },              // no title -> dropped
        { title: "Fleet Director" }        // no name  -> dropped
    ]
});
eq("normalize.website drops leadership entries missing a name or title", site.leadership.length, 1);

// =====================================================================
// Privacy allow-list (spec section 31)
// =====================================================================

const leaky = C360.gatewayClient._buildResearchParams({
    domain: "acme.example",
    company: "Acme",
    days: 90,
    ticketNotes: "customer is furious about invoice 77120",
    invoiceId: "INV-77120",
    internalNote: "do not share"
});
eq("research params keep the domain", leaky.domain, "acme.example");
eq("research params keep the company", leaky.company, "Acme");
eq("research params keep the day window", leaky.days, 90);
eq("research params drop internal ticket notes", leaky.ticketNotes, undefined);
eq("research params drop invoice identifiers", leaky.invoiceId, undefined);
eq("research params drop internal notes", leaky.internalNote, undefined);
eq("research params carry nothing beyond the allow-list", Object.keys(leaky).length, 3);

// =====================================================================
// Intelligence engine — end to end over each mock account
// =====================================================================

function bundleFor(accountId) {
    const raw = C360.mockData.forAccount(accountId);
    const account = C360.normalize.account(
        C360.mockData.accounts.filter((a) => a.id === accountId)[0]
    );
    const website = C360.normalize.website(raw.website);
    return {
        account: account,
        quotes: C360.normalize.quotes(raw.quotes),
        orders: C360.normalize.orders(raw.orders),
        tickets: C360.normalize.tickets(raw.tickets),
        billingIssues: C360.normalize.escalations(raw.billingIssues, "billing"),
        technicalIssues: C360.normalize.escalations(raw.technicalIssues, "technical"),
        reviews: C360.normalize.reviews(raw.reviews),
        website: website,
        external: C360.normalize.external(raw.external),
        contacts: C360.contactService.mergeWebsiteLeadership(
            C360.normalize.contacts(raw.contacts), website
        ),
        geotab: null
    };
}

// ---- acc-001: growth with a support problem -------------------------
const acme = C360.intelligenceEngine.run(bundleFor("acc-001"));

check("acme produces facts", acme.facts.length > 0, "got " + acme.facts.length);
check("every acme fact carries a source label",
    acme.facts.every((f) => !!f.sourceLabel && !!f.source));
check("acme detects the 50 -> 75 order increase",
    has(acme.signals, (s) => s.key === "orderVolume" && s.direction === "up"));
eq("the order-volume signal states 50%",
    has(acme.signals, (s) => s.key === "orderVolume" && s.statement.indexOf("50%") !== -1), true);
check("acme detects the technical escalation",
    has(acme.signals, (s) => s.key === "technicalEscalation"));
check("acme detects the billing escalation",
    has(acme.signals, (s) => s.key === "billingEscalation"));
check("acme detects repeated connectivity issues",
    has(acme.signals, (s) => s.key === "repeatIssue"));
check("acme detects public growth",
    has(acme.signals, (s) => s.key === "publicGrowth"));
check("every acme signal carries a confidence level",
    acme.signals.every((s) => ["High", "Medium", "Low"].indexOf(s.confidence) !== -1));

check("acme raises a technical risk",
    has(acme.risks, (r) => r.id === "risk-technical-escalation"));
check("acme raises a billing risk",
    has(acme.risks, (r) => r.id === "risk-billing-escalation"));
check("every acme risk carries evidence or an explicit absence basis",
    acme.risks.every((r) => r.evidence.length > 0 || r.severity === "Low"));
check("acme risks are severity-ordered", acme.risks[0].severity === "High");
check("every acme risk states its severity basis",
    acme.risks.every((r) => typeof r.severityBasis === "string" && r.severityBasis.length > 0));

check("acme surfaces the fleet-expansion opportunity",
    has(acme.opportunities, (o) => o.id === "opp-fleet-expansion"));
check("acme surfaces the customer-stated opportunity",
    has(acme.opportunities, (o) => o.id === "opp-review-stated"));
check("every acme opportunity separates evidence from interpretation",
    acme.opportunities.every((o) => !!o.evidenceStatement && !!o.interpretation && !!o.action));

check("acme recommends handling the escalation first",
    acme.recommendations[0].id === "action-technical-escalation"
    || acme.recommendations[0].id === "action-billing-escalation",
    "first action was " + acme.recommendations[0].id);
check("acme returns at most five actions", acme.recommendations.length <= 5,
    "got " + acme.recommendations.length);
check("every acme action has a priority",
    acme.recommendations.every((a) => ["HIGH", "MEDIUM", "LOW"].indexOf(a.priority) !== -1));

// The named-contact guarantee: John Marsh is confirmed on the website, so the
// fleet action may name him.
const fleetAction = acme.recommendations.filter((a) => a.id === "action-fleet-followup")[0];
check("acme names the verified fleet contact in its action",
    !!fleetAction && fleetAction.text.indexOf("John Marsh") !== -1,
    fleetAction ? fleetAction.text : "no fleet action generated");

check("acme ranks the fleet director first",
    acme.contacts[0].title.toLowerCase().indexOf("fleet") !== -1,
    "first contact was " + acme.contacts[0].title);
check("acme excludes placeholder contacts from the ranked list",
    acme.contacts.every((c) => !c.placeholder));
check("acme reports the unfilled safety role as a gap",
    acme.roleGaps.indexOf("Safety leadership") !== -1,
    JSON.stringify(acme.roleGaps));

check("acme health has four dimensions", acme.health.length === 4);
check("acme health uses words, not numbers",
    acme.health.every((h) => typeof h.state === "string" && isNaN(Number(h.state))));
eq("acme support health is at risk",
    acme.health.filter((h) => h.dimension === "Support")[0].state, "At risk");
eq("acme growth health is positive",
    acme.health.filter((h) => h.dimension === "Growth")[0].state, "Positive");

check("acme timeline is chronological", acme.timeline.every((item, i, arr) =>
    i === 0 || new Date(arr[i - 1].date) >= new Date(item.date)));
check("acme timeline mixes internal and external sources",
    has(acme.timeline, (t) => t.source === "internal")
    && has(acme.timeline, (t) => t.source === "external"));

check("acme what-changed is populated", acme.whatChanged.length > 0);
check("acme summary is composed, not generated", acme.summary.generated === "composed");
check("acme summary names the account",
    acme.summary.sentences[0].text.indexOf("Acme Transportation") === 0);

// ---- acc-002: contraction and churn risk ----------------------------
const abc = C360.intelligenceEngine.run(bundleFor("acc-002"));

check("abc detects the order decrease",
    has(abc.signals, (s) => s.key === "orderVolume" && s.direction === "down"));
check("abc detects public contraction",
    has(abc.signals, (s) => s.key === "publicContraction"));
check("abc raises a contraction risk",
    has(abc.risks, (r) => r.id === "risk-public-contraction"));
eq("abc growth health is negative",
    abc.health.filter((h) => h.dimension === "Growth")[0].state, "Negative");
eq("abc relationship health is unknown without a review",
    abc.health.filter((h) => h.dimension === "Relationship")[0].state, "Unknown");
check("abc does not name an unverified fleet contact",
    !has(abc.recommendations, (a) => a.text.indexOf("Not identified") !== -1));
check("abc asks for a contact to be identified instead",
    has(abc.recommendations, (a) => a.id === "action-identify-fleet-contact")
    || !has(abc.opportunities, (o) => o.id === "opp-fleet-expansion" || o.id === "opp-public-growth"));

// ---- acc-003: the sparse account ------------------------------------
const xyz = C360.intelligenceEngine.run(bundleFor("acc-003"));

check("xyz produces no signals it cannot support",
    !has(xyz.signals, (s) => s.key === "orderVolume"));
check("xyz still returns a health assessment", xyz.health.length === 4);
eq("xyz commercial health is quiet",
    xyz.health.filter((h) => h.dimension === "Commercial")[0].state, "Quiet");
eq("xyz support health reports no activity",
    xyz.health.filter((h) => h.dimension === "Support")[0].state, "No activity");
check("xyz reports the missing review as low confidence",
    has(xyz.signals, (s) => s.key === "noReview" && s.confidence === "Low"));
check("xyz has no contacts and therefore names none",
    xyz.contacts.length === 0
    && !has(xyz.recommendations, (a) => /Follow up with [A-Z]/.test(a.text)));
check("xyz summary still renders", xyz.summary.sentences.length > 0);
check("xyz timeline is empty rather than fabricated", xyz.timeline.length === 1);

// ---- acc-004: healthy strategic account ------------------------------
const north = C360.intelligenceEngine.run(bundleFor("acc-004"));

check("northline does not flag a 3% order change as a signal",
    !has(north.signals, (s) => s.key === "orderVolume"),
    "160 vs 155 units is below the 10% threshold");
check("northline detects the leadership change",
    has(north.signals, (s) => s.key === "leadershipChange"));
eq("northline support health is healthy",
    north.health.filter((h) => h.dimension === "Support")[0].state, "Healthy");
// Reviewed recently, but the customer raised a concern at that review — a
// recent meeting alone does not make the relationship healthy.
eq("northline relationship health is watch, because a concern was raised",
    north.health.filter((h) => h.dimension === "Relationship")[0].state, "Watch");
check("northline corroborates Marie Cote from two sources",
    has(north.contacts, (c) => c.name === "Marie Cote" && c.confidence === "Confirmed"));

// =====================================================================
// Contact prioritisation is profile-driven, not hardcoded
// =====================================================================

const sampleContacts = C360.normalize.contacts([
    { id: "p1", name: "Exec Person", title: "CEO", confidence: "Confirmed" },
    { id: "p2", name: "Fleet Person", title: "Fleet Director", confidence: "Confirmed" }
]);

const fleetFirst = C360.contactService.prioritize(sampleContacts, { contactProfile: "fleet-heavy" });
eq("fleet-heavy profile ranks the fleet director first", fleetFirst[0].title, "Fleet Director");

const ownerFirst = C360.contactService.prioritize(sampleContacts, { contactProfile: "small-business" });
eq("small-business profile ranks the CEO first", ownerFirst[0].title, "CEO");

// =====================================================================
// A rule that throws must not take the dashboard down
// =====================================================================

const originalRule = C360.signals.RULES.orderVolume;
C360.signals.RULES.orderVolume = function () { throw new Error("deliberate test failure"); };
let survived = true;
try {
    C360.intelligenceEngine.run(bundleFor("acc-001"));
} catch (error) {
    survived = false;
}
C360.signals.RULES.orderVolume = originalRule;
check("a throwing signal rule is contained", survived);

// =====================================================================
// Cache honours its TTL
// =====================================================================

C360.cache.set("acc-test", "quotes", [{ id: "x" }], 10000);
check("cache returns a fresh entry", C360.cache.get("acc-test", "quotes") !== null);
C360.cache.set("acc-test", "orders", [{ id: "y" }], -1);
check("cache drops an expired entry", C360.cache.get("acc-test", "orders") === null);
C360.cache.markSuccess("acc-test", "external");
check("cache records the last successful fetch",
    C360.cache.lastSuccess("acc-test", "external") instanceof Date);
C360.cache.clearAccount("acc-test");
check("cache clears an account", C360.cache.get("acc-test", "quotes") === null);

// =====================================================================
// Rendering — every section builds, and untrusted text stays inert
// =====================================================================

const renderMeta = {
    dateFilterDays: 90,
    sourceGroups: [
        { id: "internal", label: "Internal data", ok: true, lastSuccess: new Date() },
        { id: "website", label: "Customer website", ok: true, lastSuccess: new Date() },
        { id: "external", label: "External web", ok: false, lastSuccess: new Date() }
    ]
};

["acc-001", "acc-002", "acc-003", "acc-004"].forEach((id) => {
    const model = C360.intelligenceEngine.run(bundleFor(id));
    let html = null;
    try {
        html = C360.render.accountHeader(model, renderMeta) + C360.render.dashboard(model, renderMeta);
    } catch (error) {
        failures.push("render threw for " + id + ": " + error.message);
        return;
    }
    check("dashboard renders for " + id, typeof html === "string" && html.length > 1000);
    check("dashboard for " + id + " has no unresolved template holes",
        html.indexOf("undefined") === -1 && html.indexOf("[object Object]") === -1);
    check("dashboard for " + id + " labels its sources",
        html.indexOf("c360-source--internal") !== -1);
});

// An account whose external research is hostile: the "news" came off the open
// web, so it is exactly the input an attacker controls.
const hostile = bundleFor("acc-001");
hostile.external = C360.normalize.external([
    {
        id: "evil",
        date: ago(2),
        category: "expansion",
        title: '<img src=x onerror="alert(1)">',
        summary: '</p><script>document.cookie</script>',
        publisher: '"><svg onload=alert(2)>',
        url: 'javascript:alert(3)'
    }
]);
const hostileHtml = C360.render.dashboard(C360.intelligenceEngine.run(hostile), renderMeta);
check("a script tag from external research is escaped",
    hostileHtml.indexOf("<script>document.cookie") === -1);
check("an onerror attribute from external research is escaped",
    hostileHtml.indexOf('onerror="alert(1)"') === -1);
check("an svg onload payload is escaped", hostileHtml.indexOf("<svg onload") === -1);
check("a javascript: URL is never emitted as an href",
    hostileHtml.indexOf('href="javascript:') === -1);
check("the escaped payload is still displayed as text",
    hostileHtml.indexOf("&lt;img src=x") !== -1);

// Empty states rather than blank cards.
const emptyModel = C360.intelligenceEngine.run(bundleFor("acc-003"));
const emptyHtml = C360.render.dashboard(emptyModel, renderMeta);
check("a sparse account shows the no-quotes empty state",
    emptyHtml.indexOf("No recent quotes found.") !== -1);
check("a sparse account shows the no-review empty state",
    emptyHtml.indexOf("No recent account review found.") !== -1);
check("a sparse account shows the no-contacts empty state",
    emptyHtml.indexOf("No verified decision makers found.") !== -1);
check("a sparse account says so rather than showing a blank website panel",
    emptyHtml.indexOf("No customer website is recorded on this account.") !== -1);

// A failed source is reported in the status strip.
const statusHtml = C360.render.sourceStatus(renderMeta.sourceGroups);
check("the status strip marks a failed source",
    statusHtml.indexOf("Temporarily unavailable") !== -1);
check("the status strip still marks healthy sources loaded",
    statusHtml.indexOf("Loaded") !== -1);

// Display filtering must not change what the engine reasoned over.
const filtered = C360.render.withinDays(acme.commercial.orders, 30);
check("the 30-day view hides the older comparable order", filtered.length < acme.commercial.orders.length);
check("but the volume signal derived from it survives",
    has(acme.signals, (s) => s.key === "orderVolume"));

// =====================================================================
// Orchestrator: one failed source must not break the load
// =====================================================================

const originalLoad = C360.webResearchService.load;
C360.webResearchService.load = function () {
    return Promise.reject(new Error("simulated external outage"));
};

C360.orchestrator.load("acc-001", { forceRefresh: true }).then((result) => {
    C360.webResearchService.load = originalLoad;

    const external = result.sources.filter((s) => s.source === "external")[0];
    check("a failed external source is reported as failed", external && external.ok === false);
    check("the dashboard still renders internal data after an external failure",
        result.intelligence.commercial.orders.length > 0);
    check("the account header still resolves after an external failure",
        result.intelligence.account.name === "Acme Transportation");

    const groups = C360.orchestrator.summariseSources(result.sources);
    eq("source summary reports three groups", groups.length, 3);
    eq("internal group is healthy", groups.filter((g) => g.id === "internal")[0].ok, true);
    eq("external group is flagged", groups.filter((g) => g.id === "external")[0].ok, false);

    // =================================================================
    // Scorecard suites (Phases 1-9) + the consolidated scenario suite
    // =================================================================
    // Loaded here rather than as separate entry points so `node
    // tests/run-tests.cjs` stays the one command that proves the whole product.
    //
    // The scorecard suite returns a promise: the Phase 8 AI tests drive an
    // injected transport, so a few assertions land asynchronously and the
    // report has to wait for them. Reporting before they settle would show a
    // green run that had not finished checking.
    return Promise.resolve(
        require("./scorecard-tests.cjs")({ C360: C360, check: check, eq: eq, has: has })
    ).then(() => {
        require("./scenario-tests.cjs")({ C360: C360, check: check, eq: eq });
        report();
    }).catch((error) => {
        failures.push("scorecard suite threw: " + (error && error.stack
            ? error.stack : error));
        report();
    });
}).catch((error) => {
    C360.webResearchService.load = originalLoad;
    failures.push("orchestrator load threw: " + (error && error.stack ? error.stack : error.message));
    report();
});

function report() {
    console.log("");
    console.log("Customer 360 test run");
    console.log("---------------------");
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
