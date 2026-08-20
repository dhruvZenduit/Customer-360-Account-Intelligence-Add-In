/**
 * Customer 360 — MyGeotab service  [INTERNAL — GENUINELY CONNECTED]
 * =================================================================
 * The one integration in this add-in that talks to a real system today.
 *
 * MyGeotab hands the add-in an authenticated `api` object at initialize()/
 * focus(). That object is scoped to ONE database — the one the user is signed
 * in to. So it can only tell us about an account whose Geotab database matches
 * the current session.
 *
 * That constraint is respected rather than papered over:
 *
 *   - session database matches account.geotabDatabase  -> live asset count
 *   - account has no geotabDatabase on its record       -> "not linked"
 *   - session is on a different database                -> "not available
 *                                                          from this session"
 *   - add-in opened outside MyGeotab (e.g. plain browser) -> "not available"
 *
 * In every non-matching case the dashboard falls back to the asset count on
 * the CRM record and labels where the number came from. It never presents a
 * count from the wrong database as this account's fleet size.
 */

"use strict";

C360.geotabService = (function () {

    /** The authenticated MyGeotab API object, or null outside MyGeotab. */
    var api = null;

    /** Cached session lookup, so we ask MyGeotab once per page load. */
    var sessionPromise = null;

    /** Called by addin.js on initialize() and focus(). */
    function setApi(freshApi) {
        if (freshApi !== api) {
            api = freshApi || null;
            sessionPromise = null; // new api object -> re-read the session
        }
    }

    function isAvailable() {
        return !!(api && typeof api.call === "function");
    }

    /** Promise wrapper around the callback-style api.call. */
    function call(method, params) {
        return new Promise(function (resolve, reject) {
            if (!isAvailable()) {
                reject(new Error("MyGeotab API is not available."));
                return;
            }
            try {
                api.call(method, params, resolve, reject);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Which database this MyGeotab session is signed in to.
     * Resolves to null when the session cannot be read.
     */
    function getSession() {
        if (sessionPromise) { return sessionPromise; }

        sessionPromise = new Promise(function (resolve) {
            if (!api || typeof api.getSession !== "function") {
                resolve(null);
                return;
            }
            try {
                // Signature varies across MyGeotab versions: some pass
                // (session), some (session, server). Only the first is needed.
                api.getSession(function (session) {
                    resolve(session || null);
                });
            } catch (error) {
                resolve(null);
            }
        });

        return sessionPromise;
    }

    /**
     * Count devices on the current database.
     *
     * GetCountOf is the cheap way to do this; older databases that reject it
     * fall back to counting a capped Get, which is slower but still bounded.
     */
    function countDevices() {
        return call("GetCountOf", { typeName: "Device" }).then(function (count) {
            var n = Number(count);
            return isNaN(n) ? null : n;
        }, function () {
            return call("Get", { typeName: "Device", resultsLimit: 5000 }).then(function (devices) {
                return Array.isArray(devices) ? devices.length : null;
            });
        });
    }

    /**
     * Resolve the live-asset picture for an account.
     *
     * Always resolves — never rejects — because this is a best-effort
     * enrichment. A failure here must not degrade the rest of the dashboard.
     *
     * @returns {Promise<{linked:boolean, available:boolean, reason:string,
     *                    database:string|null, deviceCount:number|null}>}
     */
    function load(accountId, ctx) {
        var account = (ctx && ctx.account) || {};

        if (!account.geotabDatabase) {
            return Promise.resolve({
                linked: false,
                available: false,
                reason: "This account is not linked to a MyGeotab database on its record.",
                database: null,
                deviceCount: null
            });
        }

        if (!isAvailable()) {
            return Promise.resolve({
                linked: true,
                available: false,
                reason: "Live asset data requires the add-in to be open inside MyGeotab.",
                database: account.geotabDatabase,
                deviceCount: null
            });
        }

        return getSession().then(function (session) {
            var sessionDb = session && session.database ? String(session.database) : null;

            if (!sessionDb) {
                return {
                    linked: true,
                    available: false,
                    reason: "The current MyGeotab session could not be identified.",
                    database: account.geotabDatabase,
                    deviceCount: null
                };
            }

            if (sessionDb.toLowerCase() !== String(account.geotabDatabase).toLowerCase()) {
                return {
                    linked: true,
                    available: false,
                    reason: "This MyGeotab session is on database \"" + sessionDb
                          + "\", not this account's database.",
                    database: account.geotabDatabase,
                    deviceCount: null
                };
            }

            return countDevices().then(function (deviceCount) {
                return {
                    linked: true,
                    available: deviceCount !== null,
                    reason: deviceCount === null ? "MyGeotab did not return a device count." : "",
                    database: sessionDb,
                    deviceCount: deviceCount
                };
            });
        }).catch(function (error) {
            // Logged for developers; the user just sees the fallback count.
            console.warn("Customer 360: MyGeotab asset lookup failed.", error);
            return {
                linked: true,
                available: false,
                reason: "MyGeotab asset lookup failed.",
                database: account.geotabDatabase,
                deviceCount: null
            };
        });
    }

    return {
        setApi: setApi,
        isAvailable: isAvailable,
        getSession: getSession,
        load: load,
        source: "geotab",
        label: "MyGeotab assets"
    };
}());
