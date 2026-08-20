/**
 * Customer 360 — section renderers
 * ================================
 * One function per dashboard section, in the order they appear on the page
 * (spec section 27). Each takes the intelligence model and returns an HTML
 * string; none of them touches the DOM or holds state.
 *
 * A note on the date filter: it narrows what is DISPLAYED, never what the
 * intelligence engine reasoned over. Comparing this quarter's order against
 * last year's is exactly how the volume signal works, so hiding the older
 * order from the engine would silently delete the signal. Sections that are
 * filtered say so in their subtitle.
 */

"use strict";

C360.render = (function () {

    var util = C360.util;
    var c = C360.components;
    var esc = util.escapeHtml;

    /** Keep items inside the selected window. Undated items are kept. */
    function withinDays(items, days) {
        return util.list(items).filter(function (item) {
            var age = util.daysAgo(item.date);
            return age === null || age <= days;
        });
    }

    function windowLabel(days) {
        var match = C360.config.dateFilters.filter(function (f) { return f.days === days; })[0];
        return match ? "last " + match.label : "last " + days + " days";
    }

    // =================================================================
    // Account header
    // =================================================================

    function accountHeader(model, meta) {
        var account = model.account;
        var geotab = model.geotab;

        // Live MyGeotab count when it is genuinely for this account's
        // database; otherwise the CRM figure, labelled as such.
        var assetHtml;
        if (geotab && geotab.available && geotab.deviceCount !== null) {
            assetHtml = esc(String(geotab.deviceCount))
                      + ' <span class="c360-inline-note">live from MyGeotab ('
                      + esc(geotab.database) + ')</span>';
        } else if (account.assetCount !== null) {
            assetHtml = esc(String(account.assetCount))
                      + ' <span class="c360-inline-note">'
                      + esc(account.assetCountSource || "internal record")
                      + (geotab && geotab.reason ? " — " + geotab.reason : "")
                      + '</span>';
        } else {
            assetHtml = null;
        }

        var products = account.products.length
            ? account.products.map(function (p) {
                return '<span class="c360-tag">' + esc(p) + '</span>';
              }).join("")
            : null;

        return '<div class="c360-account-head">'
             + '<div class="c360-account-identity">'
             + '<h1 class="c360-account-name">' + esc(account.name || "Unnamed account") + '</h1>'
             + '<p class="c360-account-industry">'
             + esc(account.industry || "Industry not available")
             + c.mockBadge(account.mock) + '</p>'
             + (account.website
                 ? '<p class="c360-account-site">' + c.link(account.website, account.domain || account.website) + '</p>'
                 : '<p class="c360-account-site c360-kv-value--missing">No website on record</p>')
             + '</div>'
             + '<dl class="c360-account-facts">'
             + c.kv("Customer since", account.customerSince ? util.formatDate(account.customerSince) : null)
             + c.kv("Account owner", account.accountOwner)
             + c.kv("Account status", account.status)
             + c.kv("Headquarters", account.headquarters)
             + c.kvHtml("Products", products)
             + c.kvHtml("Vehicles / assets", assetHtml)
             + c.kv("Primary contact", account.primaryContact)
             + '</dl>'
             + '</div>';
    }

    // =================================================================
    // Source status strip (spec section 32)
    // =================================================================

    function sourceStatus(sourceGroups) {
        var items = util.list(sourceGroups).map(function (group) {
            var ok = group.ok;
            var detail = ok
                ? "Loaded"
                : "Temporarily unavailable"
                  + (group.lastSuccess
                      ? " — last successful update " + util.formatDateTime(group.lastSuccess)
                      : " — no previous successful update");

            return '<li class="c360-status c360-status--' + (ok ? "ok" : "warn") + '">'
                 + '<span class="c360-status-icon" aria-hidden="true">' + (ok ? "&#10003;" : "&#9888;") + '</span>'
                 + '<span class="c360-status-label">' + esc(group.label) + '</span>'
                 + '<span class="c360-status-detail">' + esc(detail) + '</span>'
                 + '</li>';
        }).join("");

        return '<ul class="c360-status-strip" aria-label="Data source status">' + items + '</ul>';
    }

    // =================================================================
    // What changed (spec section 22)
    // =================================================================

    function whatChanged(model) {
        var changes = util.list(model.whatChanged);

        var body = changes.length
            ? '<ul class="c360-changes">' + changes.map(function (change) {
                return '<li class="c360-change c360-change--' + esc(change.direction) + '">'
                     + c.directionGlyph(change.direction)
                     + '<div class="c360-change-body">'
                     + '<p class="c360-change-label">' + esc(change.label) + '</p>'
                     + '<p class="c360-change-text">' + esc(change.statement) + '</p>'
                     + '<p class="c360-change-meta">' + c.confidenceChip(change.confidence) + '</p>'
                     + c.evidence(change.evidence)
                     + '</div></li>';
              }).join("") + '</ul>'
            : c.emptyState("No notable changes were detected in the available data.");

        return c.section({
            id: "c360-what-changed",
            title: "What changed",
            note: "Recent movement on this account, rather than its standing state.",
            filterTags: ["all", "internal", "website", "external", "commercial", "support", "leadership"],
            body: body
        });
    }

    // =================================================================
    // Account summary (spec section 7)
    // =================================================================

    function summary(model) {
        var s = model.summary;

        // A div, not a p: the evidence disclosure is a <details> element, and
        // a <details> inside a <p> is invalid HTML that browsers silently
        // reflow by closing the paragraph early.
        var paragraphs = util.list(s.sentences).map(function (item) {
            return '<div class="c360-summary-line">' + esc(item.text)
                 + (item.evidence.length ? " " + c.evidence(item.evidence, "Source") : "")
                 + '</div>';
        }).join("");

        var headline = "";
        if (s.primaryOpportunity) {
            headline += c.card({
                eyebrow: '<span class="c360-eyebrow c360-eyebrow--good">Primary opportunity</span>',
                title: s.primaryOpportunity.title,
                body: '<p class="c360-card-text">' + esc(s.primaryOpportunity.action) + '</p>'
                    + '<p class="c360-card-sub">' + esc(s.primaryOpportunity.evidenceStatement) + '</p>',
                footer: c.confidenceChip(s.primaryOpportunity.confidence)
            });
        }
        if (s.primaryRisk) {
            headline += c.card({
                eyebrow: '<span class="c360-eyebrow c360-eyebrow--bad">Primary risk</span>',
                title: s.primaryRisk.title,
                body: '<p class="c360-card-text">' + esc(s.primaryRisk.statement) + '</p>',
                footer: c.severityChip(s.primaryRisk.severity, s.primaryRisk.severityBasis)
                      + c.confidenceChip(s.primaryRisk.confidence)
            });
        }

        return c.section({
            id: "c360-summary",
            title: "Account summary",
            meta: '<span class="c360-generated">Composed from records — no text is model-generated</span>',
            filterTags: ["all", "internal", "website", "external"],
            body: '<div class="c360-summary-grid">'
                + '<div class="c360-summary-text">' + paragraphs + '</div>'
                + (headline ? '<div class="c360-summary-cards">' + headline + '</div>' : "")
                + '</div>'
        });
    }

    // =================================================================
    // Health (spec section 8)
    // =================================================================

    function health(model) {
        var rows = util.list(model.health).map(function (dim) {
            return '<li class="c360-health-row c360-health-row--' + esc(dim.tone) + '">'
                 + '<span class="c360-health-dim">' + esc(dim.dimension) + '</span>'
                 + '<span class="c360-health-state">' + esc(dim.state) + '</span>'
                 + '<span class="c360-health-basis">' + esc(dim.basis) + '</span>'
                 + '</li>';
        }).join("");

        return c.section({
            id: "c360-health",
            title: "Account health",
            note: "Qualitative states only. No numeric score is shown, because the underlying "
                + "data does not support a defensible scoring methodology.",
            filterTags: ["all", "internal", "commercial", "support"],
            body: '<ul class="c360-health">' + rows + '</ul>'
        });
    }

    // =================================================================
    // Commercial activity (spec sections 9 and 10)
    // =================================================================

    function quoteCard(quote) {
        var tone = quote.isOpen ? "open" : null;
        return c.card({
            tone: tone,
            eyebrow: (quote.isOpen ? '<span class="c360-eyebrow c360-eyebrow--good">Open quote</span>' : "")
                   + c.sourceBadge(quote.sourceLabel, "internal") + c.mockBadge(quote.mock),
            title: "Quote " + quote.number,
            body: '<p class="c360-amount">' + esc(util.formatMoney(quote.amount, quote.currency)) + '</p>'
                + (quote.title ? '<p class="c360-card-sub">' + esc(quote.title) + '</p>' : "")
                + '<dl class="c360-kv-list">'
                + c.kv("Date", quote.date ? util.formatDate(quote.date) : null)
                + c.kvHtml("Status", c.statusChip(quote.status, quote.isOpen ? "good" : "neutral"))
                + c.kvHtml("Products", quote.products.length
                    ? quote.products.map(function (p) { return '<span class="c360-tag">' + esc(p) + '</span>'; }).join("")
                    : null)
                + c.kv("Owner", quote.owner)
                + '</dl>',
            footer: util.safeUrl(quote.url) ? c.link(quote.url, "View quote") : ""
        });
    }

    function orderCard(order, expansionSignal) {
        var signalHtml = "";
        if (expansionSignal) {
            signalHtml = '<p class="c360-signal c360-signal--' + esc(expansionSignal.direction) + '">'
                       + c.directionGlyph(expansionSignal.direction)
                       + '<strong>' + esc(expansionSignal.label) + '</strong> '
                       + esc(expansionSignal.statement) + '</p>';
        }

        return c.card({
            eyebrow: c.sourceBadge(order.sourceLabel, "internal") + c.mockBadge(order.mock),
            title: "Order " + order.number,
            body: '<p class="c360-amount">' + esc(util.formatMoney(order.value, order.currency)) + '</p>'
                + '<dl class="c360-kv-list">'
                + c.kv("Date", order.date ? util.formatDate(order.date) : null)
                + c.kv("Quantity", order.quantity !== null ? order.quantity + " units" : null)
                + c.kvHtml("Products", order.products.length
                    ? order.products.map(function (p) { return '<span class="c360-tag">' + esc(p) + '</span>'; }).join("")
                    : null)
                + c.kvHtml("Status", c.statusChip(order.status, "neutral"))
                + '</dl>'
                + signalHtml,
            footer: util.safeUrl(order.url) ? c.link(order.url, "View order") : ""
        });
    }

    function commercial(model, days) {
        var quotes = withinDays(model.commercial.quotes, days);
        var orders = withinDays(model.commercial.orders, days);

        // The volume signal is attached to the newest order it was derived
        // from, so the reader sees the comparison where the record lives.
        var volumeSignal = util.list(model.signals).filter(function (s) {
            return s.key === "orderVolume";
        })[0] || null;
        var signalOrderId = volumeSignal && volumeSignal.evidence.length
            ? volumeSignal.evidence[0].recordId : null;

        var quotesBody = quotes.length
            ? '<div class="c360-card-grid">' + quotes.map(quoteCard).join("") + '</div>'
            : c.emptyState(model.commercial.quotes.length
                ? "No quotes in the " + windowLabel(days) + ". Widen the date filter to see older quotes."
                : "No recent quotes found.");

        var ordersBody = orders.length
            ? '<div class="c360-card-grid">' + orders.map(function (order) {
                return orderCard(order, order.id === signalOrderId ? volumeSignal : null);
              }).join("") + '</div>'
            : c.emptyState(model.commercial.orders.length
                ? "No orders in the " + windowLabel(days) + ". Widen the date filter to see older orders."
                : "No recent orders found.");

        return c.section({
            id: "c360-commercial",
            title: "Commercial activity",
            meta: c.sourceBadge("Internal CRM", "internal"),
            filterTags: ["all", "internal", "commercial"],
            body: '<div class="c360-two-col">'
                + '<div class="c360-col"><h3 class="c360-col-title">Recent quotes</h3>' + quotesBody + '</div>'
                + '<div class="c360-col"><h3 class="c360-col-title">Recent orders</h3>' + ordersBody + '</div>'
                + '</div>'
        });
    }

    // =================================================================
    // Support and escalations (spec sections 11 and 12)
    // =================================================================

    function ticketRow(ticket) {
        var tone = ticket.escalated ? "bad" : (ticket.isOpen ? "watch" : "neutral");
        return '<li class="c360-ticket c360-ticket--' + esc(tone) + '">'
             + '<div class="c360-ticket-head">'
             + '<span class="c360-ticket-id">Ticket ' + esc(ticket.number) + '</span>'
             + (ticket.escalated ? '<span class="c360-chip c360-chip--high">Escalated</span>' : "")
             + c.statusChip(ticket.status, ticket.isOpen ? "watch" : "good")
             + c.statusChip(ticket.priority, ticket.priority === "High" ? "high" : "neutral")
             + c.mockBadge(ticket.mock)
             + '</div>'
             + '<p class="c360-ticket-subject">' + esc(ticket.subject || "No subject recorded") + '</p>'
             + '<dl class="c360-kv-list c360-kv-list--tight">'
             + c.kv("Opened", ticket.opened ? util.formatDate(ticket.opened) + " (" + util.relativeDays(ticket.opened) + ")" : null)
             + c.kv("Category", ticket.issueCategory)
             + c.kv("Owner", ticket.owner)
             + c.kv("Last update", ticket.lastUpdate ? util.relativeDays(ticket.lastUpdate) : null)
             + '</dl>'
             + (util.safeUrl(ticket.url) ? '<p>' + c.link(ticket.url, "Open ticket") + '</p>' : "")
             + '</li>';
    }

    /**
     * Ticket ordering (spec section 11): escalated, then high priority, then
     * unresolved, then most recent.
     */
    function prioritiseTickets(tickets) {
        return util.list(tickets).slice().sort(function (a, b) {
            if (a.escalated !== b.escalated) { return a.escalated ? -1 : 1; }
            var pa = a.priority === "High" ? 0 : a.priority === "Medium" ? 1 : 2;
            var pb = b.priority === "High" ? 0 : b.priority === "Medium" ? 1 : 2;
            if (pa !== pb) { return pa - pb; }
            if (a.isOpen !== b.isOpen) { return a.isOpen ? -1 : 1; }
            return util.byDateDesc(a, b);
        });
    }

    function escalationCard(item) {
        var tone = item.state === "RESOLVED" ? "good" : item.state === "AT RISK" ? "bad" : "watch";
        return c.card({
            tone: tone,
            eyebrow: c.statusChip(item.state || "State not recorded", tone)
                   + c.sourceBadge(item.sourceLabel, "internal") + c.mockBadge(item.mock),
            title: item.subject || "No subject recorded",
            body: '<dl class="c360-kv-list">'
                + c.kv("Raised", item.date ? util.formatDate(item.date) : null)
                + c.kv("Owner", item.owner)
                + c.kv("Last activity", item.lastActivity ? util.relativeDays(item.lastActivity) : null)
                + '</dl>'
                // Customer impact is only ever shown when a source recorded it,
                // together with where that claim came from.
                + (item.customerImpact
                    ? '<div class="c360-impact"><h4 class="c360-impact-title">Customer impact</h4>'
                      + '<p class="c360-impact-text">' + esc(item.customerImpact) + '</p>'
                      + (item.impactEvidence
                          ? '<p class="c360-impact-src">' + esc(item.impactEvidence) + '</p>' : "")
                      + '</div>'
                    : '<p class="c360-empty-inline">No customer impact has been recorded for this issue.</p>'),
            footer: util.safeUrl(item.url) ? c.link(item.url, "View issue") : ""
        });
    }

    function supportSection(model, days) {
        var support = model.support;
        var tickets = prioritiseTickets(withinDays(support.tickets, days));

        var stats = '<div class="c360-stat-row">'
            + c.statTile("Open tickets", support.openTickets.length,
                support.openTickets.length ? "watch" : "good")
            + c.statTile("Tickets in " + windowLabel(days), tickets.length, "neutral")
            + c.statTile("Escalated", support.escalatedTickets.length,
                support.escalatedTickets.length ? "bad" : "good")
            + '</div>';

        var ticketBody = tickets.length
            ? '<ul class="c360-ticket-list">' + tickets.slice(0, 8).map(ticketRow).join("") + '</ul>'
              + (tickets.length > 8
                  ? '<p class="c360-more">Showing the 8 highest-priority of '
                    + tickets.length + ' tickets in this period.</p>'
                  : "")
            : c.emptyState(support.tickets.length
                ? "No tickets in the " + windowLabel(days) + "."
                : "No open tickets found.");

        return c.section({
            id: "c360-support",
            title: "Support & technical activity",
            meta: c.sourceBadge("Support", "internal"),
            filterTags: ["all", "internal", "support"],
            body: stats + ticketBody
        });
    }

    function escalations(model) {
        var billing = util.list(model.support.billingIssues);
        var technical = util.list(model.support.technicalIssues);

        function column(title, items, kind) {
            var open = items.filter(function (i) { return i.state !== "RESOLVED"; });
            var head = '<h3 class="c360-col-title">' + esc(title) + '</h3>'
                     + '<p class="c360-col-count">'
                     + esc(open.length ? util.plural(open.length, "escalated issue") : "No escalated issues")
                     + '</p>';
            var body = items.length
                ? '<div class="c360-card-grid">' + items.map(escalationCard).join("") + '</div>'
                : c.emptyState("No escalated " + kind + " issues found.");
            return '<div class="c360-col">' + head + body + '</div>';
        }

        return c.section({
            id: "c360-escalations",
            title: "Escalations",
            meta: c.sourceBadge("Support", "internal"),
            filterTags: ["all", "internal", "support"],
            body: '<div class="c360-two-col">'
                + column("Billing", billing, "billing")
                + column("Technical", technical, "technical")
                + '</div>'
        });
    }

    // =================================================================
    // Account reviews (spec section 13)
    // =================================================================

    function reviews(model) {
        var list = util.list(model.reviews);

        if (!list.length) {
            return c.section({
                id: "c360-reviews",
                title: "Recent account reviews",
                meta: c.sourceBadge("Internal CRM", "internal"),
                filterTags: ["all", "internal"],
                body: c.emptyState("No recent account review found.")
            });
        }

        var latest = list[0];
        var body = c.card({
            eyebrow: '<span class="c360-eyebrow">Most recent</span>'
                   + c.sourceBadge(latest.sourceLabel, "internal") + c.mockBadge(latest.mock),
            title: latest.reviewType + " — " + util.formatDate(latest.date),
            body: '<dl class="c360-kv-list">'
                + c.kv("Date", util.formatDate(latest.date) + " (" + util.relativeDays(latest.date) + ")")
                + c.kvHtml("Attendees", latest.attendees.length ? esc(latest.attendees.join(", ")) : null)
                + '</dl>'
                + c.bulletGroup("Topics", latest.topics)
                + c.bulletGroup("Customer concerns", latest.concerns)
                + c.bulletGroup("Customer requests", latest.requests)
                + c.bulletGroup("Opportunities raised", latest.opportunities)
                + c.bulletGroup("Commitments made", latest.commitments)
                + c.bulletGroup("Follow-ups", latest.followUps),
            footer: util.safeUrl(latest.url) ? c.link(latest.url, "Open review") : ""
        });

        var earlier = list.slice(1);
        var earlierHtml = earlier.length
            ? '<details class="c360-earlier"><summary>Earlier reviews (' + earlier.length + ')</summary>'
              + '<ul class="c360-bullets">' + earlier.map(function (review) {
                  return '<li>' + esc(review.reviewType + " — " + util.formatDate(review.date)) + '</li>';
                }).join("") + '</ul></details>'
            : "";

        return c.section({
            id: "c360-reviews",
            title: "Recent account reviews",
            meta: c.sourceBadge("Internal CRM", "internal"),
            filterTags: ["all", "internal"],
            body: body + earlierHtml
        });
    }

    // =================================================================
    // External intelligence (spec sections 14, 15, 16)
    // =================================================================

    function websitePanel(model) {
        var site = model.website;

        if (!site) {
            return '<div class="c360-col"><h3 class="c360-col-title">Customer website</h3>'
                 + c.emptyState(model.account && model.account.website
                     ? "Website information could not be retrieved."
                     : "No customer website is recorded on this account.")
                 + '</div>';
        }

        var growth = util.list(site.growthSignals).length
            ? '<ul class="c360-news">' + site.growthSignals.map(function (signal) {
                return '<li class="c360-news-item">'
                     + '<p class="c360-news-date">' + esc(util.formatDate(signal.date)) + '</p>'
                     + '<p class="c360-news-title">' + esc(signal.title) + '</p>'
                     + (signal.detail ? '<p class="c360-news-summary">' + esc(signal.detail) + '</p>' : "")
                     + '<p class="c360-news-meta">'
                     + c.sourceBadge(signal.sourceLabel, "website")
                     + c.confidenceChip(signal.confidence)
                     + c.mockBadge(signal.mock)
                     + (util.safeUrl(signal.url) ? " " + c.link(signal.url, "Source") : "")
                     + '</p></li>';
              }).join("") + '</ul>'
            : c.emptyState("No growth indicators found on the customer website.");

        return '<div class="c360-col">'
             + '<h3 class="c360-col-title">Customer website ' + c.sourceBadge("Customer Website", "website") + '</h3>'
             + '<p class="c360-fetched">Retrieved ' + esc(util.formatDate(site.fetchedAt)) + '</p>'
             + (site.summary ? '<p class="c360-card-text">' + esc(site.summary) + '</p>' : "")
             + '<dl class="c360-kv-list">'
             + c.kv("Industry", site.industry)
             + c.kvHtml("Services", site.services.length
                 ? site.services.map(function (s) { return '<span class="c360-tag">' + esc(s) + '</span>'; }).join("")
                 : null)
             + c.kvHtml("Locations", site.locations.length ? esc(site.locations.join(" · ")) : null)
             + c.kvHtml("Markets served", site.marketsServed.length ? esc(site.marketsServed.join(" · ")) : null)
             // Quoted, not parsed into a number — the site's own words.
             + c.kv("Fleet (as stated)", site.fleetStatement)
             + '</dl>'
             + '<h4 class="c360-sub-title">Growth signals</h4>'
             + growth
             + (util.safeUrl(site.url) ? '<p>' + c.link(site.url, "Visit website") + '</p>' : "")
             + '</div>';
    }

    function newsPanel(model, days) {
        var items = withinDays(model.external, days);

        if (!items.length) {
            return '<div class="c360-col">'
                 + '<h3 class="c360-col-title">Recent company intelligence ' + c.sourceBadge("Web", "external") + '</h3>'
                 + c.emptyState("No significant public updates found in the " + windowLabel(days) + ".")
                 + '</div>';
        }

        var list = items.map(function (item) {
            return '<li class="c360-news-item c360-news-item--' + esc(item.category) + '">'
                 + '<p class="c360-news-date">' + esc(util.formatDate(item.date))
                 + ' <span class="c360-news-cat">' + esc(util.humanize(item.category)) + '</span></p>'
                 + '<p class="c360-news-title">' + esc(item.title) + '</p>'
                 + (item.summary ? '<p class="c360-news-summary">' + esc(item.summary) + '</p>' : "")
                 + '<p class="c360-news-meta">'
                 + c.sourceBadge(item.publisher || item.sourceLabel, "external")
                 + c.confidenceChip(item.confidence)
                 + c.mockBadge(item.mock)
                 + (util.safeUrl(item.url) ? " " + c.link(item.url, "Read source") : "")
                 + '</p></li>';
        }).join("");

        return '<div class="c360-col">'
             + '<h3 class="c360-col-title">Recent company intelligence ' + c.sourceBadge("Web", "external") + '</h3>'
             + '<ul class="c360-news">' + list + '</ul>'
             + '</div>';
    }

    function externalIntelligence(model, days) {
        return c.section({
            id: "c360-external",
            title: "External intelligence",
            note: "Public information. Nothing in this section comes from our internal systems.",
            filterTags: ["all", "website", "external"],
            body: '<div class="c360-two-col">' + websitePanel(model) + newsPanel(model, days) + '</div>'
        });
    }

    // =================================================================
    // Key contacts (spec sections 17 and 18)
    // =================================================================

    function contactCard(contact, position) {
        return c.card({
            eyebrow: '<span class="c360-rank">#' + position + '</span>'
                   + c.sourceBadge(contact.sourceLabel || util.humanize(contact.sourceType), contact.source)
                   + c.mockBadge(contact.mock),
            title: contact.name,
            body: '<p class="c360-contact-title">' + esc(contact.title || "Title not available") + '</p>'
                + '<dl class="c360-kv-list c360-kv-list--tight">'
                + c.kv("Role relevance", contact.roleRelevance)
                + c.kvHtml("Source", util.safeUrl(contact.sourceUrl)
                    ? c.link(contact.sourceUrl, contact.sourceLabel || "Source")
                    : (contact.sourceLabel ? esc(contact.sourceLabel) : null))
                + c.kv("Last verified", contact.lastVerified ? util.formatDate(contact.lastVerified) : null)
                // Never guessed: blank unless a source supplied it.
                + c.kv("Email", contact.email)
                + c.kv("Phone", contact.phone)
                + '</dl>'
                + (contact.corroboratedBy.length
                    ? '<p class="c360-corroborated">Also confirmed by: '
                      + esc(contact.corroboratedBy.join(", ")) + '</p>'
                    : "")
                + (contact.note ? '<p class="c360-card-sub">' + esc(contact.note) + '</p>' : ""),
            footer: '<span class="c360-chip c360-chip--' + esc(util.slug(contact.confidence)) + '">'
                  + esc(contact.confidence) + '</span>'
        });
    }

    function contacts(model) {
        var list = util.list(model.contacts);
        var gaps = util.list(model.roleGaps);

        var body = list.length
            ? '<div class="c360-card-grid">' + list.map(function (contact, i) {
                return contactCard(contact, i + 1);
              }).join("") + '</div>'
            : c.emptyState("No verified decision makers found.");

        var gapsHtml = gaps.length
            ? '<div class="c360-gaps"><h4 class="c360-sub-title">Roles with no verified contact</h4>'
              + '<p class="c360-gaps-note">These roles matter for this account type but no person '
              + 'was found in internal records or on the customer website. No contact has been '
              + 'inferred for them.</p>'
              + '<ul class="c360-bullets">' + gaps.map(function (gap) {
                  return '<li>' + esc(gap) + '</li>';
                }).join("") + '</ul></div>'
            : "";

        return c.section({
            id: "c360-contacts",
            title: "Key contacts",
            note: "Ranked by role relevance for this account type. Contacts are never inferred, "
                + "and email addresses are never guessed.",
            filterTags: ["all", "internal", "website", "leadership"],
            body: body + gapsHtml
        });
    }

    // =================================================================
    // Opportunities and risks (spec sections 19 and 20)
    // =================================================================

    function opportunities(model) {
        var list = util.list(model.opportunities);

        var body = list.length
            ? '<div class="c360-card-grid">' + list.map(function (opp) {
                return c.card({
                    tone: "good",
                    eyebrow: '<span class="c360-eyebrow c360-eyebrow--good">Opportunity</span>',
                    title: opp.title,
                    body: '<div class="c360-reason">'
                        + '<p class="c360-reason-label">Evidence</p>'
                        + '<p class="c360-reason-text">' + esc(opp.evidenceStatement) + '</p>'
                        + '<p class="c360-reason-label">Interpretation</p>'
                        + '<p class="c360-reason-text">' + esc(opp.interpretation) + '</p>'
                        + '<p class="c360-reason-label">Suggested action</p>'
                        + '<p class="c360-reason-text">' + esc(opp.action) + '</p>'
                        + '</div>'
                        + c.evidence(opp.evidence),
                    footer: c.confidenceChip(opp.confidence)
                });
              }).join("") + '</div>'
            : c.emptyState("No evidence-backed opportunities were identified.");

        return c.section({
            id: "c360-opportunities",
            title: "Potential opportunities",
            note: "Each item separates what a source recorded from what it might mean.",
            filterTags: ["all", "internal", "website", "external", "commercial"],
            body: body
        });
    }

    function risks(model) {
        var list = util.list(model.risks);

        var body = list.length
            ? '<div class="c360-card-grid">' + list.map(function (risk) {
                return c.card({
                    tone: "bad",
                    eyebrow: '<span class="c360-eyebrow c360-eyebrow--bad">Risk</span>'
                           + c.severityChip(risk.severity, risk.severityBasis),
                    title: risk.title,
                    body: '<p class="c360-card-text">' + esc(risk.statement) + '</p>'
                        + '<p class="c360-card-sub">Severity basis: ' + esc(risk.severityBasis) + '</p>'
                        + c.evidence(risk.evidence),
                    footer: c.confidenceChip(risk.confidence)
                });
              }).join("") + '</div>'
            : c.emptyState("No evidence-backed risks were identified.");

        return c.section({
            id: "c360-risks",
            title: "Account risks",
            note: "Every risk is derived from a record. No risk score is produced.",
            filterTags: ["all", "internal", "external", "support"],
            body: body
        });
    }

    // =================================================================
    // Timeline (spec section 21)
    // =================================================================

    function timeline(model, days) {
        var entries = withinDays(model.timeline, days);

        var body = entries.length
            ? '<ol class="c360-timeline">' + entries.map(function (entry) {
                return '<li class="c360-tl-item c360-tl-item--' + esc(entry.source) + '">'
                     + '<div class="c360-tl-date">'
                     + '<span class="c360-tl-day">' + esc(util.formatDate(entry.date)) + '</span>'
                     + '<span class="c360-tl-rel">' + esc(util.relativeDays(entry.date)) + '</span>'
                     + '</div>'
                     + '<div class="c360-tl-body">'
                     + '<p class="c360-tl-title">' + esc(entry.title) + '</p>'
                     + (entry.detail ? '<p class="c360-tl-detail">' + esc(entry.detail) + '</p>' : "")
                     + '<p class="c360-tl-meta">'
                     + c.sourceBadge(entry.sourceLabel, entry.source)
                     + c.mockBadge(entry.mock)
                     + (util.safeUrl(entry.url) ? " " + c.link(entry.url, "Source") : "")
                     + '</p></div></li>';
              }).join("") + '</ol>'
            : c.emptyState("No activity recorded in the " + windowLabel(days) + ".");

        return c.section({
            id: "c360-timeline",
            title: "Activity timeline",
            meta: '<span class="c360-section-meta-text">' + esc(util.humanize(windowLabel(days))) + '</span>',
            note: "Internal and external activity interleaved in date order.",
            filterTags: ["all", "internal", "website", "external", "commercial", "support", "leadership"],
            body: body
        });
    }

    // =================================================================
    // Recommended next actions (spec section 23)
    // =================================================================

    function recommendations(model) {
        var list = util.list(model.recommendations);

        var body = list.length
            ? '<ol class="c360-actions">' + list.map(function (action, i) {
                return '<li class="c360-action c360-action--' + esc(util.slug(action.priority)) + '">'
                     + '<span class="c360-action-num">' + (i + 1) + '</span>'
                     + '<div class="c360-action-body">'
                     + '<p class="c360-action-text">' + esc(action.text) + '</p>'
                     + '<p class="c360-action-why"><span class="c360-action-why-label">Why:</span> '
                     + esc(action.rationale) + '</p>'
                     + c.evidence(action.evidence)
                     + '</div>'
                     + c.priorityChip(action.priority)
                     + '</li>';
              }).join("") + '</ol>'
            : c.emptyState("No recommended actions were generated from the available evidence.");

        return c.section({
            id: "c360-actions",
            title: "Recommended next actions",
            note: "Generated from the risks and opportunities above. An action never names a "
                + "contact who has not been verified.",
            filterTags: ["all", "internal", "website", "external"],
            body: body
        });
    }

    // =================================================================
    // Sources (spec section 24)
    // =================================================================

    function sources(model) {
        function group(title, type, items) {
            if (!items.length) {
                return '<div class="c360-col"><h3 class="c360-col-title">' + esc(title) + '</h3>'
                     + c.emptyState("No sources in this category.") + '</div>';
            }
            return '<div class="c360-col"><h3 class="c360-col-title">' + esc(title) + " "
                 + c.sourceBadge(title, type) + '</h3>'
                 + '<ul class="c360-source-list">' + items.map(function (item) {
                     return '<li class="c360-source-item">'
                          + '<span class="c360-source-text">' + esc(item.statement) + '</span>'
                          + '<span class="c360-source-meta">'
                          + esc(item.date ? util.formatDate(item.date) : "Date not available")
                          + c.mockBadge(item.mock)
                          + (util.safeUrl(item.url) ? " " + c.link(item.url, item.sourceLabel || "Source") : "")
                          + '</span></li>';
                   }).join("") + '</ul></div>';
        }

        var facts = util.list(model.facts);
        var internal = facts.filter(function (f) { return f.source === "internal"; });
        var web = facts.filter(function (f) { return f.source === "website"; });
        var external = facts.filter(function (f) { return f.source === "external"; });

        return c.section({
            id: "c360-sources",
            title: "Sources",
            note: "Every claim on this page is derived from one of these records. "
                + "Load status for each source is shown under the account header.",
            filterTags: ["all", "internal", "website", "external"],
            body: '<div class="c360-three-col">'
                + group("Internal", "internal", internal)
                + group("Customer Website", "website", web)
                + group("External Web", "external", external)
                + '</div>'
        });
    }

    // =================================================================
    // Whole dashboard
    // =================================================================

    function dashboard(model, meta) {
        var days = meta.dateFilterDays;

        return whatChanged(model)
             + summary(model)
             + health(model)
             + commercial(model, days)
             + supportSection(model, days)
             + escalations(model)
             + reviews(model)
             + externalIntelligence(model, days)
             + contacts(model)
             + opportunities(model)
             + risks(model)
             + timeline(model, days)
             + recommendations(model)
             + sources(model);
    }

    return {
        accountHeader: accountHeader,
        sourceStatus: sourceStatus,
        dashboard: dashboard,
        withinDays: withinDays,
        prioritiseTickets: prioritiseTickets
    };
}());
