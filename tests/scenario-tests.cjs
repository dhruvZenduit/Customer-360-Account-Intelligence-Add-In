/**
 * Customer 360 — CONSOLIDATED SCENARIO SUITE  (Phase 9 §5)
 * ========================================================
 * The regression net for the whole product. Ten scenarios from the phase plan
 * plus the Phase 9 additions, each run through the FULL pipeline —
 * identity, segment, health, priority, overrides, queues, actions — and checked
 * against its expected level and queue.
 *
 * Scenario definitions live in `tests/fixtures/scenarios/*.json` so the
 * expectations are readable without reading JavaScript, and so a new scenario is
 * a data file rather than a code change.
 *
 * EVERY SCENARIO IS DETERMINISTIC. Dates are offsets from a fixed `asOf` that is
 * injected into the engines, there is no `Date.now()` in any assertion, and no
 * randomness anywhere. Running this twice must give the same answer, or the
 * suite cannot be used to judge a config change.
 *
 * The scenario that matters most is `healthy-plus-critical`: high health AND
 * P0/P1 priority. It is the independence check. If it fails, priority is a
 * function of health and the product's central claim is false — no other passing
 * test compensates for it.
 */

"use strict";

const fs = require("fs");
const path = require("path");

module.exports = function (harness) {

    const C360 = harness.C360;
    const check = harness.check;
    const eq = harness.eq;

    /** Fixed reference point. Nothing in the suite reads the clock. */
    const ASOF = new Date("2026-08-24T12:00:00Z");

    function shift(days) {
        const d = new Date(ASOF);
        d.setDate(d.getDate() + days);
        return d.toISOString();
    }

    /**
     * Resolve the relative date tokens a scenario file uses.
     *
     *   "-14d"  fourteen days before asOf
     *   "+61d"  sixty-one days after asOf
     *
     * Relative rather than absolute so a scenario keeps meaning what it means —
     * an absolute "renewal 2026-10-24" silently stops being "renewal in 61 days"
     * the moment anybody changes asOf.
     */
    function resolveDates(value) {
        if (typeof value === "string") {
            const match = value.match(/^([+-])(\d+)d$/);
            if (match) {
                return shift(match[1] === "-" ? -Number(match[2]) : Number(match[2]));
            }
            return value;
        }
        if (Array.isArray(value)) { return value.map(resolveDates); }
        if (value && typeof value === "object") {
            const out = {};
            Object.keys(value).forEach((key) => { out[key] = resolveDates(value[key]); });
            return out;
        }
        return value;
    }

    const N = C360.normalize;

    /** Build the engine bundle from a scenario's raw record lists. */
    function bundleFor(scenario) {
        const raw = resolveDates(scenario.data || {});

        return {
            account: N.account(raw.account),
            quotes: N.quotes(raw.quotes || []),
            orders: N.orders(raw.orders || []),
            tickets: N.tickets(raw.tickets || []),
            billingIssues: N.escalations(raw.billingIssues || [], "billing"),
            technicalIssues: N.escalations(raw.technicalIssues || [], "technical"),
            reviews: N.reviews(raw.reviews || []),
            contacts: N.contacts(raw.contacts || []),
            website: raw.website || null,
            external: N.external(raw.external || []),
            geotab: null,

            // Extended scorecard sources. `undefined` is preserved for
            // commitments so "not tracked" stays distinct from "none".
            deviceHealth: raw.deviceHealth === undefined ? null : raw.deviceHealth,
            portalUsage: raw.portalUsage === undefined ? null : raw.portalUsage,
            contract: raw.contract === undefined ? null : raw.contract,
            commitments: raw.commitments,
            communications: raw.communications || [],
            outcomes: raw.outcomes === undefined ? null : raw.outcomes
        };
    }

    // -----------------------------------------------------------------
    // Load and run
    // -----------------------------------------------------------------

    const dir = path.join(__dirname, "fixtures", "scenarios");
    const files = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort();

    check("9.13 the scenario fixture directory is populated", files.length >= 10,
        files.length + " scenario files found");

    const results = {};

    files.forEach((file) => {
        const scenario = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
        const label = scenario.name || file.replace(/\.json$/, "");
        const expect = scenario.expect || {};

        let model;
        try {
            model = C360.scorecardEngine.run(bundleFor(scenario), { asOf: ASOF });
        } catch (error) {
            check("9.13 scenario '" + label + "' runs through the full pipeline", false,
                error.message);
            return;
        }

        results[scenario.id || label] = model;

        // ---- priority level ------------------------------------------
        if (expect.level) {
            const levels = [].concat(expect.level);
            check("9.13 " + label + " -> priority " + levels.join(" or "),
                levels.indexOf(model.priority.level) !== -1,
                "got " + model.priority.level + " (score "
                    + model.priority.score.toFixed(1) + ", set by "
                    + model.priority.levelSetBy + ")");
        }

        // ---- queue ----------------------------------------------------
        if (expect.queue !== undefined) {
            const expected = expect.queue === null ? null : String(expect.queue).toLowerCase();
            check("9.13 " + label + " -> queue " + (expected === null ? "none" : expected),
                model.queues.primaryQueue === expected,
                "got " + String(model.queues.primaryQueue));
        }

        // ---- health band / range -------------------------------------
        if (expect.healthAtLeast !== undefined) {
            check("9.13 " + label + " -> health at least " + expect.healthAtLeast,
                model.health.available && model.health.score >= expect.healthAtLeast,
                "got " + (model.health.available
                    ? model.health.score.toFixed(1) : "unavailable"));
        }
        if (expect.healthAtMost !== undefined) {
            check("9.13 " + label + " -> health at most " + expect.healthAtMost,
                model.health.available && model.health.score <= expect.healthAtMost,
                "got " + (model.health.available
                    ? model.health.score.toFixed(1) : "unavailable"));
        }
        if (expect.healthAvailable !== undefined) {
            eq("9.13 " + label + " -> health available = " + expect.healthAvailable,
                model.health.available, expect.healthAvailable);
        }

        // ---- overrides ------------------------------------------------
        [].concat(expect.overridesFired || []).forEach((rule) => {
            check("9.13 " + label + " -> override '" + rule + "' fired",
                model.priority.firedOverrides.some((o) => o.rule === rule),
                "fired: " + model.priority.firedOverrides
                    .map((o) => o.rule).join(", "));
        });
        [].concat(expect.overridesNotFired || []).forEach((rule) => {
            check("9.13 " + label + " -> override '" + rule + "' did NOT fire",
                !model.priority.firedOverrides.some((o) => o.rule === rule));
        });

        // ---- confidence ----------------------------------------------
        if (expect.confidenceAtMost !== undefined) {
            check("9.13 " + label + " -> confidence at most " + expect.confidenceAtMost + "%",
                model.health.confidence.pct <= expect.confidenceAtMost,
                "got " + model.health.confidence.pct + "%");
        }
        if (expect.hasLimitations) {
            check("9.13 " + label + " -> reports its data limitations",
                model.health.confidence.limitations.length > 0);
        }

        // ---- invariants every scenario must satisfy -------------------
        check("9.13 " + label + " -> priority reasons are never empty",
            model.priority.reasons.length > 0);
        check("9.13 " + label + " -> a primary reason is always set",
            !!model.priority.primaryReason);
        check("9.13 " + label + " -> no category is ever scored 0 for want of data",
            model.health.categories.every((category) =>
                category.available || category.score === null));
        check("9.13 " + label + " -> every queue entry carries evidence",
            model.queues.queues.every((queue) =>
                queue.rules.every((rule) => rule.evidence.length > 0)));
        check("9.13 " + label + " -> every recommendation carries all mandatory parts",
            model.recommendations.every((rec) =>
                !!rec.why && rec.evidence.length > 0 && rec.action.steps.length > 0
                && !!rec.owner.label && !!rec.due.label && !!rec.confidence));
        check("9.13 " + label + " -> no draft is sendable",
            model.recommendations.every((rec) =>
                rec.drafts.every((d) => d.sendable === false && d.status === "draft")));

        // ---- determinism ----------------------------------------------
        eq("9.15 " + label + " -> is deterministic across runs",
            JSON.stringify(C360.scorecardEngine.run(bundleFor(scenario), { asOf: ASOF })),
            JSON.stringify(model));
    });

    // =================================================================
    // 9.14 — THE independence check, stated once more on its own
    // =================================================================
    const healthy = results["healthy"];
    const healthyPlusCritical = results["healthy-plus-critical"];

    if (healthy && healthyPlusCritical) {
        check("9.14 the healthy scenario is healthy and routine",
            healthy.health.score >= 70 && healthy.priority.level === "P3",
            "health " + healthy.health.score.toFixed(1)
                + " / " + healthy.priority.level);

        check("9.14 the same account plus one critical issue stays HEALTHY",
            healthyPlusCritical.health.available
            && healthyPlusCritical.health.score >= 40,
            "health " + (healthyPlusCritical.health.available
                ? healthyPlusCritical.health.score.toFixed(1) : "unavailable"));

        check("9.14 but becomes P0 or P1 — health and priority are independent",
            ["P0", "P1"].indexOf(healthyPlusCritical.priority.level) !== -1,
            "priority " + healthyPlusCritical.priority.level);

        // The strongest form of the claim: the two scores moved in genuinely
        // different directions off the same fixture.
        check("9.14 priority moved sharply while health barely moved",
            (healthy.health.score - healthyPlusCritical.health.score) < 25
            && healthyPlusCritical.priority.score > healthy.priority.score,
            "health " + healthy.health.score.toFixed(1) + " -> "
                + healthyPlusCritical.health.score.toFixed(1)
                + ", priority " + healthy.priority.score.toFixed(1) + " -> "
                + healthyPlusCritical.priority.score.toFixed(1));
    } else {
        check("9.14 both independence scenarios are present", false,
            "missing 'healthy' or 'healthy-plus-critical'");
    }
};
