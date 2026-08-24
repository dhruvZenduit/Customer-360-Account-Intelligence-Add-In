/**
 * Customer 360 — PORTFOLIO COMMAND CENTER UI  (Phase 6)
 * =====================================================
 * The whole portfolio at once: who to care about today, why, and what to do.
 *
 * ALL DOM, NO ARITHMETIC. Every count, ordering and filter result comes from
 * `js/scorecard/portfolio.js`, which is pure and unit-tested in Node. If a
 * number appears below, it was computed there.
 *
 * Four things the templates are careful about:
 *
 *   NO PLACEHOLDER COUNTS. There is no sample data path in this file. An empty
 *   portfolio renders an explained empty state.
 *
 *   QUEUE COUNTS ARE NOT PRESENTED AS A TOTAL. Four numbers printed together
 *   get read as a total whether or not they are one, so the `none` count is
 *   printed beside them with the words that make it obvious.
 *
 *   PRIORITY IS NEVER COLOUR ALONE. Every dot sits next to its `P0`/`P1` text.
 *   Screen-reader users get the level; so does anyone printing in greyscale.
 *
 *   PARTIAL FAILURE RENDERS. One account failing to load lists that account and
 *   shows the other twenty-five. Blanking the screen over one bad fetch is the
 *   failure mode the existing `#c360-source-status` block already exists to
 *   avoid.
 */

"use strict";

