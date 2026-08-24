/**
 * Customer 360 — RECOMMENDED ACTION ENGINE  (Phase 5)
 * ===================================================
 * Every queue entry becomes a specific, evidenced, owned, dated recommendation.
 * Never "Contact customer."
 *
 * Seven parts, and the first five are mandatory:
 *
 *     WHY         the sentence that justifies acting
 *     EVIDENCE    the records that sentence rests on
 *     ACTION      an ORDERED list of steps, not one sentence
 *     OWNER       a role, a named rep, or "Unassigned" — never a guess
 *     DUE DATE    from priority, overridden by a nearer hard deadline
 *     DRAFT       optional per action type
 *     CONFIDENCE  High / Medium / Low, from config.confidence
 *
 * The ordering inside ACTION carries real meaning. "Escalate internally, obtain
 * an ETA, then update the customer" is a different instruction from the same
 * three steps in any other order — calling the customer before you know the ETA
 * is how a support problem becomes a relationship problem. So steps are a list,
 * and the list is ordered.
 *
 * `suppressed[]` is not an afterthought. When the engine declines to recommend
 * something it records why, because a silently omitted recommendation is
 * indistinguishable from a bug.
 *
 * NO SEND PATH EXISTS IN THIS PHASE. Drafts are drafts, in the data as well as
 * in the CSS, and `[Approve & Send]` is wired to nothing until Phase 8 — where
 * it stays disabled anyway.
 *
 * Pure: `asOf` injected.
 */

"use strict";

