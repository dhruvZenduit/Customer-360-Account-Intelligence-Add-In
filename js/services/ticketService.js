/**
 * Customer 360 — ticket service  [INTERNAL / SUPPORT]
 */

"use strict";

C360.ticketService = C360.cachedService.create({
    source: "tickets",
    ttlClass: "internal",
    label: "Support tickets",
    fetch: function (accountId, ctx) {
        return C360.dataSource.getTickets(accountId, ctx);
    },
    normalize: function (raw) {
        return C360.normalize.tickets(raw);
    }
});
