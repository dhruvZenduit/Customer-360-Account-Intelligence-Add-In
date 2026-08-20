/**
 * Customer 360 — namespace root
 * -----------------------------
 * This add-in has no build step (same as the other add-ins in this org), so
 * modules are plain classic scripts that hang themselves off one global.
 *
 * Every file below adds exactly one property to `window.C360`. index.html
 * loads them in dependency order: core → services → intelligence → ui.
 *
 * Everything user-facing is prefixed `c360-` in the DOM, because MyGeotab
 * injects this page into its own document and bare selectors would leak out.
 */

"use strict";

window.C360 = window.C360 || {};

C360.VERSION = "1.0.0";
