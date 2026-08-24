/**
 * Customer 360 — ACCOUNT SCORECARD UI  (Phase 7)
 * ==============================================
 * The scorecard block above the existing Customer 360 sections, and the drawers
 * that make every number traceable back to the record that produced it.
 *
 * THIS FILE COMPUTES NOTHING. Every value comes from the Phase 2-5 engines. If
 * something needed here does not exist, it gets added in the owning engine, not
 * derived in a template — a number computed in the view is a number no test
 * covers and no drawer can explain.
 *
 * What the phase promises, and what the templates below therefore enforce:
 *
 *   NOTHING IS DISPLAYED WITHOUT ITS EXPLANATION (G4). There is no code path
 *   here that renders a bare score. Health, priority and confidence each carry a
 *   drawer, and the breakdown drawers print the real arithmetic.
 *
 *   THE ARITHMETIC MUST RECONCILE. `breakdown()` sums the rendered rows and
 *   compares them with the rendered total. A mismatch is SHOWN, loudly, rather
 *   than rounded away — it would be a bug in Phase 2 surfacing here, and hiding
 *   it here is how it survives.
 *
 *   UNAVAILABLE IS NOT ZERO AND NOT A DASH. It prints
 *   `display.unavailableLabel` with the reason beside it.
 *
 *   EVIDENCE REACHES A RECORD. Every row either deep-links to the source or
 *   scrolls to the existing dashboard section that shows it. A label that goes
 *   nowhere is worse than no label.
 *
 * Every id and class is `c360-` prefixed, because MyGeotab injects this page
 * into its own document.
 */

"use strict";