C360.portfolioUi = (function () {

    var util = C360.util;
    var c = C360.components;
    var esc = util.escapeHtml;

    function cfg() { return C360.scorecardConfig.portfolio; }

    // -----------------------------------------------------------------
    // Summary
    // -----------------------------------------------------------------

    function stat(label, value, tone) {
        return '<div class="c360-pf-stat' + (tone ? ' c360-pf-stat--' + esc(tone) : "") + '">'
             + '<span class="c360-pf-stat-value">' + esc(String(value)) + '</span>'
             + '<span class="c360-pf-stat-label">' + esc(label) + '</span>'
             + '</div>';
    }

    function summary(view) {
        var s = view.summary;
        var levels = C360.scorecardConfig.priority.levelLabels;

        // A reconciliation failure is a defect in the roll-up. Shown, not hidden.
        var mismatch = "";
        if (!s.reconciliation.bandsSumToTotal || !s.reconciliation.levelsSumToTotal) {
            mismatch = '<p class="c360-sc-mismatch" role="alert">'
                + '<strong>Counts do not reconcile.</strong> '
                + (s.reconciliation.bandsSumToTotal ? "" :
                    "Health bands sum to " + s.reconciliation.bandSum + " of " + s.total + ". ")
                + (s.reconciliation.levelsSumToTotal ? "" :
                    "Priority levels sum to " + s.reconciliation.levelSum + " of " + s.total + ".")
                + '</p>';
        }

        return c.section({
            id: "c360-pf-summary",
            title: "Portfolio overview",
            meta: '<span class="c360-pf-total">' + s.total + " accounts</span>",
            body: mismatch
                + '<h3 class="c360-pf-group-title">Health</h3>'
                + '<div class="c360-pf-stats">'
                + stat("Healthy", s.bands.healthy, "good")
                + stat("At risk", s.bands.atRisk, "watch")
                + stat("Critical", s.bands.critical, "bad")
                // Its own count. Filing these under Critical would turn "we have
                // no device data" into "this customer is in trouble".
                + stat("Health unavailable", s.bands.unavailable, "neutral")
                + '</div>'
                + '<p class="c360-pf-note">Health bands sum to the '
                + s.total + ' accounts in the portfolio. Accounts without enough data to '
                + 'score are counted separately, not as Critical.</p>'

                + '<h3 class="c360-pf-group-title">Priority</h3>'
                + '<div class="c360-pf-stats">'
                + ["P0", "P1", "P2", "P3"].map(function (level) {
                      return '<div class="c360-pf-stat c360-pf-stat--' + esc(level) + '">'
                           + '<span class="c360-pf-stat-value">' + s.levels[level] + '</span>'
                           + '<span class="c360-pf-stat-label">'
                           + '<span class="c360-sc-dot" aria-hidden="true"></span>'
                           + esc(level) + ' ' + esc(levels[level]) + '</span></div>';
                  }).join("")
                + '</div>'

                + '<h3 class="c360-pf-group-title">Action queues</h3>'
                + '<div class="c360-pf-stats">'
                + util.list(C360.scorecardConfig.queues.precedence).map(function (key) {
                      return stat(C360.scorecardConfig.queues.labels[key], s.queues[key], key);
                  }).join("")
                + '</div>'
                + '<p class="c360-pf-note"><strong>' + esc(s.noQueueLabel) + '.</strong> '
                + 'Queue counts are by primary queue, so the four numbers above do not sum to '
                + 'the portfolio total — they sum to ' + (s.total - s.queues.none)
                + ', and the remaining ' + s.queues.none + ' need nothing.</p>'
        });
    }

    // -----------------------------------------------------------------
    // Top priorities
    // -----------------------------------------------------------------

    function topPriorities(view) {
        if (!view.topPriorities.length) {
            return c.section({
                id: "c360-pf-top",
                title: "Top priorities",
                body: c.emptyState("No account in this portfolio has an active priority signal.")
            });
        }

        var rows = view.topPriorities.map(function (row) {
            var reasons = row.reasons.length
                ? '<ul class="c360-pf-reasons">'
                  + row.reasons.map(function (reason) {
                        return '<li>' + esc(reason) + '</li>';
                    }).join("")
                  + (row.moreReasons
                     ? '<li class="c360-pf-more">+' + row.moreReasons + ' more</li>'
                     : "")
                  + '</ul>'
                : "";

            return '<li class="c360-pf-row">'
                 + '<button type="button" class="c360-pf-rowbutton" '
                 + 'data-portfolio-account="' + esc(row.accountId) + '">'
                 + '<span class="c360-pf-rank">#' + row.rank + '</span>'
                 + '<span class="c360-pf-name">' + esc(row.accountName) + '</span>'
                 // Dot AND text. The level is never carried by colour alone.
                 + '<span class="c360-sc-level c360-sc-level--' + esc(row.priorityLevel) + '">'
                 + '<span class="c360-sc-dot" aria-hidden="true"></span>'
                 + esc(row.priorityLevel) + '</span>'
                 + '<span class="c360-pf-score">' + Math.round(row.priorityScore) + '</span>'
                 + '<span class="c360-pf-health">Health '
                 + (row.healthAvailable
                    ? Math.round(row.healthScore)
                    : esc(C360.scorecardConfig.display.unavailableLabel))
                 + '</span>'
                 + (row.primaryQueue
                    ? '<span class="c360-chip c360-chip--' + esc(row.primaryQueue) + '">'
                      + esc(C360.scorecardConfig.queues.labels[row.primaryQueue]) + '</span>'
                    : "")
                 + reasons
                 + (row.actionLabel
                    ? '<span class="c360-pf-action">&rarr; ' + esc(row.actionLabel) + '</span>'
                    : "")
                 + '</button></li>';
        }).join("");

        return c.section({
            id: "c360-pf-top",
            title: "Top priorities",
            note: "Ordered by priority score, ties broken by health ascending then renewal "
                + "date. A healthy account with a strong expansion signal belongs here — "
                + "this is not a risk list.",
            body: '<ol class="c360-pf-rows">' + rows + '</ol>'
        });
    }

    // -----------------------------------------------------------------
    // Queue panels
    // -----------------------------------------------------------------

    function queuePanels(view) {
        var queues = C360.scorecardConfig.queues;

        var panels = util.list(queues.precedence).map(function (key) {
            var cards = view.queueCards[key] || [];

            var body = cards.length
                ? cards.map(function (card) {
                      return '<li>'
                           + '<button type="button" class="c360-pf-card" '
                           + 'data-portfolio-account="' + esc(card.accountId) + '">'
                           + '<span class="c360-pf-card-name">' + esc(card.accountName) + '</span>'
                           + '<span class="c360-sc-level c360-sc-level--'
                           + esc(card.level || "P3") + '">'
                           + '<span class="c360-sc-dot" aria-hidden="true"></span>'
                           + esc(card.level || "—") + '</span>'
                           + '<span class="c360-pf-card-reason">' + esc(card.reason) + '</span>'
                           + '<span class="c360-pf-action">&rarr; '
                           + esc(card.actionLabel || "Review account") + '</span>'
                           + '</button></li>';
                  }).join("")
                : '<li class="c360-empty-inline">Nothing in this queue today.</li>';

            return '<div class="c360-pf-queue c360-pf-queue--' + esc(key) + '">'
                 + '<h3 class="c360-pf-queue-title">'
                 + esc(queues.labels[key]) + ' <span class="c360-pf-queue-count">'
                 + cards.length + '</span></h3>'
                 + '<p class="c360-pf-queue-desc">' + esc(queues.descriptions[key]) + '</p>'
                 + '<ul class="c360-pf-cards">' + body + '</ul>'
                 + '</div>';
        }).join("");

        return c.section({
            id: "c360-pf-queues",
            title: "Action queues",
            note: "Priority says how urgently. Queues say what kind of work. An account in "
                + "SAVE keeps its FIX evidence, because fixing the ticket is often how you "
                + "save the account.",
            body: '<div class="c360-pf-queues">' + panels + '</div>'
        });
    }

    // -----------------------------------------------------------------
    // Portfolio signals
    // -----------------------------------------------------------------

    /**
     * Each line is a click-through that filters the list to exactly the accounts
     * the count refers to. A count you cannot drill into is a number nobody
     * trusts, so the ids travel with it from the roll-up.
     */
    function signals(view) {
        if (!view.signals.length) {
            return c.section({
                id: "c360-pf-signals",
                title: "Portfolio signals",
                body: c.emptyState("No portfolio-level signal is active across these accounts.")
            });
        }

        var glyphs = { up: "&#8593;", down: "&#8595;", warn: "&#9888;" };

        return c.section({
            id: "c360-pf-signals",
            title: "Portfolio signals",
            note: "Every count below filters the account list to exactly those accounts.",
            body: '<ul class="c360-pf-signals">'
                + view.signals.map(function (signal) {
                      return '<li><button type="button" class="c360-pf-signal" '
                           + 'data-portfolio-signal="' + esc(signal.key) + '">'
                           + '<span class="c360-dir c360-dir--' + esc(signal.tone)
                           + '" aria-hidden="true">'
                           + (glyphs[signal.tone] || glyphs.warn) + '</span>'
                           + '<span class="c360-pf-signal-count">' + signal.count + '</span>'
                           + '<span class="c360-pf-signal-label">' + esc(signal.label)
                           + '</span></button></li>';
                  }).join("")
                + '</ul>'
        });
    }

    // -----------------------------------------------------------------
    // Filters, sort, list
    // -----------------------------------------------------------------

    /**
     * Filter chips. Same interaction style as the existing single-account
     * toolbar — `aria-pressed` toggles, AND across groups, OR within a group.
     */
    function filterBar(view) {
        var filters = cfg().filters;
        var labels = cfg().filterLabels;

        var groups = Object.keys(filters).map(function (group) {
            var active = util.list(view.filters[group]);

            var chips = util.list(filters[group]).map(function (value) {
                var on = active.indexOf(value) !== -1;
                return '<button type="button" class="c360-filter' + (on ? " is-active" : "") + '" '
                     + 'data-portfolio-filter="' + esc(group) + '" '
                     + 'data-portfolio-value="' + esc(value) + '" '
                     + 'aria-pressed="' + on + '">'
                     + esc(labels[value] || value) + '</button>';
            }).join("");

            return '<div class="c360-filter-group">'
                 + '<span class="c360-filter-label" id="c360-pf-' + esc(group) + '-label">'
                 + esc(util.humanize(group)) + '</span>'
                 + '<div class="c360-filter-set" role="group" '
                 + 'aria-labelledby="c360-pf-' + esc(group) + '-label">' + chips + '</div>'
                 + '</div>';
        }).join("");

        var sorts = '<div class="c360-filter-group">'
            + '<label class="c360-filter-label" for="c360-pf-sort">Sort</label>'
            + '<select id="c360-pf-sort" class="c360-select">'
            + util.list(cfg().sorts).map(function (id) {
                  return '<option value="' + esc(id) + '"'
                       + (view.sort === id ? " selected" : "") + '>'
                       + esc(cfg().sortLabels[id] || id) + '</option>';
              }).join("")
            + '</select></div>';

        var anyActive = Object.keys(view.filters).some(function (group) {
            return util.list(view.filters[group]).length > 0;
        });

        return '<div class="c360-pf-filters">' + groups + sorts
             + (anyActive
                ? '<button type="button" class="c360-button c360-button--ghost" '
                  + 'id="c360-pf-clear">Clear filters</button>'
                : "")
             + '</div>';
    }

    function accountList(view) {
        if (!view.rows.length) {
            return c.section({
                id: "c360-pf-list",
                title: "Accounts",
                body: filterBar(view)
                    + c.emptyState("No account matches the current filters. "
                        + "Clear a filter to widen the view.")
            });
        }

        var rows = view.rows.map(function (row) {
            return '<tr>'
                 + '<th scope="row"><button type="button" class="c360-pf-link" '
                 + 'data-portfolio-account="' + esc(row.accountId) + '">'
                 + esc(row.accountName) + '</button></th>'
                 + '<td><span class="c360-sc-level c360-sc-level--' + esc(row.priorityLevel) + '">'
                 + '<span class="c360-sc-dot" aria-hidden="true"></span>'
                 + esc(row.priorityLevel) + '</span> '
                 + Math.round(row.priorityScore) + '</td>'
                 + '<td>' + (row.healthAvailable
                     ? Math.round(row.healthScore) + ' <span class="c360-pf-band">'
                       + esc(row.healthBand) + '</span>'
                     : '<span class="c360-sc-unavailable">'
                       + esc(C360.scorecardConfig.display.unavailableLabel) + '</span>') + '</td>'
                 + '<td>' + row.confidencePct + '%</td>'
                 + '<td>' + (row.primaryQueue
                     ? esc(C360.scorecardConfig.queues.labels[row.primaryQueue])
                     : '<span class="c360-pf-none">None</span>') + '</td>'
                 + '<td>' + esc(cfg().filterLabels[row.segment]
                     || util.humanize(row.segment)) + '</td>'
                 + '<td>' + esc(row.renewalDate
                     ? util.formatDate(row.renewalDate) : "Not available") + '</td>'
                 + '<td>' + esc(util.formatMoney(row.accountValue)) + '</td>'
                 + '</tr>';
        }).join("");

        return c.section({
            id: "c360-pf-list",
            title: "Accounts",
            meta: '<span class="c360-section-meta">' + view.rows.length + " of "
                + view.allRows.length + "</span>",
            body: filterBar(view)
                + '<div class="c360-pf-tablewrap">'
                + '<table class="c360-pf-table">'
                + '<thead><tr><th scope="col">Account</th><th scope="col">Priority</th>'
                + '<th scope="col">Health</th><th scope="col">Confidence</th>'
                + '<th scope="col">Queue</th><th scope="col">Segment</th>'
                + '<th scope="col">Renewal</th><th scope="col">Value</th></tr></thead>'
                + '<tbody>' + rows + '</tbody></table></div>'
        });
    }

    // -----------------------------------------------------------------
    // Failures, metrics, refresh
    // -----------------------------------------------------------------

    /**
     * Partial failure, listed per source. The screen renders regardless — this
     * block is what makes the gap legible instead of invisible.
     */
    function failures(view) {
        if (!view.failures.length) { return ""; }

        var fatal = view.failures.filter(function (item) { return item.fatal; });
        var partial = view.failures.filter(function (item) { return !item.fatal; });

        return c.section({
            id: "c360-pf-failures",
            title: "Sources that did not load",
            note: "Everything that did load is shown above. These accounts or sources were "
                + "unavailable on the last refresh.",
            body: (fatal.length
                    ? '<h4 class="c360-sc-sub">Accounts not loaded ('
                      + fatal.length + ')</h4><ul class="c360-sc-limitation-list">'
                      + fatal.map(function (item) {
                            return '<li><strong>' + esc(item.accountId) + '</strong> — '
                                 + esc(item.error) + '</li>';
                        }).join("") + '</ul>'
                    : "")
                + (partial.length
                    ? '<h4 class="c360-sc-sub">Partial account data ('
                      + partial.length + ')</h4><ul class="c360-sc-limitation-list">'
                      + partial.map(function (item) {
                            return '<li>' + esc(item.accountName || item.accountId)
                                 + ' — ' + esc(item.label) + ': ' + esc(item.error) + '</li>';
                        }).join("") + '</ul>'
                    : "")
        });
    }

    /**
     * The metrics panel.
     *
     * `built` and `feedbackSummary` are handed IN rather than derived here.
     * `C360.feedback.summary()` reads sessionStorage, so calling it from a
     * template would put I/O in the view — and `js/scorecard/portfolio.js` has
     * to stay pure, so it cannot own it either. The app layer, which is already
     * the impure one, computes both and passes them through.
     */
    function metricsPanel(view, built, summaryData) {
        if (!built || !summaryData) {
            return c.section({
                id: "c360-pf-metrics",
                title: "Success metrics",
                body: c.emptyState("Metrics are not available for this view.")
            });
        }

        var rows = built.metrics.map(function (metric) {
            return '<tr' + (metric.measurable ? "" : ' class="c360-sc-row--unavailable"') + '>'
                 + '<th scope="row">' + esc(metric.label) + '</th>'
                 + '<td>' + (metric.measurable
                     ? esc(metric.display)
                     : '<span class="c360-sc-unavailable">' + esc(metric.display) + '</span>')
                 + (metric.isEstimate
                    ? ' <span class="c360-pf-estimate">estimate</span>' : "")
                 + '</td>'
                 + '<td class="c360-sc-note">'
                 + esc(metric.caveat || metric.unmeasurableReason || "") + '</td>'
                 + '</tr>';
        }).join("");

        return c.section({
            id: "c360-pf-metrics",
            title: "Success metrics",
            note: "Measurement only — no predictive modelling. A metric whose inputs do not "
                + "exist reports “Not yet measurable” rather than zero, because a "
                + "zero and a gap lead to opposite conclusions.",
            body: '<table class="c360-sc-breakdown">'
                + '<thead><tr><th scope="col">Metric</th><th scope="col">Value</th>'
                + '<th scope="col">Caveat</th></tr></thead>'
                + '<tbody>' + rows + '</tbody></table>'
                + (built.predictiveModelling
                    ? ""
                    : '<p class="c360-pf-note">No predictive modelling. These are '
                      + 'counts and estimates over what actually happened.</p>')
                + '<h4 class="c360-sc-sub">Feedback by rule</h4>'
                + C360.feedbackUi.aggregate(summaryData)
        });
    }

    function toolbar(view, state) {
        return '<div class="c360-pf-toolbar">'
             + '<div class="c360-pf-toolbar-left">'
             + '<h2 class="c360-pf-title">Customer Portfolio Command Center</h2>'
             + '<p class="c360-pf-subtitle">Who should I care about today, why, and exactly '
             + 'what should I do?</p>'
             + '</div>'
             + '<div class="c360-pf-toolbar-right">'
             + '<span class="c360-updated">Last updated: '
             + esc(view.lastUpdated ? util.formatDateTime(view.lastUpdated) : "Not available")
             + '</span>'
             + '<span class="c360-pf-refreshmode">Refresh is '
             + esc(cfg().refresh.mode) + '; scheduled for '
             + esc(cfg().refresh.scheduledLocalTime) + ' local. No model runs '
             + 'continuously.</span>'
             + '<button type="button" class="c360-button" id="c360-pf-refresh"'
             + (state && state.refreshing ? " disabled" : "") + '>'
             + (state && state.refreshing ? "Refreshing&hellip;" : "Refresh portfolio")
             + '</button>'
             + '</div></div>';
    }

    // -----------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------

    /**
     * @param {object} view  the pure roll-up from js/scorecard/portfolio.js
     * @param {object} state { refreshing, metrics, feedbackSummary }
     */
    function render(view, state) {
        if (!view) { return ""; }
        var app = state || {};

        if (view.empty) {
            return toolbar(view, state)
                 + c.section({
                       id: "c360-pf-summary",
                       title: "Portfolio overview",
                       body: c.emptyState("No accounts were loaded. Check the data source, "
                           + "then use Refresh portfolio.")
                   })
                 + failures(view);
        }

        return toolbar(view, state)
             + summary(view)
             + topPriorities(view)
             + queuePanels(view)
             + signals(view)
             + accountList(view)
             + metricsPanel(view, app.metrics, app.feedbackSummary)
             + failures(view);
    }

    return {
        render: render,
        summary: summary,
        topPriorities: topPriorities,
        queuePanels: queuePanels,
        signals: signals,
        accountList: accountList,
        filterBar: filterBar,
        metricsPanel: metricsPanel
    };
}());