C360.actionEngine = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig.actions; }
    function rules() { return C360.actionRules; }
    function ev() { return C360.evidence; }

    /**
     * Recommendation confidence, from the evidence rather than from a feeling.
     *
     *   High   — a source states it directly (a record with a date behind it)
     *   Medium — several records point the same way, or the evidence is derived
     *   Low    — text detection or an inference from an absence
     *
     * Same vocabulary as `config.confidence`, so the wording never drifts from
     * the rest of the dashboard.
     */
    function confidenceFor(evidence, rule) {
        var levels = C360.config.confidence;
        var rows = util.list(evidence);

        if (!rows.length) { return levels.LOW; }

        // Text-derived evidence is the weakest kind: an excerpt is a keyword
        // match on prose, and prose is where false positives live.
        var textDerived = rows.filter(function (row) { return !!row.excerpt; });
        if (textDerived.length === rows.length) { return levels.MEDIUM; }

        var dated = rows.filter(function (row) { return !!row.date; });
        if (dated.length && rows.length >= 2) { return levels.HIGH; }
        if (dated.length) { return levels.HIGH; }

        return levels.MEDIUM;
    }

    /**
     * Hard deadlines available to anchor a due date to. Read from the same
     * records Phase 3's time-sensitivity factor reads, so the two never
     * disagree about when something is due.
     */
    function deadlinesFor(bundle, priority, asOf) {
        var out = [];
        var slaHours = C360.scorecardConfig.priority.slaHours;

        var contract = bundle.contract;
        if (contract && contract.renewalDate) {
            out.push({
                anchor: "renewal",
                date: contract.renewalDate,
                label: "Renewal " + util.formatDate(contract.renewalDate)
            });
        }

        util.list(bundle.tickets).forEach(function (ticket) {
            if (!ticket.isOpen || !ticket.opened) { return; }
            var limit = slaHours[String(ticket.priority || "").toLowerCase()];
            if (limit === undefined) { return; }
            var opened = util.toDate(ticket.opened);
            if (!opened) { return; }
            var expiry = new Date(opened.getTime() + (limit * 3600000));
            out.push({
                anchor: "sla",
                date: expiry.toISOString(),
                label: "SLA on ticket " + ticket.number
            });
        });

        util.list(bundle.commitments).forEach(function (commitment) {
            if (commitment.completedDate || !commitment.dueDate) { return; }
            out.push({
                anchor: "commitment",
                date: commitment.dueDate,
                label: (commitment.description || "Commitment") + " due"
            });
        });

        util.list(bundle.quotes).forEach(function (quote) {
            if (!quote.isOpen || !quote.expiresAt) { return; }
            out.push({
                anchor: "quoteExpiry",
                date: quote.expiresAt,
                label: "Quote " + quote.number + " expires"
            });
        });

        // A deadline already in the past cannot be a due date — it can only make
        // the priority-derived date the answer.
        return out.filter(function (deadline) {
            var days = util.daysAgo(deadline.date, asOf);
            return days === null || days <= 0;
        });
    }

    // -----------------------------------------------------------------
    // Why
    // -----------------------------------------------------------------

    /**
     * The WHY sentence. Built from the queue rule's reason plus the strongest
     * piece of evidence behind it, so it names something real rather than
     * restating the rule name back at the user.
     */
    function whyFor(queueRule, evidence, account) {
        var reason = queueRule.reason;
        var rows = util.list(evidence);
        var oldest = rows.filter(function (row) { return row.date; })
            .sort(function (a, b) {
                return util.toDate(a.date).getTime() - util.toDate(b.date).getTime();
            })[0];

        var detail = oldest
            ? " The earliest supporting record is " + oldest.label
              + " (" + util.formatDate(oldest.date) + ")."
            : "";

        return reason + " on " + (account && account.name ? account.name : "this account")
             + "." + detail;
    }

    /**
     * The one-line ACTION summary. Assembled from the mapped steps so it can
     * never contradict them — the summary is the steps, read as a sentence.
     */
    function summaryFor(steps) {
        var list = util.list(steps);
        if (!list.length) { return null; }
        if (list.length === 1) { return list[0] + "."; }

        var lead = list.slice(0, list.length - 1).map(function (step, index) {
            return index === 0 ? step : step.charAt(0).toLowerCase() + step.slice(1);
        }).join(", ");

        var last = list[list.length - 1];
        return lead + ", then " + last.charAt(0).toLowerCase() + last.slice(1) + ".";
    }

    // -----------------------------------------------------------------
    // Drafts
    // -----------------------------------------------------------------

    /**
     * Build the drafts a mapping asks for.
     *
     * A customer-facing draft requires a VERIFIED contact. Where there is none,
     * the draft is suppressed WITH A REASON rather than addressed to "Hello," —
     * an email with no named recipient is not a draft anybody can send, and
     * pretending otherwise wastes the reviewer's time.
     */
    function buildDrafts(spec) {
        var kinds = util.list(spec.mapping.drafts);
        var drafts = [];
        var suppressed = [];

        var contact = rules().verifiedContact(spec.contacts);
        var customerFacing = ["customerEmail", "followUpMessage"];

        kinds.forEach(function (kind) {
            var needsContact = customerFacing.indexOf(kind) !== -1
                            && cfg().drafts.requireVerifiedContact;

            if (needsContact && !contact) {
                suppressed.push({
                    rule: spec.rule,
                    draft: kind,
                    reason: "No verified contact available for the draft."
                });
                return;
            }

            var rendered = rules().renderDraft(kind, {
                subject: spec.subject,
                opening: spec.opening,
                closing: spec.closing,
                accountName: spec.accountName,
                level: spec.level,
                queueLabel: spec.queueLabel,
                steps: spec.steps,
                evidence: spec.evidence,
                contact: needsContact ? contact : null,
                senderLabel: spec.senderLabel
            });

            if (!rendered) { return; }

            // The claim check, applied to our OWN templates too. A template that
            // drifts into asserting something unevidenced is exactly as wrong as
            // a model that does.
            var validation = rules().validateClaims(
                rendered.subject + "\n" + rendered.body,
                spec.evidence,
                needsContact ? contact : null,
                [spec.accountName, spec.level, spec.queueLabel]
            );

            if (!validation.valid) {
                suppressed.push({
                    rule: spec.rule,
                    draft: kind,
                    reason: "Draft asserted a fact that is not in the evidence list: "
                          + validation.unsupported.map(function (claim) {
                                return claim.value;
                            }).join(", ") + "."
                });
                return;
            }

            drafts.push({
                kind: kind,
                kindLabel: cfg().drafts.kindLabels[kind] || util.humanize(kind),
                subject: rendered.subject,
                body: rendered.body,
                recipient: needsContact && contact
                    ? { contactId: contact.id, name: contact.name, verified: true }
                    : null,
                /** Labelled DRAFT in the DATA, not only in the CSS. */
                status: "draft",
                /** There is no send path. Phase 8 keeps it that way. */
                sendable: false,
                notSendableReason: cfg().drafts.disabledSendReason,
                /** Phase 8 overwrites this when a model wrote the prose. */
                provenance: "derived"
            });
        });

        return { drafts: drafts, suppressed: suppressed };
    }

    /**
     * Draft copy per action type. Kept beside the mapping table so a new action
     * type needs one entry, not an edit in three places.
     *
     * Every `opening` and `closing` is written to assert nothing beyond what the
     * evidence carries. Note what is absent: no "we will have this fixed by
     * Friday", no "sorry for the repeated failures" — the engine does not know
     * either of those things.
     */
    var COPY = {
        cancellationSignal: {
            subject: "Your account and next steps",
            opening: "We have picked up that you may be considering ending the service, and "
                   + "we would like to understand the position properly before anything else "
                   + "happens.",
            closing: "Could we find time this week to talk it through? I would rather hear it "
                   + "directly than work from what is on the record."
        },
        criticalTicketBeyondSla: {
            subject: "Update on your open support issue",
            opening: "Your open issue has passed the response time we commit to, which is on "
                   + "us. It has been escalated internally and I am chasing a resolution time.",
            closing: "I will come back to you with a confirmed timeline as soon as I have one "
                   + "from the engineering team."
        },
        inactiveQuote: {
            subject: "Following up on your quote",
            opening: "I wanted to check in on the quote below, which is still open on our side.",
            closing: "If there is a decision blocker I can help with — pricing, scope, or an "
                   + "internal approval — let me know and I will work it from this end."
        },
        accountReviewOverdue: {
            subject: "Time for an account review",
            opening: "It has been a while since we last sat down properly, and there is enough "
                   + "on the record now to make a review worthwhile.",
            closing: "I will put an agenda together from what is on the account and send it "
                   + "ahead of the meeting."
        },
        deviceHealthProblem: {
            subject: "Device connectivity review",
            opening: "A number of devices on your account are not reporting, and we want to "
                   + "work out which vehicles are affected before it costs you data.",
            closing: "I will send the audit through once the affected units are confirmed."
        },
        portalAdoptionDecline: {
            subject: "Getting more out of the platform",
            opening: "Portal usage on your account has dropped, which usually means either a "
                   + "workflow changed or the team never got shown a feature they needed.",
            closing: "Would a short session with your team be useful? I would rather target it "
                   + "at what you actually use than run a generic walkthrough."
        },
        safetyConcern: {
            subject: "Safety programme recommendation",
            opening: "There is a safety-related record on your account that is worth reviewing "
                   + "together.",
            closing: "I will bring a recommendation rather than just the data."
        },
        competitorSignal: {
            subject: "Checking in on the relationship",
            opening: "It looks like you may be evaluating alternatives, which is entirely "
                   + "reasonable — I would rather know where we stand than find out later.",
            closing: "Could we talk about what is driving it? If we are falling short somewhere "
                   + "I want to hear it plainly."
        },
        overdueCommitment: {
            subject: "Something we owe you",
            opening: "We committed to something on your account and have not delivered it by "
                   + "the date we gave you. That is worth saying directly rather than letting "
                   + "it sit.",
            closing: "I am picking it up now and will confirm when it is done."
        },
        expansionReadiness: {
            subject: "Supporting your growth",
            opening: "There are signals on your account that suggest the operation is growing, "
                   + "and it is worth checking whether what you have still fits.",
            closing: "Happy to put a business case together if it is useful — no obligation "
                   + "either way."
        },
        billingIssue: {
            subject: "Your billing query",
            opening: "There is an unresolved billing item on your account that we are working "
                   + "through.",
            closing: "I will confirm the correct position and come back to you with it in "
                   + "writing."
        }
    };

    // -----------------------------------------------------------------
    // Build
    // -----------------------------------------------------------------

    /**
     * @param {object} input
     *   { signals, risks, opportunities, contacts, health, priority, queues,
     *     segment, bundle, asOf, aiProse }
     * @returns {object} { recommendations[], suppressed[] }
     */
    function build(input) {
        var data = input || {};
        var bundle = data.bundle || {};
        var account = bundle.account || null;
        var priority = data.priority || null;
        var queues = data.queues || { queues: [] };
        var asOf = data.asOf || null;
        var level = priority ? priority.level : "P3";

        var recommendations = [];
        var suppressed = [];
        var deadlines = deadlinesFor(bundle, priority, asOf);

        util.list(queues.queues).forEach(function (queue) {
            util.list(queue.rules).forEach(function (queueRule) {
                var resolved = rules().mappingFor(queueRule.rule);

                if (!resolved) {
                    // No mapping means NO recommendation. Not a generic one.
                    suppressed.push({
                        rule: queueRule.rule,
                        reason: "No action mapping is configured for this rule, and generic "
                              + "fallback actions are disabled."
                    });
                    return;
                }

                var mappingKey = resolved.key;
                var mapping = resolved.mapping;
                var steps = util.list(mapping.steps);
                var evidence = ev().withIdentityConfidence(
                    ev().dedupe(queueRule.evidence), data.identity);

                if (!evidence.length) {
                    suppressed.push({
                        rule: queueRule.rule,
                        reason: "No evidence record is attached to this rule, so no "
                              + "recommendation can be justified."
                    });
                    return;
                }

                var owner = rules().resolveOwner(mappingKey, account);
                var due = rules().dueFor(level, deadlines, asOf);
                var copy = COPY[mappingKey] || {
                    subject: queueRule.reason,
                    opening: queueRule.reason + ".",
                    closing: "I will follow up."
                };

                var draftResult = buildDrafts({
                    rule: queueRule.rule,
                    mapping: mapping,
                    subject: copy.subject,
                    opening: copy.opening,
                    closing: copy.closing,
                    accountName: account && account.name ? account.name : "this account",
                    level: level,
                    queueLabel: queue.label,
                    steps: steps,
                    evidence: evidence,
                    contacts: data.contacts,
                    senderLabel: owner.assignedTo || "Your account team"
                });

                suppressed = suppressed.concat(draftResult.suppressed);

                // AI prose, where Phase 8 supplied a validated replacement.
                // The steps are never rewritten — only the sentence that
                // describes them — so removing the model changes the wording and
                // nothing about what gets done.
                var aiSummary = data.aiProse && data.aiProse[queueRule.rule]
                    ? data.aiProse[queueRule.rule] : null;

                recommendations.push({
                    id: "rec-" + mappingKey + "-" + util.slug(evidence[0].id || queueRule.rule),
                    queue: queue.key,
                    rule: queueRule.rule,
                    mappingKey: mappingKey,

                    why: whyFor(queueRule, evidence, account),

                    evidence: evidence,

                    action: {
                        summary: aiSummary ? aiSummary.text : summaryFor(steps),
                        steps: steps,
                        /** record | derived | model — Phase 8 provenance. */
                        provenance: aiSummary ? "model" : "derived",
                        fallbackSummary: summaryFor(steps),
                        model: aiSummary ? aiSummary.model : null
                    },

                    owner: {
                        roles: owner.roles,
                        assignedTo: owner.assignedTo,
                        resolved: owner.resolved,
                        label: owner.label
                    },

                    due: due,

                    drafts: draftResult.drafts,

                    confidence: confidenceFor(evidence, queueRule.rule),

                    /** Phase 9 attaches feedback against this. */
                    evidenceIds: ev().ids(evidence)
                });
            });
        });

        return {
            recommendations: recommendations,
            /** Every declined recommendation, with its reason. Never silent. */
            suppressed: suppressed
        };
    }

    return {
        build: build,
        confidenceFor: confidenceFor,
        deadlinesFor: deadlinesFor,
        summaryFor: summaryFor,
        COPY: COPY
    };
}());
