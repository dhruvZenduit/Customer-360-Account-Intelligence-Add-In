/**
 * Customer 360 — PORTFOLIO COMMAND CENTER UI
 * ==========================================
 * The centrepiece: a three-panel workspace that answers five questions in a
 * fixed order, on one screen, without scrolling.
 *
 *     WHO?          left panel    the priority queue
 *     HOW URGENT?   centre top    level, score, health, ARR, renewal
 *     WHY?          right panel   numbered evidence + the score decomposed
 *     WHAT?         centre        NEXT BEST ACTION
 *     DO IT         centre        the buttons on that action
 *
 * The layout IS the argument. Left is narrow and scrollable because it is a
 * queue you scan; centre is widest because it holds the decision and the thing
 * you do about it; right is reference you consult when you doubt the centre.
 * Selecting an account in the left updates the other two — that is the whole
 * interaction loop, and everything below the workspace is a different way into
 * the same selection.
 *
 * ALL DOM, NO ARITHMETIC. Every count, ordering, position and filter result
 * comes from `js/scorecard/portfolio.js`, which is pure and unit-tested in
 * Node. If a number appears below, it was computed there.
 *
 * The things this file is careful not to do:
 *
 *   NO PLACEHOLDER DATA. There is no sample path. An empty portfolio renders an
 *   explained empty state.
 *
 *   HEALTH AND PRIORITY ARE NEVER MERGED. They sit in separate figure tiles
 *   with separate labels, and the matrix plots one against the other precisely
 *   so the disagreements are visible.
 *
 *   QUEUE COUNTS ARE NOT A TOTAL. Four numbers side by side get read as a total
 *   whether or not they are one, so the `none` count is printed beside them in
 *   words.
 *
 *   PRIORITY IS NEVER COLOUR ALONE. `parts.plevel()` cannot emit a dot without
 *   its "P0" text.
 */

"use strict";

