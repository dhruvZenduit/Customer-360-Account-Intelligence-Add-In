/**
 * Customer 360 — INTELLIGENCE ENGINE
 * ==================================
 * The pipeline in spec section 40, in one place:
 *
 *     normalised data
 *          |
 *          v
 *        FACTS          what sources actually recorded
 *          |
 *          v
 *       SIGNALS         patterns across facts
 *          |
 *     +----+----+
 *     v         v
 *   RISKS   OPPORTUNITIES
 *     |         |
 *     +----+----+
 *          v
 *   RECOMMENDATIONS
 *
 * Health, the timeline, "What changed" and the summary are all views over the
 * same three layers — none of them introduces a claim that is not already a
 * fact or a signal.
 *
 * This function is pure: same input, same output, no I/O. That is what makes
 * the rules testable without a browser (see tests/run-tests.js).
 */

"use strict";

C360.intelligenceEngine = (function () {

    var util = C360.util;

    /**
     * @param {object} data normalised bundle:
     *   { account, quotes, orders, tickets, billingIssues, technicalIssues,
     *     reviews, website, external, contacts, geotab }
     * @returns {object} the full intelligence model consumed by the UI
     */
    function run(data) {
        var bundle = {
            account: data.account || null,
            quotes: util.list(data.quotes),
            orders: util.list(data.orders),
            tickets: util.list(data.tickets),
            billingIssues: util.list(data.billingIssues),
            technicalIssues: util.list(data.technicalIssues),
            reviews: util.list(data.reviews),
            website: data.website || null,
            external: util.list(data.external),
            contacts: util.list(data.contacts),
            geotab: data.geotab || null
        };

        // 1. FACTS
        var facts = C360.facts.build(bundle);

        // 2. SIGNALS
        var signals = C360.signals.build(bundle, facts);

        // 3. RISKS + OPPORTUNITIES
        var risks = C360.risks.build(signals, bundle);
        var opportunities = C360.opportunities.build(signals, bundle);

        // Contacts are ranked before recommendations run, because a
        // recommendation may only name a verified contact.
        var rankedContacts = C360.contactService.prioritize(bundle.contacts, bundle.account);
        var roleGaps = C360.contactService.roleGaps(rankedContacts, bundle.account);

        // 4. RECOMMENDATIONS
        var actions = C360.recommendations.build({
            risks: risks,
            opportunities: opportunities,
            contacts: rankedContacts,
            signals: signals,
            data: bundle
        });

        return {
            account: bundle.account,

            commercial: {
                quotes: bundle.quotes.slice().sort(util.byDateDesc),
                orders: bundle.orders.slice().sort(util.byDateDesc)
            },

            support: {
                tickets: bundle.tickets.slice().sort(util.byDateDesc),
                openTickets: C360.signals.openTickets(bundle),
                escalatedTickets: bundle.tickets.filter(function (t) { return t.escalated; }),
                billingIssues: bundle.billingIssues.slice().sort(util.byDateDesc),
                technicalIssues: bundle.technicalIssues.slice().sort(util.byDateDesc)
            },

            reviews: bundle.reviews.slice().sort(util.byDateDesc),
            website: bundle.website,
            external: bundle.external.slice().sort(util.byDateDesc),

            contacts: rankedContacts,
            roleGaps: roleGaps,

            geotab: bundle.geotab,

            facts: facts.all,
            signals: signals,
            whatChanged: C360.signals.whatChanged(signals),
            health: C360.health.build(bundle, signals),
            risks: risks,
            opportunities: opportunities,
            recommendations: actions,
            timeline: C360.timeline.build(bundle),

            summary: C360.summary.build({
                account: bundle.account,
                data: bundle,
                signals: signals,
                risks: risks,
                opportunities: opportunities
            })
        };
    }

    return { run: run };
}());
