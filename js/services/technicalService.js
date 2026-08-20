/**
 * Customer 360 — technical escalation service  [INTERNAL / SUPPORT]
 *
 * Escalated *technical* issues: device failures, connectivity, integration,
 * software defects, installation and data problems.
 */

"use strict";

C360.technicalService = C360.cachedService.create({
    source: "technical",
    ttlClass: "internal",
    label: "Technical escalations",
    fetch: function (accountId, ctx) {
        return C360.dataSource.getTechnicalIssues(accountId, ctx);
    },
    normalize: function (raw) {
        return C360.normalize.escalations(raw, "technical");
    }
});
