/**
 * Customer 360 — MyGeotab add-in entry point
 * ==========================================
 * Same lifecycle contract as the other add-ins in this org:
 *
 *   initialize(api, state, callback) — once, when the add-in first loads
 *   focus(api, state)                — every time the user navigates to it
 *   blur()                           — every time they navigate away
 *
 * Two things happen here and nowhere else:
 *
 *   1. The authenticated MyGeotab `api` object is handed to geotabService.
 *      That object is the only genuinely connected integration in this
 *      add-in, and it is scoped to the database the user is signed in to.
 *
 *   2. The app is started. Loading this page outside MyGeotab (opening
 *      index.html directly, or on Vercel) still works — the DOMContentLoaded
 *      fallback at the bottom starts the app without an api object, and the
 *      dashboard simply reports live asset data as unavailable.
 */

"use strict";

window.geotab = window.geotab || {};
geotab.addin = geotab.addin || {};

geotab.addin.customer360 = function () {

    /** True once the MyGeotab lifecycle has taken over, so the standalone
     *  fallback below does not also start the app. */
    var startedByGeotab = false;

    /**
     * Work out which account to open, if anything tells us.
     *
     * MyGeotab has no concept of our CRM accounts, so it will not usually
     * supply one — the user picks from the search box instead. A deep link
     * (?accountId=acc-001) is honoured when present, which is what makes it
     * possible to link into this add-in from another internal tool.
     */
    function accountIdFrom(state) {
        if (state && state.accountId) { return String(state.accountId); }
        try {
            return new URL(window.location.href).searchParams.get("accountId");
        } catch (e) {
            return null;
        }
    }

    return {

        initialize: function (freshApi, freshState, initializeCallback) {
            startedByGeotab = true;

            C360.geotabService.setApi(freshApi);
            C360.app.start({ accountId: accountIdFrom(freshState) });

            // MyGeotab will not display the page until this is called.
            initializeCallback();
        },

        focus: function (freshApi, freshState) {
            // MyGeotab may hand over a fresh API object on each visit.
            C360.geotabService.setApi(freshApi);
            C360.app.start({ accountId: accountIdFrom(freshState) });
        },

        blur: function () {
            // No timers, subscriptions or polling to tear down.
        },

        /** Exposed so the standalone fallback can tell whether to start. */
        _startedByGeotab: function () { return startedByGeotab; }
    };
};

/**
 * Standalone fallback.
 *
 * When this page is opened outside MyGeotab, nothing calls initialize(), so
 * the app would never start. A short delay gives MyGeotab a chance to run its
 * own lifecycle first when the page IS embedded; if the account header has not
 * been wired by then, we start the app ourselves.
 */
document.addEventListener("DOMContentLoaded", function () {
    setTimeout(function () {
        var alreadyStarted = document.getElementById("c360-app")
            && document.getElementById("c360-app").getAttribute("data-started") === "true";
        if (alreadyStarted) { return; }

        document.getElementById("c360-app").setAttribute("data-started", "true");
        C360.app.start({});
    }, 150);
});
