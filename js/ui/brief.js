/**
 * Customer 360 — BRIEF MODAL
 * ==========================
 * What [ GENERATE BRIEF ] opens: the account brief as a document, ready to
 * read in the two minutes before a call.
 *
 * It is a real workflow rather than a chat surface. There is no typing
 * indicator, no streaming, no conversational framing — it is a composed
 * document with sections, evidence, and two buttons that do something. A
 * chatbot pretending to think would make it feel less trustworthy, not more,
 * because the content is not generated: `js/scorecard/brief.js` assembles every
 * sentence from records the scorecard already holds.
 *
 * Two things the modal is careful about:
 *
 *   QUOTED CONCERNS STAY QUOTED. A customer's words are rendered as a
 *   blockquote with the record they came from underneath. That is what stops
 *   somebody reading our inference aloud on a call as if the customer had said
 *   it.
 *
 *   OPEN QUESTIONS ARE NOT OPTIONAL. A brief that only asserts pretends the
 *   picture is complete. The section is always rendered, and when there is
 *   genuinely nothing missing it says that too.
 */

"use strict";

C360.briefUi = (function () {

    var util = C360.util;
    var esc = util.escapeHtml;

    function section(title, body) {
        return '<div class="c360-bs">'
             + '<h3 class="c360-bs-title">' + esc(title) + '</h3>'
             + body + '</div>';
    }

    function empty(message) {
        return '<p class="c360-bs-empty">' + esc(message) + '</p>';
    }

    // -----------------------------------------------------------------
    // Sections
    // -----------------------------------------------------------------

    function situation(data) {
        return section(data.title,
            '<div class="c360-bs-body">'
            + data.paragraphs.map(function (text) {
                  return '<p>' + esc(text) + '</p>';
              }).join("")
            + '</div>');
    }

    function stakes(data) {
        return section(data.title,
            '<div class="c360-bs-facts">'
            + data.facts.map(function (fact) {
                  return '<div class="c360-bs-fact">'
                       + '<span class="c360-fact-label">' + esc(fact.label) + '</span>'
                       + '<span class="c360-fact-value'
                       + (fact.known ? "" : " c360-fact-value--missing") + '">'
                       + esc(fact.value) + '</span></div>';
              }).join("")
            + '</div>');
    }

    function concerns(data) {
        if (!data.items.length) {
            return section(data.title, empty(data.emptyNote));
        }

        return section(data.title,
            '<ul class="c360-bs-list">'
            + data.items.map(function (item) {
                  // A customer's own words are quoted; a recorded concern is
                  // stated. The visual difference is the point.
                  return '<li>'
                       + (item.quoted
                          ? '<blockquote class="c360-bs-quote">' + esc(item.text)
                            + '</blockquote>'
                          : esc(item.text))
                       + '<span class="c360-bs-source">' + esc(item.source) + '</span>'
                       + '</li>';
              }).join("")
            + '</ul>');
    }

    function approach(data) {
        if (!data.headline) {
            return section(data.title, empty(data.emptyNote));
        }

        return section(data.title,
            '<div class="c360-bs-body"><p><strong>' + esc(data.headline)
            + '</strong></p><p>' + esc(data.summary) + '</p></div>'
            + '<ol class="c360-nba-steps" style="margin-top:9px">'
            + data.steps.map(function (step) {
                  return '<li>' + esc(step) + '</li>';
              }).join("")
            + '</ol>'
            + '<div class="c360-nba-meta" style="border-top-color:var(--c360-border)">'
            + '<div class="c360-nba-meta-item">Owner'
            + '<span class="c360-nba-meta-value">' + esc(data.owner) + '</span></div>'
            + '<div class="c360-nba-meta-item">Due'
            + '<span class="c360-nba-meta-value">' + esc(data.due)
            + (data.dueIsHard ? " (hard deadline)" : "") + '</span></div>'
            + '<div class="c360-nba-meta-item">Confidence'
            + '<span class="c360-nba-meta-value">' + esc(data.confidence)
            + '</span></div>'
            + '</div>');
    }

    function openQuestions(data) {
        if (!data.items.length) {
            return section(data.title, empty(data.emptyNote));
        }

        return section(data.title,
            '<ul class="c360-bs-list">'
            + data.items.map(function (item) {
                  return '<li>' + esc(item) + '</li>';
              }).join("")
            + '</ul>');
    }

    // -----------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------

    /**
     * The modal. Rendered into the overlay container, which app.js shows and
     * hides.
     */
    function render(brief) {
        if (!brief) { return ""; }

        return '<div class="c360-modal" role="dialog" aria-modal="true"'
             + ' aria-labelledby="c360-brief-title">'
             + '<div class="c360-modal-head">'
             + '<div>'
             + '<p class="c360-modal-eyebrow">' + esc(brief.accountName) + ' · '
             + esc(brief.level)
             + (brief.queue
                ? ' · ' + esc(C360.scorecardConfig.queues.labels[brief.queue]) : "")
             + '</p>'
             + '<h2 class="c360-modal-title" id="c360-brief-title">'
             + esc(brief.title) + '</h2>'
             + '</div>'
             + '<button type="button" class="c360-modal-close" id="c360-modal-close"'
             + ' aria-label="Close brief">×</button>'
             + '</div>'

             + '<div class="c360-modal-body">'
             + situation(brief.situation)
             + stakes(brief.stakes)
             + concerns(brief.concerns)
             + approach(brief.approach)
             + openQuestions(brief.openQuestions)
             /*
              * Provenance, stated on the document itself. "Composed" is the
              * accurate word: assembled from records, not written by a model and
              * not a verbatim record either.
              */
             + '<p class="c360-answer-method" style="margin-top:18px">'
             + 'Composed from the records cited above, as of '
             + esc(util.formatDateTime(brief.asOf))
             + '. Config version ' + esc(brief.configVersion)
             + '. No sentence in this brief asserts anything that is not in the '
             + 'evidence behind it.</p>'
             + '</div>'

             + '<div class="c360-modal-foot">'
             + '<button type="button" class="c360-button c360-button--action" '
             + 'id="c360-brief-copy">Copy brief</button>'
             + '<button type="button" class="c360-button c360-button--quiet" '
             + 'data-open-account="' + esc(brief.accountId) + '">Open workspace</button>'
             + '<span class="c360-ap-why" id="c360-brief-status" role="status"></span>'
             + '</div>'
             + '</div>';
    }

    return { render: render };
}());
