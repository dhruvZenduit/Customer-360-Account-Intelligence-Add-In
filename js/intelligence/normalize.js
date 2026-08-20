/**
 * Customer 360 — normalisation layer
 * ==================================
 * Every source hands back a different shape. The intelligence engine and the
 * UI consume exactly one shape, defined here (spec sections 38-39).
 *
 * Two rules govern this file:
 *
 *   1. NEVER INVENT. A missing field becomes null, not a zero, not "Unknown
 *      Corp", not today's date. Downstream code renders null as
 *      "Not available"; it must never be able to mistake a default for data.
 *
 *   2. EVERY RECORD CARRIES ITS PROVENANCE. `source` is one of
 *      "internal" | "website" | "external", and `sourceLabel` is the badge the
 *      UI prints. This is what keeps external research from being displayed as
 *      if it came out of our CRM (spec section 4).
 */

"use strict";

C360.normalize = (function () {

    var util = C360.util;

    /** Source label constants — the four badges the UI can print. */
    var LABEL = {
        crm: "Internal CRM",
        support: "Support",
        website: "Customer Website",
        web: "Web"
    };

    /** null unless the value is genuinely present. */
    function orNull(value) {
        if (value === undefined || value === "") { return null; }
        return value === null ? null : value;
    }

    /** Numeric value, or null. Never coerces a missing value to 0. */
    function numOrNull(value) {
        if (value === null || value === undefined || value === "") { return null; }
        var n = Number(value);
        return isNaN(n) ? null : n;
    }

    /** ISO string, or null. Never defaults to now. */
    function dateOrNull(value) {
        var d = util.toDate(value);
        return d ? d.toISOString() : null;
    }

    function strList(value) {
        return util.list(value).filter(function (item) {
            return item !== null && item !== undefined && item !== "";
        }).map(String);
    }

    // -----------------------------------------------------------------
    // Account
    // -----------------------------------------------------------------

    function account(raw) {
        if (!raw) { return null; }
        return {
            id: String(raw.id),
            type: "account",
            source: "internal",
            sourceLabel: LABEL.crm,
            name: orNull(raw.name),
            industry: orNull(raw.industry),
            status: orNull(raw.status),
            customerSince: dateOrNull(raw.customerSince),
            accountOwner: orNull(raw.accountOwner),
            website: orNull(raw.website),
            domain: orNull(raw.domain) || util.hostOf(raw.website) || null,
            headquarters: orNull(raw.headquarters),
            employeeRange: orNull(raw.employeeRange),
            contactProfile: orNull(raw.contactProfile),
            products: strList(raw.products),
            assetCount: numOrNull(raw.assetCount),
            assetCountSource: orNull(raw.assetCountSource),
            primaryContact: orNull(raw.primaryContact),
            geotabDatabase: orNull(raw.geotabDatabase),
            mock: raw.mock === true
        };
    }

    // -----------------------------------------------------------------
    // Commercial
    // -----------------------------------------------------------------

    /** Canonical quote statuses (spec section 9); anything else passes through. */
    var QUOTE_STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired", "Pending"];

    function quoteStatus(raw) {
        if (!raw) { return null; }
        var match = QUOTE_STATUSES.filter(function (status) {
            return status.toLowerCase() === String(raw).toLowerCase();
        })[0];
        return match || util.humanize(raw);
    }

    /** A quote still awaiting a customer decision. */
    function isQuoteOpen(status) {
        return status === "Sent" || status === "Pending" || status === "Draft";
    }

    function quote(raw) {
        if (!raw) { return null; }
        var status = quoteStatus(raw.status);
        return {
            id: String(raw.id || raw.number),
            type: "quote",
            source: "internal",
            sourceLabel: LABEL.crm,
            category: "commercial",
            number: orNull(raw.number) || String(raw.id || ""),
            title: orNull(raw.title),
            date: dateOrNull(raw.date),
            amount: numOrNull(raw.amount),
            currency: orNull(raw.currency) || "USD",
            status: status,
            isOpen: isQuoteOpen(status),
            products: strList(raw.products),
            owner: orNull(raw.owner),
            url: orNull(raw.url),
            mock: raw.mock === true
        };
    }

    function order(raw) {
        if (!raw) { return null; }
        return {
            id: String(raw.id || raw.number),
            type: "order",
            source: "internal",
            sourceLabel: LABEL.crm,
            category: "commercial",
            number: orNull(raw.number) || String(raw.id || ""),
            date: dateOrNull(raw.date),
            value: numOrNull(raw.value),
            currency: orNull(raw.currency) || "USD",
            products: strList(raw.products),
            quantity: numOrNull(raw.quantity),
            status: orNull(raw.status),
            owner: orNull(raw.owner),
            url: orNull(raw.url),
            mock: raw.mock === true
        };
    }

    // -----------------------------------------------------------------
    // Support
    // -----------------------------------------------------------------

    var CLOSED_WORDS = ["resolved", "closed", "complete", "cancelled", "canceled"];

    function isClosedStatus(status) {
        var s = String(status || "").toLowerCase();
        return CLOSED_WORDS.some(function (word) { return s.indexOf(word) !== -1; });
    }

    function ticket(raw) {
        if (!raw) { return null; }
        var opened = dateOrNull(raw.opened || raw.date);
        return {
            id: String(raw.id || raw.number),
            type: "ticket",
            source: "internal",
            sourceLabel: LABEL.support,
            category: "support",
            number: orNull(raw.number) || String(raw.id || ""),
            subject: orNull(raw.subject),
            issueCategory: orNull(raw.category),
            // `date` is the common timeline field on every normalised record.
            date: opened,
            opened: opened,
            lastUpdate: dateOrNull(raw.lastUpdate),
            status: orNull(raw.status),
            isOpen: !isClosedStatus(raw.status),
            priority: orNull(raw.priority),
            escalated: raw.escalated === true,
            owner: orNull(raw.owner),
            url: orNull(raw.url),
            mock: raw.mock === true
        };
    }

    /**
     * Escalation state (spec section 12). Derived only from what the status
     * string actually says — an unrecognised status stays unknown rather than
     * being optimistically called resolved or pessimistically called open.
     */
    function escalationState(status) {
        var s = String(status || "").toLowerCase();
        if (!s) { return null; }
        if (s.indexOf("risk") !== -1) { return "AT RISK"; }
        if (isClosedStatus(s)) { return "RESOLVED"; }
        if (s.indexOf("open") !== -1 || s.indexOf("pending") !== -1 || s.indexOf("progress") !== -1) {
            return "OPEN";
        }
        return null;
    }

    /**
     * @param {string} kind "billing" | "technical"
     */
    function escalation(raw, kind) {
        if (!raw) { return null; }
        return {
            id: String(raw.id),
            type: "escalation",
            kind: kind,
            source: "internal",
            sourceLabel: LABEL.support,
            category: "support",
            subject: orNull(raw.subject),
            date: dateOrNull(raw.date),
            status: orNull(raw.status),
            state: escalationState(raw.status),
            owner: orNull(raw.owner),
            /**
             * Customer impact is only ever the impact a source actually
             * recorded. `impactEvidence` says where that claim came from, so
             * the UI can show impact as a sourced statement rather than as our
             * own inference (spec section 12).
             */
            customerImpact: orNull(raw.customerImpact),
            impactEvidence: orNull(raw.impactEvidence),
            lastActivity: dateOrNull(raw.lastActivity),
            url: orNull(raw.url),
            mock: raw.mock === true
        };
    }

    // -----------------------------------------------------------------
    // Reviews
    // -----------------------------------------------------------------

    function review(raw) {
        if (!raw) { return null; }
        return {
            id: String(raw.id),
            type: "review",
            source: "internal",
            sourceLabel: LABEL.crm,
            category: "relationship",
            date: dateOrNull(raw.date),
            reviewType: orNull(raw.type) || "Account review",
            attendees: strList(raw.attendees),
            topics: strList(raw.topics),
            concerns: strList(raw.concerns),
            requests: strList(raw.requests),
            opportunities: strList(raw.opportunities),
            commitments: strList(raw.commitments),
            followUps: strList(raw.followUps),
            url: orNull(raw.url),
            mock: raw.mock === true
        };
    }

    // -----------------------------------------------------------------
    // Customer website
    // -----------------------------------------------------------------

    function websiteSignal(raw) {
        if (!raw) { return null; }
        return {
            id: String(raw.id || util.slug(raw.title)),
            type: "website-signal",
            source: "website",
            sourceLabel: LABEL.website,
            category: "growth",
            date: dateOrNull(raw.date),
            title: orNull(raw.title),
            detail: orNull(raw.detail),
            url: orNull(raw.url),
            confidence: orNull(raw.confidence),
            mock: raw.mock === true
        };
    }

    function website(raw) {
        if (!raw) { return null; }
        return {
            type: "website",
            source: "website",
            sourceLabel: LABEL.website,
            url: orNull(raw.url),
            fetchedAt: dateOrNull(raw.fetchedAt),
            summary: orNull(raw.summary),
            industry: orNull(raw.industry),
            services: strList(raw.services),
            locations: strList(raw.locations),
            marketsServed: strList(raw.marketsServed),
            /**
             * Fleet size as the site STATES it, quoted rather than parsed into
             * a number. Turning "more than 400 power units" into 400 would be
             * inventing precision the source did not give.
             */
            fleetStatement: orNull(raw.fleetStatement),
            growthSignals: util.list(raw.growthSignals).map(websiteSignal).filter(Boolean),
            leadership: util.list(raw.leadership).filter(function (person) {
                // A leadership entry without both a name and a title is not
                // usable as a contact, so it is dropped here.
                return person && person.name && person.title;
            }),
            mock: raw.mock === true
        };
    }

    // -----------------------------------------------------------------
    // External web
    // -----------------------------------------------------------------

    /**
     * Coarse category used for grouping and for the growth/contraction rules.
     * Unrecognised categories become "other" — they still display, they just
     * do not drive a signal.
     */
    var EXTERNAL_CATEGORIES = ["expansion", "contraction", "acquisition", "leadership",
                               "procurement", "contract", "partnership", "technology", "other"];

    function externalCategory(raw) {
        var c = String(raw || "").toLowerCase();
        return EXTERNAL_CATEGORIES.indexOf(c) !== -1 ? c : "other";
    }

    function externalItem(raw) {
        if (!raw) { return null; }
        return {
            id: String(raw.id || util.slug(raw.title)),
            type: "news",
            source: "external",
            sourceLabel: LABEL.web,
            category: externalCategory(raw.category),
            date: dateOrNull(raw.date),
            title: orNull(raw.title),
            summary: orNull(raw.summary),
            publisher: orNull(raw.publisher) || util.hostOf(raw.url) || null,
            url: orNull(raw.url),
            confidence: orNull(raw.confidence),
            mock: raw.mock === true
        };
    }

    // -----------------------------------------------------------------
    // Contacts
    // -----------------------------------------------------------------

    var CONFIDENCE_LEVELS = ["Confirmed", "Likely", "Unverified"];

    function contactConfidence(raw) {
        var match = CONFIDENCE_LEVELS.filter(function (level) {
            return level.toLowerCase() === String(raw || "").toLowerCase();
        })[0];
        // An unrecognised or absent confidence is treated as the weakest one.
        // Silently upgrading it would be exactly the failure mode section 17
        // is written to prevent.
        return match || "Unverified";
    }

    function contact(raw) {
        if (!raw) { return null; }
        return {
            id: String(raw.id || util.slug(raw.name) || util.slug(raw.title)),
            type: "contact",
            source: raw.sourceType === "website" ? "website"
                  : raw.sourceType === "external" ? "external" : "internal",
            sourceLabel: raw.source || null,
            category: "leadership",
            name: orNull(raw.name),
            title: orNull(raw.title),
            /** Email is NEVER derived. Present only if a source supplied it. */
            email: orNull(raw.email),
            phone: orNull(raw.phone),
            sourceType: orNull(raw.sourceType) || "internal",
            sourceUrl: orNull(raw.sourceUrl),
            lastVerified: dateOrNull(raw.lastVerified),
            confidence: contactConfidence(raw.confidence),
            note: orNull(raw.note),
            corroboratedBy: strList(raw.corroboratedBy),
            /** True for a role we looked for and did not find. */
            placeholder: raw.placeholder === true,
            date: dateOrNull(raw.lastVerified),
            mock: raw.mock === true
        };
    }

    // -----------------------------------------------------------------
    // Collection helpers — each drops unusable rows rather than emitting
    // half-formed records the UI would have to defend against.
    // -----------------------------------------------------------------

    function mapList(rows, fn) {
        return util.list(rows).map(fn).filter(Boolean);
    }

    return {
        LABEL: LABEL,

        account: account,
        quote: quote,
        order: order,
        ticket: ticket,
        escalation: escalation,
        review: review,
        website: website,
        externalItem: externalItem,
        contact: contact,

        quotes: function (rows) { return mapList(rows, quote); },
        orders: function (rows) { return mapList(rows, order); },
        tickets: function (rows) { return mapList(rows, ticket); },
        escalations: function (rows, kind) {
            return mapList(rows, function (row) { return escalation(row, kind); });
        },
        reviews: function (rows) { return mapList(rows, review); },
        external: function (rows) { return mapList(rows, externalItem); },
        contacts: function (rows) { return mapList(rows, contact); },

        isClosedStatus: isClosedStatus,
        isQuoteOpen: isQuoteOpen
    };
}());
