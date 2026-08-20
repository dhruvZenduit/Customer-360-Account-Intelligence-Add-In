/**
 * Customer 360 — customer website research  [CUSTOMER WEBSITE]
 *
 * Public information from the customer's OWN site: description, services,
 * locations, any stated fleet size, growth signals, leadership.
 *
 * Cached for a day (config.cacheTtlMs.website) — company websites change on
 * the order of weeks, and re-fetching one per page view would be wasteful.
 *
 * Privacy: only the account's public domain and company name are ever passed
 * outward; see gatewayClient.buildResearchParams.
 */

"use strict";

C360.websiteResearchService = C360.cachedService.create({
    source: "website",
    ttlClass: "website",
    label: "Customer website",
    fetch: function (accountId, ctx) {
        var account = (ctx && ctx.account) || {};
        // No website on the account record means there is nothing to fetch.
        // Guessing a domain from the company name would be fabrication.
        if (!account.website && !account.domain) {
            return Promise.resolve(null);
        }
        return C360.dataSource.getWebsiteExtract(accountId, ctx);
    },
    normalize: function (raw) {
        return C360.normalize.website(raw);
    }
});
