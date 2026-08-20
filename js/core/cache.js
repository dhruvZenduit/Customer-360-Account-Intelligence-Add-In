/**
 * Customer 360 — TTL cache
 * ------------------------
 * External research is slow and rate-limited, so results are cached per
 * (account, source) with a configurable lifetime (spec section 30).
 *
 * Storage is sessionStorage when available, falling back to an in-memory map
 * — some MyGeotab embeddings block storage inside the iframe, and a cache that
 * throws would take the whole dashboard down with it.
 *
 * NOTE: cached payloads can contain internal CRM/support data, so this uses
 * sessionStorage (cleared when the tab closes), never localStorage.
 */

"use strict";

C360.cache = (function () {

    var PREFIX = "c360:v1:";
    var memory = {};

    /** sessionStorage, or null when it is unavailable/blocked. */
    var store = (function () {
        try {
            var probe = PREFIX + "probe";
            window.sessionStorage.setItem(probe, "1");
            window.sessionStorage.removeItem(probe);
            return window.sessionStorage;
        } catch (e) {
            return null;
        }
    }());

    function read(key) {
        if (store) {
            try { return store.getItem(key); } catch (e) { return null; }
        }
        return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    }

    function write(key, value) {
        if (store) {
            try {
                store.setItem(key, value);
                return;
            } catch (e) {
                // Quota exceeded — degrade to memory rather than fail the load.
            }
        }
        memory[key] = value;
    }

    function drop(key) {
        if (store) {
            try { store.removeItem(key); } catch (e) { /* ignore */ }
        }
        delete memory[key];
    }

    function keyFor(accountId, source) {
        return PREFIX + accountId + ":" + source;
    }

    /**
     * Read a cached entry.
     * Returns null when missing, expired, or unparseable — callers then fetch.
     */
    function get(accountId, source) {
        var key = keyFor(accountId, source);
        var raw = read(key);
        if (!raw) { return null; }

        var entry;
        try {
            entry = JSON.parse(raw);
        } catch (e) {
            drop(key);
            return null;
        }

        if (!entry || typeof entry.expiresAt !== "number") { return null; }
        if (Date.now() > entry.expiresAt) {
            drop(key);
            return null;
        }
        return entry;
    }

    /** Store a value with a TTL. Returns the value so callers can chain. */
    function set(accountId, source, value, ttlMs) {
        var entry = {
            value: value,
            storedAt: Date.now(),
            expiresAt: Date.now() + (ttlMs || 0)
        };
        try {
            write(keyFor(accountId, source), JSON.stringify(entry));
        } catch (e) {
            // Value could not be serialised (circular ref) — skip caching.
        }
        return value;
    }

    /**
     * Timestamp of the last *successful* fetch for a source, even after the
     * cached value itself has expired. Powers "Last successful update: ..."
     * when a refresh fails (spec section 32), so it is tracked separately.
     */
    function markSuccess(accountId, source) {
        write(PREFIX + "success:" + accountId + ":" + source, String(Date.now()));
    }

    function lastSuccess(accountId, source) {
        var raw = read(PREFIX + "success:" + accountId + ":" + source);
        var n = raw ? Number(raw) : NaN;
        return isNaN(n) ? null : new Date(n);
    }

    /** Every source key the orchestrator caches under. */
    var SOURCES = ["account", "quotes", "orders", "tickets", "billing",
                   "technical", "reviews", "website", "external", "contacts", "geotab"];

    /** Drop every cached entry for one account (used by Refresh Intelligence). */
    function clearAccount(accountId) {
        SOURCES.forEach(function (source) {
            drop(keyFor(accountId, source));
        });
    }

    return {
        get: get,
        set: set,
        markSuccess: markSuccess,
        lastSuccess: lastSuccess,
        clearAccount: clearAccount,
        SOURCES: SOURCES
    };
}());
