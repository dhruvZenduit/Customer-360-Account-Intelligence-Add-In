/**
 * Customer 360 — ACCOUNT BRIEF
 * ============================
 * The composed brief behind [ GENERATE BRIEF ] — the thing an account manager
 * reads in the two minutes before a retention call.
 *
 *     SITUATION            what is happening, from the fired rules
 *     WHY IT MATTERS       ARR, renewal, segment — the stakes
 *     CUSTOMER CONCERNS    what the customer actually said or raised
 *     RECOMMENDED APPROACH the mapped action steps, in order
 *     OPEN QUESTIONS       what the data cannot tell you
 *
 * COMPOSED, NOT GENERATED. Every sentence is assembled from evidence the
 * scorecard already holds, which is what makes the brief safe to put in front
 * of a customer conversation: there is no step at which prose is invented, so
 * there is nothing to hallucinate. It reads like a written brief because the
 * templates are written carefully, not because a model wrote it.
 *
 * Phase 8 may replace the PROSE of individual sections when `ai.enabled` is on
 * and the output passes claim validation. The structure, the evidence and the
 * steps stay deterministic, so a brief with the model turned off says the same
 * things in plainer words.
 *
 * OPEN QUESTIONS is the section that keeps the brief honest. A brief that only
 * asserts is a brief that pretends the data is complete; naming what we do not
 * know is what stops a confident summary becoming a misleading one.
 *
 * Pure: `asOf` injected.
 */

"use strict";