C360.portfolioUi = (function () {

    var util = C360.util;
    var esc = util.escapeHtml;
    var p = null;

    /** Lazily bound so load order between the two ui files does not matter. */
    function parts() {
        if (!p) { p = C360.parts; }
        return p;
    }

    function cfg() { return C360.scorecardConfig.portfolio; }

    // =================================================================
    // LEFT — PRIORITY QUEUE
    // =================================================================

    /**
     * One queue row. A row, not a card: at this size twelve accounts fit on
     * screen instead of four, and an operational queue you have to scroll is a
     * queue you stop trusting.
     *
     * Three lines maximum — name and level, the reason, then the hard numbers
     * (SLA age, renewal countdown, ARR) as monospace tags.
     */
    function queueRow(row, selectedId) {
        var tags = [];

        if (row.slaBreach) {
            tags.push('<span class="c360-tag c360-tag--sla">SLA breach · '
                + row.slaBreach.days + 'd</span>');
        }
        if (row.renewalDays !== null && row.renewalDays <= 120) {
            tags.push('<span class="c360-tag c360-tag--renewal">Renewal · '
                + row.renewalDays + 'd</span>');
        }
        if (row.accountValue !== null && row.accountValue !== undefined) {
            tags.push('<span class="c360-tag c360-tag--arr">'
                + esc(parts().money(row.accountValue)) + '</span>');
        }

        return '<li><button type="button" class="c360-qrow c360-qrow--'
             + esc(row.priorityLevel)
             + (row.accountId === selectedId ? " is-selected" : "") + '"'
             + ' data-select-account="' + esc(row.accountId) + '"'
             + ' aria-pressed="' + (row.accountId === selectedId) + '">'
             + '<span class="c360-qrow-top">'
             + '<span class="c360-qrow-name">' + esc(row.accountName) + '</span>'
             + parts().plevel(row.priorityLevel, row.priorityScore)
             + '</span>'
             + '<span class="c360-qrow-reason">'
             + esc(row.headline || "No reason recorded") + '</span>'
             + (tags.length
                ? '<span class="c360-qrow-tags">' + tags.join("") + '</span>'
                : "")
             + '</button></li>';
    }

    function priorityQueue(view, state) {
        var rows = util.list(view.urgent);
        var levels = view.summary.levels;

        var counts = '<div class="c360-qcount">'
            + '<div class="c360-qcount-item">'
            + '<span class="c360-qcount-label">'
            + '<span class="c360-pdot" style="color:var(--c360-p0)" aria-hidden="true"></span>'
            + 'P0 · Immediate</span>'
            + '<span class="c360-qcount-value" style="color:var(--c360-p0)">'
            + levels.P0 + '</span></div>'
            + '<div class="c360-qcount-item">'
            + '<span class="c360-qcount-label">'
            + '<span class="c360-pdot" style="color:var(--c360-p1)" aria-hidden="true"></span>'
            + 'P1 · High</span>'
            + '<span class="c360-qcount-value" style="color:var(--c360-p1)">'
            + levels.P1 + '</span></div>'
            + '</div>';

        var body = rows.length
            ? '<ul class="c360-queue">'
              + rows.map(function (row) {
                    return queueRow(row, state.selectedAccountId);
                }).join("")
              + '</ul>'
            // Not a failure state. "Nothing is urgent" is a real and welcome
            // answer, and it should read like one.
            : parts().emptyPanel("Nothing is at P0 or P1. No account in this "
                + "portfolio needs attention today.");

        return parts().panel({
            title: "Priority Queue",
            meta: rows.length + " urgent",
            modifier: "queue",
            raw: counts
                + '<div class="c360-panel-scroll">' + body + '</div>'
        });
    }

    // =================================================================
    // CENTRE — ACTIVE ACCOUNT + NEXT BEST ACTION
    // =================================================================

    /**
     * NEXT BEST ACTION — the strongest element on the page.
     *
     * Everything above it is diagnosis. This is what the user came to do, so it
     * gets the accent border, the numbered steps, the owner and due date, and
     * the buttons. It changes with the selected account because it IS the
     * account's top recommendation, in queue-precedence order.
     *
     * When nothing is recommended it says so plainly. No generic "contact the
     * customer" is offered in its place — that is a config decision
     * (`allowGenericFallback: false`) and this is where the user would feel it.
     */
    function nextBestAction(row) {
        var action = row.nextAction;

        if (!action) {
            return '<div class="c360-nba c360-nba--quiet">'
                 + '<p class="c360-nba-eyebrow">No action required</p>'
                 + '<h3 class="c360-nba-headline">Nothing to do today</h3>'
                 + '<p class="c360-nba-why">No rule fired on this account, so it is in '
                 + 'no queue and no action is recommended. A generic action is not '
                 + 'offered in place of a real one.</p>'
                 + '</div>';
        }

        return '<div class="c360-nba">'
             + '<p class="c360-nba-eyebrow">'
             + '<span>Next best action</span>'
             + parts().qbadge(action.queue)
             + '</p>'
             + '<h3 class="c360-nba-headline">' + esc(action.label) + '</h3>'
             + '<p class="c360-nba-why">' + esc(action.why) + '</p>'
             + (action.steps.length
                ? '<ol class="c360-nba-steps">'
                  + action.steps.map(function (step) {
                        return '<li>' + esc(step) + '</li>';
                    }).join("")
                  + '</ol>'
                : "")
             + '<div class="c360-nba-meta">'
             + '<div class="c360-nba-meta-item">Owner'
             + '<span class="c360-nba-meta-value">' + esc(action.owner) + '</span></div>'
             + '<div class="c360-nba-meta-item">Due'
             + '<span class="c360-nba-meta-value">' + esc(action.due) + '</span></div>'
             + '<div class="c360-nba-meta-item">Confidence'
             + '<span class="c360-nba-meta-value">' + esc(action.confidence)
             + '</span></div>'
             + '</div>'
             + '<div class="c360-nba-actions">'
             + '<button type="button" class="c360-button c360-button--action" '
             + 'data-brief-account="' + esc(row.accountId) + '">Generate brief</button>'
             + '<button type="button" class="c360-button c360-button--quiet" '
             + 'data-open-account="' + esc(row.accountId) + '">Open workspace</button>'
             + '</div></div>';
    }

    /**
     * The centre panel: who, how urgent, the stakes, the trend, the action.
     *
     * Health and priority are two separate tiles with two separate labels. They
     * are never averaged, never combined into a single "score", and the matrix
     * further down exists to show how often they disagree.
     */
    function activeAccount(view, state) {
        var row = C360.portfolio.rowFor(view, state.selectedAccountId)
               || util.list(view.urgent)[0]
               || util.list(view.rows)[0];

        if (!row) {
            return parts().panel({
                title: "Active Account",
                body: parts().emptyPanel("Select an account from the priority queue.")
            });
        }

        var model = row.model;
        var health = model.health;

        var head = '<div class="c360-active-head">'
            + '<h2 class="c360-active-name">' + esc(row.accountName) + '</h2>'
            + '<div class="c360-active-tags">'
            + parts().band(health)
            + parts().plevel(row.priorityLevel, row.priorityScore)
            + parts().qbadge(row.primaryQueue)
            + '<span class="c360-tag">' + esc(row.lifecycleLabel || "") + '</span>'
            + '</div></div>';

        var figures = '<div class="c360-figs">'
            + parts().figure({
                  label: "Health",
                  value: health.available ? Math.round(health.score) : null,
                  tone: health.available
                      ? (health.bandTone === "good" ? "good"
                         : health.bandTone === "watch" ? "watch" : "bad")
                      : null,
                  note: health.available ? "of 100" : null,
                  missingNote: "Too few categories have data"
              })
            + parts().figure({
                  label: "Priority",
                  value: Math.round(row.priorityScore),
                  tone: row.priorityLevel === "P0" ? "bad"
                      : row.priorityLevel === "P1" ? "watch" : null,
                  note: row.priorityLevel + " · " + (model.priority.levelSetBy === "override"
                      ? "set by override" : "scored")
              })
            + parts().figure({
                  label: "Renewal",
                  value: row.renewalDays === null ? null : row.renewalDays + "D",
                  tone: row.renewalDays !== null && row.renewalDays <= 90 ? "watch" : null,
                  note: row.renewalDays === null
                      ? null : util.formatDate(row.renewalDate),
                  missingNote: "No contract record"
              })
            + '</div>';

        var facts = '<div class="c360-facts">'
            + parts().fact("ARR", parts().money(row.accountValue),
                  { missingLabel: "Not recorded" })
            + parts().fact("Segment", row.segmentLabel, { text: true })
            + parts().fact("Confidence", row.confidencePct + "%")
            + parts().fact("Open actions", row.recommendationCount)
            + '</div>';

        var trend = parts().sparkline(
            C360.history.trend(row.accountId, "healthScore"),
            { title: "Health trend" });

        return parts().panel({
            title: "Active Account",
            meta: model.identity.masterCustomerId,
            modifier: "active",
            raw: head + figures + facts + trend + nextBestAction(row)
        });
    }

    // =================================================================
    // RIGHT — INTELLIGENCE
    // =================================================================

    /**
     * WHY THIS ACCOUNT? — numbered evidence, then the score decomposed.
     *
     * Ordered: fired overrides first (the most concrete statements available),
     * then contributing factors. Numbering matters — it reads as a chain of
     * reasoning rather than a bag of facts, which is the difference between an
     * explanation and a list.
     */
    function intelligence(view, state) {
        var row = C360.portfolio.rowFor(view, state.selectedAccountId)
               || util.list(view.urgent)[0]
               || util.list(view.rows)[0];

        if (!row) {
            return parts().panel({
                title: "Intelligence",
                sub: "Why this account?",
                body: parts().emptyPanel("No account selected.")
            });
        }

        var model = row.model;
        var priority = model.priority;
        var entries = [];

        util.list(priority.firedOverrides).forEach(function (override) {
            var evidence = util.list(override.evidence)[0];
            entries.push({
                tone: override.level === "P0" ? "critical"
                    : override.level === "P1" ? "warning" : "info",
                title: parts().ruleLabel(override.rule),
                text: override.reason,
                excerpt: evidence ? evidence.excerpt : null,
                meta: [override.level + " override"].concat(
                    evidence && evidence.date
                        ? [util.formatDate(evidence.date)] : [])
                    .concat(evidence && evidence.id
                        ? [String(evidence.type).toUpperCase() + " " + evidence.id] : [])
            });
        });

        if (row.renewalDays !== null && row.renewalDays <= 120) {
            entries.push({
                tone: "warning",
                title: "Renewal proximity",
                text: row.renewalDays + " days remaining on the recorded contract.",
                meta: [util.formatDate(row.renewalDate)]
            });
        }

        // Only factors that actually contribute, so the list is reasons rather
        // than an inventory of the scoring model.
        util.list(priority.factors)
            .filter(function (factor) {
                return factor.available && factor.contribution >= 1;
            })
            .sort(function (a, b) { return b.contribution - a.contribution; })
            .slice(0, 4)
            .forEach(function (factor) {
                entries.push({
                    tone: "info",
                    title: factor.label,
                    text: factor.basis,
                    meta: [factor.contribution.toFixed(1) + " of "
                        + Math.round(priority.score)]
                });
            });

        var evidenceList = entries.length
            ? '<ul class="c360-eviList">'
              + entries.map(function (entry, index) {
                    return parts().evidenceRow(index, entry);
                }).join("")
              + '</ul>'
            : parts().emptyPanel("No reason is recorded for this account.");

        var primary = '<p class="c360-answer-method"><strong>Primary reason:</strong> '
            + esc(priority.primaryReason) + '</p>';

        var breakdown = '<h3 class="c360-trend-title" style="margin-top:16px">'
            + 'Priority score</h3>'
            + parts().factorBars(priority)
            + '<p class="c360-answer-method">Health is calculated separately and is not '
            + 'an input to this score. '
            + (model.health.available
                ? "Health is " + Math.round(model.health.score) + " ("
                  + model.health.band + ")."
                : "Health could not be scored for this account.")
            + '</p>';

        return parts().panel({
            title: "Intelligence",
            sub: "Why this account?",
            modifier: "intel",
            body: evidenceList + primary + breakdown
        });
    }

    // =================================================================
    // ACTION QUEUE TABS
    // =================================================================

    /**
     * Four interactive filters. Clicking SAVE narrows the account list to
     * retention accounts; clicking it again clears.
     *
     * The `none` count is printed underneath in words, because four numbers in
     * a row get read as a total and these do not add to one.
     */
    function queueTabs(view) {
        var queues = C360.scorecardConfig.queues;
        var active = util.list(view.filters.queue);
        var counts = view.summary.queues;

        var tabs = util.list(queues.precedence).map(function (key) {
            var on = active.indexOf(key) !== -1;
            return '<button type="button" class="c360-qtab c360-qtab--' + esc(key)
                 + (on ? " is-active" : "") + '"'
                 + ' data-portfolio-filter="queue" data-portfolio-value="' + esc(key) + '"'
                 + ' aria-pressed="' + on + '">'
                 + '<span class="c360-qtab-count">' + counts[key] + '</span>'
                 + '<span><span class="c360-qtab-name">'
                 + esc(queues.labels[key]) + '</span>'
                 + '<span class="c360-qtab-desc">'
                 + esc(queues.descriptions[key]) + '</span></span>'
                 + '</button>';
        }).join("");

        return '<div class="c360-queues">' + tabs + '</div>'
             + '<p class="c360-strip-note" style="padding:8px 22px 0">'
             + esc(view.summary.noQueueLabel)
             + '. Queue counts are by primary queue, so these four do not sum to the '
             + view.summary.total + ' accounts in the portfolio.</p>';
    }

    // =================================================================
    // PORTFOLIO MATRIX
    // =================================================================

    /**
     * Health on x, priority on y.
     *
     * The quadrant that justifies the whole product is top-right: urgent AND
     * healthy. A single blended score cannot put an account there, which is why
     * health and priority are kept apart — and why this chart is worth the
     * space when most dashboard charts are not.
     *
     * Accounts whose health could not be scored are listed beneath rather than
     * plotted at zero. Plotting them at zero would assert they are critical.
     */
    function matrix(view, state) {
        var data = view.matrix;

        if (!data.placed.length) {
            return parts().panel({
                title: "Portfolio Matrix",
                body: parts().emptyPanel("No account has both a health and a priority "
                    + "score, so nothing can be plotted.")
            });
        }

        var nodes = data.placed.map(function (node) {
            var selected = node.accountId === state.selectedAccountId;
            return '<button type="button" class="c360-mnode c360-mnode--'
                 + esc(node.priorityLevel) + (selected ? " is-selected" : "") + '"'
                 + ' style="left:' + node.x.toFixed(2) + '%;bottom:'
                 + node.y.toFixed(2) + '%"'
                 + ' data-select-account="' + esc(node.accountId) + '"'
                 + ' data-open-account-dbl="' + esc(node.accountId) + '"'
                 + ' aria-label="' + esc(node.accountName + ", health "
                     + Math.round(node.healthScore) + ", priority "
                     + node.priorityLevel + " " + Math.round(node.priorityScore)) + '">'
                 + '<span class="c360-mtip">'
                 + '<span class="c360-mtip-name">' + esc(node.accountName) + '</span>'
                 + '<span class="c360-mtip-row"><span>Health</span><span>'
                 + Math.round(node.healthScore) + '</span></span>'
                 + '<span class="c360-mtip-row"><span>Priority</span><span>'
                 + node.priorityLevel + ' · ' + Math.round(node.priorityScore)
                 + '</span></span>'
                 + '<span class="c360-mtip-row"><span>Queue</span><span>'
                 + esc(node.primaryQueue
                     ? C360.scorecardConfig.queues.labels[node.primaryQueue]
                     : "None") + '</span></span>'
                 + '<span class="c360-mtip-row"><span>ARR</span><span>'
                 + esc(parts().money(node.accountValue) || "—") + '</span></span>'
                 + '<span class="c360-mtip-row"><span>Renewal</span><span>'
                 + (node.renewalDays === null ? "—" : node.renewalDays + "D")
                 + '</span></span>'
                 + '</span></button>';
        }).join("");

        var body = '<div class="c360-matrix-wrap">'
            + '<div class="c360-matrix">'
            + '<div class="c360-maxis-y">'
            + '<span class="c360-maxis-label">High</span>'
            + '<span class="c360-maxis-label">Low</span>'
            + '</div>'
            + nodes
            + '</div>'
            + '<div class="c360-maxis-x">'
            + '<span class="c360-maxis-label">Critical</span>'
            + '<span class="c360-maxis-label">Healthy</span>'
            + '</div>'
            + '<p class="c360-maxis-name">Health →</p>'
            + (data.unplaced.length
                ? '<p class="c360-matrix-unplaced">'
                  + util.plural(data.unplaced.length, "account")
                  + ' could not be plotted: '
                  + esc(data.unplaced.map(function (item) {
                        return item.accountName;
                    }).join(", "))
                  + '. Health could not be scored, and plotting them at zero would '
                  + 'assert they are critical.</p>'
                : "")
            + '</div>';

        return parts().panel({
            title: "Portfolio Matrix",
            meta: data.placed.length + " plotted",
            sub: "Priority (vertical) against health (horizontal)",
            raw: body
        });
    }

    // =================================================================
    // SIGNAL FEED
    // =================================================================

    /**
     * LATEST PORTFOLIO SIGNALS.
     *
     * Timestamps are the RECORDS' own dates, not the time of the scoring run.
     * A feed where every row said "12:26" because that is when Refresh ran
     * would look live and mean nothing. The wording is "latest signals · last
     * updated", never anything implying a process that runs on its own.
     */
    function feed(view) {
        var items = util.list(view.feed);

        if (!items.length) {
            return parts().panel({
                title: "Latest Portfolio Signals",
                body: parts().emptyPanel("No dated signal is on record across the "
                    + "portfolio.")
            });
        }

        return parts().panel({
            title: "Latest Portfolio Signals",
            meta: "Last updated " + parts().clockOf(view.lastUpdated),
            raw: '<div class="c360-panel-scroll"><ul class="c360-feed">'
                + items.map(function (item) {
                      return '<li><button type="button" class="c360-feed-item" '
                           + 'data-select-account="' + esc(item.accountId) + '">'
                           + '<span class="c360-feed-time">'
                           + esc(parts().clockOf(item.date)) + '</span>'
                           + '<span class="c360-feed-dot c360-feed-dot--'
                           + esc(item.tone) + '" aria-hidden="true"></span>'
                           + '<span class="c360-feed-text">'
                           + '<span class="c360-feed-account">'
                           + esc(item.accountName) + '</span> '
                           + '<span class="c360-feed-what">'
                           + esc(parts().ruleLabel(item.text).toLowerCase())
                           + '</span></span>'
                           + '</button></li>';
                  }).join("")
                + '</ul></div>'
        });
    }

    // =================================================================
    // ACCOUNT LIST  (the "Accounts" screen)
    // =================================================================

    function filterBar(view) {
        var filters = cfg().filters;
        var labels = cfg().filterLabels;

        var groups = Object.keys(filters).map(function (group) {
            var active = util.list(view.filters[group]);
            var chips = util.list(filters[group]).map(function (value) {
                var on = active.indexOf(value) !== -1;
                return '<button type="button" class="c360-filter'
                     + (on ? " is-active" : "") + '" '
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

        var any = Object.keys(view.filters).some(function (group) {
            return util.list(view.filters[group]).length > 0;
        });

        return '<div class="c360-pf-filters">' + groups + sorts
             + (any
                ? '<button type="button" class="c360-button c360-button--ghost" '
                  + 'id="c360-pf-clear">Clear filters</button>'
                : "")
             + '</div>';
    }

    function accountList(view, state) {
        var rows = util.list(view.rows);

        var body = rows.length
            ? '<div class="c360-pf-tablewrap"><table class="c360-pf-table">'
              + '<thead><tr><th scope="col">Account</th><th scope="col">Priority</th>'
              + '<th scope="col">Health</th><th scope="col">Queue</th>'
              + '<th scope="col">ARR</th><th scope="col">Renewal</th>'
              + '<th scope="col">Conf</th><th scope="col">Next action</th></tr></thead>'
              + '<tbody>'
              + rows.map(function (row) {
                    return '<tr' + (row.accountId === state.selectedAccountId
                            ? ' class="is-selected"' : "") + '>'
                         + '<th scope="row"><button type="button" class="c360-pf-link" '
                         + 'data-open-account="' + esc(row.accountId) + '">'
                         + esc(row.accountName) + '</button></th>'
                         + '<td>' + parts().plevel(row.priorityLevel, row.priorityScore)
                         + '</td>'
                         + '<td class="c360-num">' + (row.healthAvailable
                             ? Math.round(row.healthScore)
                             : '<span class="c360-sc-unavailable">n/a</span>') + '</td>'
                         + '<td>' + parts().qbadge(row.primaryQueue) + '</td>'
                         + '<td class="c360-num">'
                         + esc(parts().money(row.accountValue) || "—") + '</td>'
                         + '<td class="c360-num">'
                         + (row.renewalDays === null ? "—" : row.renewalDays + "D")
                         + '</td>'
                         + '<td class="c360-num">' + row.confidencePct + '%</td>'
                         + '<td>' + esc(row.nextAction ? row.nextAction.label : "—")
                         + '</td>'
                         + '</tr>';
                }).join("")
              + '</tbody></table></div>'
            : parts().emptyPanel("No account matches the current filters. Clear a filter "
                + "to widen the view.");

        return parts().panel({
            title: "Accounts",
            meta: rows.length + " of " + view.allRows.length,
            raw: '<div class="c360-panel-body">' + filterBar(view) + '</div>' + body
        });
    }

    // =================================================================
    // METRICS
    // =================================================================

    /**
     * Built in the app layer and handed in — `C360.feedback.summary()` reads
     * sessionStorage, and neither the pure roll-up nor a template should own
     * I/O.
     */
    function metricsPanel(view, built, summaryData) {
        if (!built || !summaryData) {
            return parts().panel({
                title: "Success Metrics",
                body: parts().emptyPanel("Metrics are not available for this view.")
            });
        }

        var rows = built.metrics.map(function (metric) {
            return '<tr' + (metric.measurable ? "" : ' class="c360-sc-row--unavailable"') + '>'
                 + '<th scope="row">' + esc(metric.label) + '</th>'
                 + '<td>' + (metric.measurable
                     ? esc(metric.display)
                     : '<span class="c360-sc-unavailable">' + esc(metric.display)
                       + '</span>')
                 + (metric.isEstimate
                    ? ' <span class="c360-pf-estimate">estimate</span>' : "")
                 + '</td>'
                 + '<td class="c360-sc-note">'
                 + esc(metric.caveat || metric.unmeasurableReason || "") + '</td>'
                 + '</tr>';
        }).join("");

        return parts().panel({
            title: "Success Metrics",
            sub: "Measurement only — no predictive modelling",
            body: '<table class="c360-sc-breakdown">'
                + '<thead><tr><th scope="col">Metric</th><th scope="col">Value</th>'
                + '<th scope="col">Caveat</th></tr></thead>'
                + '<tbody>' + rows + '</tbody></table>'
                + '<h4 class="c360-sc-sub">Feedback by rule</h4>'
                + C360.feedbackUi.aggregate(summaryData)
        });
    }

    // =================================================================
    // Failures
    // =================================================================

    function failures(view) {
        if (!view.failures.length) { return ""; }

        var fatal = view.failures.filter(function (item) { return item.fatal; });
        var partial = view.failures.filter(function (item) { return !item.fatal; });

        return parts().panel({
            title: "Sources That Did Not Load",
            sub: "Everything that did load is shown above",
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
                                 + ' — ' + esc(item.label) + ': '
                                 + esc(item.error) + '</li>';
                        }).join("") + '</ul>'
                    : "")
        });
    }

    // =================================================================
    // Render
    // =================================================================

    /**
     * @param {object} view  the pure roll-up from js/scorecard/portfolio.js
     * @param {object} state { screen, selectedAccountId, metrics, feedbackSummary }
     */
    function render(view, state) {
        if (!view) { return ""; }
        var app = state || {};

        if (view.empty) {
            return '<div class="c360-cc">'
                 + parts().panel({
                       title: "Command Center",
                       body: parts().emptyPanel("No accounts were loaded. Check the data "
                           + "source, then use Refresh.")
                   })
                 + '</div>' + failures(view);
        }

        // The "Signals" screen is the feed at full width — the same computed
        // feed, given room, rather than a second implementation of it.
        if (app.screen === "signals") {
            return '<div class="c360-cc" style="grid-template-columns:minmax(0,1fr)">'
                 + feed(view) + '</div>'
                 + '<div class="c360-cc" style="grid-template-columns:minmax(0,1fr)">'
                 + matrix(view, app) + '</div>';
        }

        // The "Accounts" screen is the filterable list, plus the queue tabs that
        // drive it.
        if (app.screen === "accounts") {
            return queueTabs(view)
                 + '<div class="c360-cc" style="grid-template-columns:minmax(0,1fr)">'
                 + accountList(view, app) + '</div>'
                 + '<div class="c360-cc" style="grid-template-columns:minmax(0,1fr)">'
                 + metricsPanel(view, app.metrics, app.feedbackSummary) + '</div>'
                 + failures(view);
        }

        // Command Center: the three-panel workspace, then the queues, then the
        // matrix and feed side by side.
        return '<div class="c360-cc">'
             + priorityQueue(view, app)
             + activeAccount(view, app)
             + intelligence(view, app)
             + '</div>'
             + queueTabs(view)
             + '<div class="c360-cc" style="grid-template-columns:minmax(0,1.5fr) '
             + 'minmax(300px,1fr)">'
             + matrix(view, app)
             + feed(view)
             + '</div>'
             + failures(view);
    }

    return {
        render: render,
        priorityQueue: priorityQueue,
        activeAccount: activeAccount,
        intelligence: intelligence,
        nextBestAction: nextBestAction,
        queueTabs: queueTabs,
        matrix: matrix,
        feed: feed,
        accountList: accountList,
        filterBar: filterBar,
        metricsPanel: metricsPanel
    };
}());