C360.scorecardUi = (function () {

    var util = C360.util;
    var c = C360.components;
    var esc = util.escapeHtml;

    function cfg() { return C360.scorecardConfig.display; }

    /** Fixed decimals for the breakdown arithmetic. */
    function dp(value) {
        return Number(value).toFixed(cfg().breakdownDecimals);
    }

    function pct(weight) {
        return Math.round(weight * 100) + "%";
    }

    /** `Data unavailable`, with the reason. Never a 0 and never an em dash. */
    function unavailable(reason) {
        return '<span class="c360-sc-unavailable">' + esc(cfg().unavailableLabel) + '</span>'
             + (reason ? '<span class="c360-sc-unavailable-why">' + esc(reason) + '</span>' : "");
    }

    // -----------------------------------------------------------------
    // Evidence
    // -----------------------------------------------------------------

    /**
     * One evidence row.
     *
     * Three things travel with it and each is load-bearing:
     *   - the EXCERPT for text-derived evidence, which is what lets a user spot
     *     a false positive without opening anything;
     *   - the identity CONFIDENCE on external evidence, so an article matched at
     *     90% is discounted by the reader rather than trusted equally;
     *   - a way to REACH the record — a real link, or a jump to the existing
     *     dashboard section that lists it.
     */
    function evidenceRow(row) {
        var when = row.date ? util.formatDate(row.date) : "Date not available";

        var reach = util.safeUrl(row.url)
            ? c.link(row.url, "Open record")
            : (row.section
                ? '<a class="c360-link c360-sc-jump" href="#' + esc(row.section) + '"'
                  + ' data-scorecard-jump="' + esc(row.section) + '">View in Customer 360</a>'
                : '<span class="c360-sc-noreach">No link available for this source</span>');

        var confidence = row.confidencePct !== null
            && cfg().showIdentityConfidenceOnExternal
            && (row.source === "external" || row.source === "website")
            ? '<span class="c360-sc-idconf" title="Phase 1 identity match confidence">'
              + 'matched at ' + esc(String(row.confidencePct)) + '%</span>'
            : "";

        var provenance = row.provenance === "model"
            ? '<span class="c360-provenance">' + esc(C360.scorecardConfig.ai.provenanceLabel)
              + '</span>'
            : "";

        return '<li class="c360-sc-evidence-item">'
             + '<span class="c360-sc-evidence-text">' + esc(row.label || "Record") + '</span>'
             + (row.excerpt
                ? '<blockquote class="c360-sc-excerpt">' + esc(row.excerpt) + '</blockquote>'
                : "")
             + '<span class="c360-sc-evidence-meta">'
             + c.sourceBadge(row.sourceLabel, row.source)
             + '<span class="c360-sc-evidence-date">' + esc(when) + '</span>'
             + confidence + provenance
             + c.mockBadge(row.mock)
             + reach
             + '</span></li>';
    }

    /**
     * Evidence grouped by source class. A component with NO evidence renders
     * `display.emptyEvidenceLabel` rather than an empty box, so the absence is a
     * statement instead of a rendering gap.
     */
    function evidenceList(rows, identity) {
        var stamped = C360.evidence.withIdentityConfidence(rows, identity);
        var groups = C360.evidence.group(stamped);

        if (!groups.length) {
            return '<p class="c360-sc-empty-evidence">' + esc(cfg().emptyEvidenceLabel) + '</p>';
        }

        return groups.map(function (group) {
            return '<div class="c360-sc-evidence-group">'
                 + '<h5 class="c360-sc-evidence-group-title">' + esc(group.label) + '</h5>'
                 + '<ul class="c360-sc-evidence-list">'
                 + group.items.map(evidenceRow).join("")
                 + '</ul></div>';
        }).join("");
    }

    /** A collapsible drawer. `<details>` is keyboard reachable and reports its own state. */
    function drawer(spec) {
        return '<details class="c360-sc-drawer' + (spec.tone ? ' c360-sc-drawer--' + esc(spec.tone) : "") + '"'
             + (cfg().drawersCollapsedByDefault ? "" : " open")
             + (spec.id ? ' id="' + esc(spec.id) + '"' : "") + '>'
             + '<summary class="c360-sc-drawer-summary">' + esc(spec.title)
             + (spec.hint ? '<span class="c360-sc-drawer-hint">' + esc(spec.hint) + '</span>' : "")
             + '</summary>'
             + '<div class="c360-sc-drawer-body">' + spec.body + '</div>'
             + '</details>';
    }

    function toneGlyph(tone) {
        var glyphs = { good: "&#10003;", warn: "&#9888;", bad: "&#9888;", info: "&#8226;" };
        return '<span class="c360-sc-tone c360-sc-tone--' + esc(tone || "info")
             + '" aria-hidden="true">' + (glyphs[tone] || glyphs.info) + '</span>';
    }

    /** Tone as a WORD, so meaning never depends on colour alone. */
    function toneWord(tone) {
        var words = { good: "OK", warn: "Watch", bad: "Problem", info: "Note" };
        return '<span class="c360-visually-hidden">' + esc(words[tone] || "Note") + ': </span>';
    }

    // -----------------------------------------------------------------
    // Health
    // -----------------------------------------------------------------

    /**
     * The arithmetic, with the real values, summed and checked.
     *
     * `Product & Device   61 × 25% = 15.25`
     *
     * The check at the bottom is not defensive decoration: Phase 7 forbids
     * rounding a mismatch away, so if the rows do not sum to the total the
     * discrepancy is printed where a human will see it.
     */
    function healthBreakdown(health, identity) {
        var rows = health.categories.map(function (category) {
            if (!category.available) {
                return '<tr class="c360-sc-row--unavailable">'
                     + '<th scope="row">' + esc(category.label) + '</th>'
                     + '<td colspan="3">' + unavailable(category.unavailableReason) + '</td>'
                     + '</tr>';
            }
            return '<tr>'
                 + '<th scope="row">' + esc(category.label) + '</th>'
                 + '<td class="c360-sc-num">' + Math.round(category.score) + '</td>'
                 + '<td class="c360-sc-num">&times; ' + pct(category.effectiveWeight) + '</td>'
                 + '<td class="c360-sc-num">= ' + dp(category.contribution) + '</td>'
                 + '</tr>';
        }).join("");

        var sum = health.categories.reduce(function (total, category) {
            return total + category.contribution;
        }, 0);

        // Compared at the rendered precision, which is the precision the user
        // can actually check.
        var reconciles = dp(sum) === dp(health.score);

        var mismatch = reconciles ? "" :
              '<p class="c360-sc-mismatch" role="alert">'
            + '<strong>Breakdown does not reconcile.</strong> The rows above sum to '
            + esc(dp(sum)) + ' but the health score is ' + esc(dp(health.score))
            + '. This is a defect in the scoring engine, not a display rounding '
            + 'issue, and it is shown rather than hidden.</p>';

        var renormalised = health.renormalised
            ? '<p class="c360-sc-renormalised">' + esc(cfg().renormalisedNotice)
              + ' Excluded: '
              + esc(health.excludedCategories.map(function (key) {
                    var match = health.categories.filter(function (item) {
                        return item.key === key;
                    })[0];
                    return match ? match.label : key;
                }).join(", "))
              + '.</p>'
            : "";

        var perCategory = health.categories.map(function (category) {
            var signals = category.signals.length
                ? '<ul class="c360-sc-signals">'
                  + category.signals.map(function (signal) {
                        return '<li class="c360-sc-signal c360-sc-signal--' + esc(signal.tone) + '">'
                             + toneGlyph(signal.tone) + toneWord(signal.tone)
                             + '<span class="c360-sc-signal-text">' + esc(signal.text) + '</span>'
                             + (signal.note
                                ? '<span class="c360-sc-signal-note">' + esc(signal.note) + '</span>'
                                : "")
                             + evidenceList(signal.evidence, identity)
                             + '</li>';
                    }).join("")
                  + '</ul>'
                : '<p class="c360-sc-empty-evidence">' + esc(cfg().emptyEvidenceLabel) + '</p>';

            return drawer({
                title: category.label + " — "
                     + (category.available ? Math.round(category.score) : cfg().unavailableLabel),
                hint: category.available ? null : cfg().unavailableLabel,
                body: '<p class="c360-sc-basis">' + esc(category.basis) + '</p>' + signals
            });
        }).join("");

        return renormalised
             + '<table class="c360-sc-breakdown">'
             + '<caption class="c360-visually-hidden">Health score breakdown</caption>'
             + '<thead><tr><th scope="col">Category</th><th scope="col">Score</th>'
             + '<th scope="col">Weight</th><th scope="col">Contribution</th></tr></thead>'
             + '<tbody>' + rows + '</tbody>'
             + '<tfoot><tr><th scope="row">Health Score</th>'
             + '<td class="c360-sc-num" colspan="3">' + dp(health.score) + '</td></tr></tfoot>'
             + '</table>'
             + mismatch
             + '<h4 class="c360-sc-sub">Category detail</h4>'
             + perCategory;
    }

    // -----------------------------------------------------------------
    // Priority
    // -----------------------------------------------------------------

    /**
     * The priority drawer. Says explicitly which mechanism set the level, using
     * the Phase 3 `levelSetBy` field — a P0 that came from an override reads
     * very differently from a P0 that scored 91, and the user is owed the
     * difference.
     */
    function priorityDrawer(priority, identity) {
        var overrideBlock = "";

        if (priority.levelSetBy === "override") {
            var floor = priority.firedOverrides.filter(function (item) {
                return item.level === priority.overrideFloor;
            })[0];

            if (floor) {
                overrideBlock =
                      '<div class="c360-sc-override">'
                    + '<h4 class="c360-sc-override-title">' + esc(priority.level)
                    + ' OVERRIDE</h4>'
                    + '<p class="c360-sc-override-label">Reason:</p>'
                    + '<p class="c360-sc-override-reason">' + esc(floor.reason) + '</p>'
                    + (floor.source
                        ? '<p class="c360-sc-override-label">Source:</p>'
                          + '<p class="c360-sc-override-source">'
                          + esc(util.humanize(floor.source.type))
                          + (floor.source.date
                             ? ' — ' + esc(util.formatDate(floor.source.date)) : "")
                          + '</p>'
                        : "")
                    + '<p class="c360-sc-override-note">This override takes precedence over '
                    + 'the weighted score, which alone would have made this account '
                    + esc(priority.scoredLevel) + '.</p>'
                    + evidenceList(floor.evidence, identity)
                    + '</div>';
            }
        }

        var factorRows = priority.factors.map(function (factor) {
            if (!factor.available) {
                return '<tr class="c360-sc-row--unavailable">'
                     + '<th scope="row">' + esc(factor.label) + '</th>'
                     + '<td colspan="3">' + unavailable(factor.unavailableReason) + '</td>'
                     + '</tr>';
            }
            return '<tr>'
                 + '<th scope="row">' + esc(factor.label) + '</th>'
                 + '<td class="c360-sc-num">' + Math.round(factor.score) + '</td>'
                 + '<td class="c360-sc-num">&times; ' + pct(factor.effectiveWeight) + '</td>'
                 + '<td class="c360-sc-num">= ' + dp(factor.contribution) + '</td>'
                 + '</tr>';
        }).join("");

        var factorDetail = priority.factors.map(function (factor) {
            var inputs = factor.inputs.length
                ? '<dl class="c360-sc-inputs">'
                  + factor.inputs.map(function (item) {
                        return '<div class="c360-kv">'
                             + '<dt class="c360-kv-key">' + esc(item.label) + '</dt>'
                             + '<dd class="c360-kv-value">' + esc(String(item.value))
                             + (item.detail
                                ? ' <span class="c360-sc-input-detail">'
                                  + esc(item.detail) + '</span>'
                                : "")
                             + '</dd></div>';
                    }).join("")
                  + '</dl>'
                : "";

            return drawer({
                title: factor.label + " — "
                     + (factor.available ? Math.round(factor.score) : cfg().unavailableLabel),
                body: '<p class="c360-sc-basis">'
                    + esc(factor.basis || factor.unavailableReason || "") + '</p>'
                    + inputs
                    + evidenceList(factor.evidence, identity)
            });
        }).join("");

        var unavailableNote = priority.unavailableFactors.length
            ? '<p class="c360-sc-renormalised">Weights re-normalised across the factors that '
              + 'have data. Excluded: ' + esc(priority.unavailableFactors.join(", ")) + '.</p>'
            : "";

        return overrideBlock
             + unavailableNote
             + '<table class="c360-sc-breakdown">'
             + '<caption class="c360-visually-hidden">Priority score breakdown</caption>'
             + '<thead><tr><th scope="col">Factor</th><th scope="col">Score</th>'
             + '<th scope="col">Weight</th><th scope="col">Contribution</th></tr></thead>'
             + '<tbody>' + factorRows + '</tbody>'
             + '<tfoot><tr><th scope="row">Priority Score</th>'
             + '<td class="c360-sc-num" colspan="3">' + dp(priority.score) + '</td></tr></tfoot>'
             + '</table>'
             + '<h4 class="c360-sc-sub">Factor detail</h4>'
             + factorDetail;
    }

    /** The `Why?` list. Never empty — Phase 3 guarantees at least one reason. */
    function whyList(priority, identity) {
        return '<ul class="c360-sc-why">'
             + priority.reasons.map(function (reason) {
                   return '<li class="c360-sc-why-item'
                        + (reason.kind === "override" ? ' c360-sc-why-item--override' : "") + '">'
                        + '<span class="c360-sc-why-text">' + esc(reason.text) + '</span>'
                        + (reason.kind === "override"
                           ? '<span class="c360-sc-why-tag">Override</span>' : "")
                        + evidenceList(reason.evidence, identity)
                        + '</li>';
               }).join("")
             + '</ul>'
             + '<p class="c360-sc-primary"><strong>Primary reason:</strong> '
             + esc(priority.primaryReason) + '</p>';
    }

    // -----------------------------------------------------------------
    // Confidence
    // -----------------------------------------------------------------

    /**
     * Per-source states plus the limitations list.
     *
     * Below `display.leadWithLimitationsBelowPct` the limitations are rendered
     * ABOVE the number. A health score built on two of five categories must not
     * look as solid as one built on five, and ordering is the cheapest honest
     * way to say so.
     */
    function confidenceDrawer(confidence) {
        var lead = confidence.pct < cfg().leadWithLimitationsBelowPct
                && confidence.limitations.length;

        var limitations = confidence.limitations.length
            ? '<div class="c360-sc-limitations' + (lead ? ' c360-sc-limitations--lead' : "") + '">'
              + '<h4 class="c360-sc-sub">' + (lead
                    ? "Read this before the score"
                    : "Limitations") + '</h4>'
              + '<ul class="c360-sc-limitation-list">'
              + confidence.limitations.map(function (item) {
                    return '<li>' + esc(item) + '</li>';
                }).join("")
              + '</ul></div>'
            : "";

        var sources = '<table class="c360-sc-breakdown">'
            + '<caption class="c360-visually-hidden">Data confidence by source</caption>'
            + '<tbody>'
            + confidence.sources.map(function (row) {
                  var glyph = row.state === "recent" ? "good"
                            : row.state === "missing" ? "bad" : "warn";
                  return '<tr><th scope="row">' + esc(row.label) + '</th>'
                       + '<td>' + toneGlyph(glyph) + esc(row.stateLabel) + '</td>'
                       + '<td class="c360-sc-note">'
                       + (row.note ? esc(row.note) : "") + '</td></tr>';
              }).join("")
            + '</tbody></table>';

        var inputs = '<h4 class="c360-sc-sub">How this was calculated</h4>'
            + '<table class="c360-sc-breakdown">'
            + '<tbody>'
            + confidence.inputs.map(function (item) {
                  return '<tr><th scope="row">' + esc(item.label) + '</th>'
                       + '<td class="c360-sc-num">' + Math.round(item.value * 100) + '</td>'
                       + '<td class="c360-sc-num">&times; ' + pct(item.weight) + '</td>'
                       + '<td class="c360-sc-num">= ' + dp(item.contribution) + '</td></tr>';
              }).join("")
            + '</tbody>'
            + '<tfoot><tr><th scope="row">Overall confidence</th>'
            + '<td class="c360-sc-num" colspan="3">' + confidence.pct + '%</td></tr></tfoot>'
            + '</table>';

        // Ordering carries the message: when confidence is low, limitations
        // come first.
        return lead ? limitations + sources + inputs : sources + limitations + inputs;
    }

    // -----------------------------------------------------------------
    // Recommendations
    // -----------------------------------------------------------------

    function recommendation(rec, model) {
        var steps = '<ol class="c360-sc-steps">'
            + rec.action.steps.map(function (step) {
                  return '<li>' + esc(step) + '</li>';
              }).join("")
            + '</ol>';

        var provenance = rec.action.provenance === "model"
            ? '<span class="c360-provenance">'
              + esc(C360.scorecardConfig.ai.provenanceLabel) + '</span>'
            : "";

        var drafts = rec.drafts.length
            ? rec.drafts.map(function (draft) {
                  return C360.approvalUi.draft(draft, rec, model);
              }).join("")
            : "";

        var owner = rec.owner.resolved
            ? esc(rec.owner.label)
            : '<span class="c360-sc-unassigned">'
              + esc(C360.scorecardConfig.actions.unassignedLabel) + '</span>';

        return '<article class="c360-sc-rec" data-recommendation-id="' + esc(rec.id) + '">'
             + '<header class="c360-sc-rec-head">'
             + '<span class="c360-chip c360-chip--' + esc(rec.queue) + '">'
             + esc(C360.scorecardConfig.queues.labels[rec.queue] || rec.queue) + '</span>'
             + c.confidenceChip(rec.confidence)
             + '</header>'
             + '<h4 class="c360-sc-rec-why-title">Why</h4>'
             + '<p class="c360-sc-rec-why">' + esc(rec.why) + '</p>'
             + '<h4 class="c360-sc-rec-why-title">Action ' + provenance + '</h4>'
             + '<p class="c360-sc-rec-summary">' + esc(rec.action.summary) + '</p>'
             + steps
             + '<dl class="c360-sc-rec-meta">'
             + c.kvHtml("Suggested owner", owner)
             + c.kvHtml("Due", esc(rec.due.label)
                 + (rec.due.isHardDeadline
                    ? ' <span class="c360-sc-hard">anchored to '
                      + esc(rec.due.anchorLabel || rec.due.anchor) + '</span>'
                    : ""))
             + '</dl>'
             + drawer({ title: "Evidence", body: evidenceList(rec.evidence, model.identity) })
             + drafts
             + C360.feedbackUi.controls(rec, model)
             + '</article>';
    }

    // -----------------------------------------------------------------
    // What changed
    // -----------------------------------------------------------------

    /**
     * Signal changes, plus score deltas ONCE a previous run exists.
     *
     * With no stored prior run the block says the history is not available. It
     * does not invent a previous value to compute a delta against — a fabricated
     * trend is worse than no trend, because the user cannot tell which they are
     * looking at.
     *
     * @param {object} spec
     *   changes   `C360.signals.whatChanged()` output — the SIGNAL movement,
     *             which comes from the existing intelligence model
     *   health    Phase 2 output, for the health delta
     *   priority  Phase 3 output, for the level delta
     *   previous  the stored prior run, or null
     *
     * Takes an explicit spec rather than a model, because the signal changes and
     * the scores come from two different models and passing "the model" made it
     * ambiguous which one — a confusion that reached a crash before it reached a
     * reader.
     */
    function whatChanged(spec) {
        var input = spec || {};
        var signalChanges = util.list(input.changes);
        var previous = input.previous || null;
        var health = input.health || null;
        var priority = input.priority || null;

        var deltas = [];
        if (previous) {
            if (previous.priorityLevel && priority
                && previous.priorityLevel !== priority.level) {
                deltas.push("Priority " + esc(previous.priorityLevel) + " &rarr; "
                    + esc(priority.level));
            }
            if (previous.healthScore !== null && previous.healthScore !== undefined
                && health && health.available) {
                var moved = Math.round(health.score) - Math.round(previous.healthScore);
                if (moved !== 0) {
                    deltas.push("Health " + Math.round(previous.healthScore) + " &rarr; "
                        + Math.round(health.score)
                        + " (" + (moved > 0 ? "+" : "") + moved + ")");
                }
            }
        }

        var deltaBlock = previous
            ? (deltas.length
                ? '<ul class="c360-sc-deltas">'
                  + deltas.map(function (item) { return '<li>' + item + '</li>'; }).join("")
                  + '</ul>'
                : '<p class="c360-sc-note">No score change since the previous run.</p>')
            : '<p class="c360-sc-note">' + esc(cfg().noHistoryLabel) + '</p>';

        var signalBlock = signalChanges.length
            ? '<ul class="c360-sc-signals">'
              + signalChanges.map(function (change) {
                    return '<li class="c360-sc-signal">'
                         + c.directionGlyph(change.direction)
                         + '<span class="c360-sc-signal-text">' + esc(change.label)
                         + ' — ' + esc(change.statement) + '</span></li>';
                }).join("")
              + '</ul>'
            : '<p class="c360-sc-note">No recent signal movement on this account.</p>';

        return c.section({
            id: "c360-sc-what-changed",
            title: "What changed",
            filterTags: ["all", "internal"],
            body: deltaBlock + signalBlock
        });
    }

    // -----------------------------------------------------------------
    // The block
    // -----------------------------------------------------------------

    /**
     * @param {object} model    scorecard model from C360.scorecardEngine
     * @param {object} options  { previous, intelligence, portfolioReturn }
     */
    function render(model, options) {
        var opts = options || {};
        if (!model) { return ""; }

        var health = model.health;
        var priority = model.priority;
        var confidence = health.confidence;

        var back = opts.portfolioReturn
            ? '<button type="button" class="c360-button c360-button--ghost" '
              + 'id="c360-sc-back">&larr; Back to Command Center</button>'
            : "";

        // ---- the three headline figures -----------------------------
        var healthFigure = health.available
            ? '<span class="c360-sc-figure">' + Math.round(health.score)
              + '<span class="c360-sc-of"> / 100</span></span>'
              + '<span class="c360-sc-band c360-sc-band--' + esc(health.bandTone) + '">'
              + esc(health.band) + '</span>'
            : unavailable(health.unavailableReason);

        var tiles =
              '<div class="c360-sc-tile">'
            + '<h3 class="c360-sc-tile-label">Health</h3>'
            + healthFigure
            + '</div>'
            + '<div class="c360-sc-tile">'
            + '<h3 class="c360-sc-tile-label">Priority</h3>'
            // The level is TEXT beside the dot, never colour alone.
            + '<span class="c360-sc-level c360-sc-level--' + esc(priority.level) + '">'
            + '<span class="c360-sc-dot" aria-hidden="true"></span>'
            + esc(priority.level) + '</span>'
            + '<span class="c360-sc-figure">' + Math.round(priority.score)
            + '<span class="c360-sc-of"> / 100</span></span>'
            + '<span class="c360-sc-levellabel">' + esc(priority.levelLabel)
            + (priority.levelSetBy === "override" ? " — set by override" : "") + '</span>'
            + '</div>'
            + '<div class="c360-sc-tile">'
            + '<h3 class="c360-sc-tile-label">Confidence</h3>'
            + '<span class="c360-sc-figure">' + confidence.pct + '%</span>'
            + (confidence.low
               ? '<span class="c360-sc-band c360-sc-band--watch">Limited data</span>'
               : "")
            + '</div>';

        var segment =
              '<dl class="c360-sc-segment">'
            + c.kv("Segment", model.segment.segmentLabel)
            + c.kv("Lifecycle", model.segment.lifecycleLabel)
            + c.kv("Primary queue", model.queues.primaryQueue
                ? C360.scorecardConfig.queues.labels[model.queues.primaryQueue]
                : "No action needed today")
            + c.kv("Identity confidence", model.identity.confidencePct + "%")
            + '</dl>';

        var recommendations = model.recommendations.length
            ? model.recommendations.map(function (rec) {
                  return recommendation(rec, model);
              }).join("")
            : '<p class="c360-empty">No recommendation is warranted for this account today. '
              + 'No generic action is offered in place of one.</p>';

        var suppressed = model.suppressed.length
            ? drawer({
                  title: "Not recommended (" + model.suppressed.length + ")",
                  hint: "and why",
                  body: '<ul class="c360-sc-suppressed">'
                      + model.suppressed.map(function (item) {
                            return '<li><strong>' + esc(item.rule) + '</strong>'
                                 + (item.draft ? ' (' + esc(item.draft) + ')' : "")
                                 + ' — ' + esc(item.reason) + '</li>';
                        }).join("")
                      + '</ul>'
              })
            : "";

        return '<div class="c360-scorecard" id="c360-scorecard">'
             + back
             + '<div class="c360-sc-head">'
             + '<h2 class="c360-sc-title">Portfolio scorecard</h2>'
             + '<p class="c360-sc-intro">Health says how the account is doing. Priority says '
             + 'how urgently to act. They are calculated separately and can disagree.</p>'
             + '</div>'
             + '<div class="c360-sc-tiles">' + tiles + '</div>'
             + segment
             + '<div class="c360-sc-drawers">'
             + drawer({
                   id: "c360-sc-health-drawer",
                   title: "Health score breakdown",
                   hint: health.available
                       ? "how " + Math.round(health.score) + " was calculated"
                       : cfg().unavailableLabel,
                   body: health.available
                       ? healthBreakdown(health, model.identity)
                       : '<p class="c360-sc-basis">' + esc(health.unavailableReason) + '</p>'
                         + '<p class="c360-sc-note">The category detail below shows which '
                         + 'categories had data and which did not.</p>'
                         + health.categories.map(function (category) {
                               return drawer({
                                   title: category.label,
                                   body: '<p class="c360-sc-basis">' + esc(category.basis)
                                       + '</p>'
                               });
                           }).join("")
               })
             + drawer({
                   id: "c360-sc-priority-drawer",
                   title: "Why this account is " + priority.level,
                   hint: "reasons and arithmetic",
                   body: whyList(priority, model.identity)
                       + priorityDrawer(priority, model.identity)
               })
             + drawer({
                   id: "c360-sc-confidence-drawer",
                   title: "Data confidence — " + confidence.pct + "%",
                   hint: confidence.low ? "limited data" : "per source",
                   body: confidenceDrawer(confidence)
               })
             + drawer({
                   id: "c360-sc-identity-drawer",
                   title: "Account identity",
                   hint: model.identity.links.length + " linked, "
                       + model.identity.unmatched.length + " unmatched",
                   body: identityDrawer(model.identity)
               })
             + '</div>'
             + '<div class="c360-sc-recs">'
             + '<h3 class="c360-sc-sub">Recommended next actions</h3>'
             + recommendations
             + suppressed
             + '</div>'
             + whatChanged({
                   changes: (opts.intelligence || {}).whatChanged,
                   health: health,
                   priority: priority,
                   previous: opts.previous
               })
             + '</div>';
    }

    /**
     * The identity drawer — which source systems resolved to this account, how,
     * and at what confidence. Unmatched sources are shown too: a source silently
     * discarded looks exactly like a source that does not exist.
     */
    function identityDrawer(identity) {
        var links = '<table class="c360-sc-breakdown">'
            + '<caption class="c360-visually-hidden">Linked source systems</caption>'
            + '<thead><tr><th scope="col">System</th><th scope="col">Matched by</th>'
            + '<th scope="col">Confidence</th></tr></thead><tbody>'
            + identity.links.map(function (link) {
                  return '<tr><th scope="row">' + esc(link.label) + '</th>'
                       + '<td>' + esc(link.matchedByLabel || link.matchedBy) + '</td>'
                       + '<td class="c360-sc-num">' + link.confidencePct + '%</td></tr>';
              }).join("")
            + '</tbody></table>';

        var unmatched = identity.unmatched.length
            ? '<h4 class="c360-sc-sub">Not attached</h4>'
              + '<ul class="c360-sc-limitation-list">'
              + identity.unmatched.map(function (link) {
                    return '<li><strong>' + esc(link.label) + '</strong> — '
                         + esc(link.reason || "No match strategy identified this source.")
                         + '</li>';
                }).join("")
              + '</ul>'
            : '<p class="c360-sc-note">Every source offered for this account cleared the '
              + C360.scorecardConfig.identity.minAttachConfidencePct
              + '% confidence threshold.</p>';

        return '<p class="c360-sc-basis">Master customer id: <code>'
             + esc(identity.masterCustomerId) + '</code>. Overall identity confidence is the '
             + 'weakest attached link, not the average — an average would hide exactly the '
             + 'link worth doubting.</p>'
             + links + unmatched;
    }

    return {
        render: render,
        evidenceList: evidenceList,
        healthBreakdown: healthBreakdown,
        priorityDrawer: priorityDrawer,
        confidenceDrawer: confidenceDrawer,
        whatChanged: whatChanged,
        recommendation: recommendation,
        drawer: drawer
    };
}());
