/**
 * Customer 360 — ACCOUNT SUMMARY
 * ==============================
 * The paragraph at the top that a user reads in ten seconds.
 *
 * NO LANGUAGE MODEL IS INVOLVED. The summary is composed deterministically
 * from the same normalised records and signals as everything else, which is
 * why it cannot hallucinate: there is no step in which free text is generated
 * from anything other than a counted or quoted value.
 *
 * That is a stronger guarantee than the "LLM must not invent facts" rule in
 * spec section 25, and it is the reason this was built as composition rather
 * than generation. If an LLM is added later, it must sit BEHIND this same
 * evidence structure: every sentence keeps its `evidence` array, and a
 * sentence with no evidence must not be displayable.
 */

"use strict";

C360.summary = (function () {

    var util = C360.util;

    function sentence(text, evidence) {
        return { text: text, evidence: util.list(evidence) };
    }

    function find(signals, key) {
        return util.list(signals).filter(function (signal) { return signal.key === key; });
    }

    /**
     * @param {object} input { account, data, signals, risks, opportunities }
     * @returns {{sentences: Array, primaryOpportunity: object|null,
     *            primaryRisk: object|null, generated: string}}
     */
    function build(input) {
        var account = input.account;
        var data = input.data || {};
        var signals = util.list(input.signals);
        var sentences = [];

        if (!account) {
            return {
                sentences: [sentence("No account is selected.", [])],
                primaryOpportunity: null,
                primaryRisk: null,
                generated: "composed"
            };
        }

        // ---- Identity ----------------------------------------------------
        var identity = account.name
            + (account.industry ? " is a " + account.industry.toLowerCase() + " account" : " is an account")
            + (account.status ? " with status \"" + account.status + "\"" : "")
            + (account.customerSince ? ", a customer since " + util.formatDate(account.customerSince) : "")
            + ".";
        sentences.push(sentence(identity, []));

        if (data.website && data.website.summary) {
            sentences.push(sentence(
                "The company's own website describes it as: " + data.website.summary,
                [{ sourceLabel: data.website.sourceLabel, url: data.website.url,
                   date: data.website.fetchedAt, statement: data.website.summary,
                   source: "website", mock: data.website.mock }]
            ));
        }

        // ---- Commercial --------------------------------------------------
        var recentOrders = util.list(data.orders).filter(function (order) {
            var age = util.daysAgo(order.date);
            return age !== null && age <= 90;
        });
        var openQuotes = util.list(data.quotes).filter(function (quote) { return quote.isOpen; });

        if (recentOrders.length || openQuotes.length) {
            sentences.push(sentence(
                "Commercial activity is current: "
                + [recentOrders.length ? util.plural(recentOrders.length, "order") + " in the last 90 days" : null,
                   openQuotes.length ? util.plural(openQuotes.length, "open quote") : null]
                    .filter(Boolean).join(" and ") + ".",
                []
            ));
        } else {
            sentences.push(sentence(
                "No orders or open quotes are recorded in the last 90 days.", []));
        }

        var volume = find(signals, "orderVolume")[0];
        if (volume) {
            sentences.push(sentence(volume.statement, volume.evidence));
        }

        // ---- Support -----------------------------------------------------
        var openTickets = C360.signals.openTickets(data);
        var escalations = C360.signals.openEscalations(data.billingIssues)
            .concat(C360.signals.openEscalations(data.technicalIssues));

        if (escalations.length) {
            sentences.push(sentence(
                util.plural(escalations.length, "escalation is", "escalations are")
                + " unresolved, alongside " + util.plural(openTickets.length, "open ticket") + ".",
                []
            ));
        } else if (openTickets.length) {
            sentences.push(sentence(
                util.plural(openTickets.length, "open ticket") + ", none escalated.", []));
        } else if (util.list(data.tickets).length) {
            sentences.push(sentence("No tickets are currently open.", []));
        }

        // ---- Public picture ------------------------------------------------
        var growth = find(signals, "publicGrowth")[0];
        var contraction = find(signals, "publicContraction")[0];
        if (growth) { sentences.push(sentence(growth.statement, growth.evidence)); }
        if (contraction) { sentences.push(sentence(contraction.statement, contraction.evidence)); }
        if (!growth && !contraction) {
            sentences.push(sentence(
                "No significant public updates were found for this account in the selected period.", []));
        }

        // ---- Headline opportunity and risk -----------------------------------
        var primaryOpportunity = util.list(input.opportunities)[0] || null;
        var primaryRisk = util.list(input.risks)[0] || null;

        return {
            sentences: sentences,
            primaryOpportunity: primaryOpportunity,
            primaryRisk: primaryRisk,
            /** Recorded so the UI can state how the summary was produced. */
            generated: "composed"
        };
    }

    return { build: build };
}());
