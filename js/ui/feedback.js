/**
 * Customer 360 — FEEDBACK UI  (Phase 9)
 * =====================================
 * Four controls, an optional reason prompt, and an honest statement about where
 * the feedback goes.
 *
 *     Useful   Incorrect   Not needed   Already handled
 *
 * FOUR BUTTONS, NOT TWO. Thumbs up/down would be a smaller UI and would throw
 * away the only genuinely useful information here — whether the SIGNAL was
 * wrong, the ACTION was wrong, or the work was simply already done. Each of
 * those indicts a different part of the system, and each leads to a different
 * config change. So the labels stay distinct and the UI prints which layer each
 * one indicts, so a user marking "Not needed" knows they are not calling the
 * system wrong.
 *
 * MARKING SOMETHING INCORRECT CHANGES NOTHING AUTOMATICALLY. It records a
 * judgment. The UI says so, because a user who believes their click retrained
 * something will stop clicking when nothing appears to happen.
 *
 * FEEDBACK IS SESSION-LOCAL until a gateway write endpoint exists, and the panel
 * says that too. Implying persistence that does not exist is how six weeks of
 * tuning data turns out to have never left the browser.
 */

"use strict";

C360.feedbackUi = (function () {

    var util = C360.util;
    var esc = util.escapeHtml;

    function cfg() { return C360.scorecardConfig.feedback; }

    /**
     * The four controls for one recommendation, plus whatever feedback it
     * already carries.
     */
    function controls(recommendation, model) {
        var existing = C360.feedback.forRecommendation(recommendation.id);
        var storage = C360.feedback.storageState();
        var labels = cfg().labels;

        var buttons = Object.keys(labels).map(function (key) {
            var chosen = existing.filter(function (record) {
                return record.outcome === key;
            }).length;

            return '<button type="button" '
                 + 'class="c360-fb-button c360-fb-button--' + esc(key)
                 + (chosen ? " is-chosen" : "") + '" '
                 + 'data-feedback-outcome="' + esc(key) + '" '
                 + 'data-feedback-rec="' + esc(recommendation.id) + '" '
                 + 'aria-pressed="' + (chosen ? "true" : "false") + '" '
                 // The indictment is a title rather than visible text so four
                 // buttons stay scannable, but it is on every one of them.
                 + 'title="' + esc(cfg().indicts[key]
                       ? "Indicts the " + cfg().indicts[key]
                       : "Confirms the recommendation was right and wanted") + '">'
                 + esc(labels[key])
                 + (chosen ? ' <span class="c360-fb-count">' + chosen + '</span>' : "")
                 + '</button>';
        }).join("");

        var recorded = existing.length
            ? '<ul class="c360-fb-recorded">'
              + existing.map(function (record) {
                    return '<li>' + esc(record.outcomeLabel)
                         + (record.reason ? ' — ' + esc(record.reason) : "")
                         + (record.indicts
                            ? ' <span class="c360-fb-indicts">indicts the '
                              + esc(record.indicts) + '</span>'
                            : "")
                         + (record.dismissed
                            ? ' <span class="c360-fb-dismissed">dismissed, retained</span>'
                            : "")
                         + '</li>';
                }).join("")
              + '</ul>'
            : "";

        return '<div class="c360-fb" data-feedback-account="' + esc(model.accountId || "") + '">'
             + '<h5 class="c360-fb-title">Was this recommendation useful?</h5>'
             + '<div class="c360-fb-buttons">' + buttons + '</div>'
             + '<div class="c360-fb-reason" hidden>'
             + '<label class="c360-fb-label" for="c360-fb-reason-' + esc(recommendation.id) + '">'
             + 'Why was this incorrect? (optional)</label>'
             + '<input type="text" class="c360-fb-reason-input" '
             + 'id="c360-fb-reason-' + esc(recommendation.id) + '" '
             + 'placeholder="What did the system get wrong?" />'
             + '<button type="button" class="c360-button c360-button--ghost" '
             + 'data-feedback-action="save-reason" '
             + 'data-feedback-rec="' + esc(recommendation.id) + '">Save reason</button>'
             + '</div>'
             + recorded
             + '<p class="c360-fb-note">Feedback is recorded against the rule that fired '
             + '(<code>' + esc(recommendation.rule) + '</code>). It does not change this '
             + 'account&rsquo;s scores and does not switch the rule off — suppressing a rule '
             + 'is a config change a person makes after reading the aggregate.</p>'
             + (storage.notice
                ? '<p class="c360-fb-storage">' + esc(storage.notice) + '</p>'
                : "")
             + '</div>';
    }

    /**
     * Whether this outcome should prompt for a reason.
     *
     * Prompt, not require: a user who marks something incorrect and does not
     * want to explain why has still told us something worth counting, and
     * blocking on the text box would cost us the count.
     */
    function shouldPromptForReason(outcome) {
        return util.list(cfg().promptForReasonOn).indexOf(outcome) !== -1;
    }

    /**
     * The per-rule aggregate panel — the output the tuning loop actually reads.
     *
     * Ordered worst-first, because the point of the panel is to answer "which
     * rule do I fix next?" and a global average cannot.
     */
    function aggregate(summary) {
        var byRule = util.list(summary.byRule);

        if (!byRule.length) {
            return '<p class="c360-empty">No feedback has been recorded yet, so no rule has a '
                 + 'false-positive rate. This panel fills in as recommendations are '
                 + 'reviewed.</p>';
        }

        var rows = byRule.map(function (entry) {
            return '<tr>'
                 + '<th scope="row"><code>' + esc(entry.rule) + '</code></th>'
                 + '<td class="c360-sc-num">' + entry.total + '</td>'
                 + '<td class="c360-sc-num">' + entry.useful + '</td>'
                 + '<td class="c360-sc-num">' + entry.incorrect + '</td>'
                 + '<td class="c360-sc-num">' + entry.notNeeded + '</td>'
                 + '<td class="c360-sc-num">' + entry.alreadyHandled + '</td>'
                 + '<td class="c360-sc-num">'
                 + Math.round(entry.falsePositiveRate * 100) + '%</td>'
                 + '</tr>';
        }).join("");

        return '<table class="c360-sc-breakdown">'
             + '<caption>Per-rule feedback. Ordered by false-positive rate, worst first — '
             + 'a single global rate would hide which rule is broken.</caption>'
             + '<thead><tr><th scope="col">Rule</th><th scope="col">Responses</th>'
             + '<th scope="col">Useful</th><th scope="col">Incorrect</th>'
             + '<th scope="col">Not needed</th><th scope="col">Handled</th>'
             + '<th scope="col">False positive</th></tr></thead>'
             + '<tbody>' + rows + '</tbody></table>'
             + '<p class="c360-fb-note">Response rate: '
             + (summary.responseRate === null
                ? "not available"
                : Math.round(summary.responseRate * 100) + "% of recommendations reviewed ("
                  + summary.withFeedback + " of " + summary.recommendationTotal + ")")
             + '. No rule has been suppressed — automatic suppression is '
             + (byRule[0].autoSuppressEnabled ? "enabled" : "disabled") + ' in config.</p>';
    }

    return {
        controls: controls,
        aggregate: aggregate,
        shouldPromptForReason: shouldPromptForReason
    };
}());
