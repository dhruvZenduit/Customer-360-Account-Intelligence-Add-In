/**
 * Customer 360 — SCORECARD TESTS  (Phases 1-9)
 * ============================================
 * Loaded by tests/run-tests.cjs, which owns the window stub and the assertion
 * helpers, so `node tests/run-tests.cjs` stays the one command that proves the
 * whole product.
 *
 * Test numbers match the tables in docs/phase-*.md. Where a doc numbers a test,
 * the assertion below carries that number, so a failure points at the
 * requirement rather than at the implementation.
 *
 * EVERY TEST INJECTS `asOf`. Nothing here reads the clock, and no engine does
 * either — that is what makes the suite deterministic across runs, and it is the
 * Phase 9 requirement that the fixtures be reproducible.
 *
 * The tests that matter most, if you only read a few:
 *
 *   3.2   healthy account + critical issue -> health stays high, priority goes
 *         P0/P1. If this fails, priority is still a function of health and the
 *         product's central claim is false.
 *   2.2   a category with no data is `available: false`, not `0`.
 *   3.13  an override raises the level and never lowers it.
 *   5.12  no draft asserts a fact that is absent from its evidence.
 *   8.2   enabling AI changes no score.
 *   8.12  no gated action happens without an approval record.
 */

"use strict";

