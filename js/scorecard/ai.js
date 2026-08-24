/**
 * Customer 360 — AI LAYER  (Phase 8)
 * ==================================
 * AI for interpretation and generation only, after deterministic scoring already
 * works. The whole product works with `ai.enabled: false`; AI makes it more
 * useful, never more correct.
 *
 * THE DIVIDING LINE, as an implementation rule:
 *
 *     The model may PROPOSE a signal. The deterministic engine decides whether
 *     that signal fires a rule, and the deterministic engine alone produces the
 *     number.
 *
 * So an AI-extracted "cancellation language detected" enters as a proposed
 * signal with its source excerpt, is judged by the same Phase 3 override rule
 * that judges a keyword match, and is labelled model-derived wherever it
 * appears. Remove the model and every score is byte-identical — only the recall
 * of text-derived signals drops.
 *
 * Four things this file enforces in code rather than documentation:
 *
 *   FORBIDDEN TASKS are refused BEFORE any transport call. `calculateHealth` is
 *   not a prompt we are careful about; it is a task the adapter will not send.
 *
 *   NO SOURCE RECORDS, NO DISPLAY. A model statement citing nothing is dropped.
 *
 *   FABRICATION IS DROPPED, NOT REPAIRED. Every date, ticket number, figure and
 *   person in model output must appear in the supplied context. "Correcting" a
 *   fabricating response would mean trusting the rest of it, and the rest of it
 *   came from the same place.
 *
 *   NO KEY IN THE BROWSER. The model call is a gateway endpoint like every
 *   other source. There is no provider SDK here and no credential.
 *
 * Testable without a network: the transport is injected, and the fixtures under
 * tests/fixtures/ai-responses/ include malformed, truncated and fabricating
 * responses so the validation path is covered rather than assumed.
 */

"use strict";

