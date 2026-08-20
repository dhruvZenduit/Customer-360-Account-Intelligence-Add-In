/**
 * Customer 360 — billing escalation service  [INTERNAL / SUPPORT]
 *
 * Escalated *billing* issues only: disputes, unexpected charges, pricing and
 * credit problems. Kept separate from technicalService because the two are
 * shown, owned and acted on differently (spec section 12).
 */

"use strict";

C360.billingService = C360.cachedService.create({
    source: "billing",
    ttlClass: "internal",
    label: "Billing escalations",
    fetch: function (accountId, ctx) {
        return C360.dataSource.getBillingIssues(accountId, ctx);
    },
    normalize: function (raw) {
        return C360.normalize.escalations(raw, "billing");
    }
});