C360.brief = (function () {

    var util = C360.util;

    /**
     * A rule's name, lower-cased for use inside a sentence.
     *
     * Reads the config labels rather than de-camelCasing, so an open question
     * says "the SLA breach signal" and not "the critical ticket beyond sla
     * signal".
     */
    function ruleText(rule) {
        var labels = C360.scorecardConfig.priority.overrideLabels || {};
        if (labels[rule]) { return labels[rule].toLowerCase(); }
        return util.humanize(String(rule).replace(/([A-Z])/g, " $1")).toLowerCase();
    }

    // -----------------------------------------------------------------
    // Sections
    // -----------------------------------------------------------------

    /**
     * SITUATION — the fired overrides, in urgency order, as one paragraph.
     *
     * Uses the overrides' own `reason` strings, which already name the record
     * they came from. Re-describing them here would let the brief and the
     * priority drawer drift apart.
     */
    function situation(model) {
        var fired = util.list(model.priority && model.priority.firedOverrides);

        if (!fired.length) {
            return {
                title: "Situation",
                paragraphs: ["No critical rule has fired on this account. It is "
                    + (model.priority ? model.priority.level : "P3")
                    + " on the weighted score alone, and the reasons below are "
                    + "contributing factors rather than triggers."],
                evidence: []
            };
        }

        var rank = C360.scorecardConfig.priority.levelRank;
        var ordered = fired.slice().sort(function (a, b) {
            return rank[a.level] - rank[b.level];
        });

        return {
            title: "Situation",
            paragraphs: ordered.map(function (override) {
                return override.reason;
            }),
            evidence: ordered.reduce(function (all, override) {
                return all.concat(util.list(override.evidence));
            }, [])
        };
    }

    /**
     * WHY IT MATTERS — the stakes, as facts with units.
     *
     * A missing value prints as "Not recorded" rather than being omitted: an
     * account whose ARR we do not know is a different conversation from one
     * worth nothing, and a silently absent row reads as the second.
     */
    function stakes(model, row) {
        var facts = [];

        facts.push({
            label: "ARR",
            value: row && row.accountValue !== null && row.accountValue !== undefined
                ? util.formatMoney(row.accountValue)
                : "Not recorded",
            known: !!(row && row.accountValue !== null && row.accountValue !== undefined)
        });

        facts.push({
            label: "Renewal",
            value: row && row.renewalDays !== null
                ? row.renewalDays + " days (" + util.formatDate(row.renewalDate) + ")"
                : "Not recorded",
            known: !!(row && row.renewalDays !== null)
        });

        facts.push({
            label: "Segment",
            value: model.segment ? model.segment.segmentLabel : "Not resolved",
            known: !!model.segment
        });

        facts.push({
            label: "Lifecycle",
            value: model.segment ? model.segment.lifecycleLabel : "Not resolved",
            known: !!model.segment
        });

        facts.push({
            label: "Health",
            value: model.health.available
                ? Math.round(model.health.score) + " / 100 (" + model.health.band + ")"
                : C360.scorecardConfig.display.unavailableLabel,
            known: model.health.available
        });

        facts.push({
            label: "Priority",
            value: model.priority.level + " · " + Math.round(model.priority.score) + " / 100",
            known: true
        });

        facts.push({
            label: "Data confidence",
            value: model.health.confidence.pct + "%",
            known: true
        });

        return { title: "Why it matters", facts: facts };
    }

    /**
     * CUSTOMER CONCERNS — what the customer said or raised, quoted.
     *
     * Only text-derived evidence and recorded review concerns qualify. Our own
     * inferences are not customer concerns, and presenting them as such in a
     * document somebody reads aloud on a call is how a retention conversation
     * starts with a claim the customer never made.
     */
    function concerns(model) {
        var out = [];
        var seen = {};

        util.list(model.priority && model.priority.firedOverrides).forEach(function (override) {
            util.list(override.evidence).forEach(function (evidence) {
                if (!evidence.excerpt) { return; }
                var key = evidence.type + ":" + evidence.id;
                if (seen[key]) { return; }
                seen[key] = true;
                out.push({
                    text: evidence.excerpt,
                    source: evidence.label,
                    date: evidence.date,
                    quoted: true
                });
            });
        });

        util.list(model.bundle && model.bundle.reviews).forEach(function (review) {
            util.list(review.concerns).forEach(function (concern) {
                var key = "review:" + review.id + ":" + concern;
                if (seen[key]) { return; }
                seen[key] = true;
                out.push({
                    text: concern,
                    source: (review.reviewType || "Account review") + " — "
                          + util.formatDate(review.date),
                    date: review.date,
                    quoted: false
                });
            });
        });

        return {
            title: "Customer concerns",
            items: out,
            /** Stated when empty, so silence is not read as "no concerns". */
            emptyNote: "No customer statement or recorded concern is available. That is "
                     + "an absence of evidence, not evidence that the customer is happy."
        };
    }

    /**
     * RECOMMENDED APPROACH — the mapped steps of the top recommendation.
     *
     * The steps come straight from `actions.mappings`, in order, because the
     * order carries meaning: escalating internally before calling the customer
     * is a different instruction from the reverse.
     */
    function approach(model) {
        var recommendation = util.list(model.recommendations)[0];

        if (!recommendation) {
            return {
                title: "Recommended approach",
                headline: null,
                steps: [],
                emptyNote: "No action is recommended for this account today. No generic "
                         + "step is offered in place of one."
            };
        }

        var labels = C360.scorecardConfig.queues.actionLabels;

        return {
            title: "Recommended approach",
            headline: labels[recommendation.rule] || recommendation.action.summary,
            summary: recommendation.action.summary,
            steps: util.list(recommendation.action.steps),
            owner: recommendation.owner.label,
            due: recommendation.due.label,
            dueIsHard: recommendation.due.isHardDeadline,
            confidence: recommendation.confidence,
            queue: recommendation.queue,
            recommendationId: recommendation.id,
            emptyNote: null
        };
    }

    /**
     * OPEN QUESTIONS — what the data cannot answer.
     *
     * Derived from actual gaps, not a stock list: an unavailable health
     * category, a missing decision-maker, a text match that might be a false
     * positive, low confidence. This is the section that stops the brief
     * reading as though the picture were complete.
     */
    function openQuestions(model) {
        var out = [];

        util.list(model.priority && model.priority.firedOverrides).forEach(function (override) {
            var textDerived = util.list(override.evidence)
                .filter(function (evidence) { return !!evidence.excerpt; });
            if (textDerived.length) {
                out.push("The " + ruleText(override.rule) + " signal came from matching "
                    + "language in a record, not a structured field. Confirm with the "
                    + "customer that it means what it appears to mean.");
            }
        });

        util.list(model.health.categories).forEach(function (category) {
            if (!category.available) {
                out.push("No " + category.label.toLowerCase() + " data is available, so "
                    + "that part of the picture is unknown rather than fine.");
            }
        });

        var verified = C360.actionRules.verifiedContact(model.contacts);
        if (!verified) {
            out.push("No contact on this account is confirmed against a system of record. "
                + "Who is the decision maker, and is their contact detail current?");
        }

        util.list(model.roleGaps).forEach(function (gap) {
            out.push("There is no known contact for the " + gap.toLowerCase()
                + " role. Who covers it?");
        });

        if (model.health.confidence.low) {
            out.push("Data confidence is " + model.health.confidence.pct
                + "%, below the " + model.health.confidence.lowThresholdPct
                + "% threshold. Treat the scores above as directional.");
        }

        if (model.bundle && model.bundle.commitments === null) {
            out.push("Commitments are not a tracked source, so anything previously "
                + "promised to this customer is invisible here. Check before the call.");
        }

        return {
            title: "Open questions",
            items: out,
            emptyNote: "No material data gap was detected for this account."
        };
    }

    // -----------------------------------------------------------------
    // Build
    // -----------------------------------------------------------------

    /**
     * @param {object} model  a scorecard model
     * @param {object} row    the portfolio row (for ARR + renewal countdown)
     * @param {object} options { asOf, aiProse }
     */
    function build(model, row, options) {
        if (!model) { return null; }
        var opts = options || {};

        var recommendation = util.list(model.recommendations)[0];
        var labels = C360.scorecardConfig.queues.actionLabels;

        var title = recommendation
            ? (labels[recommendation.rule] || "Account brief")
            : "Account brief";

        return {
            accountId: model.accountId,
            accountName: model.accountName,
            /** e.g. "RETENTION CALL BRIEF" */
            title: title,
            level: model.priority.level,
            queue: model.queues.primaryQueue,
            asOf: opts.asOf || model.asOf,

            situation: situation(model),
            stakes: stakes(model, row),
            concerns: concerns(model),
            approach: approach(model),
            openQuestions: openQuestions(model),

            /**
             * record | derived | model. `derived` is the honest label for a
             * composed brief: nothing here is a verbatim record, and nothing
             * here was written by a model either.
             */
            provenance: opts.aiProse ? "model" : "derived",
            configVersion: model.configVersion
        };
    }

    /**
     * The brief as plain text, for [ COPY BRIEF ].
     *
     * Built from the same structure the UI renders, so the copied version can
     * never say something the screen did not.
     */
    function toText(brief) {
        if (!brief) { return ""; }
        var lines = [];

        lines.push(brief.accountName.toUpperCase());
        lines.push(brief.title.toUpperCase());
        lines.push("Priority " + brief.level
            + (brief.queue ? " · " + C360.scorecardConfig.queues.labels[brief.queue] : ""));
        lines.push("As of " + util.formatDateTime(brief.asOf));
        lines.push("");

        lines.push("SITUATION");
        brief.situation.paragraphs.forEach(function (text) { lines.push(text); });
        lines.push("");

        lines.push("WHY IT MATTERS");
        brief.stakes.facts.forEach(function (fact) {
            lines.push("  " + fact.label + ": " + fact.value);
        });
        lines.push("");

        lines.push("CUSTOMER CONCERNS");
        if (brief.concerns.items.length) {
            brief.concerns.items.forEach(function (item) {
                lines.push("  • " + (item.quoted ? "“" + item.text + "”" : item.text));
                lines.push("    " + item.source);
            });
        } else {
            lines.push("  " + brief.concerns.emptyNote);
        }
        lines.push("");

        lines.push("RECOMMENDED APPROACH");
        if (brief.approach.headline) {
            lines.push("  " + brief.approach.headline);
            brief.approach.steps.forEach(function (step, index) {
                lines.push("  " + (index + 1) + ". " + step);
            });
            lines.push("  Owner: " + brief.approach.owner);
            lines.push("  Due: " + brief.approach.due);
        } else {
            lines.push("  " + brief.approach.emptyNote);
        }
        lines.push("");

        lines.push("OPEN QUESTIONS");
        if (brief.openQuestions.items.length) {
            brief.openQuestions.items.forEach(function (item) {
                lines.push("  • " + item);
            });
        } else {
            lines.push("  " + brief.openQuestions.emptyNote);
        }
        lines.push("");

        lines.push("Composed from the records listed above. Sample data — not a real "
            + "customer record.");

        return lines.join("\n");
    }

    return {
        build: build,
        toText: toText,
        situation: situation,
        stakes: stakes,
        concerns: concerns,
        approach: approach,
        openQuestions: openQuestions
    };
}());
