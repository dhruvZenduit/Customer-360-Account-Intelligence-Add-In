/**
 * Customer 360 — PORTFOLIO AI DRAWER
 * ==================================
 * A right-side drawer, never a takeover. The Command Center stays visible and
 * clickable behind it, because the answers are ABOUT what is on screen —
 * covering the dashboard would make an answer harder to act on, not easier.
 *
 * Answers come from `js/scorecard/portfolioQuery.js`: an intent matcher over
 * the same rows the Command Center is rendering. So every answer names real
 * accounts with real scores, and every account in an answer is a button that
 * selects it.
 *
 * WHY THIS IS NOT A CHAT CLONE. Three reasons, and the drawer states the third
 * one on its own face:
 *
 *   1. The interesting questions are aggregations, not inferences. "Who should
 *      I contact today?" is a sort.
 *   2. A fluent wrong answer to "which customers are at highest risk?" is
 *      indistinguishable from a right one, and somebody acts on it before a
 *      phone call.
 *   3. Every answer shows the query that produced it, so it is auditable.
 *
 * An unmatched question says so and offers what it can answer. That is the one
 * behaviour a chat interface cannot have and this one must: improvising is the
 * failure mode worth engineering against.
 */

"use strict";

C360.portfolioAiUi = (function () {

    var util = C360.util;
    var esc = util.escapeHtml;

    function parts() { return C360.parts; }

    // -----------------------------------------------------------------
    // Answer
    // -----------------------------------------------------------------

    function accountRef(ref) {
        return '<li><button type="button" class="c360-aref" '
             + 'data-select-account="' + esc(ref.accountId) + '">'
             + parts().plevel(ref.priorityLevel, ref.priorityScore)
             + '<span class="c360-aref-name">' + esc(ref.accountName)
             + (ref.note
                ? '<span class="c360-aref-note">' + esc(ref.note) + '</span>'
                : "")
             + '</span>'
             + '<span class="c360-tag">'
             + esc(parts().money(ref.accountValue) || "") + '</span>'
             + '</button></li>';
    }

    function answer(result) {
        if (!result) { return ""; }

        return '<div class="c360-answer">'
             + (result.question
                ? '<p class="c360-answer-q">' + esc(result.question) + '</p>'
                : "")
             + '<p class="c360-answer-headline">' + esc(result.headline) + '</p>'
             + (util.list(result.detail).length
                ? '<ul class="c360-answer-detail">'
                  + result.detail.map(function (line) {
                        return '<li>' + esc(line) + '</li>';
                    }).join("")
                  + '</ul>'
                : "")
             + (util.list(result.accounts).length
                ? '<ul class="c360-answer-accounts">'
                  + result.accounts.slice(0, 8).map(accountRef).join("")
                  + (result.accounts.length > 8
                     ? '<li><p class="c360-answer-method">+ '
                       + (result.accounts.length - 8) + ' more</p></li>'
                     : "")
                  + '</ul>'
                : "")
             // Always shown. An answer somebody acts on before a call has to be
             // auditable, and "here is the query I ran" is what makes it so.
             + (result.method
                ? '<p class="c360-answer-method"><strong>How:</strong> '
                  + esc(result.method) + '</p>'
                : "")
             + '</div>';
    }

    // -----------------------------------------------------------------
    // Drawer
    // -----------------------------------------------------------------

    /**
     * @param {object} state { aiQuestion, aiAnswer, aiHistory }
     * @param {object} view  the portfolio roll-up, for the suggestion counts
     */
    function render(state, view) {
        var app = state || {};
        var suggestions = C360.portfolioQuery.suggestions();

        /*
         * The suggestions stay visible BELOW an answer, not just before the
         * first one. Answering a portfolio question almost always raises the
         * next one — "who should I contact today" leads straight to "which of
         * them are renewing" — and a drawer that hides the other questions once
         * you have asked one makes you close it and reopen it to continue.
         */
        var body = app.aiAnswer
            ? answer(app.aiAnswer)
              + '<h3 class="c360-trend-title" style="margin-top:16px">'
              + (app.aiAnswer.matched === false
                 ? 'What this panel can answer'
                 : 'Ask something else')
              + '</h3>'
              + suggestionList(app.aiAnswer.suggestions
                    || C360.portfolioQuery.suggestions())
            : '<p class="c360-drawer-note" style="margin-bottom:12px">'
              + 'Answers are computed from the '
              + (view ? view.summary.total : 0)
              + ' accounts currently loaded — the same rows the Command Center is '
              + 'showing. Nothing here is generated prose, and every answer names '
              + 'the accounts it is about.</p>'
              + '<h3 class="c360-trend-title">Suggested</h3>'
              + suggestionList(suggestions);

        return '<div class="c360-drawer" role="dialog" aria-modal="false"'
             + ' aria-labelledby="c360-ai-title">'
             + '<div class="c360-drawer-head">'
             + '<div>'
             + '<h2 class="c360-drawer-title" id="c360-ai-title">'
             + '<span aria-hidden="true">◆</span> Portfolio AI</h2>'
             + '<p class="c360-drawer-note">Deterministic queries over the loaded '
             + 'portfolio. Every answer shows how it was derived.</p>'
             + '</div>'
             + '<button type="button" class="c360-modal-close" id="c360-ai-close"'
             + ' aria-label="Close Portfolio AI">×</button>'
             + '</div>'

             + '<div class="c360-drawer-body">' + body + '</div>'

             + '<div class="c360-drawer-foot">'
             + '<div class="c360-ask">'
             + '<label class="c360-visually-hidden" for="c360-ai-input">'
             + 'Ask about your portfolio</label>'
             + '<input type="text" id="c360-ai-input" class="c360-ask-input" '
             + 'placeholder="Ask about your portfolio…" '
             + 'value="' + esc(app.aiQuestion || "") + '" autocomplete="off" />'
             + '<button type="button" class="c360-button c360-button--ai" '
             + 'id="c360-ai-send">Ask</button>'
             + '</div>'
             + '<p class="c360-drawer-note" style="margin-top:9px">'
             + (C360.scorecardConfig.ai.enabled
                ? "The AI layer is enabled; it may rewrite the wording of an answer, "
                  + "but the accounts, counts and scores are computed."
                : "The AI layer is off. These answers do not need it — they are "
                  + "queries, not inferences.")
             + '</p>'
             + '</div></div>';
    }

    function suggestionList(suggestions) {
        return '<ul class="c360-sugs">'
             + util.list(suggestions).map(function (item) {
                   return '<li><button type="button" class="c360-sug" '
                        + 'data-ai-ask="' + esc(item.label) + '">'
                        + esc(item.label) + '</button></li>';
               }).join("")
             + '</ul>';
    }

    return {
        render: render,
        answer: answer
    };
}());
