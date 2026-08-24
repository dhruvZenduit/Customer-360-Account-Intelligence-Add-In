/**
 * Customer 360 — SCORECARD ENGINE  (Phase 2+)
 * ===========================================
 * The single entry point, mirroring `js/intelligence/intelligenceEngine.js`:
 *
 *     normalised bundle + intelligence model
 *              |
 *              v
 *          IDENTITY            one account across every source system
 *              |
 *          SEGMENT / LIFECYCLE per-segment expectations
 *              |
 *          HEALTH              5 categories -> weighted 0-100  + CONFIDENCE
 *              |
 *          PRIORITY            overrides (a floor) -> weighted 0-100 -> P0-P3
 *              |
 *          QUEUES              SAVE / FIX / GROW / ENGAGE
 *              |
 *          ACTIONS             why / evidence / action / owner / due / draft
 *
 * Health and priority sit on the same evidence base and are computed
 * independently — priority never reads `health.score`. That is what allows
 * `Health 75 / Priority P0` and `Health 42 / Priority P3` to both be true.
 *
 * ---------------------------------------------------------------------------
 * THE EXTENDED BUNDLE
 * ---------------------------------------------------------------------------
 * The scorecard reads five inputs the existing Customer 360 does not have a
 * service for. They are OPTIONAL. Absent means `Data unavailable` — never zero,
 * and never invented (G3, G7):
 *
 *   deviceHealth   { available, deviceCount, notCommunicating,
 *                    cameraAvailabilityPct, asOf }
 *   portalUsage    { available, activeUsers, previousActiveUsers, changePct, asOf }
 *   hosActivity    { available, state, asOf }
 *   outcomes       { available, trainingCompleted, recommendationsImplemented,
 *                    improvements: [{ label, change, date }] }
 *   communications [ { id, date, direction, subject, body, author } ]
 *   contract       { id, startDate, renewalDate, cancelledDate,
 *                    cancellationRequested, annualValue, pastDueAmount }
 *   commitments    [ { id, description, dueDate, completedDate, owner } ]
 *                  — or NULL, meaning "not a tracked source in this deployment",
 *                    which is a different statement from "none outstanding" and
 *                    is reported as an unavailable factor rather than a zero.
 *
 * Shaping lives here rather than in `js/intelligence/normalize.js` because
 * Phase 1 forbids touching the intelligence tree, and because these sources are
 * the scorecard's own concern.
 *
 * Pure: `asOf` is injected by the caller and never read from the clock.
 */

"use strict";

