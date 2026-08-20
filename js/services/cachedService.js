/**
 * Customer 360 — cached service factory
 * -------------------------------------
 * Every source service (quotes, orders, tickets, website, research, ...) has
 * the same lifecycle: check the cache, otherwise fetch, then record that the
 * fetch succeeded so a later failure can still say when data was last good.
 *
 * That lifecycle lives here once. Each service file below stays as small as
 * its actual responsibility: which adapter call it makes, which cache bucket
 * it uses, and how it normalises the result.
 */

"use strict";

C360.cachedService = (function () {

    /**
     * Build a service.
     *
     * @param {object} spec
     * @param {string} spec.source     cache bucket + status key ("quotes", ...)
     * @param {string} spec.ttlClass   "internal" | "website" | "external"
     * @param {string} spec.label      human label used in the source-status strip
     * @param {function} spec.fetch    (accountId, ctx) => Promise<raw>
     * @param {function} [spec.normalize] (raw, ctx) => value stored and returned
     */
    function create(spec) {

        function ttl() {
            return C360.config.cacheTtlMs[spec.ttlClass] || 0;
        }

        /**
         * Load this source for an account.
         *
         * @param {string} accountId
         * @param {object} ctx      { account, days } — passed through to fetch
         * @param {object} options  { forceRefresh: bool }
         * @returns {Promise<{value:*, cached:boolean, storedAt:Date|null}>}
         */
        function load(accountId, ctx, options) {
            var opts = options || {};

            if (!opts.forceRefresh) {
                var hit = C360.cache.get(accountId, spec.source);
                if (hit) {
                    return Promise.resolve({
                        value: hit.value,
                        cached: true,
                        storedAt: new Date(hit.storedAt)
                    });
                }
            }

            return Promise.resolve(spec.fetch(accountId, ctx)).then(function (raw) {
                var value = spec.normalize ? spec.normalize(raw, ctx) : raw;
                C360.cache.set(accountId, spec.source, value, ttl());
                C360.cache.markSuccess(accountId, spec.source);
                return { value: value, cached: false, storedAt: new Date() };
            });
        }

        return {
            source: spec.source,
            label: spec.label,
            ttlClass: spec.ttlClass,
            load: load
        };
    }

    return { create: create };
}());
