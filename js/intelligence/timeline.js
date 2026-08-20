/**
 * Customer 360 — ACTIVITY TIMELINE
 * ================================
 * One chronological stream across every source (spec section 21).
 *
 * The point of the timeline is that it interleaves: an internal escalation
 * sitting two days after a public expansion announcement tells a story that
 * neither section tells on its own. So entries keep their source badge and are
 * never grouped by source — only by date.
 */

"use strict";

C360.timeline = (function () {

    var util = C360.util;

    function entry(spec) {
        return {
            id: spec.id,
            date: spec.date,
            title: spec.title,
            detail: spec.detail || null,
            source: spec.source,             // internal | website | external
            sourceLabel: spec.sourceLabel,
            category: spec.category,         // commercial | support | relationship | growth | leadership
            url: spec.url || null,
            mock: spec.mock === true
        };
    }

    function build(data) {
        var out = [];

        util.list(data.quotes).forEach(function (quote) {
            out.push(entry({
                id: "tl-quote-" + quote.id,
                date: quote.date,
                title: "Quote " + quote.number + " " + (quote.status || "recorded").toLowerCase(),
                detail: [quote.title, util.formatMoney(quote.amount, quote.currency)]
                    .filter(Boolean).join(" — "),
                source: "internal",
                sourceLabel: quote.sourceLabel,
                category: "commercial",
                url: quote.url,
                mock: quote.mock
            }));
        });

        util.list(data.orders).forEach(function (order) {
            out.push(entry({
                id: "tl-order-" + order.id,
                date: order.date,
                title: "Order " + order.number + " placed",
                detail: [order.quantity !== null ? order.quantity + " units" : null,
                         util.formatMoney(order.value, order.currency)]
                    .filter(Boolean).join(" — "),
                source: "internal",
                sourceLabel: order.sourceLabel,
                category: "commercial",
                url: order.url,
                mock: order.mock
            }));
        });

        util.list(data.tickets).forEach(function (ticket) {
            out.push(entry({
                id: "tl-ticket-" + ticket.id,
                date: ticket.opened,
                title: (ticket.escalated ? "Ticket escalated — " : "Ticket opened — ") + ticket.number,
                detail: ticket.subject,
                source: "internal",
                sourceLabel: ticket.sourceLabel,
                category: "support",
                url: ticket.url,
                mock: ticket.mock
            }));
        });

        util.list(data.reviews).forEach(function (review) {
            out.push(entry({
                id: "tl-review-" + review.id,
                date: review.date,
                title: review.reviewType + " completed",
                detail: review.topics.length ? review.topics.join(", ") : null,
                source: "internal",
                sourceLabel: review.sourceLabel,
                category: "relationship",
                url: review.url,
                mock: review.mock
            }));
        });

        util.list(data.website && data.website.growthSignals).forEach(function (signal) {
            out.push(entry({
                id: "tl-web-" + signal.id,
                date: signal.date,
                title: signal.title,
                detail: signal.detail,
                source: "website",
                sourceLabel: signal.sourceLabel,
                category: "growth",
                url: signal.url,
                mock: signal.mock
            }));
        });

        util.list(data.external).forEach(function (item) {
            out.push(entry({
                id: "tl-news-" + item.id,
                date: item.date,
                title: item.title,
                detail: item.publisher,
                source: "external",
                sourceLabel: item.sourceLabel,
                category: item.category === "leadership" ? "leadership" : "growth",
                url: item.url,
                mock: item.mock
            }));
        });

        // Entries with no date cannot be placed on a timeline at all, so they
        // are dropped here rather than shown at an invented position.
        return out.filter(function (item) { return !!item.date; }).sort(util.byDateDesc);
    }

    return { build: build, entry: entry };
}());
