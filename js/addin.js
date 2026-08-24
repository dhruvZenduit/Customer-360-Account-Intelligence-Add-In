/**
 * Customer 360 — MyGeotab add-in entry point
 * ==========================================
 * The lifecycle contract, and the only file that knows MyGeotab is there:
 *
 *   initialize(api, state, callback) — once, when the add-in first loads
 *   focus(api, state)                — every time the user navigates to it
 *   blur()                           — every time they navigate away
 *
 * MyGeotab calls focus/blur on EVERY navigation, not once. An add-in that
 * treats initialize as its only entry point and never tears anything down
 * accumulates a timer, a listener or an in-flight request per visit, and the
 * symptom is a MyGeotab session that gets slower the longer somebody works in
 * it. So blur() genuinely stops things and focus() genuinely restarts them.
 *
 * Three things happen here and nowhere else:
 *
 *   1. The authenticated MyGeotab `api` object is handed to geotabService.
 *      That object is the only genuinely connected integration in this add-in,
 *      and it is scoped to the database the user is signed in to.
 *
 *   2. The app is told it is EMBEDDED. That governs one behaviour: whether it
 *      may write to `window.location`. Inside MyGeotab the URL belongs to
 *      MyGeotab's hash router, so the add-in keeps its view state internally
 *      instead. Standalone, the URL still round-trips.
 *
 *   3. Start, suspend and resume are driven from the lifecycle rather than
 *      from a DOM event, so the add-in's running state matches what MyGeotab
 *      believes about it.
 *
 * Loading this page outside MyGeotab still works — the DOMContentLoaded
 * fallback at the bottom starts the app without an api object, and the add-in
 * reports live asset data as unavailable rather than failing.
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
     * supply one — the user picks from the search box instead. A deep link is
     * honoured when present, which is what makes it possible to link into this
     * add-in from another internal tool.
     *
     * Both shapes are read: MyGeotab's own `state` object, which is how a
     * MyGeotab link passes parameters, and a `?accountId=` query param for the
     * standalone case. Neither is trusted beyond being turned into a string —
     * an unknown id lands on the add-in's own "could not be loaded" state.
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
            C360.app.start({
                embedded: true,
                accountId: accountIdFrom(freshState)
            });

            // MyGeotab will not display the page until this is called.
            initializeCallback();
        },

        focus: function (freshApi, freshState) {
            // MyGeotab may hand over a fresh API object on each visit.
            C360.geotabService.setApi(freshApi);

            // start() is safe to call repeatedly: the first call wires the DOM
            // and fetches, later calls resume what blur() stopped.
            C360.app.start({
                embedded: true,
                accountId: accountIdFrom(freshState)
            });
        },

        blur: function () {
            /*
             * Stop the clock interval, cancel the pending search debounce,
             * invalidate any in-flight account load, and close the AI panel and
             * the brief.
             *
             * The load invalidation is the subtle one: without it, a response
             * that arrives after the user has navigated away paints an account
             * into a DOM the user is no longer looking at, and they come back to
             * the wrong account on screen.
             */
            C360.app.suspend();

            // Drop the API reference. MyGeotab hands over a fresh one on the
            // next focus(), and holding a stale object risks calling into a
            // session that has since changed database.
            C360.geotabService.setApi(null);
        },

        /** Exposed so the standalone fallback can tell whether to start. */
        _startedByGeotab: function () { return startedByGeotab; }
    };
};

/**
 * Standalone fallback.
 *
 * When this page is opened outside MyGeotab — directly, or on the Vercel
 * deployment — nothing calls initialize(), so the app would never start. A
 * short delay gives MyGeotab a chance to run its own lifecycle first when the
 * page IS embedded; if the app has not been wired by then, we start it
 * ourselves, WITHOUT the embedded flag, so the URL round-trips as it should
 * when nothing else owns it.
 */
document.addEventListener("DOMContentLoaded", function () {
    setTimeout(function () {
        var root = document.getElementById("c360-app");
        if (!root || root.getAttribute("data-started") === "true") { return; }

        C360.app.start({ embedded: false });
    }, 150);
});
