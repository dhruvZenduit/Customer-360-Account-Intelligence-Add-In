/**
 * Customer 360 — quote service  [INTERNAL]
 */

"use strict";

C360.quoteService = C360.cachedService.create({
    source: "quotes",
    ttlClass: "internal",
    label: "Quotes",
    fetch: function (accountId, ctx) {
        return C360.dataSource.getQuotes(accountId, ctx);
    },
    normalize: function (raw) {
        return C360.normalize.quotes(raw);
    }
});
