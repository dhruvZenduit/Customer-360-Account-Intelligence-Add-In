/**
 * Customer 360 — OPPORTUNITIES
 * ============================
 * Layer 3b of the intelligence engine.
 *
 * Every opportunity is written in three parts, which is also how the card
 * renders (spec section 19):
 *
 *   EVIDENCE       what a source actually recorded
 *   INTERPRETATION what that might mean
 *   ACTION         what could be done about it
 *
 * The interpretation is always hedged, and an opportunity built on an ABSENCE
 * of evidence says so explicitly rather than asserting the customer does not
 * use something.
 */

"use strict";

C360.opportunities = (function () {

    var util = C360.util;

    function makeOpportunity(spec) {
        return {
            id: spec.id,
            title: spec.title,
            category: spec.category,
            evidenceStatement: spec.evidenceStatement,
            interpretation: spec.interpretation,
            action: spec.action,
            confidence: spec.confidence,
            evidence: util.list(spec.evidence)
        };
    }

    function indexSignals(signals) {
        var index = {};
        util.list(signals).forEach(function (signal) {
            index[signal.key] = index[signal.key] || [];
            index[signal.key].push(signal);
        });
        return index;
    }

    function build(signals, data) {
        var index = indexSignals(signals);
        var out = [];

        // ---- Growing order volume ---------------------------------------
        util.list(index.orderVolume).forEach(function (signal) {
            if (signal.direction !== "up") { return; }
            out.push(makeOpportunity({
                id: "opp-fleet-expansion",
                title: "Fleet expansion",
                category: "commercial",
                evidenceStatement: signal.statement,
                interpretation: "The increase indicates the customer is adding vehicles or assets.",
                action: "Discuss whether further deployment is planned, and on what timeline.",
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        // ---- Public growth ------------------------------------------------
        util.list(index.publicGrowth).forEach(function (signal) {
            out.push(makeOpportunity({
                id: "opp-public-growth",
                title: "Operational growth",
                category: "growth",
                evidenceStatement: signal.statement,
                interpretation: "Public growth activity suggests new operations that may not yet be "
                              + "covered by the account's current deployment.",
                action: "Ask whether the new operations require additional coverage.",
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        // ---- Safety follow-on from growth ---------------------------------
        if (util.list(index.publicGrowth).length && util.list(index.orderVolume).some(function (s) {
            return s.direction === "up";
        })) {
            var combined = index.publicGrowth[0].evidence
                .concat(index.orderVolume[0].evidence);
            out.push(makeOpportunity({
                id: "opp-safety-review",
                title: "Safety programme review",
                category: "growth",
                evidenceStatement: "Public expansion activity and an increase in ordered volume "
                                 + "appear in the same period.",
                interpretation: "A larger operation typically increases exposure to driver-safety "
                              + "risk, though no safety incident data is available here.",
                action: "Review current driver-monitoring coverage against the expanded operation.",
                // Two independent signals pointing the same way.
                confidence: C360.config.confidence.MEDIUM,
                evidence: combined
            }));
        }

        // ---- Product coverage gaps ----------------------------------------
        util.list(index.productGap).forEach(function (signal) {
            out.push(makeOpportunity({
                id: "opp-product-gap",
                title: "Product coverage",
                category: "commercial",
                evidenceStatement: signal.statement,
                interpretation: "An absence of internal usage records is not proof the customer "
                              + "does not use these — internal data may simply not capture it.",
                action: "Confirm current usage before positioning anything new.",
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        // ---- Fleet on platform vs fleet stated publicly --------------------
        util.list(index.fleetGap).forEach(function (signal) {
            if (signal.direction !== "up") { return; }
            out.push(makeOpportunity({
                id: "opp-fleet-coverage",
                title: "Coverage gap",
                category: "growth",
                evidenceStatement: signal.statement,
                interpretation: "The gap may indicate assets that are not on the platform, or it "
                              + "may simply mean the two figures count different things.",
                action: "Verify the real asset count with the customer before treating this as a gap.",
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        // ---- Opportunities the customer stated themselves ------------------
        var review = C360.signals.latestReview(data);
        if (review && review.opportunities.length) {
            out.push(makeOpportunity({
                id: "opp-review-stated",
                title: "Customer-stated opportunity",
                category: "relationship",
                evidenceStatement: "Recorded at the " + review.reviewType.toLowerCase() + " on "
                                 + util.formatDate(review.date) + ": " + review.opportunities.join("; ") + ".",
                interpretation: "This came from the customer directly, making it the strongest "
                              + "opportunity signal available on the account.",
                action: "Follow up on what the customer already told us they are planning.",
                confidence: C360.config.confidence.HIGH,
                evidence: [{
                    id: "fact-review-" + review.id,
                    statement: review.reviewType + " on " + util.formatDate(review.date),
                    source: "internal",
                    sourceLabel: review.sourceLabel,
                    date: review.date,
                    url: review.url,
                    recordType: "review",
                    recordId: review.id,
                    mock: review.mock
                }]
            }));
        }

        // ---- Open quote worth chasing --------------------------------------
        util.list(index.openQuotes).forEach(function (signal) {
            out.push(makeOpportunity({
                id: "opp-open-quote",
                title: "Open commercial activity",
                category: "commercial",
                evidenceStatement: signal.statement,
                interpretation: "An outstanding quote is already-qualified pipeline on this account.",
                action: "Confirm where the decision stands with the account owner.",
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        var confidenceOrder = { High: 0, Medium: 1, Low: 2 };
        out.sort(function (a, b) {
            return confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
        });

        return out;
    }

    return { build: build };
}());
