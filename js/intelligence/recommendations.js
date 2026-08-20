/**
 * Customer 360 — RECOMMENDED NEXT ACTIONS
 * =======================================
 * Layer 4, the last one (spec section 23). Recommendations are generated from
 * risks and opportunities — never directly from raw records — so an action can
 * always be traced back through a signal to the facts underneath it.
 *
 * TWO RULES ARE ENFORCED HERE, NOT JUST DOCUMENTED:
 *
 *   1. Never recommend contacting a person who has not been verified.
 *      namedContactFor() only returns a Confirmed contact. When no verified
 *      contact exists for the relevant role, the action becomes "identify a
 *      contact" instead of naming somebody we are not sure about.
 *
 *   2. Fix the problem before selling into it. An unresolved escalation
 *      outranks every commercial action, because walking into a customer
 *      conversation unaware of an open escalation is the single most
 *      avoidable mistake this dashboard exists to prevent.
 *
 * Output is capped at five: a list longer than that is not a set of next
 * actions, it is a backlog.
 */

"use strict";

C360.recommendations = (function () {

    var util = C360.util;

    var PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    var MAX_ACTIONS = 5;

    function makeAction(spec) {
        return {
            id: spec.id,
            priority: spec.priority,
            text: spec.text,
            rationale: spec.rationale,
            category: spec.category,
            evidence: util.list(spec.evidence)
        };
    }

    function findRisk(risks, id) {
        return util.list(risks).filter(function (risk) { return risk.id === id; })[0] || null;
    }

    function findOpportunity(opportunities, id) {
        return util.list(opportunities).filter(function (opp) { return opp.id === id; })[0] || null;
    }

    /**
     * The best VERIFIED contact whose role group matches one of `roleGroups`.
     *
     * Returns null when there is no confirmed match — which is the point.
     * A "Likely" or "Unverified" contact is not good enough to put a name in
     * a recommended action.
     */
    function namedContactFor(contacts, roleGroups) {
        return util.list(contacts).filter(function (contact) {
            return contact.confidence === "Confirmed"
                && contact.name
                && roleGroups.indexOf(contact.roleGroup) !== -1;
        })[0] || null;
    }

    function build(input) {
        var risks = util.list(input.risks);
        var opportunities = util.list(input.opportunities);
        var contacts = util.list(input.contacts);
        var data = input.data || {};
        var out = [];

        // ---- 1. Unresolved escalations come first ------------------------
        var technicalRisk = findRisk(risks, "risk-technical-escalation");
        if (technicalRisk) {
            out.push(makeAction({
                id: "action-technical-escalation",
                priority: "HIGH",
                text: "Coordinate with Support on the unresolved technical escalation before "
                    + "contacting the customer.",
                rationale: technicalRisk.statement,
                category: "support",
                evidence: technicalRisk.evidence
            }));
        }

        var billingRisk = findRisk(risks, "risk-billing-escalation");
        if (billingRisk) {
            out.push(makeAction({
                id: "action-billing-escalation",
                priority: "HIGH",
                text: "Get a status from Billing on the open dispute before any commercial "
                    + "conversation.",
                rationale: billingRisk.statement,
                category: "support",
                evidence: billingRisk.evidence
            }));
        }

        // ---- 2. What the customer already told us ------------------------
        var stated = findOpportunity(opportunities, "opp-review-stated");
        if (stated) {
            out.push(makeAction({
                id: "action-review-opportunity",
                priority: "HIGH",
                text: "Follow up on the expansion the customer raised at the last account review.",
                rationale: stated.evidenceStatement,
                category: "relationship",
                evidence: stated.evidence
            }));
        }

        // ---- 3. Fleet expansion, with or without a verified contact -------
        var expansion = findOpportunity(opportunities, "opp-fleet-expansion")
                     || findOpportunity(opportunities, "opp-public-growth");
        if (expansion) {
            var fleetContact = namedContactFor(contacts, ["Fleet leadership", "Operations leadership", "Fleet"]);

            if (fleetContact) {
                out.push(makeAction({
                    id: "action-fleet-followup",
                    priority: "HIGH",
                    text: "Follow up with " + fleetContact.name + " (" + fleetContact.title
                        + ") regarding the recent expansion activity.",
                    rationale: expansion.evidenceStatement + " Contact verified via "
                             + (fleetContact.sourceLabel || fleetContact.sourceType) + ".",
                    category: "growth",
                    evidence: expansion.evidence
                }));
            } else {
                // No confirmed contact — so the action is to find one, not to
                // guess at who to call.
                out.push(makeAction({
                    id: "action-identify-fleet-contact",
                    priority: "MEDIUM",
                    text: "Identify a verified fleet or operations contact before acting on the "
                        + "expansion signal — none is currently verified on this account.",
                    rationale: expansion.evidenceStatement,
                    category: "growth",
                    evidence: expansion.evidence
                }));
            }
        }

        // ---- 4. Contraction needs confirming, not assuming -----------------
        var contraction = findRisk(risks, "risk-public-contraction")
                       || findRisk(risks, "risk-order-decline");
        if (contraction) {
            out.push(makeAction({
                id: "action-confirm-contraction",
                priority: "HIGH",
                text: "Confirm with the account owner whether the reported reduction affects this "
                    + "account's deployment.",
                rationale: contraction.statement,
                category: "growth",
                evidence: contraction.evidence
            }));
        }

        // ---- 5. Commercial follow-through ----------------------------------
        var staleQuote = findRisk(risks, "risk-stale-quote");
        if (staleQuote) {
            var owner = util.list(data.quotes).filter(function (quote) { return quote.isOpen; })
                .map(function (quote) { return quote.owner; })
                .filter(Boolean)[0];
            out.push(makeAction({
                id: "action-stale-quote",
                priority: "MEDIUM",
                text: "Review the outstanding quote with the account owner"
                    + (owner ? " (" + owner + ")" : "") + ".",
                rationale: staleQuote.statement,
                category: "commercial",
                evidence: staleQuote.evidence
            }));
        }

        // ---- 6. Relationship cadence ----------------------------------------
        var reviewRisk = findRisk(risks, "risk-stale-review") || findRisk(risks, "risk-no-review");
        if (reviewRisk) {
            out.push(makeAction({
                id: "action-schedule-review",
                priority: "MEDIUM",
                text: "Schedule an account review.",
                rationale: reviewRisk.statement,
                category: "relationship",
                evidence: reviewRisk.evidence
            }));
        }

        // ---- 7. Leadership change --------------------------------------------
        var leadership = util.list(input.signals).filter(function (signal) {
            return signal.key === "leadershipChange";
        })[0];
        if (leadership) {
            out.push(makeAction({
                id: "action-leadership-change",
                priority: "MEDIUM",
                text: "Confirm who now owns decisions on this account following the reported "
                    + "leadership change.",
                rationale: leadership.statement,
                category: "leadership",
                evidence: leadership.evidence
            }));
        }

        // ---- 8. Product coverage, last because it is the weakest evidence ----
        var gap = findOpportunity(opportunities, "opp-product-gap");
        if (gap) {
            out.push(makeAction({
                id: "action-product-gap",
                priority: "LOW",
                text: "Confirm what the customer actually uses today before positioning anything new.",
                rationale: gap.evidenceStatement + " " + gap.interpretation,
                category: "commercial",
                evidence: gap.evidence
            }));
        }

        out.sort(function (a, b) {
            return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        });

        return out.slice(0, MAX_ACTIONS);
    }

    return {
        build: build,
        namedContactFor: namedContactFor,
        MAX_ACTIONS: MAX_ACTIONS
    };
}());
