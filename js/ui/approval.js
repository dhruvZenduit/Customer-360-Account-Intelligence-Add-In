/**
 * Customer 360 — DRAFT REVIEW & APPROVAL UI  (Phase 8)
 * ====================================================
 * Renders a draft, and renders why it cannot be sent.
 *
 *     AI RECOMMENDATION -> USER REVIEW -> APPROVE -> ACTION
 *
 * The distinction the UI must make obvious is between a DRAFT and a SENT
 * message. Every draft is labelled `DRAFT` in the markup as well as in the data,
 * `[Approve & Send]` is disabled, and — this is the part that matters — the
 * reason it is disabled is printed next to it. A greyed-out button with no
 * explanation teaches the user the product is broken; a greyed-out button that
 * says "no outbound integration is connected" teaches them it is careful.
 *
 * This file cannot send anything. It has no transport, and the only function in
 * the add-in that could ever produce an outbound effect is
 * `C360.approval.perform()`, which refuses while `approval.sendingEnabled` is
 * false. Enabling that is a separate, reviewed decision.
 *
 * Editing is offered because a human improving a draft is the normal case — and
 * an edited draft is RE-VALIDATED before approval, because a claim a person
 * typed in needs evidence exactly as much as one a model generated.
 */

"use strict";

C360.approvalUi = (function () {

    var util = C360.util;
    var c = C360.components;
    var esc = util.escapeHtml;

    /**
     * One draft, as a reviewable block.
     *
     * `data-draft-*` attributes carry the identifiers the click handler needs;
     * the draft body itself lives in a textarea so editing is the default
     * affordance rather than a mode you have to discover.
     */
    function draft(item, recommendation, model) {
        var disabledReason = C360.approval.sendDisabledReason();
        var approvals = C360.approval.forRecommendation(recommendation.id)
            .filter(function (record) { return record.content
                && record.content.kind === item.kind; });

        var approved = approvals.length ? approvals[approvals.length - 1] : null;

        var provenance = item.provenance === "model"
            ? '<span class="c360-provenance">'
              + esc(C360.scorecardConfig.ai.provenanceLabel) + '</span>'
            : '<span class="c360-provenance c360-provenance--rule">Rule-based</span>';

        var approvedBlock = approved
            ? '<p class="c360-ap-approved" role="status">Approved by '
              + esc(approved.approver) + ' on '
              + esc(util.formatDateTime(approved.approvedAt))
              + (approved.content.edited ? " (edited before approval)" : "")
              + '. Nothing was sent — ' + esc(disabledReason || "sending is disabled")
              + '</p>'
            : "";

        return '<section class="c360-ap-draft" '
             + 'data-draft-kind="' + esc(item.kind) + '" '
             + 'data-draft-rec="' + esc(recommendation.id) + '" '
             + 'data-draft-account="' + esc(model.accountId || "") + '">'

             + '<header class="c360-ap-head">'
             // Labelled DRAFT in the markup, matching `status: "draft"` in the data.
             + '<span class="c360-ap-badge">DRAFT</span>'
             + '<h5 class="c360-ap-title">' + esc(item.kindLabel) + '</h5>'
             + provenance
             + '</header>'

             + (item.recipient
                ? '<p class="c360-ap-to">To: ' + esc(item.recipient.name)
                  + ' <span class="c360-ap-verified">verified contact</span></p>'
                : '<p class="c360-ap-to c360-ap-to--internal">Internal — no customer '
                  + 'recipient.</p>')

             + '<label class="c360-ap-label" for="c360-ap-subject-'
             + esc(recommendation.id) + '-' + esc(item.kind) + '">Subject</label>'
             + '<input class="c360-ap-subject" type="text" '
             + 'id="c360-ap-subject-' + esc(recommendation.id) + '-' + esc(item.kind) + '" '
             + 'value="' + esc(item.subject) + '" />'

             + '<label class="c360-ap-label" for="c360-ap-body-'
             + esc(recommendation.id) + '-' + esc(item.kind) + '">Body</label>'
             + '<textarea class="c360-ap-body" rows="10" '
             + 'id="c360-ap-body-' + esc(recommendation.id) + '-' + esc(item.kind) + '">'
             + esc(item.body) + '</textarea>'

             + '<div class="c360-ap-validation" role="status"></div>'

             + '<div class="c360-ap-actions">'
             + '<button type="button" class="c360-button c360-button--ghost" '
             + 'data-draft-action="validate">Check claims against evidence</button>'
             + '<button type="button" class="c360-button" '
             + 'data-draft-action="approve">Approve</button>'
             // Disabled, with the reason beside it rather than in a tooltip.
             + '<button type="button" class="c360-button c360-button--primary" '
             + 'data-draft-action="send" disabled '
             + 'aria-describedby="c360-ap-why-' + esc(recommendation.id) + '-'
             + esc(item.kind) + '">Approve &amp; Send</button>'
             + '</div>'

             + '<p class="c360-ap-why" id="c360-ap-why-' + esc(recommendation.id) + '-'
             + esc(item.kind) + '">'
             + esc(disabledReason || "Sending is disabled.") + '</p>'

             + approvedBlock
             + '</section>';
    }

    /**
     * Result of a claim check, rendered where the reviewer is looking.
     *
     * An unsupported claim is not softened into a warning about tone: it names
     * the exact token that has no evidence behind it, because the reviewer's
     * next action is to delete or evidence that token.
     */
    function validationMessage(result) {
        if (result.valid) {
            return '<p class="c360-ap-ok">Every date, record number, figure and name in this '
                 + 'draft appears in its evidence list.</p>';
        }
        return '<p class="c360-ap-bad"><strong>Not approvable yet.</strong> '
             + 'These assert facts that are not in the evidence list: '
             + esc(result.unsupported.map(function (claim) {
                   return claim.value;
               }).join(", "))
             + '. Remove them, or attach the record that supports them.</p>';
    }

    function approvalMessage(result) {
        if (result.approved) {
            return '<p class="c360-ap-ok">Approved and recorded. Nothing has been sent: '
                 + esc(C360.approval.sendDisabledReason() || "sending is disabled") + '</p>';
        }
        return '<p class="c360-ap-bad">' + esc(result.reason) + '</p>';
    }

    /**
     * Read the (possibly edited) draft back out of the DOM.
     *
     * `edited` is computed by comparing against the generated content, so the
     * approval record can say whether the human changed anything — approving
     * your own rewrite and approving the generated text are different acts.
     */
    function readDraft(section, original) {
        var subject = section.querySelector(".c360-ap-subject");
        var body = section.querySelector(".c360-ap-body");

        var current = {
            kind: section.getAttribute("data-draft-kind"),
            subject: subject ? subject.value : original.subject,
            body: body ? body.value : original.body,
            recipient: original.recipient,
            edited: false
        };

        current.edited = current.subject !== original.subject
                      || current.body !== original.body;

        return current;
    }

    return {
        draft: draft,
        validationMessage: validationMessage,
        approvalMessage: approvalMessage,
        readDraft: readDraft
    };
}());
