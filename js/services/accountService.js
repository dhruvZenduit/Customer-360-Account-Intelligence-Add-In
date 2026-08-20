/**
 * Customer 360 — account service
 * ------------------------------
 * Account search and the account record itself. This is the entry point of the
 * whole pipeline: nothing else loads until an account has been identified.
 */

"use strict";

C360.accountService = (function () {

    var service = C360.cachedService.create({
        source: "account",
        ttlClass: "internal",
        label: "Account record",
        fetch: function (accountId) {
            return C360.dataSource.getAccount(accountId);
        },
        normalize: function (raw) {
            return C360.normalize.account(raw);
        }
    });

    /**
     * Search accounts by name or industry.
     *
     * Deliberately NOT cached: the user types, and a stale result list is
     * worse than a fast one. Rejections bubble up to the search UI.
     */
    function search(query) {
        return C360.dataSource.searchAccounts(query).then(function (rows) {
            return C360.util.list(rows).map(C360.normalize.account);
        });
    }

    return {
        search: search,
        load: service.load,
        source: service.source,
        label: service.label
    };
}());
