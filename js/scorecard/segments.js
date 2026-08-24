/**
 * Customer 360 — SEGMENTS & LIFECYCLE  (Phase 1)
 * ==============================================
 * Different customers deserve different expectations. A Strategic account
 * nobody has reviewed in 100 days is overdue; a Small Business account at the
 * same age is not. Every threshold that varies by segment lives in
 * `scorecardConfig.accountSegmentRules` — nothing here hardcodes a day count.
 *
 * Lifecycle is derived from EVIDENCE, never guessed. Contract start, renewal
 * date, cancellation record, suspension flag. When the evidence does not say,
 * the answer is `unknown` with a basis explaining what was missing — because a
 * guessed lifecycle stage silently changes how every later signal is read:
 *
 *     Low portal usage
 *         Onboarding:  potential adoption problem
 *         Mature:      potential disengagement
 *         At Risk:     an additional risk signal
 *
 * Pure: `asOf` is injected, never read from the clock (Phase 9 requires this).
 */

"use strict";

C360.segments = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig; }

    /** Days between a date and the injected "as of", or null. */
    function ageDays(value, asOf) {
        return util.daysAgo(value, asOf);
    }

    /** Days until a future date, or null. Negative once it has passed. */
    function daysUntil(value, asOf) {
        var age = util.daysAgo(value, asOf);
        return age === null ? null : -age;
    }

    function statusMatches(status, list) {
        var s = String(status || "").toLowerCase();
        if (!s) { return false; }
        return util.list(list).some(function (word) {
            return s.indexOf(String(word).toLowerCase()) !== -1;
        });
    }

    // -----------------------------------------------------------------
    // Segment
    // -----------------------------------------------------------------

    /**
     * Segment resolution, in order of authority:
     *
     *   1. A DECLARED segment — what a human recorded. Always wins.
     *   2. Suspension status — a suspended account is its own segment.
     *   3. Tenure — too new to judge, or long enough to be a long-term customer.
     *   4. Asset bands — the fallback, and the weakest basis of the four.
     *
     * The declared segment is read from the account record OR the contract
     * record. Two places because `js/intelligence/normalize.js` does not carry
     * an account-level `segment` field today and Phase 1 forbids changing it, so
     * the contract — which the scorecard shapes itself — is the one that
     * actually arrives. See docs/phase-1-audit.md.
     */
    function declaredSegment(account, data) {
        var acct = account || {};
        var contract = (data || {}).contract || {};
        return acct.segment || contract.segment || null;
    }

    function resolveSegment(account, data, asOf) {
        var rules = cfg().segmentRules;
        var segmentRules = cfg().accountSegmentRules;
        var acct = account || {};

        var stated = declaredSegment(account, data);
        var declared = stated ? String(stated).toLowerCase() : null;
        if (declared && segmentRules[declared]) {
            return {
                segment: declared,
                basis: "Segment recorded on the account or contract record."
            };
        }

        if (statusMatches(acct.status, cfg().lifecycleRules.suspendedStatuses)) {
            return { segment: "suspended", basis: "Account status reads \"" + acct.status + "\"." };
        }

        var tenure = ageDays(acct.customerSince, asOf);

        if (tenure !== null && tenure <= rules.newOnboardingWithinDays) {
            return {
                segment: "new-onboarding",
                basis: "Customer since " + util.formatDate(acct.customerSince)
                     + " (" + tenure + " days), within the "
                     + rules.newOnboardingWithinDays + "-day onboarding window."
            };
        }

        var assets = acct.assetCount;
        if (assets !== null && assets !== undefined) {
            var band = util.list(rules.assetBands).filter(function (entry) {
                return assets >= entry.min;
            })[0];
            if (band) {
                // Tenure upgrades the band's answer rather than replacing it:
                // a long-term small-business account is still long-term.
                if (tenure !== null && tenure >= rules.longTermAfterDays
                    && band.segment === "small-business") {
                    return {
                        segment: "long-term",
                        basis: util.plural(assets, "asset") + " on the account, and a customer for "
                             + Math.floor(tenure / 365) + " years."
                    };
                }
                return {
                    segment: band.segment,
                    basis: util.plural(assets, "asset") + " recorded on the account "
                         + "(band: " + band.min + "+)."
                };
            }
        }

        if (tenure !== null && tenure >= rules.longTermAfterDays) {
            return {
                segment: "long-term",
                basis: "Customer for " + Math.floor(tenure / 365)
                     + " years; no asset count recorded to band by."
            };
        }

        return {
            segment: cfg().defaultSegment,
            basis: "No segment on the CRM record and no asset count to band by; "
                 + "defaulted to " + cfg().defaultSegment + "."
        };
    }

    // -----------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------

    /**
     * Lifecycle from evidence only.
     *
     * Note the ordering: terminal states first (a churned account is not
     * "mature"), then the renewal window, then tenure-based stages. Expansion
     * outranks mature because it is the more actionable reading of the same
     * account, and it requires a QUALIFIED opportunity — a product-catalogue
     * gap is not an expansion.
     */
    function resolveLifecycle(account, data, asOf, opportunities) {
        var rules = cfg().lifecycleRules;
        var acct = account || {};
        var bundle = data || {};
        var contract = bundle.contract || null;

        if (statusMatches(acct.status, rules.suspendedStatuses)) {
            return { lifecycle: "suspended", basis: "Account status reads \"" + acct.status + "\"." };
        }

        if (statusMatches(acct.status, rules.churnedStatuses)) {
            return { lifecycle: "churned", basis: "Account status reads \"" + acct.status + "\"." };
        }

        if (contract && contract.cancelledDate) {
            return {
                lifecycle: "churned",
                basis: "Contract records a cancellation dated "
                     + util.formatDate(contract.cancelledDate) + "."
            };
        }

        // A cancellation REQUEST is at-risk, not churned. The customer has said
        // something; they have not yet left, and the difference is the entire
        // point of the SAVE queue.
        if (contract && contract.cancellationRequested === true) {
            return {
                lifecycle: "at-risk",
                basis: "Contract record flags a cancellation request; the contract is still active."
            };
        }

        var renewalIn = contract ? daysUntil(contract.renewalDate, asOf) : null;
        if (renewalIn !== null && renewalIn >= 0 && renewalIn <= rules.renewalWindowDays) {
            return {
                lifecycle: "renewal",
                basis: "Renewal recorded for " + util.formatDate(contract.renewalDate)
                     + ", " + renewalIn + " days away."
            };
        }

        var tenure = ageDays(acct.customerSince, asOf);

        if (tenure === null) {
            return {
                lifecycle: "unknown",
                basis: "No contract start, renewal date, cancellation record or customer-since "
                     + "date is available, so the lifecycle stage cannot be derived."
            };
        }

        if (tenure <= rules.onboardingWithinDays) {
            return {
                lifecycle: "onboarding",
                basis: "Customer for " + tenure + " days, within the "
                     + rules.onboardingWithinDays + "-day onboarding window."
            };
        }

        if (tenure <= rules.adoptionWithinDays) {
            return {
                lifecycle: "adoption",
                basis: "Customer for " + tenure + " days, within the "
                     + rules.adoptionWithinDays + "-day adoption window."
            };
        }

        var qualified = util.list(opportunities).filter(function (opp) {
            return util.list(cfg().queues.qualifiedOpportunityConfidence)
                .indexOf(opp.confidence) !== -1;
        });
        if (qualified.length) {
            return {
                lifecycle: "expansion",
                basis: util.plural(qualified.length, "qualified opportunity", "qualified opportunities")
                     + " recorded against this account."
            };
        }

        return {
            lifecycle: "mature",
            basis: "Customer for " + Math.floor(tenure / 365) + " years with no renewal "
                 + "window, cancellation record or qualified expansion signal."
        };
    }

    // -----------------------------------------------------------------
    // Resolve
    // -----------------------------------------------------------------

    /**
     * @param {object} account normalised CRM account
     * @param {object} data    bundle (contract, reviews, opportunities...)
     * @param {object} options { asOf: Date|string, opportunities: [] }
     * @returns {object} { segment, segmentLabel, lifecycle, lifecycleLabel,
     *                     basis: { segment, lifecycle }, rules }
     */
    function resolve(account, data, options) {
        var opts = options || {};
        var asOf = opts.asOf || null;

        var segment = resolveSegment(account, data, asOf);
        var lifecycle = resolveLifecycle(account, data, asOf, opts.opportunities);

        var rules = cfg().accountSegmentRules[segment.segment]
                 || cfg().accountSegmentRules[cfg().defaultSegment];

        return {
            segment: segment.segment,
            segmentLabel: rules ? rules.label : util.humanize(segment.segment),
            lifecycle: lifecycle.lifecycle,
            lifecycleLabel: cfg().lifecycleLabels[lifecycle.lifecycle]
                         || util.humanize(lifecycle.lifecycle),
            basis: {
                segment: segment.basis,
                lifecycle: lifecycle.basis
            },
            /** The per-segment thresholds every later phase reads. */
            rules: {
                reviewOverdueDays: rules ? rules.reviewOverdueDays : null,
                renewalWindowDays: rules ? rules.renewalWindowDays : null,
                strategicWeight: rules ? rules.strategicWeight : null
            }
        };
    }

    /**
     * Review cadence for a segment, falling back to the global default in
     * `config.thresholds.staleReviewDays`. Phase 1 makes the cadence
     * segment-aware without removing that global default.
     */
    function reviewOverdueDays(segment) {
        var rules = cfg().accountSegmentRules[segment];
        if (rules && rules.reviewOverdueDays !== undefined) {
            return rules.reviewOverdueDays;
        }
        return C360.config.thresholds.staleReviewDays;
    }

    function renewalWindowDays(segment) {
        var rules = cfg().accountSegmentRules[segment];
        return rules ? rules.renewalWindowDays : null;
    }

    /**
     * Is the account's most recent review overdue for ITS segment?
     * Returns null — not false — when there is no review to measure, because
     * "we have never reviewed this account" is a different fact from "the
     * review is recent enough".
     */
    function isReviewOverdue(segment, latestReviewDate, asOf) {
        var limit = reviewOverdueDays(segment);
        if (limit === null || limit === undefined) { return false; }
        var age = ageDays(latestReviewDate, asOf);
        if (age === null) { return null; }
        return age > limit;
    }

    return {
        resolve: resolve,
        resolveSegment: resolveSegment,
        resolveLifecycle: resolveLifecycle,
        reviewOverdueDays: reviewOverdueDays,
        renewalWindowDays: renewalWindowDays,
        declaredSegment: declaredSegment,
        isReviewOverdue: isReviewOverdue,
        daysUntil: daysUntil
    };
}());