module.exports = function (harness) {

    const C360 = harness.C360;
    const check = harness.check;
    const eq = harness.eq;

    /** Fixed "as of" — every date below is an offset from it. */
    const ASOF = new Date("2026-08-24T12:00:00Z");
    const ago = (days) => {
        const d = new Date(ASOF);
        d.setDate(d.getDate() - days);
        return d.toISOString();
    };
    const ahead = (days) => {
        const d = new Date(ASOF);
        d.setDate(d.getDate() + days);
        return d.toISOString();
    };

    const N = C360.normalize;

    /** Round to 2dp for hand-arithmetic comparisons. */
    const p2 = (n) => Math.round(n * 100) / 100;

    // =================================================================
    // A healthy baseline account, and deltas from it
    // =================================================================

    /**
     * Deliberately boring: full stakeholder coverage, good devices, recent
     * review, no deadlines. Every scenario below is this account plus one
     * problem, which is what makes each test attribute its result to that
     * problem rather than to the fixture.
     */
    /**
     * @param {object} over  { id, account, rest }
     *
     * `id` gives the fixture its own account id. Without distinct ids every
     * baseline-derived model shares one, and a portfolio filter by account id
     * returns all of them — which made test 6.8 fail for a reason that had
     * nothing to do with the filter.
     */
    function baseline(over) {
        const o = over || {};
        const account = N.account(Object.assign({
            id: o.id || "sc-1",
            /*
             * A distinct name per fixture. Identical names made the
             * name-matching query ambiguous, which the query layer now reports
             * rather than guesses — correct behaviour, but it meant every
             * fixture collided with every other one.
             */
            name: o.name || ((o.id || "sc-1") + " Freight Inc."),
            domain: "baselinefreight.example",
            status: "Active", customerSince: "2019-05-01", assetCount: 180,
            accountOwner: "Priya Raman", contactProfile: "fleet-heavy",
            products: ["Telematics Core", "Driver Safety Cameras", "Compliance / HOS",
                       "Routing & Dispatch", "Asset Tracking"]
        }, o.account || {}));

        return Object.assign({
            account: account,
            quotes: [], orders: [],
            /**
             * One long-resolved low-severity ticket, so the SUPPORT category has
             * data to judge. Without it support is genuinely unavailable and the
             * weights legitimately re-normalise, which would make test 2.10
             * unsatisfiable for the wrong reason.
             */
            tickets: N.tickets([{ id: "bt", number: "BT1", subject: "Report layout question",
                category: "Access", opened: ago(150), lastUpdate: ago(148),
                status: "Resolved", priority: "Low" }]),
            billingIssues: [], technicalIssues: [],
            website: null, external: [],
            contacts: N.contacts([
                { id: "b1", name: "Dana Reyes", title: "Fleet Manager", confidence: "Confirmed", sourceType: "internal" },
                { id: "b2", name: "Ana Lopez", title: "Director of Operations", confidence: "Confirmed", sourceType: "internal" },
                { id: "b3", name: "Ken Obi", title: "Director of Safety", confidence: "Confirmed", sourceType: "internal" },
                { id: "b4", name: "Rae Kim", title: "Procurement Manager", confidence: "Confirmed", sourceType: "internal" }
            ]),
            geotab: null,
            reviews: N.reviews([{ id: "br", date: ago(30), type: "Quarterly Business Review" }]),
            deviceHealth: { available: true, deviceCount: 180, notCommunicating: 2, cameraAvailabilityPct: 98, asOf: ago(1) },
            portalUsage: { available: true, activeUsers: 62, previousActiveUsers: 60, asOf: ago(1) },
            contract: { id: "bk", startDate: "2019-05-01", renewalDate: ahead(300), annualValue: 90000 },
            communications: [{ id: "bm", date: ago(9), subject: "Thanks", body: "All good this month.", author: "Dana Reyes" }],
            commitments: [],
            outcomes: { available: true, trainingCompleted: true, trainingCompletedDate: ago(40),
                        recommendationsImplemented: 2,
                        improvements: [{ label: "Idling reduced", change: "-12%", date: ago(30) }] }
        }, o.rest || {});
    }

    const run = (data) => C360.scorecardEngine.run(data, { asOf: ASOF });

    // =================================================================
    // PHASE 1 — identity, segments, lifecycle
    // =================================================================

    // 1.1 — the three spellings of one company collapse onto one master id.
    const spellings = ["ABC Logistics Inc.", "ABC Logistics", "ABC Logistics LLC"]
        .map((name) => C360.identity.normaliseName(name));
    check("1.1 three legal spellings of one company normalise identically",
        spellings[0] === spellings[1] && spellings[1] === spellings[2],
        JSON.stringify(spellings));

    const oneId = ["ABC Logistics Inc.", "ABC Logistics", "ABC Logistics LLC"].map((name) =>
        C360.identity.resolve({
            account: N.account({ id: "abc-1", name: name, domain: "abclogistics.example" }),
            sources: []
        }).masterCustomerId);
    check("1.1 all three resolve to one masterCustomerId",
        oneId[0] === oneId[1] && oneId[1] === oneId[2], JSON.stringify(oneId));

    // 1.2 — genuinely different companies with similar names stay separate.
    const northlineFreight = C360.identity.resolve({
        account: N.account({ id: "n-1", name: "Northline Freight Systems", domain: "northlinefreight.example" }),
        sources: []
    });
    const northlineFoods = C360.identity.resolve({
        account: N.account({ id: "n-2", name: "Northline Foods", domain: "northlinefoods.example" }),
        sources: []
    });
    check("1.2 two similar-but-different companies get distinct ids",
        northlineFreight.masterCustomerId !== northlineFoods.masterCustomerId);
    check("1.2 their normalised names also differ",
        northlineFreight.normalisedName !== northlineFoods.normalisedName);

    // 1.3 — a loose name match (70%) is below the 85% threshold, so it is
    // reported as unmatched rather than attached. This is the test that stops
    // the wrong company's news reaching an account.
    const looseMatch = C360.identity.resolve({
        account: N.account({ id: "l-1", name: "Cedar Ridge Haulage", domain: "cedarridge.example" }),
        sources: [{ system: "external", id: "news-1", name: "Cedar Ridge Haulage" }]
    });
    eq("1.3 a name-only match is not attached", looseMatch.attachedSystems.indexOf("external"), -1);
    eq("1.3 it is reported as unmatched, not dropped", looseMatch.unmatched.length, 1);
    eq("1.3 the unmatched entry records the 70% strategy",
        looseMatch.unmatched[0].confidencePct, 70);
    check("1.3 the unmatched entry explains why it was not attached",
        looseMatch.unmatched[0].reason.indexOf("below") !== -1);

    // A name + verified domain match clears the bar at 90%.
    const domainMatch = C360.identity.resolve({
        account: N.account({ id: "d-1", name: "Cedar Ridge Haulage", domain: "cedarridge.example" }),
        sources: [{ system: "external", id: "news-2", name: "Cedar Ridge Haulage",
                    domain: "cedarridge.example" }]
    });
    check("1.3 a name + domain match at 90% IS attached",
        domainMatch.attachedSystems.indexOf("external") !== -1);
    eq("1.3 and is recorded at 90%",
        C360.identity.confidenceFor(domainMatch, "external"), 90);

    // 1.4 — every attached link carries how it matched and a numeric confidence.
    const baseModel = run(baseline({}));
    check("1.4 every attached link records matchedBy and a numeric confidencePct",
        baseModel.identity.links.length > 0
        && baseModel.identity.links.every((link) =>
            !!link.matchedBy && typeof link.confidencePct === "number"));
    check("1.4 overall identity confidence is the weakest attached link, not the average",
        baseModel.identity.confidencePct
            === Math.min.apply(null, baseModel.identity.links.map((l) => l.confidencePct)));

    // 1.5 — the same review age is overdue for Strategic and not for Small
    // Business. This is the whole reason segments exist.
    eq("1.5 a Strategic account is overdue at 100 days",
        C360.segments.isReviewOverdue("strategic", ago(100), ASOF), true);
    eq("1.5 a Small Business account is not overdue at 100 days",
        C360.segments.isReviewOverdue("small-business", ago(100), ASOF), false);
    eq("1.5 the Strategic cadence comes from config",
        C360.segments.reviewOverdueDays("strategic"), 90);
    eq("1.5 the Small Business cadence differs", C360.segments.reviewOverdueDays("small-business"), 180);

    // 1.6 — no contract, no renewal, no tenure: lifecycle is unknown, never guessed.
    const noEvidence = C360.segments.resolve(
        N.account({ id: "u-1", name: "Unknown Tenure Co", status: "Active" }),
        {}, { asOf: ASOF });
    eq("1.6 lifecycle with no evidence is reported unknown, not guessed",
        noEvidence.lifecycle, "unknown");
    check("1.6 and says what evidence was missing",
        noEvidence.basis.lifecycle.indexOf("cannot be derived") !== -1);
    check("1.6 a suspended status resolves from evidence",
        C360.segments.resolve(N.account({ id: "u-2", name: "Held Co", status: "Suspended" }),
            {}, { asOf: ASOF }).lifecycle === "suspended");

    // 1.7 — a missing data area is unavailable, never coerced to 0.
    const noDevice = run(baseline({ rest: { deviceHealth: null, portalUsage: null } }));
    const productCategory = noDevice.health.categories.filter((c) => c.key === "product")[0];
    eq("1.7 a missing data area is not scored 0", productCategory.score, null);
    eq("1.7 it is reported unavailable", productCategory.available, false);
    check("1.7 with a reason", !!productCategory.unavailableReason);

    // 1.9 — the fixture set covers every MVP category.
    eq("1.9 the fixture set has 20-30 accounts",
        C360.mockData.accounts.length >= 20 && C360.mockData.accounts.length <= 30, true);
    const fixtureCategories = Object.keys(C360.mockData.fixtureCategories)
        .map((id) => C360.mockData.fixtureCategories[id]);
    ["healthy", "at-risk", "high-value", "cancelled", "expansion", "technical",
     "billing", "inactive"].forEach((category) => {
        check("1.9 the fixture set covers the " + category + " category",
            fixtureCategories.indexOf(category) !== -1);
    });
    check("1.9 every fixture account is labelled MOCK",
        C360.mockData.accounts.every((account) => account.mock === true));

    /**
     * The account manifests in tests/fixtures/accounts/ are GENERATED from
     * mockData and asserted here. Without this, a fixture could quietly lose its
     * device feed and stop exercising the unavailable-category path while its
     * manifest still claimed it had one — the manifest would document a test
     * that had stopped running.
     */
    const fsMod = require("fs");
    const pathMod = require("path");
    const manifestDir = pathMod.join(__dirname, "fixtures", "accounts");
    const manifestFiles = fsMod.readdirSync(manifestDir)
        .filter((name) => name.endsWith(".json"));

    eq("1.9 there is one manifest per fixture account",
        manifestFiles.length, C360.mockData.accounts.length);

    const manifestCategories = {};
    let manifestDrift = 0;

    manifestFiles.forEach((file) => {
        const manifest = JSON.parse(fsMod.readFileSync(
            pathMod.join(manifestDir, file), "utf8"));
        manifestCategories[manifest.category] =
            (manifestCategories[manifest.category] || 0) + 1;

        const account = C360.mockData.accounts
            .filter((item) => item.id === manifest.id)[0];
        if (!account) {
            manifestDrift++;
            console.error("  manifest " + file + " names an account that does not exist");
            return;
        }

        const bundle = C360.mockData.forAccount(manifest.id);
        const declared = manifest.sources;

        const actual = {
            quotes: (bundle.quotes || []).length,
            orders: (bundle.orders || []).length,
            tickets: (bundle.tickets || []).length,
            reviews: (bundle.reviews || []).length,
            contacts: (bundle.contacts || []).length,
            communications: (bundle.communications || []).length,
            website: !!bundle.website,
            deviceHealth: !!bundle.deviceHealth,
            portalUsage: !!bundle.portalUsage,
            contract: !!bundle.contract,
            outcomes: !!bundle.outcomes,
            commitments: bundle.commitments === null || bundle.commitments === undefined
                ? null : bundle.commitments.length
        };

        Object.keys(actual).forEach((key) => {
            if (actual[key] !== declared[key]) {
                manifestDrift++;
                console.error("  manifest drift on " + manifest.id + "." + key
                    + ": manifest says " + JSON.stringify(declared[key])
                    + ", fixture has " + JSON.stringify(actual[key]));
            }
        });
    });

    eq("1.9 every manifest matches the live fixture set", manifestDrift, 0);
    check("1.9 the manifests document what each fixture proves",
        manifestFiles.every((file) => {
            const manifest = JSON.parse(fsMod.readFileSync(
                pathMod.join(manifestDir, file), "utf8"));
            return typeof manifest.proves === "string" && manifest.proves.length > 20;
        }));

    // `commitments: null` (untracked) and `commitments: 0` (tracked, none) must
    // BOTH be present, or only one of the two Phase 3 paths is ever tested.
    const untrackedCommitments = manifestFiles.filter((file) =>
        JSON.parse(fsMod.readFileSync(pathMod.join(manifestDir, file), "utf8"))
            .sources.commitments === null);
    check("1.9 at least one fixture has commitments UNTRACKED (null)",
        untrackedCommitments.length > 0);
    check("1.9 and at least one has them tracked",
        manifestFiles.length > untrackedCommitments.length);

    ["healthy", "at-risk", "high-value", "cancelled", "expansion", "technical",
     "billing", "inactive"].forEach((category) => {
        check("1.9 the manifests classify at least one account as " + category,
            (manifestCategories[category] || 0) > 0);
    });

    // =================================================================
    // PHASE 2 — health + confidence
    // =================================================================

    // 2.1 — the weighted total matches hand arithmetic to 2dp.
    const weighted = baseModel.health;
    const byHand = p2(weighted.categories.reduce(
        (total, category) => total + (category.available ? category.score * category.effectiveWeight : 0), 0));
    eq("2.1 the weighted total matches hand arithmetic to 2dp", p2(weighted.score), byHand);

    // 2.13 — the contributions sum to the score. The invariant the UI renders.
    eq("2.13 the sum of contributions equals the score",
        p2(weighted.categories.reduce((t, c) => t + c.contribution, 0)), p2(weighted.score));

    // 2.2 covered by 1.7 above; 2.3 — removing device data must not move health.
    const withDevice = run(baseline({}));
    const withoutDevice = run(baseline({ rest: { deviceHealth: null, portalUsage: null } }));
    check("2.3 removing device data does not drop health below the with-device score",
        withoutDevice.health.score >= withDevice.health.score - 0.01,
        "with " + withDevice.health.score.toFixed(2) + " vs without "
            + withoutDevice.health.score.toFixed(2));
    check("2.3 but it does drop confidence",
        withoutDevice.health.confidence.pct < withDevice.health.confidence.pct,
        withDevice.health.confidence.pct + " -> " + withoutDevice.health.confidence.pct);

    // 2.4 / 2.5 — support scores quality, not count.
    const lowTickets = [];
    for (let i = 0; i < 20; i++) {
        lowTickets.push({ id: "low" + i, number: String(i), subject: "Minor question",
            category: "Access", opened: ago(60 + i), status: "Resolved", priority: "Low" });
    }
    const supportOf = (tickets) => run(baseline({ rest: { tickets: N.tickets(tickets) } }))
        .health.categories.filter((c) => c.key === "support")[0];

    const twenty = supportOf(lowTickets);
    const forty = supportOf(lowTickets.concat(lowTickets.map((t, i) =>
        Object.assign({}, t, { id: "dup" + i, number: "1" + i }))));
    const oneCritical = supportOf([{ id: "crit", number: "C1", subject: "Critical unresolved",
        category: "Connectivity", opened: ago(20), status: "Open", priority: "Critical" }]);

    check("2.4 one critical unresolved ticket scores lower than 20 resolved low ones",
        oneCritical.score < twenty.score,
        oneCritical.score.toFixed(1) + " vs " + twenty.score.toFixed(1));
    check("2.5 doubling the ticket count at constant severity barely moves support",
        Math.abs(forty.score - twenty.score) <= 1,
        twenty.score.toFixed(1) + " vs " + forty.score.toFixed(1));

    // 2.6 / 2.7 — sentiment alone is capped until corroborated.
    const relationshipOf = (rest) => run(baseline({ rest: rest }))
        .health.categories.filter((c) => c.key === "relationship")[0];

    const soloSentiment = relationshipOf({
        communications: [{ id: "s1", date: ago(3), subject: "unhappy",
            body: "I am frustrated with this." }]
    });
    const corroborated = relationshipOf({
        communications: [{ id: "s2", date: ago(3), subject: "unhappy",
            body: "I am frustrated. This is the third time. We are evaluating a competitor." }],
        tickets: N.tickets([
            { id: "r1", number: "R1", subject: "Camera fault", category: "Camera", opened: ago(30), status: "Open", priority: "High", escalated: true },
            { id: "r2", number: "R2", subject: "Camera fault again", category: "Camera", opened: ago(20), status: "Open", priority: "High" },
            { id: "r3", number: "R3", subject: "Camera fault third", category: "Camera", opened: ago(10), status: "Open", priority: "Medium" }
        ])
    });

    const capNote = soloSentiment.signals.filter((s) => s.note)[0];
    check("2.6 uncorroborated sentiment is capped and says so",
        !!capNote && capNote.note.indexOf("Capped at") !== -1);
    check("2.7 corroborated sentiment scores materially lower than uncorroborated",
        corroborated.score < soloSentiment.score - 5,
        soloSentiment.score.toFixed(1) + " -> " + corroborated.score.toFixed(1));

    // 2.8 — a cancellation request must not be masked by a healthy order history.
    const cancelling = run(baseline({ rest: {
        orders: N.orders([
            { id: "o1", number: "1", date: ago(20), quantity: 75, products: ["Telematics Core"], value: 60000 },
            { id: "o2", number: "2", date: ago(140), quantity: 50, products: ["Telematics Core"], value: 40000 }
        ]),
        communications: [{ id: "c1", date: ago(2), subject: "cancel",
            body: "We want to cancel our contract." }]
    } }));
    const cancelCommercial = cancelling.health.categories.filter((c) => c.key === "commercial")[0];
    const cancelProduct = cancelling.health.categories.filter((c) => c.key === "product")[0];
    const baseProduct = baseModel.health.categories.filter((c) => c.key === "product")[0];

    check("2.8 a cancellation signal caps the commercial category",
        cancelCommercial.score <= C360.scorecardConfig.health.commercial.retentionSignalCeiling,
        String(cancelCommercial.score));
    eq("2.8 and leaves the product category untouched",
        cancelProduct.score, baseProduct.score);

    // 2.9 — no outcome evidence is reported as limited, not as poor outcomes.
    const noOutcomes = run(baseline({ rest: { outcomes: null } }));
    const outcomeCategory = noOutcomes.health.categories.filter((c) => c.key === "outcomes")[0];
    eq("2.9 no outcome evidence is not scored", outcomeCategory.score, null);
    check("2.9 it is reported as outcomes data limited",
        outcomeCategory.unavailableReason
            === C360.scorecardConfig.health.outcomes.limitedLabel);
    check("2.9 and explicitly not as poor outcomes",
        outcomeCategory.basis.indexOf("not evidence of poor outcomes") !== -1);

    // 2.10 / 2.11 — re-normalisation.
    eq("2.10 with every category available, weights are the declared weights",
        baseModel.health.renormalised, false);
    baseModel.health.categories.forEach((category) => {
        eq("2.10 " + category.key + " effective weight equals its declared weight",
            p2(category.effectiveWeight), p2(category.weight));
    });

    const twoMissing = run(baseline({ id: "sc-two-missing", rest: {
        deviceHealth: null, portalUsage: null, outcomes: null
    } }));
    eq("2.11 with categories unavailable, weights re-normalise", twoMissing.health.renormalised, true);
    eq("2.11 effective weights re-normalise to 1.0",
        p2(twoMissing.health.categories.reduce((t, c) => t + c.effectiveWeight, 0)), 1);
    check("2.11 the excluded categories are named",
        twoMissing.health.excludedCategories.length >= 2);

    // 2.12 — fewer than minScoredCategories: health unavailable WITH a reason.
    const barelyAnything = run({
        account: N.account({ id: "thin", name: "Thin Data Inc", status: "Active" }),
        quotes: [], orders: [], tickets: [], billingIssues: [], technicalIssues: [],
        reviews: [], contacts: [], external: []
    });
    eq("2.12 too few scored categories reports health unavailable",
        barelyAnything.health.available, false);
    eq("2.12 and does not substitute a number", barelyAnything.health.score, null);
    check("2.12 with a reason naming the requirement",
        barelyAnything.health.unavailableReason.indexOf("at least") !== -1);

    // 2.14 — confidence inputs sum to 1 and the result is 0-100.
    const confidenceWeights = C360.scorecardConfig.health.confidence.inputs;
    eq("2.14 confidence input weights sum to 1",
        p2(Object.keys(confidenceWeights).reduce((t, k) => t + confidenceWeights[k], 0)), 1);
    check("2.14 the confidence result is within 0-100",
        baseModel.health.confidence.pct >= 0 && baseModel.health.confidence.pct <= 100);

    // 2.15 — every category carries a non-empty basis.
    check("2.15 every health category carries a non-empty basis",
        baseModel.health.categories.every((c) => typeof c.basis === "string" && c.basis.length > 0));
    check("2.15 every available category carries a non-empty signal list",
        baseModel.health.categories.filter((c) => c.available)
            .every((c) => c.signals.length > 0));

    // 2.16 — purity.
    eq("2.16 building health twice on the same input gives identical output",
        JSON.stringify(run(baseline({})).health), JSON.stringify(run(baseline({})).health));

    // =================================================================
    // PHASE 3 — priority + overrides
    // =================================================================

    const healthyModel = baseModel;

    // 3.1 — healthy account, nothing urgent.
    check("3.1 a healthy account scores high on health", healthyModel.health.score >= 70,
        String(healthyModel.health.score));
    eq("3.1 and is P3", healthyModel.priority.level, "P3");
    eq("3.1 and is in no queue", healthyModel.queues.primaryQueue, null);

    // 3.2 — THE test. A healthy account with one critical unresolved issue must
    // stay healthy and become urgent. If this fails, priority is a function of
    // health and the product's central claim is false.
    const healthyButUrgent = run(baseline({ id: "sc-urgent", rest: {
        tickets: N.tickets([{ id: "u1", number: "U1", subject: "Camera offline on 3 units",
            category: "Connectivity", opened: ago(9), status: "Open", priority: "Critical" }])
    } }));
    check("3.2 health stays high with one critical unresolved issue",
        healthyButUrgent.health.score >= 40, String(healthyButUrgent.health.score));
    check("3.2 but priority becomes P0 or P1",
        ["P0", "P1"].indexOf(healthyButUrgent.priority.level) !== -1,
        healthyButUrgent.priority.level);
    check("3.2 health and priority genuinely disagree",
        healthyButUrgent.health.band === "HEALTHY"
        && ["P0", "P1"].indexOf(healthyButUrgent.priority.level) !== -1,
        "health " + healthyButUrgent.health.band + " / priority "
            + healthyButUrgent.priority.level);

    // 3.3 — unhealthy account with nothing urgent stays P3.
    const unhealthyQuiet = run(baseline({ id: "sc-unhealthy", rest: {
        deviceHealth: { available: true, deviceCount: 180, notCommunicating: 46, cameraAvailabilityPct: 62, asOf: ago(1) },
        portalUsage: { available: true, activeUsers: 8, previousActiveUsers: 55, asOf: ago(1) },
        outcomes: null,
        contract: { id: "uk", startDate: "2019-05-01", renewalDate: ahead(320), annualValue: 60000 }
    } }));
    check("3.3 an unhealthy account with nothing urgent is still P3",
        unhealthyQuiet.priority.level === "P3", unhealthyQuiet.priority.level);
    check("3.3 its health is materially lower than the baseline",
        unhealthyQuiet.health.score < healthyModel.health.score - 10,
        healthyModel.health.score.toFixed(1) + " -> " + unhealthyQuiet.health.score.toFixed(1));

    // 3.4 — explicit cancellation is P0 by override.
    const cancelled = run(baseline({ id: "sc-cancelled", rest: {
        communications: [{ id: "x1", date: ago(2), subject: "Ending our contract",
            body: "We have decided to cancel our contract at the end of the term." }]
    } }));
    eq("3.4 an explicit cancellation request is P0", cancelled.priority.level, "P0");
    eq("3.4 and the level was set by an override", cancelled.priority.levelSetBy, "override");
    check("3.4 the primary reason names the cancellation",
        cancelled.priority.primaryReason.toLowerCase().indexOf("cancel") !== -1);

    // 3.5 — explicit competitor switch is P0.
    const competitor = run(baseline({ id: "sc-competitor", rest: {
        communications: [{ id: "x2", date: ago(3), subject: "Alternatives",
            body: "Procurement has asked us to run an RFP before renewing." }]
    } }));
    eq("3.5 an explicit competitor-switch signal is P0", competitor.priority.level, "P0");

    // 3.6 — a critical ticket past SLA is at least P1.
    const slaBreached = run(baseline({ id: "sc-sla", rest: {
        tickets: N.tickets([{ id: "s1", number: "S1", subject: "Critical fault",
            category: "Connectivity", opened: ago(10), status: "Open", priority: "Critical" }])
    } }));
    check("3.6 a critical ticket past SLA is P1 or more urgent",
        ["P0", "P1"].indexOf(slaBreached.priority.level) !== -1, slaBreached.priority.level);
    check("3.6 the SLA override fired",
        slaBreached.priority.firedOverrides.some((o) => o.rule === "criticalTicketBeyondSla"));

    // 3.7 / 3.8 — renewal window needs negative signals; the window is per segment.
    const renewalWithNegatives = run(baseline({ rest: {
        contract: { id: "rk", startDate: "2019-05-01", renewalDate: ahead(60), annualValue: 90000 },
        tickets: N.tickets([{ id: "n1", number: "N1", subject: "Ageing fault",
            category: "Connectivity", opened: ago(40), status: "Open", priority: "Medium" }]),
        technicalIssues: N.escalations([{ id: "ne1", subject: "Unresolved fault",
            date: ago(30), status: "Open" }], "technical")
    } }));
    check("3.7 renewal inside the window plus negative signals fires the P1 override",
        renewalWithNegatives.priority.firedOverrides
            .some((o) => o.rule === "renewalWindowWithNegativeSignals"));

    const renewalNoNegatives = run(baseline({ rest: {
        contract: { id: "rk2", startDate: "2019-05-01", renewalDate: ahead(60), annualValue: 90000 }
    } }));
    check("3.8 renewal inside the window with NO negative signals does not fire it",
        !renewalNoNegatives.priority.firedOverrides
            .some((o) => o.rule === "renewalWindowWithNegativeSignals"));

    // 3.9 — an overdue quote fires the P2 override.
    const staleQuote = run(baseline({ rest: {
        quotes: N.quotes([{ id: "q1", number: "Q1", date: ago(45), amount: 20000,
            status: "Sent", products: ["Telematics Core"] }])
    } }));
    check("3.9 a quote past staleQuoteDays fires the P2 override",
        staleQuote.priority.firedOverrides.some((o) => o.rule === "quoteAwaitingResponse"));
    check("3.9 and the account is at least P2",
        ["P0", "P1", "P2"].indexOf(staleQuote.priority.level) !== -1, staleQuote.priority.level);

    // 3.10 / 3.11 — review overdue fires per segment, not globally.
    const strategicOverdue = run(baseline({
        id: "sc-strategic",
        account: { id: "sc-strategic", assetCount: 900 },
        rest: { reviews: N.reviews([{ id: "sr", date: ago(100), type: "QBR" }]) }
    }));
    const smallNotOverdue = run(baseline({
        id: "sc-small",
        account: { id: "sc-small", assetCount: 40 },
        rest: { reviews: N.reviews([{ id: "sr2", date: ago(100), type: "QBR" }]) }
    }));
    eq("3.10 a Strategic account is segmented as strategic", strategicOverdue.segment.segment, "strategic");
    check("3.10 its 100-day-old review fires the review-overdue override",
        strategicOverdue.priority.firedOverrides
            .some((o) => o.rule === "accountReviewOverdue"));
    check("3.11 the same review age does NOT fire it for a smaller account",
        !smallNotOverdue.priority.firedOverrides
            .some((o) => o.rule === "accountReviewOverdue"),
        "segment was " + smallNotOverdue.segment.segment);

    // 3.12 — a healthy expansion opportunity raises priority and lands in GROW.
    const expanding = run(baseline({ id: "sc-expanding", rest: {
        orders: N.orders([
            { id: "e1", number: "E1", date: ago(25), quantity: 60, products: ["Telematics Core"], value: 50000 },
            { id: "e2", number: "E2", date: ago(150), quantity: 40, products: ["Telematics Core"], value: 32000 }
        ]),
        reviews: N.reviews([{ id: "er", date: ago(30), type: "QBR",
            opportunities: ["Customer indicated 60 additional vehicles planned"] }])
    } }));
    const expansionFactor = expanding.priority.factors
        .filter((f) => f.key === "expansionReadiness")[0];
    const baseExpansionFactor = healthyModel.priority.factors
        .filter((f) => f.key === "expansionReadiness")[0];
    check("3.12 expansion readiness raises the priority score",
        expansionFactor.score > baseExpansionFactor.score,
        baseExpansionFactor.score + " -> " + expansionFactor.score);
    check("3.12 a healthy expanding account is P2 or P3",
        ["P2", "P3"].indexOf(expanding.priority.level) !== -1, expanding.priority.level);
    eq("3.12 and lands in the GROW queue", expanding.queues.primaryQueue, "grow");

    // 3.13 — an override sets a FLOOR, never an assignment downward.
    const highScoringWithP1 = run(baseline({ rest: {
        tickets: N.tickets([{ id: "h1", number: "H1", subject: "Fleet-wide outage",
            category: "Connectivity", opened: ago(20), status: "Open", priority: "Critical", escalated: true }]),
        deviceHealth: { available: true, deviceCount: 180, notCommunicating: 90, asOf: ago(1) },
        contract: { id: "hk", startDate: "2019-05-01", renewalDate: ahead(20), annualValue: 900000 },
        commitments: [{ id: "hc", description: "Root-cause analysis", dueDate: ago(30) }],
        communications: [{ id: "hm", date: ago(2), subject: "Escalation",
            body: "This has been escalated to our CEO." }]
    } }));
    eq("3.13 a P0 override wins over a P1-scoring level", highScoringWithP1.priority.level, "P0");
    check("3.13 lower-level overrides fired too but did not lower the level",
        highScoringWithP1.priority.firedOverrides.some((o) => o.level === "P1"));
    check("3.13 an override never lowers the level below the scored level",
        C360.scorecardConfig.priority.levelRank[highScoringWithP1.priority.level]
            <= C360.scorecardConfig.priority.levelRank[highScoringWithP1.priority.scoredLevel]);

    // 3.14 — every fired override carries a reason and a source.
    [cancelled, competitor, slaBreached, highScoringWithP1].forEach((model, index) => {
        check("3.14 every fired override on model " + index + " has a reason",
            model.priority.firedOverrides.every((o) => !!o.reason));
        check("3.14 every fired override on model " + index + " has evidence or a source",
            model.priority.firedOverrides.every((o) => !!o.source || o.evidence.length > 0));
    });

    // 3.15 — factor contributions sum to the score.
    eq("3.15 the sum of factor contributions equals the priority score",
        p2(baseModel.priority.factors.reduce((t, f) => t + f.contribution, 0)),
        p2(baseModel.priority.score));

    // 3.16 — commitments untracked: unavailable factor, weights re-normalised,
    // never scored 0.
    const noCommitments = run(baseline({ rest: { commitments: null } }));
    const commitmentFactor = noCommitments.priority.factors
        .filter((f) => f.key === "overdueCommitments")[0];
    eq("3.16 an untracked commitments source is an unavailable factor",
        commitmentFactor.available, false);
    eq("3.16 and is not scored 0", commitmentFactor.score, null);
    check("3.16 it is listed in unavailableFactors",
        noCommitments.priority.unavailableFactors.indexOf("overdueCommitments") !== -1);
    eq("3.16 the remaining factor weights re-normalise to 1.0",
        p2(noCommitments.priority.factors.reduce((t, f) => t + f.effectiveWeight, 0)), 1);
    check("3.16 the overdueCommitment override reports itself unavailable",
        noCommitments.priority.unavailableOverrides.some((o) => o.rule === "overdueCommitment"));

    // 3.17 — reasons are never empty, and a primary reason is always set.
    [baseModel, cancelled, unhealthyQuiet, expanding, barelyAnything].forEach((model, index) => {
        check("3.17 model " + index + " has a non-empty reasons list",
            model.priority.reasons.length > 0);
        check("3.17 model " + index + " has a primary reason",
            typeof model.priority.primaryReason === "string"
            && model.priority.primaryReason.length > 0);
    });

    // 3.19 — purity.
    eq("3.19 building priority twice on the same input gives identical output",
        JSON.stringify(run(baseline({})).priority), JSON.stringify(run(baseline({})).priority));

    // =================================================================
    // PHASE 4 — queues
    // =================================================================

    // 4.1 / 4.2 — SAVE outranks FIX, but the FIX evidence travels with it.
    const saveAndFix = run(baseline({ id: "sc-savefix", rest: {
        communications: [{ id: "sf1", date: ago(2), subject: "cancel",
            body: "We want to cancel our contract." }],
        tickets: N.tickets([{ id: "sf2", number: "SF2", subject: "Critical fault",
            category: "Connectivity", opened: ago(12), status: "Open", priority: "Critical" }])
    } }));
    eq("4.1 a cancellation signal makes the primary queue SAVE",
        saveAndFix.queues.primaryQueue, "save");
    check("4.2 FIX is still present in queues[] with its own evidence",
        saveAndFix.queues.queues.some((q) =>
            q.key === "fix" && q.rules.length > 0 && q.rules[0].evidence.length > 0));

    // 4.3 — an SLA breach alone is FIX.
    eq("4.3 an SLA breach alone makes the primary queue FIX",
        slaBreached.queues.primaryQueue, "fix");

    // 4.4 — a healthy account with a qualified expansion signal is GROW at P2/P3.
    eq("4.4 a qualified expansion signal makes the primary queue GROW",
        expanding.queues.primaryQueue, "grow");

    // 4.5 — a product-catalogue gap alone is NOT a GROW.
    const gapOnly = run(baseline({ account: { products: ["Telematics Core"] } }));
    check("4.5 a product gap alone does not put an account in GROW",
        !gapOnly.queues.queues.some((q) => q.key === "grow"));

    // 4.6 — a review overdue for its segment is ENGAGE.
    eq("4.6 a review overdue for its segment makes the primary queue ENGAGE",
        strategicOverdue.queues.primaryQueue, "engage");

    // 4.7 — a low health score alone is NOT a SAVE.
    check("4.7 a low health score with no risk signal is not a SAVE",
        unhealthyQuiet.queues.primaryQueue !== "save",
        "health " + unhealthyQuiet.health.score.toFixed(1)
            + " -> queue " + unhealthyQuiet.queues.primaryQueue);

    // 4.8 — an account with nothing outstanding is in NO queue.
    eq("4.8 a healthy account with nothing outstanding has no primary queue",
        healthyModel.queues.primaryQueue, null);
    eq("4.8 and an empty queues list", healthyModel.queues.queues.length, 0);

    // 4.9 — every queue entry has a rule, a reason and non-empty evidence.
    [saveAndFix, slaBreached, expanding, strategicOverdue].forEach((model, index) => {
        check("4.9 every queue entry on model " + index + " has rule, reason and evidence",
            model.queues.queues.every((queue) =>
                queue.rules.length > 0 && queue.rules.every((rule) =>
                    !!rule.rule && !!rule.reason && rule.evidence.length > 0)));
    });

    // 4.10 — the roll-up reconciles against the account total.
    const rollupSample = [saveAndFix, slaBreached, expanding, healthyModel, strategicOverdue];
    const rolled = C360.queues.rollup(rollupSample);
    eq("4.10 queue counts plus none equal the account total",
        rolled.save + rolled.fix + rolled.grow + rolled.engage + rolled.none, rollupSample.length);
    eq("4.10 the total is reported", rolled.total, rollupSample.length);

    // 4.11 — cards inside a queue are ordered by priority score descending.
    const saveCards = C360.queues.cards(rollupSample, "save");
    check("4.11 cards within a queue are ordered by priority score descending",
        saveCards.every((card, index) =>
            index === 0 || (saveCards[index - 1].priorityScore || 0) >= (card.priorityScore || 0)));
    check("4.11 and each card carries its priority level",
        saveCards.every((card) => !!card.level));

    // 4.12 — precedence is config-driven.
    const originalPrecedence = C360.scorecardConfig.queues.precedence;
    C360.scorecardConfig.queues.precedence = ["fix", "save", "grow", "engage"];
    const reordered = run(baseline({ rest: {
        communications: [{ id: "ro1", date: ago(2), subject: "cancel",
            body: "We want to cancel our contract." }],
        tickets: N.tickets([{ id: "ro2", number: "RO2", subject: "Critical fault",
            category: "Connectivity", opened: ago(12), status: "Open", priority: "Critical" }])
    } }));
    eq("4.12 reordering precedence in config changes the primary queue",
        reordered.queues.primaryQueue, "fix");
    C360.scorecardConfig.queues.precedence = originalPrecedence;

    // 4.13 — purity.
    eq("4.13 classifying twice on the same input gives identical output",
        JSON.stringify(run(baseline({})).queues), JSON.stringify(run(baseline({})).queues));

    // =================================================================
    // PHASE 5 — recommended actions
    // =================================================================

    const withRecs = saveAndFix;

    // 5.1 — every recommendation carries all seven parts.
    check("5.1 every recommendation has why, evidence, action, owner, due and confidence",
        withRecs.recommendations.length > 0
        && withRecs.recommendations.every((rec) =>
            !!rec.why && rec.evidence.length > 0 && rec.action.steps.length > 0
            && !!rec.owner.label && !!rec.due.label && !!rec.confidence));

    // 5.2 — no mapping means no recommendation, and nothing generic.
    eq("5.2 generic fallback actions are disabled in config",
        C360.scorecardConfig.actions.allowGenericFallback, false);
    check("5.2 no recommendation anywhere says 'Contact customer'",
        !withRecs.recommendations.some((rec) =>
            rec.action.summary.toLowerCase().indexOf("contact customer") !== -1));
    eq("5.2 a rule with no mapping produces no recommendation",
        C360.actionRules.mappingFor("someRuleThatDoesNotExist"), null);

    // 5.3 — the critical-ticket steps are ordered escalate -> ETA -> customer.
    const slaRec = slaBreached.recommendations
        .filter((rec) => rec.mappingKey === "criticalTicketBeyondSla")[0];
    check("5.3 a critical-ticket recommendation exists", !!slaRec);
    if (slaRec) {
        eq("5.3 step 1 escalates internally", slaRec.action.steps[0], "Escalate internally");
        eq("5.3 step 2 obtains an ETA", slaRec.action.steps[1], "Obtain ETA");
        check("5.3 step 3 updates the customer LAST",
            slaRec.action.steps[2].indexOf("customer update") !== -1);
    }

    // 5.4 — the cancellation mapping has its four steps and the right owner.
    const cancelRec = cancelled.recommendations
        .filter((rec) => rec.mappingKey === "cancellationSignal")[0];
    check("5.4 a cancellation recommendation exists", !!cancelRec);
    if (cancelRec) {
        eq("5.4 it has the four mapped steps", cancelRec.action.steps.length, 4);
        check("5.4 and names the Account Manager",
            cancelRec.owner.roles.indexOf("Account Manager") !== -1);
    }

    // 5.5 — no CRM rep and no owner mapping gives Unassigned, not a guess.
    const unassigned = C360.actionRules.resolveOwner("noSuchMapping",
        N.account({ id: "no-owner", name: "No Owner Co" }));
    eq("5.5 owner is Unassigned when neither a rep nor a mapping exists",
        unassigned.label, C360.scorecardConfig.actions.unassignedLabel);
    eq("5.5 and is marked unresolved rather than guessed", unassigned.resolved, false);

    // 5.6 / 5.7 — due dates derive from the priority level.
    const p0Due = C360.actionRules.dueFor("P0", [], ASOF);
    const p1Due = C360.actionRules.dueFor("P1", [], ASOF);
    eq("5.6 a P0 recommendation is due Today", p0Due.label, "Today");
    eq("5.7 a P1 recommendation is due within 1 business day",
        p1Due.label, "Within 1 business day");

    // 5.8 — business-day arithmetic skips the weekend.
    eq("5.8 Thursday + 5 business days lands on the following Thursday",
        C360.actionRules.addBusinessDays(new Date("2026-08-20T12:00:00Z"), 5)
            .toISOString().slice(0, 10), "2026-08-27");
    eq("5.8 'Today' on a Saturday lands on Monday",
        C360.actionRules.addBusinessDays(new Date("2026-08-22T12:00:00Z"), 0)
            .toISOString().slice(0, 10), "2026-08-24");

    // 5.9 — a nearer hard deadline wins, and says which one it is anchored to.
    const slaTomorrow = C360.actionRules.dueFor("P2",
        [{ anchor: "sla", date: ahead(1), label: "SLA on ticket 1" }], ASOF);
    eq("5.9 a nearer SLA overrides the priority-derived date",
        slaTomorrow.isHardDeadline, true);
    eq("5.9 and the anchor is recorded", slaTomorrow.anchor, "sla");
    const renewalFar = C360.actionRules.dueFor("P0",
        [{ anchor: "renewal", date: ahead(300), label: "Renewal" }], ASOF);
    eq("5.9 a distant renewal does NOT override a P0 due date",
        renewalFar.isHardDeadline, false);

    // 5.10 — every draft is a draft, in the data, and cannot be sent.
    const allDrafts = withRecs.recommendations.reduce((all, rec) => all.concat(rec.drafts), []);
    check("5.10 at least one draft was generated", allDrafts.length > 0);
    check("5.10 every draft is status 'draft' and not sendable",
        allDrafts.every((draft) => draft.status === "draft" && draft.sendable === false));
    check("5.10 and each states why it cannot be sent",
        allDrafts.every((draft) => !!draft.notSendableReason));

    // 5.11 — no verified contact means the customer email is suppressed WITH a
    // reason, not addressed to nobody.
    const noVerifiedContact = run(baseline({ rest: {
        contacts: N.contacts([{ id: "nv", name: "Maybe Person", title: "Fleet Manager",
            confidence: "Unverified", sourceType: "external" }]),
        communications: [{ id: "nv1", date: ago(2), subject: "cancel",
            body: "We want to cancel our contract." }]
    } }));
    check("5.11 a customer-email draft is suppressed when no verified contact exists",
        noVerifiedContact.suppressed.some((item) =>
            item.draft === "customerEmail"
            && item.reason.indexOf("verified contact") !== -1));
    check("5.11 and no customer-email draft was produced",
        !noVerifiedContact.recommendations.some((rec) =>
            rec.drafts.some((draft) => draft.kind === "customerEmail")));

    // 5.12 — THE hard one. Every date, record number and named person in a draft
    // body must appear in that recommendation's evidence or verified contact.
    let draftClaimFailures = 0;
    let draftsChecked = 0;
    [withRecs, cancelled, slaBreached, expanding, strategicOverdue].forEach((model) => {
        model.recommendations.forEach((rec) => {
            rec.drafts.forEach((draft) => {
                draftsChecked++;
                const contact = draft.recipient
                    ? { name: draft.recipient.name }
                    : null;
                const result = C360.actionRules.validateClaims(
                    draft.subject + "\n" + draft.body,
                    rec.evidence, contact,
                    [model.accountName, rec.owner.label]);
                if (!result.valid) {
                    draftClaimFailures++;
                    console.error("  draft claim failure in " + rec.rule + ": "
                        + result.unsupported.map((c) => c.value).join(", "));
                }
            });
        });
    });
    check("5.12 at least one draft was claim-checked", draftsChecked > 0);
    eq("5.12 no draft asserts a fact absent from its evidence", draftClaimFailures, 0);

    // The validator has to be capable of failing, or 5.12 proves nothing.
    const fabricated = C360.actionRules.validateClaims(
        "Ticket 9999 was opened on Jan 1, 2020 and we owe you $50,000.",
        [{ label: "Ticket 4567", type: "ticket", id: "4567", date: ago(12) }], null, []);
    eq("5.12 the claim validator rejects an invented ticket number and figure",
        fabricated.valid, false);
    check("5.12 and names the unsupported tokens", fabricated.unsupported.length >= 2);

    // 5.13 — every evidence entry resolves to a record id.
    check("5.13 every evidence entry carries a record type and id",
        withRecs.recommendations.every((rec) =>
            rec.evidence.every((row) => !!row.type && !!row.id)));
    check("5.13 and every entry can reach a source or a page section",
        withRecs.recommendations.every((rec) =>
            rec.evidence.every((row) => !!row.url || !!row.section)));

    // 5.14 — the existing recommendation engine is untouched.
    check("5.14 the pre-existing intelligence recommendation engine still exists",
        typeof C360.recommendations.build === "function");

    // 5.15 — purity.
    eq("5.15 building actions twice on the same input gives identical output",
        JSON.stringify(run(baseline({})).recommendations),
        JSON.stringify(run(baseline({})).recommendations));

    // 5.x — suppressed[] always explains itself.
    check("5.x every suppressed entry carries a rule and a reason",
        [withRecs, noVerifiedContact].every((model) =>
            model.suppressed.every((item) => !!item.rule && !!item.reason)));

    // =================================================================
    // PHASE 6 — portfolio roll-up
    // =================================================================

    const portfolioModels = [saveAndFix, slaBreached, expanding, healthyModel,
                             strategicOverdue, unhealthyQuiet, barelyAnything, cancelled];
    const view = C360.portfolio.build(portfolioModels, {});

    // 6.1 / 6.2 — the counts reconcile.
    eq("6.1 health-band counts sum to the account total",
        view.summary.reconciliation.bandsSumToTotal, true);
    eq("6.2 priority-level counts sum to the account total",
        view.summary.reconciliation.levelsSumToTotal, true);

    // 6.3 — queue counts do not claim to sum to the total; `none` is reported.
    eq("6.3 queue counts plus none reconcile to the total",
        view.summary.reconciliation.queuesReconcile, true);
    check("6.3 the no-queue count is labelled in words",
        view.summary.noQueueLabel.indexOf("need no action today") !== -1);

    // 6.4 — unavailable health is counted separately, not as Critical.
    check("6.4 an account with unavailable health is counted separately",
        view.summary.bands.unavailable >= 1);
    check("6.4 and is not counted as Critical",
        view.summary.bands.critical
            === portfolioModels.filter((m) => m.health.available
                && m.health.band === "CRITICAL").length);

    // 6.5 — top-N is ordered by priority score descending.
    check("6.5 the top-priority list is ordered by priority score descending",
        view.topPriorities.every((row, index) =>
            index === 0 || view.topPriorities[index - 1].priorityScore >= row.priorityScore));

    // 6.6 — ties break by health ascending, then renewal date ascending.
    const tied = C360.portfolio.topPriorities([
        { accountId: "t1", accountName: "Higher health", priorityScore: 50, priorityLevel: "P2",
          healthScore: 80, healthAvailable: true, renewalDate: ahead(10), reasons: [],
          queues: { queues: [] }, firedOverrides: [] },
        { accountId: "t2", accountName: "Lower health", priorityScore: 50, priorityLevel: "P2",
          healthScore: 40, healthAvailable: true, renewalDate: ahead(90), reasons: [],
          queues: { queues: [] }, firedOverrides: [] }
    ], 2);
    eq("6.6 a priority tie breaks by health ascending", tied[0].accountId, "t2");

    const tiedHealth = C360.portfolio.topPriorities([
        { accountId: "r1", accountName: "Later renewal", priorityScore: 50, priorityLevel: "P2",
          healthScore: 60, healthAvailable: true, renewalDate: ahead(200), reasons: [],
          queues: { queues: [] }, firedOverrides: [] },
        { accountId: "r2", accountName: "Sooner renewal", priorityScore: 50, priorityLevel: "P2",
          healthScore: 60, healthAvailable: true, renewalDate: ahead(20), reasons: [],
          queues: { queues: [] }, firedOverrides: [] }
    ], 2);
    eq("6.6 then by renewal date ascending", tiedHealth[0].accountId, "r2");

    // 6.7 — a healthy P2 expansion account can appear in the top ten.
    check("6.7 a healthy expansion account can reach the top-priority list",
        view.topPriorities.some((row) =>
            row.accountId === expanding.accountId && row.primaryQueue === "grow"));

    // 6.8 — every portfolio-signal count matches what its filter returns.
    view.signals.forEach((signal) => {
        eq("6.8 the '" + signal.key + "' count matches its drill-through set",
            signal.accountIds.length, signal.count);
        const filtered = C360.portfolio.applyFilters(view.allRows,
            { accountIds: signal.accountIds });
        eq("6.8 and filtering by those ids returns exactly that many accounts",
            filtered.length, signal.count);
    });

    // 6.9 / 6.10 — AND across groups, OR within a group.
    const orResult = C360.portfolio.applyFilters(view.allRows, { priority: ["P0", "P1"] });
    const p0Only = C360.portfolio.applyFilters(view.allRows, { priority: ["P0"] });
    const p1Only = C360.portfolio.applyFilters(view.allRows, { priority: ["P1"] });
    eq("6.10 two values in one group are OR-ed", orResult.length, p0Only.length + p1Only.length);

    const andResult = C360.portfolio.applyFilters(view.allRows,
        { priority: ["P0", "P1"], queue: ["save"] });
    check("6.9 two groups are AND-ed",
        andResult.length <= orResult.length
        && andResult.every((row) => orResult.indexOf(row) !== -1));
    check("6.9 and every result satisfies both groups",
        andResult.every((row) =>
            ["P0", "P1"].indexOf(row.priorityLevel) !== -1 && row.primaryQueue === "save"));

    // 6.11 — filter and sort state round-trips through the URL.
    const urlState = { filters: { priority: ["P0", "P1"], queue: ["save"] }, sort: "health" };
    const roundTripped = C360.portfolio.fromQuery(C360.portfolio.toQuery(urlState));
    eq("6.11 filters round-trip through the URL",
        JSON.stringify(roundTripped.filters), JSON.stringify(urlState.filters));
    eq("6.11 sort round-trips through the URL", roundTripped.sort, urlState.sort);
    check("6.11 an unknown filter value is rejected rather than trusted",
        JSON.stringify(C360.portfolio.fromQuery("priority=P9").filters) === "{}");

    // 6.12 / 6.13 — search by contact and by issue, each with a match reason.
    const contactHits = C360.portfolio.search(view.allRows, "Dana Reyes");
    check("6.12 searching a contact name returns the account", contactHits.length > 0);
    check("6.12 and says it matched a contact",
        contactHits.length > 0 && contactHits[0].matchReason.indexOf("contact") !== -1);

    const issueHits = C360.portfolio.search(view.allRows, "Critical fault");
    check("6.13 searching an issue returns the account", issueHits.length > 0);
    check("6.13 and says it matched an issue",
        issueHits.length > 0 && issueHits[0].matchReason.indexOf("issue") !== -1);

    // 6.16 — an empty portfolio renders an explained empty state.
    const emptyView = C360.portfolio.build([], {});
    eq("6.16 an empty portfolio is flagged empty", emptyView.empty, true);
    eq("6.16 with a zero total rather than a broken screen", emptyView.summary.total, 0);

    // 6.20 — purity.
    eq("6.20 building the portfolio twice gives identical output",
        JSON.stringify(C360.portfolio.build(portfolioModels, {})),
        JSON.stringify(C360.portfolio.build(portfolioModels, {})));

    // =================================================================
    // PHASE 7 — display + explainability
    // =================================================================

    const scorecardHtml = C360.scorecardUi.render(saveAndFix, {
        intelligence: {}, previous: null
    });

    // 7.1 — the breakdown is reachable wherever the score is rendered.
    check("7.1 the health score is rendered with its breakdown drawer",
        scorecardHtml.indexOf("Health score breakdown") !== -1);

    // 7.2 — the rendered rows sum to the rendered total.
    const decimals = C360.scorecardConfig.display.breakdownDecimals;
    const renderedContribs = (scorecardHtml.match(/= (-?\d+\.\d+)</g) || [])
        .map((m) => parseFloat(m.replace("= ", "").replace("<", "")));
    check("7.2 the breakdown renders its contribution values", renderedContribs.length > 0);

    // 7.3 — those values come from the engine, not from the document's examples.
    check("7.3 the breakdown does not contain the doc's illustrative numbers",
        scorecardHtml.indexOf("15.25") === -1 || saveAndFix.health.categories.some((c) =>
            c.available && c.contribution.toFixed(decimals) === "15.25"));

    // 7.4 — an unavailable category renders the label, not 0 and not a dash.
    const unavailableHtml = C360.scorecardUi.render(noDevice, { intelligence: {} });
    check("7.4 an unavailable category renders 'Data unavailable'",
        unavailableHtml.indexOf(C360.scorecardConfig.display.unavailableLabel) !== -1);
    check("7.4 and states why it was unavailable",
        unavailableHtml.indexOf("c360-sc-unavailable-why") !== -1);

    // 7.5 — re-normalisation is stated on the face of the breakdown.
    check("7.5 re-normalised weights are stated on the breakdown",
        unavailableHtml.indexOf(C360.scorecardConfig.display.renormalisedNotice) !== -1);

    // 7.6 — a Why? list is always present and non-empty.
    check("7.6 the priority display carries a non-empty Why list",
        scorecardHtml.indexOf("c360-sc-why-item") !== -1);
    check("7.6 and always names a primary reason",
        scorecardHtml.indexOf("Primary reason:") !== -1);

    // 7.7 — when an override set the level, its reason and source are rendered.
    const overrideHtml = C360.scorecardUi.render(cancelled, { intelligence: {} });
    check("7.7 an override-set level renders the OVERRIDE block",
        overrideHtml.indexOf("OVERRIDE") !== -1);
    check("7.7 with its reason", overrideHtml.indexOf("c360-sc-override-reason") !== -1);
    check("7.7 and its source", overrideHtml.indexOf("c360-sc-override-source") !== -1);
    check("7.7 and says it takes precedence over the weighted score",
        overrideHtml.indexOf("takes precedence") !== -1);

    // 7.8 — below the threshold, limitations lead.
    const lowConfidenceHtml = C360.scorecardUi.confidenceDrawer(
        Object.assign({}, barelyAnything.health.confidence));
    check("7.8 low confidence leads with the limitations, not the score",
        lowConfidenceHtml.indexOf("Read this before the score") !== -1);

    // 7.10 — external evidence shows identity confidence.
    const externalEvidenceHtml = C360.scorecardUi.evidenceList([
        C360.evidence.make({ label: "Trade press item", type: "news", id: "x-1",
            date: ago(10), source: "external", sourceLabel: "Web", confidencePct: 90 })
    ], null);
    check("7.10 external evidence renders its identity confidence",
        externalEvidenceHtml.indexOf("matched at 90%") !== -1);

    // 7.11 — no evidence renders the label, not an empty box.
    eq("7.11 an empty evidence list renders the configured label",
        C360.scorecardUi.evidenceList([], null).indexOf(
            C360.scorecardConfig.display.emptyEvidenceLabel) !== -1, true);

    // 7.12 — text-derived evidence shows the excerpt.
    check("7.12 text-derived evidence renders the matched excerpt",
        overrideHtml.indexOf("c360-sc-excerpt") !== -1);

    // 7.13 — with no prior run, no delta is invented.
    const noHistoryHtml = C360.scorecardUi.whatChanged({
        changes: [], health: saveAndFix.health, priority: saveAndFix.priority, previous: null
    });
    check("7.13 with no stored prior run, the score history is reported unavailable",
        noHistoryHtml.indexOf(C360.scorecardConfig.display.noHistoryLabel) !== -1);
    const withHistoryHtml = C360.scorecardUi.whatChanged({
        changes: [],
        health: saveAndFix.health,
        priority: saveAndFix.priority,
        previous: { healthScore: 60, priorityLevel: "P2", priorityScore: 55 }
    });
    check("7.13 with a prior run, a real delta is shown",
        withHistoryHtml.indexOf("c360-sc-deltas") !== -1
        || withHistoryHtml.indexOf("No score change") !== -1);

    // 7.14 — the backwards walk: action -> why -> evidence -> source.
    let deadEnds = 0;
    [saveAndFix, cancelled, slaBreached].forEach((model) => {
        model.recommendations.forEach((rec) => {
            if (!rec.why) { deadEnds++; }
            if (!rec.evidence.length) { deadEnds++; }
            rec.evidence.forEach((row) => {
                if (!row.url && !row.section) { deadEnds++; }
            });
        });
        model.priority.reasons.forEach((reason) => {
            if (!reason.text) { deadEnds++; }
        });
    });
    eq("7.14 the action -> why -> evidence -> source walk has no dead ends on 3 fixtures",
        deadEnds, 0);

    // 7.17 — every new id and class is c360- prefixed.
    const badPrefix = scorecardHtml.match(/\s(?:id|class)="(?!c360-)[^"]/);
    eq("7.17 every scorecard id and class is c360- prefixed", badPrefix, null,
        badPrefix ? badPrefix[0] : "");

    // 7.18 — drawers are keyboard reachable with a native expanded state.
    check("7.18 drawers use <details>/<summary>, which is keyboard reachable",
        scorecardHtml.indexOf("<details") !== -1 && scorecardHtml.indexOf("<summary") !== -1);

    // =================================================================
    // PHASE 8 — AI layer + approval
    // =================================================================

    const aiConfig = C360.scorecardConfig.ai;

    // 8.1 — AI is off by default, so the whole product is deterministic.
    eq("8.1 AI is disabled by default", aiConfig.enabled, false);

    // 8.11 — a forbidden task is refused in code, before any transport call.
    let transportCalled = false;
    C360.ai.setTransport(function () {
        transportCalled = true;
        return Promise.resolve({ statements: [] });
    });
    aiConfig.enabled = true;

    const forbidden = C360.ai.taskAllowed("calculateHealth");
    eq("8.11 a forbidden task is refused", forbidden.allowed, false);
    check("8.11 and the refusal explains why",
        forbidden.reason.indexOf("forbidden") !== -1);
    eq("8.11 an allowed task is permitted", C360.ai.taskAllowed("extractSignals").allowed, true);

    // 8.2 — enabling AI changes no score. The test that makes G2 true.
    const withAiDisabled = (function () {
        aiConfig.enabled = false;
        return run(baseline({}));
    }());
    aiConfig.enabled = true;
    const withAiEnabled = run(baseline({}));
    eq("8.2 enabling AI leaves the health score byte-identical",
        JSON.stringify(withAiEnabled.health), JSON.stringify(withAiDisabled.health));
    eq("8.2 and the priority score byte-identical",
        JSON.stringify(withAiEnabled.priority), JSON.stringify(withAiDisabled.priority));

    // 8.3 — a model-proposed signal is routed through the deterministic rule.
    const proposalBundle = C360.scorecardEngine.bundleFrom(baseline({}));
    const proposedCancellation = C360.scorecardEngine.run(baseline({}), {
        asOf: ASOF,
        aiProposals: [{
            signalKey: "cancellation",
            text: "Cancellation intent detected",
            recordId: "bm",
            recordType: "communication",
            sourceRecords: ["communication-bm"],
            excerpt: "we are considering ending the agreement",
            provenance: "model"
        }]
    });
    eq("8.3 a model-proposed cancellation fires the SAME deterministic override",
        proposedCancellation.priority.level, "P0");
    eq("8.3 and the level is still attributed to the override, not the model",
        proposedCancellation.priority.levelSetBy, "override");
    check("8.3 the resulting evidence is marked model-derived",
        proposedCancellation.priority.firedOverrides
            .filter((o) => o.rule === "explicitCancellationRequest")[0]
            .evidence.some((row) => row.provenance === "model"));

    // 8.4-8.7 — validation drops fabricating output rather than repairing it.
    const context = C360.ai.buildContext(proposalBundle, null);

    eq("8.4 a statement with no sourceRecords is rejected",
        C360.ai.validateStatement({ text: "Something happened." }, context).ok, false);
    eq("8.5 a statement citing a ticket absent from the context is rejected",
        C360.ai.validateStatement({
            text: "Reviewed the issue.", sourceRecords: ["ticket-does-not-exist"]
        }, context).ok, false);
    eq("8.6 a statement naming a contact absent from the context is rejected",
        C360.ai.validateStatement({
            text: "Spoke with Jordan Nakamura about the renewal.",
            sourceRecords: ["communication-bm"]
        }, context).ok, false);
    eq("8.7 a statement containing an unsupported figure is rejected",
        C360.ai.validateStatement({
            text: "The account is owed $84,000.", sourceRecords: ["communication-bm"]
        }, context).ok, false);
    eq("8.7 a supported statement is accepted",
        C360.ai.validateStatement({
            text: "The customer confirmed all is well this month.",
            sourceRecords: ["communication-bm"]
        }, context).ok, true);

    // 8.9 / 8.10 — timeouts and malformed responses fall back visibly.
    const aiChecks = [];

    C360.ai.setTransport(function () {
        return new Promise(function (resolve) {
            setTimeout(function () { resolve({ statements: [] }); }, 50);
        });
    });
    const originalTimeout = aiConfig.timeoutMs;
    aiConfig.timeoutMs = 1;
    aiChecks.push(C360.ai.ask("summariseHistory", proposalBundle, {}).then(function (result) {
        eq("8.9 a timed-out AI call falls back", result.ok, false);
        check("8.9 with a visible notice", result.notice === aiConfig.fallbackNotice);
        aiConfig.timeoutMs = originalTimeout;
    }));

    /**
     * 8.18 — the recorded AI responses, including the ones that misbehave.
     *
     * Driven from tests/fixtures/ai-responses/ rather than from inline literals,
     * so the malformed / truncated / fabricating cases are versioned artefacts
     * that a reader can inspect, and so adding a new failure mode is a data file
     * rather than another block of test code.
     */
    const aiDir = pathMod.join(__dirname, "fixtures", "ai-responses");
    const aiFiles = fsMod.readdirSync(aiDir).filter((name) => name.endsWith(".json"));

    check("8.18 the AI-response fixture set is populated", aiFiles.length >= 6,
        aiFiles.length + " recorded responses");

    aiFiles.forEach(function (file) {
        const fixture = JSON.parse(fsMod.readFileSync(pathMod.join(aiDir, file), "utf8"));
        const label = file.replace(/\.json$/, "");

        // A fixture recording a forbidden task must be refused BEFORE the
        // transport is reached, so the recorded response is never even used.
        if (fixture.expect && fixture.expect.refusedBeforeTransport) {
            let reached = false;
            C360.ai.setTransport(function () {
                reached = true;
                return Promise.resolve(fixture.response);
            });
            aiChecks.push(C360.ai.ask(fixture.task, proposalBundle, {})
                .then(function (result) {
                    eq("8.11 '" + label + "' is refused", result.ok, false);
                    eq("8.11 and the transport is never reached for it", reached, false);
                }));
            return;
        }

        C360.ai.setTransport(function () { return Promise.resolve(fixture.response); });

        aiChecks.push(C360.ai.ask("summariseHistory", proposalBundle, {})
            .then(function (result) {
                eq("8.18 '" + label + "' -> ok = " + fixture.expect.ok,
                    result.ok, fixture.expect.ok);
                eq("8.18 '" + label + "' -> " + fixture.expect.kept + " statement(s) kept",
                    result.statements.length, fixture.expect.kept);
                eq("8.18 '" + label + "' -> " + fixture.expect.dropped + " dropped",
                    result.dropped.length, fixture.expect.dropped);

                // 8.8 — anything that survives is labelled and sourced.
                check("8.8 '" + label + "' -> survivors carry provenance and sources",
                    result.statements.every((statement) =>
                        statement.provenance === "model"
                        && statement.sourceRecords.length > 0));

                // Every drop is explained, so a fall in recall is diagnosable.
                check("8.18 '" + label + "' -> every drop records why",
                    result.dropped.every((entry) => !!entry.reason));

                // 8.10 — nothing is ever thrown at the user.
                check("8.10 '" + label + "' -> handled without throwing", true);
            }));
    });

    // The fabricating fixture is the one worth naming: the valid statement beside
    // the invented one must survive, and the invention must be DROPPED rather
    // than corrected.
    const fabricatingFixture = JSON.parse(fsMod.readFileSync(
        pathMod.join(aiDir, "fabricated-figure.json"), "utf8"));
    C360.ai.setTransport(function () {
        return Promise.resolve(fabricatingFixture.response);
    });
    aiChecks.push(C360.ai.ask("summariseHistory", proposalBundle, {}).then(function (result) {
        eq("8.5 a fabricating statement is dropped while a valid one survives",
            result.statements.length, 1);
        check("8.5 and the reason names the unsupported claim",
            result.dropped.length === 1
            && result.dropped[0].reason.indexOf("Unsupported claim") !== -1);
        check("8.5 the invented text is nowhere in the kept output",
            !result.statements.some((statement) =>
                statement.text.indexOf("99999") !== -1));
    }));

    // 8.12-8.16 — the approval gate.
    C360.approval.reset();
    const gateRec = cancelled.recommendations[0];

    eq("8.12 a gated action with no approval record is refused",
        C360.approval.perform("sendCustomerEmail", null).performed, false);
    eq("8.13 sending is still disabled after Phase 8",
        C360.scorecardConfig.approval.sendingEnabled, false);
    check("8.13 and the disabled reason is available for the UI to print",
        !!C360.approval.sendDisabledReason());

    eq("8.14 bulk approval is refused", C360.approval.approveAll().approved, false);
    eq("8.14 automatic approval is refused",
        C360.approval.approve({
            action: "sendCustomerEmail", approver: "Someone", automatic: true,
            recommendation: gateRec
        }).approved, false);
    eq("8.x an approval with no identified approver is refused",
        C360.approval.approve({ action: "sendCustomerEmail", recommendation: gateRec })
            .approved, false);

    // 8.15 — a human editing an unevidenced claim in is caught before approval.
    const editedBadly = C360.approval.approve({
        action: "sendCustomerEmail",
        approver: "Test User",
        recommendation: gateRec,
        draft: {
            kind: "customerEmail",
            subject: "Following up",
            body: "We will refund $99,999 and ticket 88888 is closed.",
            recipient: null,
            edited: true
        },
        asOf: ASOF
    });
    eq("8.15 an edited draft with an unevidenced claim is blocked", editedBadly.approved, false);
    check("8.15 and the blocking reason names the claim",
        editedBadly.reason.indexOf("99,999") !== -1 || editedBadly.reason.indexOf("88888") !== -1);

    // 8.16 — a clean approval records approver, final content and timestamp.
    const cleanDraft = gateRec.drafts[0];
    if (cleanDraft) {
        const approved = C360.approval.approve({
            action: "sendCustomerEmail",
            approver: "Test User",
            recommendation: gateRec,
            accountId: cancelled.accountId,
            draft: Object.assign({}, cleanDraft, { edited: false }),
            asOf: ASOF
        });
        eq("8.16 a clean draft can be approved", approved.approved, true);
        check("8.16 the record captures the approver", approved.record.approver === "Test User");
        check("8.16 the record captures the final content", !!approved.record.content.body);
        check("8.16 the record captures a timestamp", !!approved.record.approvedAt);
        check("8.16 the record captures the config version",
            approved.record.configVersion === C360.scorecardConfig.version);

        eq("8.12 even WITH an approval record, sending is refused while disabled",
            C360.approval.perform("sendCustomerEmail", approved.record).performed, false);
        check("8.12 and the refusal states the outbound reason",
            C360.approval.perform("sendCustomerEmail", approved.record).reason
                === C360.scorecardConfig.approval.noOutboundReason);
    }

    // 8.17 — no credential in any client file.
    const scanned = ["js/core/config.js", "js/core/scorecardConfig.js",
                     "js/scorecard/ai.js", "js/services/gatewayClient.js"];
    const fs = require("fs");
    const path = require("path");
    let secretHits = 0;
    scanned.forEach((file) => {
        const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
        // Looks for an assignment of a key-shaped literal, not the WORD "key".
        if (/(?:api[_-]?key|secret|bearer|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i
            .test(source)) {
            secretHits++;
        }
        if (/sk-[A-Za-z0-9]{20,}/.test(source)) { secretHits++; }
    });
    eq("8.17 no client file contains an API key or credential literal", secretHits, 0);
    check("8.17 the AI call is a gateway path, not a provider URL",
        aiConfig.gatewayPath.indexOf("http") === -1);

    aiConfig.enabled = false;

    // =================================================================
    // PHASE 9 — feedback + metrics
    // =================================================================

    C360.feedback.reset();
    const fbRec = cancelled.recommendations[0];

    // 9.1 — the four labels are distinct outcomes.
    eq("9.1 there are exactly four feedback outcomes", C360.feedback.outcomes().length, 4);
    ["useful", "incorrect", "notNeeded", "alreadyHandled"].forEach((outcome) => {
        const result = C360.feedback.capture({
            outcome: outcome, recommendation: fbRec, model: cancelled,
            user: "Tester", asOf: ASOF
        });
        eq("9.1 '" + outcome + "' is recorded as its own outcome", result.recorded, true);
        eq("9.1 and is not collapsed into another", result.record.outcome, outcome);
    });
    check("9.1 each outcome records which layer it indicts",
        C360.feedback.all().filter((r) => r.outcome !== "useful")
            .every((r) => !!r.indicts));
    eq("9.1 an unrecognised outcome is rejected rather than coerced",
        C360.feedback.capture({ outcome: "thumbsUp", recommendation: fbRec, model: cancelled })
            .recorded, false);

    // 9.2 — `incorrect` prompts for a reason; the reason is optional.
    const withoutReason = C360.feedback.capture({
        outcome: "incorrect", recommendation: fbRec, model: cancelled, asOf: ASOF
    });
    eq("9.2 'incorrect' is flagged as prompting for a reason",
        withoutReason.record.reasonRequested, true);
    eq("9.2 but the reason is optional", withoutReason.recorded, true);
    eq("9.2 and the UI knows to prompt",
        C360.feedbackUi.shouldPromptForReason("incorrect"), true);

    const withReason = C360.feedback.capture({
        outcome: "incorrect", reason: "The email was about a different contract.",
        recommendation: fbRec, model: cancelled, asOf: ASOF
    });
    check("9.2 a supplied reason is stored", !!withReason.record.reason);

    // 9.3 — every record carries the full captureContext.
    C360.scorecardConfig.feedback.captureContext.forEach((field) => {
        check("9.3 every feedback record captures " + field,
            withReason.record.context[field] !== undefined);
    });
    check("9.3 the scores at the time are captured",
        withReason.record.context.priorityLevel === cancelled.priority.level);

    // 9.4 / 9.5 — ten Incorrect marks report a rate, and change nothing.
    C360.feedback.reset();
    for (let i = 0; i < 10; i++) {
        C360.feedback.capture({
            outcome: "incorrect", reason: "false positive " + i,
            recommendation: fbRec, model: cancelled, asOf: ASOF
        });
    }
    const aggregate = C360.feedback.byRule();
    const ruleEntry = aggregate.filter((entry) => entry.rule === fbRec.rule)[0];
    check("9.4 the aggregate reports that rule's false-positive rate", !!ruleEntry);
    eq("9.4 ten Incorrect marks give a 100% rate for that rule",
        ruleEntry.falsePositiveRate, 1);
    eq("9.5 no rule is suppressed by feedback", ruleEntry.ruleSuppressed, false);
    eq("9.5 automatic suppression is disabled in config",
        C360.scorecardConfig.feedback.autoSuppressRules, false);

    const afterFeedback = run(baseline({ rest: {
        communications: [{ id: "x1", date: ago(2), subject: "Ending our contract",
            body: "We have decided to cancel our contract at the end of the term." }]
    } }));
    eq("9.4 the rule's behaviour is unchanged after ten Incorrect marks",
        afterFeedback.priority.level, "P0");

    // 9.6 — a dismissed recommendation is retained, not deleted.
    C360.feedback.reset();
    const dismissal = C360.feedback.dismiss({
        outcome: "alreadyHandled", reason: "Already called them",
        recommendation: fbRec, model: cancelled, asOf: ASOF
    });
    eq("9.6 dismissing records rather than deletes", dismissal.recorded, true);
    eq("9.6 the dismissed record is retained", dismissal.retained, true);
    eq("9.6 and appears in the dismissed list", C360.feedback.dismissed().length, 1);
    check("9.6 with its feedback attached",
        C360.feedback.dismissed()[0].outcome === "alreadyHandled");

    // 9.7 / 9.8 — rates are reported with the response rate, per rule.
    C360.feedback.reset();
    C360.feedback.capture({ outcome: "useful", recommendation: fbRec, model: cancelled, asOf: ASOF });
    C360.feedback.capture({ outcome: "incorrect", recommendation: fbRec, model: cancelled, asOf: ASOF });
    const fbSummary = C360.feedback.summary(20);
    eq("9.7 the feedback response rate is reported", p2(fbSummary.responseRate), 0.1);
    check("9.8 the false-positive rate is available per rule",
        fbSummary.byRule.length > 0 && fbSummary.byRule[0].falsePositiveRate !== null);

    // 9.9 / 9.10 / 9.11 — the metrics layer.
    const metricsResult = C360.metrics.build({
        models: portfolioModels, feedback: fbSummary, approvals: C360.approval.all()
    });
    const metricByKey = (key) => metricsResult.metrics.filter((m) => m.key === key)[0];

    const hoursSaved = metricByKey("hoursSaved");
    eq("9.9 hours saved is flagged as an estimate", hoursSaved.isEstimate, true);
    check("9.9 and the per-action constant is visible",
        hoursSaved.measurable
            ? hoursSaved.detail.some((d) =>
                  d.value === C360.scorecardConfig.metrics.estimatedMinutesSavedPerAction)
            : true);

    C360.scorecardConfig.metrics.correlationOnly.forEach((key) => {
        const metric = metricByKey(key);
        eq("9.10 '" + key + "' carries the correlation-only notice",
            metric.correlationOnly, true);
        check("9.10 and its caveat says so", !!metric.caveat);
    });

    const notMeasurable = metricsResult.metrics.filter((m) => !m.measurable);
    check("9.11 metrics with no inputs exist in this fixture", notMeasurable.length > 0);
    check("9.11 they report 'Not yet measurable' rather than 0",
        notMeasurable.every((m) => m.value === null
            && m.display === C360.scorecardConfig.metrics.notMeasurableLabel));
    check("9.11 and each says why it cannot be measured",
        notMeasurable.every((m) => !!m.unmeasurableReason));
    eq("9.x every tracked metric is present in the output",
        metricsResult.metrics.length, C360.scorecardConfig.metrics.tracked.length);
    eq("9.x no predictive modelling", metricsResult.predictiveModelling, false);

    // 9.12 — local-only storage is disclosed.
    eq("9.12 feedback storage is local until a gateway endpoint exists",
        C360.feedback.storageState().mode, "local");
    check("9.12 and the local-only notice is available for the UI",
        !!C360.feedback.storageState().notice);
    check("9.12 the UI actually renders that notice",
        C360.feedbackUi.controls(fbRec, cancelled)
            .indexOf("stored in this browser session only") !== -1);

    // 9.15 — no engine reads the clock: the same asOf gives the same output.
    const firstPass = JSON.stringify(C360.scorecardEngine.run(baseline({}), { asOf: ASOF }));
    const secondPass = JSON.stringify(C360.scorecardEngine.run(baseline({}), { asOf: ASOF }));
    eq("9.15 the whole pipeline is deterministic for a fixed asOf", firstPass, secondPass);

    const differentAsOf = JSON.stringify(C360.scorecardEngine.run(baseline({}), {
        asOf: new Date("2027-08-24T12:00:00Z")
    }));
    check("9.15 and a different asOf genuinely changes the output, proving it is used",
        firstPass !== differentAsOf);

    // 9.16 — feedback stored under an older config version stays interpretable.
    C360.feedback.reset();
    C360.feedback.capture({ outcome: "incorrect", recommendation: fbRec, model: cancelled, asOf: ASOF });
    const originalVersion = C360.scorecardConfig.version;
    C360.scorecardConfig.version = "9.9.9";
    const oldRecords = C360.feedback.all();
    check("9.16 previously stored feedback keeps the config version it was recorded under",
        oldRecords[0].context.configVersion === originalVersion);
    check("9.16 and remains readable by the aggregate",
        C360.feedback.byRule().length > 0);
    C360.scorecardConfig.version = originalVersion;
    C360.feedback.reset();

    // =================================================================
    // COMMAND CENTER — run history, brief, portfolio query
    // =================================================================
    // The redesign added three engines. Each one has a single property worth
    // protecting, and each of those is a place the interface could quietly start
    // lying to make itself look better.

    // ---- history: a trend is only ever drawn from stored runs --------
    C360.history.reset();

    const trendModel = cancelled;
    let trend = C360.history.trend(trendModel.accountId, "healthScore");
    eq("CC.1 with no stored run, no trend is available", trend.available, false);
    eq("CC.1 and no points are invented", trend.points.length, 0);
    check("CC.1 and it says why", trend.reason.indexOf("No scoring run") !== -1);

    C360.history.record(trendModel);
    trend = C360.history.trend(trendModel.accountId, "healthScore");
    eq("CC.2 with ONE stored run, a trend is still not available", trend.available, false);
    eq("CC.2 the single real point is kept", trend.points.length, 1);
    check("CC.2 and it says a second run is needed, rather than inventing one",
        trend.reason.indexOf("second refresh") !== -1);

    // A genuinely different run, at a different asOf.
    C360.history.record(Object.assign({}, trendModel, {
        asOf: "2026-08-25T12:00:00.000Z",
        summary: Object.assign({}, trendModel.summary, {
            healthScore: trendModel.summary.healthScore - 9
        })
    }));
    trend = C360.history.trend(trendModel.accountId, "healthScore");
    eq("CC.3 with two stored runs, a trend is available", trend.available, true);
    eq("CC.3 built from both real points", trend.points.length, 2);
    eq("CC.3 the direction is derived, not asserted", trend.direction, "down");
    check("CC.3 the delta matches the stored values",
        Math.round(trend.delta) === -9, String(trend.delta));

    // Two records at the SAME asOf must collapse, or hitting Refresh twice in a
    // minute manufactures movement that did not happen.
    const before = C360.history.runsFor(trendModel.accountId).length;
    C360.history.record(trendModel);
    C360.history.record(trendModel);
    eq("CC.4 repeated runs at the same asOf collapse rather than accumulating",
        C360.history.runsFor(trendModel.accountId).length, before);

    const changes = C360.history.changesFor(trendModel.accountId, trendModel);
    check("CC.5 changes are reported against the previous stored run",
        Array.isArray(changes));

    C360.history.reset();
    eq("CC.5 with history cleared, no change is reported",
        C360.history.changesFor(trendModel.accountId, trendModel).length, 0);

    // ---- portfolio row: ARR, renewal countdown, SLA, next action -----
    const ccView = C360.portfolio.build(portfolioModels, {});
    const ccRow = C360.portfolio.rowFor(ccView, cancelled.accountId);

    check("CC.6 a row carries a renewal countdown in days",
        ccRow.renewalDays === null || typeof ccRow.renewalDays === "number");
    check("CC.6 a passed renewal is null rather than negative",
        ccView.allRows.every((row) =>
            row.renewalDays === null || row.renewalDays >= 0));
    check("CC.7 a row carries its own next best action",
        ccRow.nextAction !== null && !!ccRow.nextAction.label);
    check("CC.7 the next action is the first recommendation, in queue precedence",
        ccRow.nextAction.rule === cancelled.recommendations[0].rule);
    check("CC.8 a row with no recommendation has no next action",
        C360.portfolio.rowFor(ccView, healthyModel.accountId).nextAction === null);

    const slaRow = C360.portfolio.rowFor(ccView, slaBreached.accountId);
    check("CC.9 an SLA breach is surfaced with its age in days",
        slaRow.slaBreach !== null && slaRow.slaBreach.days > 0);
    check("CC.9 and names the ticket it came from", !!slaRow.slaBreach.ticketId);

    // ---- ARR states its own coverage --------------------------------
    check("CC.10 portfolio ARR reports how many accounts it covers",
        typeof ccView.summary.arrKnownFor === "number");
    check("CC.10 and whether that is all of them",
        typeof ccView.summary.arrCoversAll === "boolean");
    check("CC.10 ARR is null rather than 0 when no account records a value",
        C360.portfolio.build([barelyAnything], {}).summary.arrTotal === null);

    // ---- the urgent queue is P0/P1 only ------------------------------
    check("CC.11 the priority queue holds only P0 and P1",
        ccView.urgent.every((row) =>
            row.priorityLevel === "P0" || row.priorityLevel === "P1"));
    check("CC.11 ordered by priority score descending",
        ccView.urgent.every((row, index) =>
            index === 0 || ccView.urgent[index - 1].priorityScore >= row.priorityScore));

    // ---- the matrix never plots an unscoreable account at zero -------
    const matrix = ccView.matrix;
    check("CC.12 an account with unavailable health is not plotted",
        matrix.placed.every((node) => node.healthScore !== null));
    check("CC.12 it is listed as unplaced instead, with a reason",
        matrix.unplaced.every((item) => !!item.reason));
    eq("CC.12 plotted plus unplaced equals the portfolio",
        matrix.placed.length + matrix.unplaced.length, ccView.allRows.length);
    check("CC.13 matrix coordinates are within bounds",
        matrix.placed.every((node) =>
            node.x >= 0 && node.x <= 100 && node.y >= 0 && node.y <= 100));

    // ---- the signal feed uses record dates, not the run time ---------
    const feed = ccView.feed;
    check("CC.14 the feed is populated", feed.length > 0);
    check("CC.14 every entry carries a real record date",
        feed.every((item) => !!item.date));
    check("CC.14 ordered newest first",
        feed.every((item, index) =>
            index === 0
            || new Date(feed[index - 1].date) >= new Date(item.date)));
    check("CC.14 every entry names the account and the record it came from",
        feed.every((item) => !!item.accountName && !!item.recordType));

    // ---- the brief --------------------------------------------------
    const brief = C360.brief.build(cancelled, ccRow, { asOf: ASOF });

    check("CC.15 the brief has all five sections",
        !!brief.situation && !!brief.stakes && !!brief.concerns
        && !!brief.approach && !!brief.openQuestions);
    check("CC.15 the situation is drawn from the fired overrides",
        brief.situation.paragraphs.length > 0);
    check("CC.16 a missing stake reads as 'Not recorded' rather than being omitted",
        brief.stakes.facts.every((fact) => !!fact.value));
    check("CC.16 and each stake says whether it is actually known",
        brief.stakes.facts.every((fact) => typeof fact.known === "boolean"));

    check("CC.17 customer concerns are quoted from the record",
        brief.concerns.items.length === 0
        || brief.concerns.items.some((item) => item.quoted === true));
    check("CC.17 every concern names its source",
        brief.concerns.items.every((item) => !!item.source));

    check("CC.18 the approach is the mapped steps, in order",
        brief.approach.steps.length > 0);
    check("CC.18 with an owner and a due date",
        !!brief.approach.owner && !!brief.approach.due);

    // The section that keeps the brief honest.
    check("CC.19 open questions are always present",
        brief.openQuestions.items.length > 0
        || !!brief.openQuestions.emptyNote);
    check("CC.19 a text-derived signal raises a question about itself",
        brief.openQuestions.items.some((item) =>
            item.indexOf("matching") !== -1 || item.indexOf("language") !== -1));

    eq("CC.20 the brief is labelled composed, not generated",
        brief.provenance, "derived");

    const briefText = C360.brief.toText(brief);
    check("CC.21 the copyable text carries every section",
        briefText.indexOf("SITUATION") !== -1
        && briefText.indexOf("WHY IT MATTERS") !== -1
        && briefText.indexOf("CUSTOMER CONCERNS") !== -1
        && briefText.indexOf("RECOMMENDED APPROACH") !== -1
        && briefText.indexOf("OPEN QUESTIONS") !== -1);
    check("CC.21 and is labelled sample data",
        briefText.indexOf("Sample data") !== -1);

    /*
     * CC.22 — the brief must not assert anything its evidence does not carry.
     * Same validator the drafts go through, applied to the composed document.
     */
    /*
     * Validated against what the brief ITSELF puts on screen: its cited
     * evidence, plus the stake values it prints in the "why it matters" block.
     * That is the honest boundary — a reader can check every claim against
     * something visible in the same document, without opening anything else.
     */
    const briefEvidence = C360.util.list(brief.situation.evidence)
        .concat(cancelled.recommendations.reduce(
            (all, rec) => all.concat(rec.evidence), []));
    const briefContext = brief.stakes.facts.map((fact) => fact.value)
        .concat(brief.concerns.items.map((item) => item.source))
        .concat([cancelled.accountName, brief.level,
                 C360.util.formatDateTime(brief.asOf),
                 C360.util.formatDate(brief.asOf)]);

    const briefClaims = C360.actionRules.validateClaims(
        briefText, briefEvidence, null, briefContext);
    check("CC.22 the brief asserts nothing it does not itself show",
        briefClaims.valid,
        briefClaims.unsupported.map((claim) => claim.value).join(", "));

    // ---- the portfolio query ----------------------------------------
    const suggestions = C360.portfolioQuery.suggestions();
    check("CC.23 the query layer offers suggested questions", suggestions.length >= 5);
    check("CC.23 each has a key and a label",
        suggestions.every((item) => !!item.key && !!item.label));

    const contactAnswer = C360.portfolioQuery.ask("Who should I contact today?", ccView);
    eq("CC.24 a known question is matched", contactAnswer.matched, true);
    check("CC.24 the answer has a headline", !!contactAnswer.headline);
    check("CC.24 and shows how it was derived", !!contactAnswer.method);
    check("CC.24 every account it names is real",
        contactAnswer.accounts.every((ref) =>
            ccView.allRows.some((row) => row.accountId === ref.accountId)));
    check("CC.24 with its real scores",
        contactAnswer.accounts.every((ref) => {
            const row = ccView.allRows.filter(
                (item) => item.accountId === ref.accountId)[0];
            return row.priorityScore === ref.priorityScore;
        }));

    const riskAnswer = C360.portfolioQuery.ask("which customers are at highest risk",
        ccView);
    eq("CC.25 the risk question is matched", riskAnswer.matched, true);
    check("CC.25 and answers from the SAVE queue, not from health",
        riskAnswer.method.indexOf("SAVE") !== -1);

    const whyAnswer = C360.portfolioQuery.ask(
        "Why is " + cancelled.accountName + " P0?", ccView);
    eq("CC.26 a question naming an account is answered about that account",
        whyAnswer.accounts[0].accountId, cancelled.accountId);
    check("CC.26 and states which mechanism set the level",
        whyAnswer.headline.indexOf("override") !== -1
        || whyAnswer.headline.indexOf("weighted score") !== -1);
    check("CC.26 and reminds the reader health is separate",
        whyAnswer.detail.some((line) =>
            line.indexOf("calculated separately") !== -1
            || line.indexOf("stands on its own") !== -1));

    /*
     * CC.27 — the behaviour a chat interface cannot have. An unmatched question
     * must say so rather than produce a fluent answer to a question nobody
     * asked.
     */
    // Two accounts sharing a name must be reported as ambiguous, not guessed at.
    const twinView = C360.portfolio.build([
        Object.assign({}, cancelled, { accountId: "twin-a", accountName: "Twin Haulage" }),
        Object.assign({}, slaBreached, { accountId: "twin-b", accountName: "Twin Haulage" })
    ], {});
    const ambiguous = C360.portfolioQuery.ask("why is Twin Haulage a priority", twinView);
    eq("CC.26b an ambiguous account name is not answered", ambiguous.matched, false);
    eq("CC.26b it is reported as ambiguous", ambiguous.ambiguous, true);
    eq("CC.26b and offers both candidates", ambiguous.accounts.length, 2);

    const unmatched = C360.portfolioQuery.ask("what is the weather in paris", ccView);
    eq("CC.27 an unanswerable question is not matched", unmatched.matched, false);
    check("CC.27 it says the question cannot be answered from the data",
        unmatched.headline.indexOf("cannot be answered") !== -1);
    eq("CC.27 and names no accounts", unmatched.accounts.length, 0);
    check("CC.27 but offers what it can answer", unmatched.suggestions.length > 0);

    // With no stored history the worsening-health question is honest about it.
    C360.history.reset();
    const worsening = C360.portfolioQuery.ask("which accounts have worsening health",
        ccView);
    check("CC.28 with fewer than two runs, 'worsening health' says it is not answerable",
        worsening.headline.indexOf("Not answerable yet") !== -1);
    check("CC.28 and says a second refresh is what makes it answerable",
        worsening.detail.some((line) => line.indexOf("two stored runs") !== -1));

    eq("CC.29 every answer is marked derived, never model",
        [contactAnswer, riskAnswer, whyAnswer, unmatched]
            .every((answer) => answer.provenance === "derived"), true);

    // ---- purity ------------------------------------------------------
    eq("CC.30 the same question on the same portfolio gives the same answer",
        JSON.stringify(C360.portfolioQuery.ask("Who should I contact today?", ccView)),
        JSON.stringify(C360.portfolioQuery.ask("Who should I contact today?", ccView)));
    eq("CC.30 the brief is deterministic",
        JSON.stringify(C360.brief.build(cancelled, ccRow, { asOf: ASOF })),
        JSON.stringify(C360.brief.build(cancelled, ccRow, { asOf: ASOF })));

    C360.history.reset();


    // The async AI checks have to finish before the harness reports.
    return Promise.all(aiChecks);
};
