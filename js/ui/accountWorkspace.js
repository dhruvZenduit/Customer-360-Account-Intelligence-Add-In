/**
 * Customer 360 — ACCOUNT DETAIL WORKSPACE
 * =======================================
 * The full-screen view an account opens into from the Command Center.
 *
 * Same five questions, more room to answer them:
 *
 *     back to Command Center      (never a dead end)
 *     name · P0 · SAVE · CRITICAL (who, how urgent, what kind, how healthy)
 *     health / priority / renewal (the figures)
 *     NEXT BEST ACTION            (what, and the buttons to do it)
 *     SIGNALS  |  ACTIVITY        (why, and when)
 *     health history              (whether it is getting worse)
 *     the Phase 7 explainability drawers, unchanged
 *
 * The Phase 7 scorecard block is reused rather than reimplemented. It already
 * renders the health arithmetic, the priority factor breakdown, the confidence
 * per source and the evidence drawers — and it already has the tests that keep
 * those honest. Re-rendering that here would mean two implementations of the
 * same explanation, which is how the two start disagreeing.
 */

"use strict";

C360.accountWorkspace = (function () {

    var util = C360.util;
    var esc = util.escapeHtml;

    function parts() { return C360.parts; }

    // -----------------------------------------------------------------
    // Signals
    // -----------------------------------------------------------------

    /**
     * Every active signal on the account, worst first.
     *
     * Assembled from the fired overrides and the queue rules — the same two
     * sources the portfolio feed reads, so an account's signal list and its row
     * in the feed can never tell different stories.
     */
    function signals(model) {
        var entries = [];
        var seen = {};

        function push(tone, name, evidence) {
            var key = name + ":" + (evidence ? evidence.id : "");
            if (seen[key]) { return; }
            seen[key] = true;
            entries.push({
                tone: tone,
                name: name,
                date: evidence ? evidence.date : null,
                record: evidence
                    ? String(evidence.type).toUpperCase()
                      + (evidence.id ? " " + evidence.id : "")
                    : null
            });
        }

        util.list(model.priority.firedOverrides).forEach(function (override) {
            push(override.level === "P0" ? "critical"
                 : override.level === "P1" ? "warning" : "info",
                 parts().ruleLabel(override.rule),
                 util.list(override.evidence)[0]);
        });

        util.list(model.queues.queues).forEach(function (queue) {
            util.list(queue.rules).forEach(function (rule) {
                push(queue.key === "save" ? "critical"
                     : queue.key === "fix" ? "warning"
                     : queue.key === "grow" ? "healthy" : "info",
                     rule.reason,
                     util.list(rule.evidence)[0]);
            });
        });

        if (!entries.length) {
            return parts().emptyPanel("No signal is active on this account.");
        }

        return '<ul class="c360-siglist">'
             + entries.map(function (entry) {
                   return '<li class="c360-sig">'
                        + '<span class="c360-sig-dot c360-sig-dot--' + esc(entry.tone)
                        + '" aria-hidden="true"></span>'
                        + '<div><div class="c360-sig-name">' + esc(entry.name) + '</div>'
                        + (entry.record || entry.date
                           ? '<div class="c360-sig-meta">'
                             + esc([entry.record,
                                    entry.date ? util.formatDate(entry.date) : null]
                                   .filter(Boolean).join(" · "))
                             + '</div>'
                           : "")
                        + '</div></li>';
               }).join("")
             + '</ul>';
    }

    // -----------------------------------------------------------------
    // Activity
    // -----------------------------------------------------------------

    /**
     * A dated timeline from the account's real records — tickets,
     * communications, escalations, orders, quotes, reviews.
     *
     * Newest first, capped. Every entry is a record that exists; nothing is
     * synthesised to fill a gap in the timeline, so a quiet account looks
     * quiet.
     */
    function activity(model) {
        var bundle = model.bundle || {};
        var items = [];

        function add(records, tone, describe) {
            util.list(records).forEach(function (record) {
                if (!record.date) { return; }
                items.push({
                    date: record.date,
                    tone: tone,
                    text: describe(record)
                });
            });
        }

        add(bundle.communications, "critical", function (r) {
            return r.subject || "Customer communication";
        });
        add(bundle.tickets, "warning", function (r) {
            return "Ticket " + r.number + " — " + (r.subject || "no subject")
                 + (r.isOpen ? " (open)" : " (resolved)");
        });
        add(bundle.technicalIssues, "warning", function (r) {
            return "Technical escalation — " + (r.subject || "no subject");
        });
        add(bundle.billingIssues, "warning", function (r) {
            return "Billing escalation — " + (r.subject || "no subject");
        });
        add(bundle.orders, "healthy", function (r) {
            return "Order " + r.number
                 + (r.quantity !== null ? " — " + r.quantity + " units" : "");
        });
        add(bundle.quotes, "info", function (r) {
            return "Quote " + r.number + " — " + (r.status || "status not recorded");
        });
        add(bundle.reviews, "info", function (r) {
            return r.reviewType || "Account review";
        });

        if (!items.length) {
            return parts().emptyPanel("No dated record is available for this account.");
        }

        items.sort(util.byDateDesc);

        return '<ul class="c360-acts">'
             + items.slice(0, 14).map(function (item) {
                   return '<li class="c360-act c360-act--' + esc(item.tone) + '">'
                        + '<div class="c360-act-date">'
                        + esc(util.formatDate(item.date)) + '</div>'
                        + '<div class="c360-act-text">' + esc(item.text) + '</div>'
                        + '</li>';
               }).join("")
             + '</ul>';
    }

    // -----------------------------------------------------------------
    // Next best action
    // -----------------------------------------------------------------

    /**
     * The workspace version: the same action as the Command Center, plus
     * Escalate, because this is where somebody sits down to actually do it.
     */
    function nextBestAction(row) {
        var action = row.nextAction;

        if (!action) {
            return '<div class="c360-nba c360-nba--quiet">'
                 + '<p class="c360-nba-eyebrow">No action required</p>'
                 + '<h3 class="c360-nba-headline">Nothing to do today</h3>'
                 + '<p class="c360-nba-why">No rule fired on this account. It is in no '
                 + 'queue, and no generic action is offered in place of a real one.</p>'
                 + '</div>';
        }

        return '<div class="c360-nba">'
             + '<p class="c360-nba-eyebrow"><span>Next best action</span>'
             + parts().qbadge(action.queue) + '</p>'
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
             + 'data-escalate-account="' + esc(row.accountId) + '">Escalate</button>'
             + '</div></div>';
    }

    // -----------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------

    /**
     * @param {object} row    the portfolio row (carries ARR + renewal countdown)
     * @param {object} state  { intelligence, previous }
     */
    function render(row, state) {
        if (!row) { return ""; }
        var app = state || {};
        var model = row.model;
        var health = model.health;

        var crumbs = [
            parts().plevel(row.priorityLevel, row.priorityScore),
            parts().qbadge(row.primaryQueue),
            parts().band(health),
            '<span>' + esc(row.segmentLabel || "") + '</span>',
            '<span>' + esc(row.lifecycleLabel || "") + '</span>'
        ].join('<span aria-hidden="true">·</span>');

        var head = '<button type="button" class="c360-aw-back" id="c360-aw-back">'
            + '<span aria-hidden="true">←</span> Command Center</button>'
            + '<div class="c360-aw-head">'
            + '<div><h1 class="c360-aw-name">' + esc(row.accountName) + '</h1>'
            + '<div class="c360-aw-crumbs">' + crumbs + '</div></div>'
            + '<div class="c360-cmd-right">'
            + '<button type="button" class="c360-button c360-button--ai" '
            + 'data-ask-about="' + esc(row.accountName) + '">Ask about this account</button>'
            + '</div></div>';

        var figures = '<div class="c360-figs">'
            + parts().figure({
                  label: "Health",
                  value: health.available ? Math.round(health.score) : null,
                  tone: health.available
                      ? (health.bandTone === "good" ? "good"
                         : health.bandTone === "watch" ? "watch" : "bad")
                      : null,
                  note: health.available ? health.band : null,
                  missingNote: "Too few categories have data"
              })
            + parts().figure({
                  label: "Priority",
                  value: Math.round(row.priorityScore),
                  tone: row.priorityLevel === "P0" ? "bad"
                      : row.priorityLevel === "P1" ? "watch" : null,
                  note: row.priorityLevel + " · " + model.priority.levelLabel
              })
            + parts().figure({
                  label: "Renewal",
                  value: row.renewalDays === null ? null : row.renewalDays + "D",
                  tone: row.renewalDays !== null && row.renewalDays <= 90 ? "watch" : null,
                  note: row.renewalDays === null ? null : util.formatDate(row.renewalDate),
                  missingNote: "No contract record"
              })
            + '</div>';

        var facts = '<div class="c360-facts">'
            + parts().fact("ARR", parts().money(row.accountValue),
                  { missingLabel: "Not recorded" })
            + parts().fact("Confidence", row.confidencePct + "%")
            + parts().fact("Identity", model.identity.confidencePct + "%")
            + parts().fact("Open actions", row.recommendationCount)
            + parts().fact("Segment", row.segmentLabel, { text: true })
            + '</div>';

        // What changed, from stored runs only.
        var changes = C360.history.changesFor(row.accountId, model);
        var changeBlock = changes.length
            ? '<div class="c360-panel-body"><ul class="c360-siglist">'
              + changes.map(function (change) {
                    return '<li class="c360-sig">'
                         + '<span class="c360-sig-dot c360-sig-dot--'
                         + esc(change.tone === "bad" ? "critical"
                               : change.tone === "good" ? "healthy" : "info")
                         + '" aria-hidden="true"></span>'
                         + '<div class="c360-sig-name">' + esc(change.text) + '</div>'
                         + '</li>';
                }).join("")
              + '</ul></div>'
            : '<div class="c360-panel-body"><p class="c360-trend-empty">'
              + esc(C360.history.trend(row.accountId).reason
                    || C360.scorecardConfig.display.noHistoryLabel)
              + '</p></div>';

        var centre = parts().panel({
            title: "Account",
            meta: model.identity.masterCustomerId,
            raw: figures + facts
                + parts().sparkline(C360.history.trend(row.accountId, "healthScore"),
                      { title: "Health history" })
                + nextBestAction(row)
        });

        var side = parts().panel({
            title: "What Changed",
            sub: "Since the previous scoring run",
            raw: changeBlock
        });

        var split = parts().panel({
            title: "Signals",
            meta: util.list(model.queues.queues).length + " queue rules",
            body: signals(model)
        })
        + parts().panel({
            title: "Activity",
            sub: "Dated records on this account",
            body: activity(model)
        });

        return '<div class="c360-aw">'
             + head
             + '<div class="c360-aw-grid">' + centre + side + '</div>'
             + '<div class="c360-aw-split">' + split + '</div>'
             + '</div>'
             /*
              * The Phase 7 explainability block, unchanged. It carries the health
              * arithmetic, the priority factor drawer, the confidence-per-source
              * table, the evidence drawers, the drafts and the feedback controls
              * — all already tested. Reimplementing any of it here would mean
              * two explanations of the same number.
              */
             + '<div class="c360-scorecard-block">'
             + C360.scorecardUi.render(model, {
                   previous: C360.history.previousRun(row.accountId),
                   intelligence: app.intelligence || {},
                   portfolioReturn: false
               })
             + '</div>';
    }

    return {
        render: render,
        signals: signals,
        activity: activity,
        nextBestAction: nextBestAction
    };
}());