C360.ai = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig.ai; }

    /**
     * The transport. Defaults to the gateway; tests inject their own.
     *
     * @param {object} payload { task, context }
     * @returns {Promise<object>} the raw model response
     */
    var transport = function (payload) {
        return C360.gatewayClient.aiInterpret(cfg().gatewayPath, payload);
    };

    function setTransport(fn) {
        transport = typeof fn === "function" ? fn : transport;
    }

    // -----------------------------------------------------------------
    // Task gating
    // -----------------------------------------------------------------

    /**
     * Is this task allowed to reach a model at all?
     *
     * Checked before the payload is even built. A forbidden task is a
     * programming error, not a request to be talked out of.
     */
    function taskAllowed(task) {
        if (util.list(cfg().forbiddenTasks).indexOf(task) !== -1) {
            return { allowed: false, reason: "Task \"" + task + "\" is forbidden: the model "
                   + "may not calculate, adjust or assign a score, and may not take an action." };
        }
        if (util.list(cfg().allowedTasks).indexOf(task) === -1) {
            return { allowed: false, reason: "Task \"" + task + "\" is not in the allowed "
                   + "task list." };
        }
        return { allowed: true, reason: null };
    }

    // -----------------------------------------------------------------
    // Context
    // -----------------------------------------------------------------

    /**
     * Everything the model is allowed to see, and therefore everything it is
     * allowed to assert. The context IS the validation set — that symmetry is
     * what makes claim checking meaningful rather than decorative.
     */
    function buildContext(bundle, extra) {
        var data = bundle || {};

        function records(list, type) {
            return util.list(list).map(function (record) {
                return {
                    id: type + "-" + record.id,
                    recordId: record.id,
                    type: type,
                    date: record.date || null,
                    text: [record.subject, record.title, record.body, record.description,
                           record.customerImpact]
                        .filter(Boolean).join(" — ")
                };
            });
        }

        return {
            account: data.account ? {
                id: data.account.id,
                name: data.account.name,
                industry: data.account.industry
            } : null,
            records: records(data.communications, "communication")
                .concat(records(data.tickets, "ticket"))
                .concat(records(data.reviews, "review"))
                .concat(records(data.billingIssues, "escalation"))
                .concat(records(data.technicalIssues, "escalation"))
                .concat(records(data.quotes, "quote"))
                .concat(records(data.orders, "order")),
            contacts: util.list(data.contacts).map(function (contact) {
                return {
                    id: contact.id,
                    name: contact.name,
                    title: contact.title,
                    confidence: contact.confidence
                };
            }),
            extra: extra || null
        };
    }

    /** The context as one searchable string, for claim validation. */
    function contextHaystack(context) {
        var parts = [];
        if (context.account) { parts.push(context.account.name, context.account.industry); }

        util.list(context.records).forEach(function (record) {
            parts.push(record.recordId, record.id, record.text);
            if (record.date) {
                parts.push(record.date);
                parts.push(util.formatDate(record.date));
                parts.push(util.formatDate(record.date).replace(/,\s*\d{4}$/, ""));
            }
        });

        util.list(context.contacts).forEach(function (contact) {
            parts.push(contact.name, contact.title);
        });

        return parts.filter(Boolean).join(" — ").toLowerCase();
    }

    // -----------------------------------------------------------------
    // Validation
    // -----------------------------------------------------------------

    /**
     * Validate one model statement.
     *
     * @returns {{ ok: boolean, reason: string|null }}
     */
    function validateStatement(statement, context) {
        if (!statement || typeof statement !== "object") {
            return { ok: false, reason: "Response entry is not an object." };
        }

        if (typeof statement.text !== "string" || !statement.text.trim()) {
            return { ok: false, reason: "Response entry carries no text." };
        }

        // Rule 2: a model statement with no source record is dropped, not
        // displayed. There is no "probably fine" version of this.
        if (cfg().requireSourceRecords) {
            var sources = util.list(statement.sourceRecords);
            if (!sources.length) {
                return { ok: false, reason: "No source record cited." };
            }

            var known = {};
            util.list(context.records).forEach(function (record) {
                known[String(record.id).toLowerCase()] = true;
                known[String(record.recordId).toLowerCase()] = true;
            });

            var unknown = sources.filter(function (id) {
                return !known[String(id).toLowerCase()];
            });

            if (unknown.length) {
                return {
                    ok: false,
                    reason: "Cited source record(s) not present in the supplied context: "
                          + unknown.join(", ") + "."
                };
            }
        }

        // Rule 3: every checkable claim must appear in the context. Dates,
        // record numbers, money, counts — and named people, which get their own
        // check below because inventing a contact is the most damaging kind.
        if (cfg().validateClaimsAgainstContext) {
            var haystack = contextHaystack(context);
            var claims = C360.actionRules.extractClaims(statement.text
                + " " + (statement.excerpt || ""));

            var unsupported = claims.filter(function (claim) {
                var needle = claim.value.toLowerCase();
                if (haystack.indexOf(needle) !== -1) { return false; }
                var numeric = needle.match(/\d[\d,]*/);
                return !(numeric && haystack.indexOf(numeric[0]) !== -1);
            });

            if (unsupported.length) {
                return {
                    ok: false,
                    reason: "Unsupported claim(s) absent from the context: "
                          + unsupported.map(function (c) { return c.value; }).join(", ") + "."
                };
            }

            var invented = namedPeople(statement.text).filter(function (name) {
                return haystack.indexOf(name.toLowerCase()) === -1;
            });

            if (invented.length) {
                return {
                    ok: false,
                    reason: "Named person not present in the context: "
                          + invented.join(", ") + "."
                };
            }
        }

        return { ok: true, reason: null };
    }

    /**
     * Capitalised multi-word names in prose.
     *
     * Deliberately narrow — two or three capitalised words in a row. Broader
     * detection would flag "Driver Safety Cameras" as a person and reject every
     * usable response; narrower would miss the case that matters, which is a
     * draft addressed to somebody who does not exist.
     */
    function namedPeople(text) {
        var matches = String(text || "")
            .match(/\b[A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,15}(?:\s+[A-Z][a-z]{1,15})?\b/g) || [];

        // Sentence-initial phrases and product names produce false hits, so a
        // small stop list keeps the check on people.
        var stop = ["The Customer", "Account Manager", "Customer Success", "Technical Support",
                    "Driver Safety", "Telematics Core", "Asset Tracking", "Data Unavailable",
                    "Not Available", "Best Regards", "Account Review", "Business Review"];

        return matches.filter(function (match) {
            return stop.indexOf(match) === -1;
        });
    }

    /** Stamp provenance onto a statement that passed validation. */
    function stamp(statement, model) {
        return {
            text: statement.text,
            /** record | derived | model — always present, always rendered. */
            provenance: "model",
            model: model || statement.model || null,
            sourceRecords: util.list(statement.sourceRecords),
            excerpt: statement.excerpt || null,
            confidence: statement.confidence || C360.config.confidence.MEDIUM,
            /** Set for extractSignals, so the deterministic rule can pick it up. */
            signalKey: statement.signalKey || null,
            recordId: statement.recordId || (util.list(statement.sourceRecords)[0] || null),
            recordType: statement.recordType || null,
            date: statement.date || null
        };
    }

    // -----------------------------------------------------------------
    // Ask
    // -----------------------------------------------------------------

    /**
     * Run one AI task.
     *
     * Never rejects. Every failure mode — disabled, forbidden, timeout,
     * malformed, fabricating — resolves to a result carrying `ok: false` and a
     * reason, so the caller renders the deterministic fallback with a VISIBLE
     * notice. Silent degradation would mean the user cannot tell which version
     * they are reading.
     *
     * @param {string} task
     * @param {object} bundle
     * @param {object} options { extra, model }
     * @returns {Promise<{ok, statements, dropped, reason, notice}>}
     */
    function ask(task, bundle, options) {
        var opts = options || {};

        function fail(reason) {
            return Promise.resolve({
                ok: false,
                statements: [],
                dropped: [],
                reason: reason,
                notice: cfg().fallbackNotice
            });
        }

        if (!cfg().enabled) {
            return fail("AI is disabled in configuration.");
        }

        var gate = taskAllowed(task);
        if (!gate.allowed) {
            // Refused in code, before any transport call. The payload is never
            // built, so there is nothing to accidentally send.
            return fail(gate.reason);
        }

        var context = buildContext(bundle, opts.extra);

        return withTimeout(transport({ task: task, context: context }), cfg().timeoutMs)
            .then(function (response) {
                if (!response || typeof response !== "object") {
                    return {
                        ok: false, statements: [], dropped: [],
                        reason: "Model response was not an object.",
                        notice: cfg().fallbackNotice
                    };
                }

                var raw = util.list(response.statements);
                if (!raw.length) {
                    return {
                        ok: false, statements: [], dropped: [],
                        reason: "Model response contained no statements.",
                        notice: cfg().fallbackNotice
                    };
                }

                var kept = [];
                var dropped = [];

                raw.forEach(function (statement) {
                    var check = validateStatement(statement, context);
                    if (check.ok) {
                        kept.push(stamp(statement, response.model));
                    } else {
                        // Recorded, not repaired. The reason is kept so a
                        // developer can see WHY recall dropped.
                        dropped.push({ statement: statement, reason: check.reason });
                    }
                });

                if (!kept.length) {
                    return {
                        ok: false, statements: [], dropped: dropped,
                        reason: "Every model statement failed validation.",
                        notice: cfg().fallbackNotice
                    };
                }

                return {
                    ok: true,
                    statements: kept,
                    dropped: dropped,
                    reason: null,
                    notice: dropped.length
                        ? util.plural(dropped.length, "model statement")
                          + " dropped for citing unsupported facts."
                        : null,
                    model: response.model || null
                };
            })
            .catch(function (error) {
                console.warn("Customer 360: AI task \"" + task + "\" failed.", error);
                return {
                    ok: false, statements: [], dropped: [],
                    reason: error && error.message ? error.message : "AI request failed.",
                    notice: cfg().fallbackNotice
                };
            });
    }

    function withTimeout(promise, ms) {
        return new Promise(function (resolve, reject) {
            var settled = false;
            var timer = setTimeout(function () {
                if (settled) { return; }
                settled = true;
                reject(new Error("AI request timed out after " + ms + "ms."));
            }, ms);

            Promise.resolve(promise).then(function (value) {
                if (settled) { return; }
                settled = true;
                clearTimeout(timer);
                resolve(value);
            }, function (error) {
                if (settled) { return; }
                settled = true;
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    // -----------------------------------------------------------------
    // Insertion points
    // -----------------------------------------------------------------

    /**
     * Signal extraction. Returns PROPOSALS — never applied signals.
     *
     * Each proposal names a `signalKey` matching a `priority.detection` pattern
     * set, so `C360.detect.withProposals` can hand it to the same rule that
     * judges the keyword matches. The model has widened recall and decided
     * nothing.
     */
    function proposeSignals(bundle) {
        return ask("extractSignals", bundle, {
            extra: { signalKeys: Object.keys(C360.scorecardConfig.priority.detection) }
        }).then(function (result) {
            return {
                ok: result.ok,
                proposals: result.statements.filter(function (statement) {
                    return !!statement.signalKey;
                }),
                dropped: result.dropped,
                reason: result.reason,
                notice: result.notice
            };
        });
    }

    /**
     * Prose for a recommendation summary, keyed by rule.
     *
     * The STEPS are never rewritten — only the sentence describing them. So the
     * work stays deterministic even when the wording is not, and the fallback is
     * always the mapped steps read as a sentence.
     */
    function proposeActionProse(bundle, recommendations) {
        return ask("generateActionPlan", bundle, {
            extra: {
                rules: util.list(recommendations).map(function (rec) {
                    return { rule: rec.rule, steps: rec.action.steps, why: rec.why };
                })
            }
        }).then(function (result) {
            var byRule = {};
            result.statements.forEach(function (statement) {
                if (statement.signalKey) { byRule[statement.signalKey] = statement; }
            });
            return { ok: result.ok, prose: byRule, reason: result.reason, notice: result.notice };
        });
    }

    /** Narrative account history. Falls back to js/intelligence/summary.js. */
    function summariseHistory(bundle) {
        return ask("summariseHistory", bundle, {});
    }

    /** Priority explanation prose. Falls back to the Phase 3 bullet list. */
    function explainPriority(bundle, priority) {
        return ask("explainPriority", bundle, {
            extra: {
                level: priority.level,
                reasons: util.list(priority.reasons).map(function (r) { return r.text; })
            }
        });
    }

    return {
        ask: ask,
        setTransport: setTransport,
        taskAllowed: taskAllowed,
        buildContext: buildContext,
        contextHaystack: contextHaystack,
        validateStatement: validateStatement,
        namedPeople: namedPeople,
        proposeSignals: proposeSignals,
        proposeActionProse: proposeActionProse,
        summariseHistory: summariseHistory,
        explainPriority: explainPriority
    };
}());
