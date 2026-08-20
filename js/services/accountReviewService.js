/**
 * Customer 360 — account review service  [INTERNAL]
 *
 * QBRs / EBRs and their notes. The most recent review is the highest-signal
 * internal record on the account: it is the only source that states customer
 * concerns and commitments in the customer's own framing.
 */

"use strict";

C360.accountReviewService = C360.cachedService.create({
    source: "reviews",
    ttlClass: "internal",
    label: "Account reviews",
    fetch: function (accountId, ctx) {
        return C360.dataSource.getReviews(accountId, ctx);
    },
    normalize: function (raw) {
        return C360.normalize.reviews(raw);
    }
});
