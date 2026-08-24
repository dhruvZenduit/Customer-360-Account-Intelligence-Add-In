/**
 * Customer 360 — scorecard source services  [INTERNAL — NOT CONNECTED]
 * ====================================================================
 * The six sources the Customer Portfolio Command Center needs and the existing
 * Customer 360 does not have:
 *
 *     device health   portal usage   contract   commitments
 *     communications  outcomes
 *
 * Grouped in one file because each is four lines of adapter wiring and six
 * near-identical files would say less than this header does. They go through
 * `cachedService` and `dataSource` like every other source, so they honour the
 * cache TTLs, the manual-refresh bypass and the per-source failure isolation
 * without any special handling.
 *
 * NONE OF THESE IS CONNECTED TO A REAL SYSTEM TODAY. There is no device-health
 * feed, no portal-usage feed, no contract system and no email store behind this
 * add-in — the gateway endpoints are specified in `gatewayClient.js` and the
 * fixtures in `mockData.js` are labelled MOCK. Where an account's fixture omits
 * a source, the scorecard reports `Data unavailable` and lowers CONFIDENCE
 * rather than health. That is the behaviour to check first if any of these is
 * ever wired to something real.
 *
 * Two notes that matter downstream:
 *
 *   COMMITMENTS RETURN null, NOT []. `null` means "not a tracked source in this
 *   deployment"; `[]` means "tracked, none outstanding". Phase 3 reports the
 *   first as an unavailable factor and the second as a factor scoring zero, and
 *   collapsing them would either hide a data gap or invent one.
 *
 *   COMMUNICATIONS ARE THE INPUT TO TEXT DETECTION. Everything Phase 3's
 *   cancellation, competitor and escalation rules read comes through here, so
 *   an empty communications feed does not make an account safe — it makes those
 *   rules blind, which the confidence figure reflects.
 */

"use strict";

C360.deviceHealthService = C360.cachedService.create({
    source: "deviceHealth",
    ttlClass: "internal",
    label: "Device health",
    fetch: function (accountId, ctx) {
        return C360.dataSource.getDeviceHealth(accountId, ctx);
    }
});

C360.portalUsageService = C360.cachedService.create({
    source: "portalUsage",
    ttlClass: "internal",
    label: "Portal usage",
    fetch: function (accountId, ctx) {
        return C360.dataSource.getPortalUsage(accountId, ctx);
    }
});

C360.contractService = C360.cachedService.create({
    source: "contract",
    ttlClass: "internal",
    label: "Contract",
    fetch: function (accountId, ctx) {
        return C360.dataSource.getContract(accountId, ctx);
    }
});

C360.commitmentService = C360.cachedService.create({
    source: "commitments",
    ttlClass: "internal",
    label: "Commitments",
    fetch: function (accountId, ctx) {
        return C360.dataSource.getCommitments(accountId, ctx);
    }
});

C360.communicationService = C360.cachedService.create({
    source: "communications",
    ttlClass: "internal",
    label: "Communications",
    fetch: function (accountId, ctx) {
        return C360.dataSource.getCommunications(accountId, ctx);
    }
});

C360.outcomeService = C360.cachedService.create({
    source: "outcomes",
    ttlClass: "internal",
    label: "Customer outcomes",
    fetch: function (accountId, ctx) {
        return C360.dataSource.getOutcomes(accountId, ctx);
    }
});
