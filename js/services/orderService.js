/**
 * Customer 360 — order service  [INTERNAL]
 */

"use strict";

C360.orderService = C360.cachedService.create({
    source: "orders",
    ttlClass: "internal",
    label: "Orders",
    fetch: function (accountId, ctx) {
        return C360.dataSource.getOrders(accountId, ctx);
    },
    normalize: function (raw) {
        return C360.normalize.orders(raw);
    }
});