C360.scorecardEngine = (function () {

    var util = C360.util;

    /** Number, or null. Never coerces a missing value to 0 (G3). */
    function numOrNull(value) {
        if (value === null || value === undefined || value === "") { return null; }
        var n = Number(value);
        return isNaN(n) ? null : n;
    }

    function dateOrNull(value) {
        var d = util.toDate(value);
        return d ? d.toISOString() : null;
    }

    // -----------------------------------------------------------------
    // Shaping the extended sources
    // -----------------------------------------------------------------

    /**
     * `available: false` is the honest default. A device-health object that
     * exists but carries no device count is not device-health data.
     */
    function shapeDeviceHealth(raw) {
        if (!raw) { return null; }
        var deviceCount = numOrNull(raw.deviceCount);
        var notCommunicating = numOrNull(raw.notCommunicating);

        return {
            id: raw.id || "device-health",
            type: "device",
            available: raw.available !== false
                && (deviceCount !== null || raw.cameraAvailabilityPct !== undefined),
            deviceCount: deviceCount,
            notCommunicating: notCommunicating,
            cameraCount: numOrNull(raw.cameraCount),
            cameraAvailabilityPct: numOrNull(raw.cameraAvailabilityPct),
            asOf: dateOrNull(raw.asOf),
            source: "internal",
            sourceLabel: raw.sourceLabel || "Device health",
            mock: raw.mock === true
        };
    }

    function shapePortalUsage(raw) {
        if (!raw) { return null; }
        var active = numOrNull(raw.activeUsers);
        var previous = numOrNull(raw.previousActiveUsers);

        // Derived only when BOTH periods exist. A single reading is not a trend,
        // and calling it one would invent a direction the data does not have.
        var changePct = numOrNull(raw.changePct);
        if (changePct === null && active !== null && previous !== null && previous > 0) {
            changePct = ((active - previous) / previous) * 100;
        }

        return {
            type: "portal-usage",
            available: raw.available !== false && (active !== null || changePct !== null),
            activeUsers: active,
            previousActiveUsers: previous,
            changePct: changePct,
            logins30d: numOrNull(raw.logins30d),
            asOf: dateOrNull(raw.asOf),
            source: "internal",
            sourceLabel: raw.sourceLabel || "Portal usage",
            mock: raw.mock === true
        };
    }

    function shapeContract(raw) {
        if (!raw) { return null; }
        return {
            id: raw.id ? String(raw.id) : "contract",
            type: "contract",
            accountId: raw.accountId ? String(raw.accountId) : null,
            startDate: dateOrNull(raw.startDate),
            renewalDate: dateOrNull(raw.renewalDate),
            cancelledDate: dateOrNull(raw.cancelledDate),
            cancellationRequested: raw.cancellationRequested === true,
            cancellationRequestedDate: dateOrNull(raw.cancellationRequestedDate),
            annualValue: numOrNull(raw.annualValue),
            currency: raw.currency || "USD",
            /**
             * A commercially declared segment, where the contract system records
             * one. `js/intelligence/normalize.js` carries no account-level
             * segment field and Phase 1 forbids changing it, so this is the
             * route a human-set segment actually travels.
             */
            segment: raw.segment || null,
            pastDueAmount: numOrNull(raw.pastDueAmount),
            pastDueSince: dateOrNull(raw.pastDueSince),
            autoRenew: raw.autoRenew === true,
            date: dateOrNull(raw.startDate),
            source: "internal",
            sourceLabel: raw.sourceLabel || "Contract",
            mock: raw.mock === true
        };
    }

    function shapeCommunication(raw) {
        if (!raw) { return null; }
        return {
            id: String(raw.id),
            type: "communication",
            date: dateOrNull(raw.date),
            direction: raw.direction || null,
            subject: raw.subject || null,
            body: raw.body || null,
            author: raw.author || null,
            channel: raw.channel || "email",
            source: "internal",
            sourceLabel: raw.sourceLabel || "Communication",
            url: raw.url || null,
            mock: raw.mock === true
        };
    }

    function shapeCommitment(raw) {
        if (!raw) { return null; }
        return {
            id: String(raw.id),
            type: "commitment",
            description: raw.description || null,
            dueDate: dateOrNull(raw.dueDate),
            completedDate: dateOrNull(raw.completedDate),
            owner: raw.owner || null,
            date: dateOrNull(raw.dueDate),
            source: "internal",
            sourceLabel: raw.sourceLabel || "Account review",
            mock: raw.mock === true
        };
    }

    function shapeOutcomes(raw) {
        if (!raw) { return null; }
        return {
            type: "outcomes",
            available: raw.available !== false,
            trainingCompleted: raw.trainingCompleted === true,
            trainingCompletedDate: dateOrNull(raw.trainingCompletedDate),
            recommendationsImplemented: numOrNull(raw.recommendationsImplemented),
            improvements: util.list(raw.improvements).map(function (item) {
                return {
                    label: item.label || null,
                    change: item.change || null,
                    date: dateOrNull(item.date)
                };
            }).filter(function (item) { return !!item.label; }),
            source: "internal",
            sourceLabel: raw.sourceLabel || "Customer outcomes",
            mock: raw.mock === true
        };
    }

    /**
     * Assemble the scorecard bundle from the intelligence bundle plus whatever
     * extended sources were supplied.
     *
     * Note the `commitments` handling: `undefined` (never supplied) stays null,
     * which downstream reads as "not tracked". An empty array means tracked and
     * none outstanding. Collapsing those two would either hide a data gap or
     * invent an unavailable factor.
     */
    function bundleFrom(data) {
        var input = data || {};

        return {
            account: input.account || null,
            quotes: util.list(input.quotes),
            orders: util.list(input.orders),
            tickets: util.list(input.tickets),
            billingIssues: util.list(input.billingIssues),
            technicalIssues: util.list(input.technicalIssues),
            reviews: util.list(input.reviews),
            website: input.website || null,
            external: util.list(input.external),
            contacts: util.list(input.contacts),
            geotab: input.geotab || null,

            // ---- extended sources ----
            deviceHealth: shapeDeviceHealth(input.deviceHealth),
            portalUsage: shapePortalUsage(input.portalUsage),
            hosActivity: input.hosActivity || null,
            outcomes: shapeOutcomes(input.outcomes),
            contract: shapeContract(input.contract),
            communications: util.list(input.communications)
                .map(shapeCommunication).filter(Boolean),
            commitments: input.commitments === undefined || input.commitments === null
                ? null
                : util.list(input.commitments).map(shapeCommitment).filter(Boolean)
        };
    }

    /**
     * Commitments recorded on account reviews, promoted into the commitments
     * source when no dedicated feed exists.
     *
     * A review's `commitments[]` is free text with no due date, so these arrive
     * WITHOUT one — and `overdueCommitment` requires a date. They therefore
     * never fire that rule, which is correct: "Support to provide a
     * root-cause summary" with no date attached is not overdue, it is undated.
     */
    function commitmentsFromReviews(reviews) {
        var out = [];
        util.list(reviews).forEach(function (review) {
            util.list(review.commitments).forEach(function (text, index) {
                out.push({
                    id: review.id + "-commitment-" + index,
                    description: text,
                    dueDate: null,
                    completedDate: null,
                    owner: null,
                    sourceLabel: review.sourceLabel || "Account review",
                    mock: review.mock === true
                });
            });
        });
        return out;
    }

    // -----------------------------------------------------------------
    // Run
    // -----------------------------------------------------------------

    /**
     * @param {object} data normalised bundle plus extended sources
     * @param {object} options
     *   asOf          Date|string — REQUIRED for determinism. Defaults to now
     *                 only so a browser caller need not think about it; every
     *                 test passes it explicitly.
     *   intelligence  an existing intelligence model, to avoid recomputing
     *                 signals/risks/opportunities that the account page already
     *                 has
     *   aiProposals   Phase 8 model-proposed signals, already validated
     *   aiProse       Phase 8 validated prose replacements
     * @returns {object} the scorecard model
     */
    function run(data, options) {
        var opts = options || {};
        var asOf = opts.asOf || new Date();
        var bundle = bundleFrom(data);

        // ---- Reuse the existing pipeline where it already ran ------------
        var intelligence = opts.intelligence || null;
        var facts = intelligence ? null : C360.facts.build(bundle);
        var signals = intelligence ? intelligence.signals : C360.signals.build(bundle, facts);
        var risks = intelligence ? intelligence.risks : C360.risks.build(signals, bundle);
        var opportunities = intelligence
            ? intelligence.opportunities
            : C360.opportunities.build(signals, bundle);
        var contacts = intelligence && intelligence.contacts
            ? intelligence.contacts
            : C360.contactService.prioritize(bundle.contacts, bundle.account);
        var roleGaps = intelligence && intelligence.roleGaps
            ? intelligence.roleGaps
            : C360.contactService.roleGaps(contacts, bundle.account);

        // Review commitments are a fallback source, used only when no dedicated
        // commitments feed was supplied.
        if (bundle.commitments === null) {
            var fromReviews = commitmentsFromReviews(bundle.reviews);
            if (fromReviews.length) {
                bundle.commitments = fromReviews.map(shapeCommitment).filter(Boolean);
            }
        }

        // ---- Phase 1 ----------------------------------------------------
        var identity = C360.identity.resolve({
            account: bundle.account,
            sources: C360.identity.describeSources(bundle)
        });

        var segment = C360.segments.resolve(bundle.account, bundle, {
            asOf: asOf,
            opportunities: opportunities
        });

        // ---- Phase 2 ----------------------------------------------------
        var health = C360.healthScore.build(bundle, signals, identity, segment, {
            asOf: asOf,
            roleGaps: roleGaps
        });

        // ---- Phase 3 ----------------------------------------------------
        // `health` is passed for the UI's convenience only. Nothing inside
        // priority.js reads health.score — see the header there.
        var priority = C360.priority.build(bundle, signals, health, identity, segment, {
            asOf: asOf,
            risks: risks,
            opportunities: opportunities,
            proposals: opts.aiProposals
        });

        // ---- Phase 4 ----------------------------------------------------
        var queues = C360.queues.classify(bundle.account, signals, health, priority, {
            bundle: bundle,
            opportunities: opportunities,
            roleGaps: roleGaps,
            identity: identity,
            asOf: asOf
        });

        // ---- Phase 5 ----------------------------------------------------
        var actions = C360.actionEngine.build({
            bundle: bundle,
            signals: signals,
            risks: risks,
            opportunities: opportunities,
            contacts: contacts,
            health: health,
            priority: priority,
            queues: queues,
            segment: segment,
            identity: identity,
            asOf: asOf,
            aiProse: opts.aiProse
        });

        return {
            accountId: bundle.account ? bundle.account.id : null,
            accountName: bundle.account ? bundle.account.name : null,
            asOf: util.toDate(asOf) ? util.toDate(asOf).toISOString() : null,
            configVersion: C360.scorecardConfig.version,

            identity: identity,
            segment: segment,
            health: health,
            priority: priority,
            queues: queues,
            recommendations: actions.recommendations,
            suppressed: actions.suppressed,

            /**
             * The shaped bundle, carried on the model so the portfolio can
             * search contacts and issues, and so the account page can deep-link
             * evidence, without refetching either.
             */
            bundle: bundle,
            signals: signals,
            risks: risks,
            opportunities: opportunities,
            contacts: contacts,
            roleGaps: roleGaps,

            /** Carried so the portfolio can sort and filter without refetching. */
            summary: {
                healthScore: health.available ? health.score : null,
                healthBand: health.band,
                healthAvailable: health.available,
                confidencePct: health.confidence.pct,
                priorityLevel: priority.level,
                priorityScore: priority.score,
                primaryQueue: queues.primaryQueue,
                segment: segment.segment,
                lifecycle: segment.lifecycle,
                renewalDate: bundle.contract ? bundle.contract.renewalDate : null,
                accountValue: bundle.contract ? bundle.contract.annualValue : null,
                recommendationCount: actions.recommendations.length
            }
        };
    }

    return {
        run: run,
        bundleFrom: bundleFrom,
        commitmentsFromReviews: commitmentsFromReviews
    };
}());
