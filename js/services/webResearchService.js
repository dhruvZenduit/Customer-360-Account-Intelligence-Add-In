/**
 * Customer 360 — external web research  [EXTERNAL WEB]
 *
 * Public information from outside the customer's own site: trade press,
 * announcements, filings, contract awards, layoffs, leadership changes.
 *
 * This is the least reliable source in the system, so everything it returns is
 * normalised with an explicit publisher, URL, date and confidence, and the UI
 * never mixes it in with internal CRM records (spec section 4).
 *
 * Cached for 6 hours: news genuinely changes during a working day, but not
 * between two page views a minute apart.
 */

"use strict";

C360.webResearchService = C360.cachedService.create({
    source: "external",
    ttlClass: "external",
    label: "External web research",
    fetch: function (accountId, ctx) {
        var account = (ctx && ctx.account) || {};
        if (!account.name) {
            return Promise.resolve([]);
        }
        return C360.dataSource.getExternalResearch(accountId, ctx);
    },
    normalize: function (raw) {
        return C360.normalize.external(raw);
    }
});
