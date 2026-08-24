/**
 * Customer 360 — HUMAN APPROVAL GATE  (Phase 8)
 * =============================================
 * The system is READ-ONLY + RECOMMENDATION.
 *
 *     AI RECOMMENDATION -> USER REVIEW -> APPROVE -> ACTION
 *
 * There is exactly ONE code path in the add-in capable of an outbound effect,
 * and it is `perform()` below. No service, no draft renderer and no AI adapter
 * may perform an outbound call — which is why `perform()` is the only function
 * here that even mentions sending, and why it currently always refuses.
 *
 * `approval.sendingEnabled` is still `false` after Phase 8. Turning it on is a
 * deliberate, separately reviewed change; it is not a consequence of having
 * finished this phase. Until an outbound integration exists, `[Approve & Send]`
 * is disabled WITH A VISIBLE REASON — a greyed-out button with no explanation
 * teaches the user that the product is broken rather than that it is careful.
 *
 * Approval records what was ACTUALLY approved — the final edited content, not
 * the generated content. A human who edits a draft and then approves it has
 * approved their own words, and the record has to say so, or the audit trail
 * describes a message nobody sent.
 *
 * No blanket approval. No bulk approval. No timed approval. No
 * approve-unless-cancelled.
 */

"use strict";

C360.approval = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig.approval; }

    /** Approval records for this session. Cleared on reload; see Phase 9. */
    var records = [];

    function isGated(action) {
        return util.list(cfg().gatedActions).indexOf(action) !== -1;
    }

    // -----------------------------------------------------------------
    // Re-validation of human edits
    // -----------------------------------------------------------------

    /**
     * A human editing a claim INTO a draft is still a claim that needs evidence.
     *
     * This is the check people expect to be able to skip, and the one most worth
     * keeping: the generated draft was validated, so if validation only ran at
     * generation time, the edit box would be the hole in the whole scheme.
     */
    function revalidate(draft, recommendation) {
        if (!cfg().revalidateEditedDrafts) {
            return { valid: true, unsupported: [] };
        }

        var contact = draft && draft.recipient
            ? { name: draft.recipient.name }
            : null;

        return C360.actionRules.validateClaims(
            String(draft.subject || "") + "\n" + String(draft.body || ""),
            recommendation ? recommendation.evidence : [],
            contact,
            [recommendation && recommendation.owner ? recommendation.owner.label : null]
        );
    }

    // -----------------------------------------------------------------
    // Request an approval
    // -----------------------------------------------------------------

    /**
     * Record an approval.
     *
     * @param {object} request
     *   action        one of approval.gatedActions
     *   approver      who is approving — required, and never defaulted
     *   recommendation the recommendation being approved
     *   draft         the FINAL content, after any human edit
     *   asOf          injected timestamp
     * @returns {object} { approved, record, reason }
     */
    function approve(request) {
        var input = request || {};

        if (!isGated(input.action)) {
            return {
                approved: false,
                record: null,
                reason: "\"" + input.action + "\" is not a recognised gated action."
            };
        }

        if (cfg().allowAutoApproval !== true && input.automatic === true) {
            return {
                approved: false,
                record: null,
                reason: "Automatic approval is disabled. A person must approve each action."
            };
        }

        if (!input.approver) {
            // Not defaulted to "system" or to the account owner. An approval
            // record whose approver is a guess is not an approval record.
            return {
                approved: false,
                record: null,
                reason: "An approver must be identified before an action can be approved."
            };
        }

        var validation = input.draft
            ? revalidate(input.draft, input.recommendation)
            : { valid: true, unsupported: [] };

        if (!validation.valid) {
            return {
                approved: false,
                record: null,
                reason: "The content asserts facts that are not in the evidence list: "
                      + validation.unsupported.map(function (claim) {
                            return claim.value;
                        }).join(", ") + ". Approval is blocked until they are removed or "
                      + "evidenced.",
                unsupported: validation.unsupported
            };
        }

        var record = {
            id: "approval-" + records.length + "-"
              + util.slug(input.action + "-" + (input.recommendation
                    ? input.recommendation.id : "none")),
            action: input.action,
            approver: input.approver,
            approvedAt: input.asOf
                ? (util.toDate(input.asOf) || new Date()).toISOString()
                : new Date().toISOString(),
            recommendationId: input.recommendation ? input.recommendation.id : null,
            accountId: input.accountId || null,

            /**
             * The FINAL content, captured verbatim. Not the generated content —
             * what the human actually signed off on.
             */
            content: input.draft ? {
                kind: input.draft.kind,
                subject: input.draft.subject,
                body: input.draft.body,
                recipient: input.draft.recipient || null,
                /** true when the human changed the generated text. */
                edited: input.draft.edited === true
            } : null,

            evidenceIds: input.recommendation
                ? util.list(input.recommendation.evidenceIds) : [],
            configVersion: C360.scorecardConfig.version
        };

        records.push(record);

        return { approved: true, record: record, reason: null };
    }

    /**
     * Bulk approval. Exists only to refuse, in code, at the one place a caller
     * would reach for it — rather than being absent and therefore easy to add.
     */
    function approveAll() {
        return {
            approved: false,
            records: [],
            reason: "Bulk approval is disabled. Approval is per-action, by design."
        };
    }

    // -----------------------------------------------------------------
    // The single gated action path
    // -----------------------------------------------------------------

    /**
     * The ONLY function in the add-in that could ever produce an outbound
     * effect. It currently cannot, and it says why.
     *
     * Two independent conditions must both hold before anything could be sent:
     * an approval record must exist, and `sendingEnabled` must be true. Neither
     * one alone is enough, and the second is a config change nobody makes by
     * accident.
     */
    function perform(action, approvalRecord) {
        if (!isGated(action)) {
            return {
                performed: false,
                reason: "\"" + action + "\" is not a recognised gated action."
            };
        }

        if (cfg().requireApprovalRecord && !approvalRecord) {
            return {
                performed: false,
                reason: "No approval record exists for this action."
            };
        }

        if (approvalRecord && approvalRecord.action !== action) {
            // An approval for one action is not an approval for another.
            return {
                performed: false,
                reason: "The approval record is for \"" + approvalRecord.action
                      + "\", not \"" + action + "\"."
            };
        }

        if (!cfg().sendingEnabled) {
            return {
                performed: false,
                reason: cfg().noOutboundReason
            };
        }

        // Unreachable while sendingEnabled is false. When an outbound
        // integration is added it is wired HERE and nowhere else, so there is
        // exactly one place to review.
        return {
            performed: false,
            reason: "Sending is enabled in configuration but no outbound integration is "
                  + "wired to this path."
        };
    }

    /** Why the send control is disabled, for the UI to print next to it. */
    function sendDisabledReason() {
        if (!cfg().sendingEnabled) { return cfg().noOutboundReason; }
        return null;
    }

    function sendingEnabled() {
        return cfg().sendingEnabled === true;
    }

    function all() {
        return records.slice();
    }

    function forRecommendation(recommendationId) {
        return records.filter(function (record) {
            return record.recommendationId === recommendationId;
        });
    }

    /** Test hook. Not called by the app. */
    function reset() {
        records = [];
    }

    return {
        approve: approve,
        approveAll: approveAll,
        perform: perform,
        revalidate: revalidate,
        isGated: isGated,
        sendingEnabled: sendingEnabled,
        sendDisabledReason: sendDisabledReason,
        all: all,
        forRecommendation: forRecommendation,
        reset: reset
    };
}());
