/**
 * Customer 360 — runtime configuration
 * ------------------------------------
 * One place for every tunable value. Nothing here is a secret: this file ships
 * to the browser, so it must never contain an API key, token, or credential
 * (see README "Privacy and security"). Secrets live only behind the gateway.
 */

"use strict";

C360.config = {

    /**
     * Where internal + research data comes from.
     *
     *   "mock"    — bundled sample data. Clearly badged MOCK in the UI.
     *               This is the default because no backend exists yet.
     *   "gateway" — a server-side gateway that holds the CRM / helpdesk /
     *               research credentials and exposes read-only JSON endpoints.
     *               See gatewayClient.js for the exact contract.
     *
     * Override at runtime without a redeploy via the ?dataSource= query
     * parameter (resolved in dataSource.js).
     */
    dataSource: "mock",

    /**
     * Base URL of the intelligence gateway. Empty until one is deployed.
     * Overridable with ?gateway=https://... for staging.
     */
    gatewayBaseUrl: "",

    /**
     * Cache lifetimes, in milliseconds, per source class.
     * Internal data changes often and is cheap; external research is slow and
     * rate-limited, so it is cached far longer. Manual refresh bypasses all of
     * these (see cache.bypass).
     */
    cacheTtlMs: {
        internal: 5 * 60 * 1000,        // 5 minutes
        website: 24 * 60 * 60 * 1000,   // 24 hours
        external: 6 * 60 * 60 * 1000    // 6 hours
    },

    /** Date-range filter options offered in the toolbar. */
    dateFilters: [
        { id: "30d", label: "30 days", days: 30 },
        { id: "90d", label: "90 days", days: 90 },
        { id: "6m", label: "6 months", days: 182 },
        { id: "12m", label: "12 months", days: 365 }
    ],

    /** Filter applied on first load. */
    defaultDateFilterId: "90d",

    /**
     * How far back sources are actually FETCHED, regardless of the date filter.
     *
     * The filter narrows what is displayed; it must not narrow what is
     * fetched. The order-volume rule compares the latest order against an
     * older comparable one, so fetching only the last 30 days would silently
     * delete that signal. Fetching one wide window also keeps the cache key
     * free of the filter, so switching period is instant and never refetches.
     */
    fetchWindowDays: 365,

    /** Source-category filters offered in the toolbar. */
    sourceFilters: [
        { id: "all", label: "All" },
        { id: "internal", label: "Internal" },
        { id: "website", label: "Website" },
        { id: "external", label: "External" },
        { id: "commercial", label: "Commercial" },
        { id: "support", label: "Support" },
        { id: "leadership", label: "Leadership" }
    ],

    /**
     * Contact prioritisation — deliberately configurable rather than hardcoded
     * to fleet-heavy companies (spec §18).
     *
     * A profile is an ordered list of title patterns. contactService scores a
     * contact by the index of the first pattern its title matches, so earlier
     * entries rank higher. `match` is tested case-insensitively as a substring
     * list — a contact matches an entry if ANY of its strings appear.
     *
     * Profiles are selected by account.contactProfile, falling back to
     * `defaultProfile`.
     */
    contactProfiles: {
        "fleet-heavy": [
            { label: "Fleet leadership", match: ["fleet director", "director of fleet", "fleet manager", "vp fleet"] },
            { label: "Operations leadership", match: ["vp operations", "vice president of operations", "director of operations", "coo", "chief operating"] },
            { label: "Safety leadership", match: ["director of safety", "safety director", "safety manager", "vp safety"] },
            { label: "Procurement", match: ["procurement", "purchasing", "sourcing"] },
            { label: "Transportation", match: ["transportation manager", "transportation director", "dispatch"] },
            { label: "Executive", match: ["ceo", "chief executive", "president", "owner"] },
            { label: "Finance", match: ["cfo", "chief financial", "controller"] },
            { label: "IT", match: ["it director", "cio", "chief information", "director of it", "it manager"] }
        ],
        "small-business": [
            { label: "Owner / executive", match: ["owner", "ceo", "chief executive", "president", "founder"] },
            { label: "Operations", match: ["operations manager", "director of operations", "coo", "general manager"] },
            { label: "Fleet", match: ["fleet manager", "fleet director"] },
            { label: "Finance", match: ["cfo", "controller", "bookkeeper"] },
            { label: "Safety", match: ["safety"] },
            { label: "IT", match: ["it "] }
        ],
        "enterprise": [
            { label: "Operations leadership", match: ["vp operations", "svp operations", "director of operations", "coo", "chief operating"] },
            { label: "Fleet leadership", match: ["fleet director", "director of fleet", "vp fleet", "fleet manager"] },
            { label: "IT leadership", match: ["cio", "chief information", "it director", "director of it", "cto"] },
            { label: "Procurement", match: ["procurement", "sourcing", "purchasing"] },
            { label: "Safety leadership", match: ["director of safety", "vp safety", "safety director"] },
            { label: "Finance", match: ["cfo", "chief financial", "controller"] },
            { label: "Executive", match: ["ceo", "chief executive", "president"] }
        ]
    },

    defaultProfile: "fleet-heavy",

    /**
     * Thresholds used by the intelligence engine. Every one of these is a
     * judgement call, so they live here where they can be argued about and
     * changed — not buried inside the rules.
     */
    thresholds: {
        /** An order-quantity change of at least this fraction is a signal. */
        orderVolumeChangePct: 0.10,
        /** A quote older than this with no decision is treated as stalling. */
        staleQuoteDays: 30,
        /** No account review in this long is a relationship risk. */
        staleReviewDays: 365,
        /** A review this old is worth flagging in "What changed". */
        agingReviewDays: 120,
        /** This many tickets of one category is a "repeat issue" pattern. */
        repeatIssueCount: 3,
        /** Tickets open longer than this are called out as ageing. */
        ageingTicketDays: 14,
        /** "Recent" for the What Changed / activity summary. */
        recentActivityDays: 30
    },

    /**
     * OUR product lines — used only to spot which of them an account shows no
     * evidence of using. This is our own catalogue, not a claim about the
     * customer, and the resulting signal is always worded as "no usage found
     * in available internal data" (spec section 19).
     *
     * Replace with the real catalogue, or feed it from the gateway, before
     * relying on the product-gap opportunity.
     */
    productCatalogue: [
        "Telematics Core",
        "Driver Safety Cameras",
        "Compliance / HOS",
        "Routing & Dispatch",
        "Asset Tracking"
    ],

    /** Confidence vocabulary, kept in one place so wording never drifts. */
    confidence: {
        HIGH: "High",
        MEDIUM: "Medium",
        LOW: "Low"
    }
};
