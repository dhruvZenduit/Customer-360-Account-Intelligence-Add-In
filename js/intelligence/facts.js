/**
 * Customer 360 — FACTS
 * ====================
 * Layer 1 of the intelligence engine (spec section 40).
 *
 * A FACT is a single thing a source actually recorded, restated in one
 * sentence, with its provenance attached. Facts contain no interpretation:
 * "Order 98765 was placed on Aug 15, 2026 for 75 units" is a fact;
 * "the account is growing" is not.
 *
 * Everything above this layer — signals, risks, opportunities,
 * recommendations, the summary — cites facts by id. That is what makes every
 * claim on the dashboard traceable back to a source and a date.
 */

"use strict";

C360.facts = (function () {

    var util = C360.util;

    function makeFact(spec) {
        return {
            id: spec.id,
            /** One plain sentence. No adjectives, no inference. */
            statement: spec.statement,
            source: spec.source,              // internal | website | external
            sourceLabel: spec.sourceLabel,    // the badge the UI prints
            date: spec.date || null,
            url: spec.url || null,
            recordType: spec.recordType,
            recordId: spec.recordId,
            category: spec.category || null,
            mock: spec.mock === true
        };
    }

    function key(recordType, recordId) {
        return recordType + ":" + recordId;
    }

    // -----------------------------------------------------------------
    // Per-source fact builders
    // -----------------------------------------------------------------

    function quoteFact(quote) {
        var amount = quote.amount === null ? "an unstated amount"
                                           : util.formatMoney(quote.amount, quote.currency);
        return makeFact({
            id: "fact-quote-" + quote.id,
            statement: "Quote " + quote.number + " (" + amount + ") is "
                     + (quote.status ? quote.status.toLowerCase() : "in an unrecorded status")
                     + (quote.date ? ", dated " + util.formatDate(quote.date) : "") + ".",
            source: "internal",
            sourceLabel: quote.sourceLabel,
            date: quote.date,
            url: quote.url,
            recordType: "quote",
            recordId: quote.id,
            category: "commercial",
            mock: quote.mock
        });
    }

    function orderFact(order) {
        var qty = order.quantity === null ? "an unstated quantity" : order.quantity + " units";
        return makeFact({
            id: "fact-order-" + order.id,
            statement: "Order " + order.number + " for " + qty
                     + (order.value !== null ? " (" + util.formatMoney(order.value, order.currency) + ")" : "")
                     + (order.date ? " was placed " + util.formatDate(order.date) : "") + ".",
            source: "internal",
            sourceLabel: order.sourceLabel,
            date: order.date,
            url: order.url,
            recordType: "order",
            recordId: order.id,
            category: "commercial",
            mock: order.mock
        });
    }

    function ticketFact(ticket) {
        return makeFact({
            id: "fact-ticket-" + ticket.id,
            statement: "Ticket " + ticket.number + " — " + (ticket.subject || "no subject recorded")
                     + " — is " + (ticket.status || "in an unrecorded status")
                     + (ticket.priority ? " at " + ticket.priority.toLowerCase() + " priority" : "")
                     + (ticket.escalated ? " and is escalated" : "")
                     + (ticket.opened ? ", opened " + util.formatDate(ticket.opened) : "") + ".",
            source: "internal",
            sourceLabel: ticket.sourceLabel,
            date: ticket.opened,
            url: ticket.url,
            recordType: "ticket",
            recordId: ticket.id,
            category: "support",
            mock: ticket.mock
        });
    }

    function escalationFact(item) {
        return makeFact({
            id: "fact-escalation-" + item.kind + "-" + item.id,
            statement: util.humanize(item.kind) + " escalation: "
                     + (item.subject || "no subject recorded")
                     + " (" + (item.state || "state not recorded") + ")"
                     + (item.date ? ", raised " + util.formatDate(item.date) : "") + ".",
            source: "internal",
            sourceLabel: item.sourceLabel,
            date: item.date,
            url: item.url,
            recordType: "escalation",
            recordId: item.kind + "-" + item.id,
            category: "support",
            mock: item.mock
        });
    }

    function reviewFact(review) {
        return makeFact({
            id: "fact-review-" + review.id,
            statement: review.reviewType + " held " + util.formatDate(review.date)
                     + (review.attendees.length ? " with " + review.attendees.length + " attendees" : "") + ".",
            source: "internal",
            sourceLabel: review.sourceLabel,
            date: review.date,
            url: review.url,
            recordType: "review",
            recordId: review.id,
            category: "relationship",
            mock: review.mock
        });
    }

    function websiteSignalFact(signal) {
        return makeFact({
            id: "fact-website-" + signal.id,
            statement: signal.detail || signal.title,
            source: "website",
            sourceLabel: signal.sourceLabel,
            date: signal.date,
            url: signal.url,
            recordType: "website-signal",
            recordId: signal.id,
            category: "growth",
            mock: signal.mock
        });
    }

    function websiteProfileFact(website) {
        if (!website || !website.summary) { return null; }
        return makeFact({
            id: "fact-website-profile",
            statement: website.summary,
            source: "website",
            sourceLabel: website.sourceLabel,
            date: website.fetchedAt,
            url: website.url,
            recordType: "website",
            recordId: "profile",
            category: "profile",
            mock: website.mock
        });
    }

    function websiteFleetFact(website) {
        if (!website || !website.fleetStatement) { return null; }
        return makeFact({
            id: "fact-website-fleet",
            statement: website.fleetStatement,
            source: "website",
            sourceLabel: website.sourceLabel,
            date: website.fetchedAt,
            url: website.url,
            recordType: "website",
            recordId: "fleet",
            category: "operations",
            mock: website.mock
        });
    }

    function externalFact(item) {
        return makeFact({
            id: "fact-external-" + item.id,
            statement: item.summary || item.title,
            source: "external",
            sourceLabel: item.sourceLabel,
            date: item.date,
            url: item.url,
            recordType: "news",
            recordId: item.id,
            category: item.category,
            mock: item.mock
        });
    }

    function geotabFact(geotab, account) {
        if (!geotab || !geotab.available || geotab.deviceCount === null) { return null; }
        return makeFact({
            id: "fact-geotab-devices",
            statement: "MyGeotab database \"" + geotab.database + "\" currently reports "
                     + util.plural(geotab.deviceCount, "device") + " on this account.",
            source: "internal",
            sourceLabel: "MyGeotab",
            date: new Date().toISOString(),
            url: null,
            recordType: "geotab",
            recordId: account ? account.id : "session",
            category: "operations",
            mock: false
        });
    }

    // -----------------------------------------------------------------
    // Build
    // -----------------------------------------------------------------

    /**
     * Turn a normalised account bundle into a fact list plus a lookup index.
     *
     * @param {object} data normalised bundle (see intelligenceEngine)
     * @returns {{all: Array, index: object, get: function}}
     */
    function build(data) {
        var all = [];

        util.list(data.quotes).forEach(function (q) { all.push(quoteFact(q)); });
        util.list(data.orders).forEach(function (o) { all.push(orderFact(o)); });
        util.list(data.tickets).forEach(function (t) { all.push(ticketFact(t)); });
        util.list(data.billingIssues).forEach(function (b) { all.push(escalationFact(b)); });
        util.list(data.technicalIssues).forEach(function (t) { all.push(escalationFact(t)); });
        util.list(data.reviews).forEach(function (r) { all.push(reviewFact(r)); });

        if (data.website) {
            var profile = websiteProfileFact(data.website);
            if (profile) { all.push(profile); }
            var fleet = websiteFleetFact(data.website);
            if (fleet) { all.push(fleet); }
            util.list(data.website.growthSignals).forEach(function (s) {
                all.push(websiteSignalFact(s));
            });
        }

        util.list(data.external).forEach(function (x) { all.push(externalFact(x)); });

        var geo = geotabFact(data.geotab, data.account);
        if (geo) { all.push(geo); }

        var index = {};
        all.forEach(function (fact) {
            index[fact.id] = fact;
            index[key(fact.recordType, fact.recordId)] = fact;
        });

        return {
            all: all,

            /** Look a fact up by its id, or by (recordType, recordId). */
            get: function (recordType, recordId) {
                if (recordId === undefined) { return index[recordType] || null; }
                return index[key(recordType, recordId)] || null;
            },

            /** Facts for a set of records; missing ones are simply skipped. */
            forRecords: function (recordType, records) {
                return util.list(records).map(function (record) {
                    var id = recordType === "escalation" ? record.kind + "-" + record.id : record.id;
                    return index[key(recordType, id)] || null;
                }).filter(Boolean);
            }
        };
    }

    return {
        build: build,
        make: makeFact
    };
}());
