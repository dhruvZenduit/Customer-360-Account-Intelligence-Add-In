/**
 * Customer 360 — PORTFOLIO QUERY  ("Ask Portfolio AI")
 * ====================================================
 * Answers questions about the portfolio from the portfolio.
 *
 * This is deliberately NOT a chat model. It is an intent matcher over a fixed
 * set of questions, each answered by a query against the rows the scoring
 * engines already produced. Every answer therefore:
 *
 *   - cites the accounts it is about, by name, with their real scores
 *   - can be clicked through to those accounts
 *   - says the same thing the Command Center says, because it reads the same rows
 *   - is reproducible: the same portfolio and the same question give the same answer
 *
 * WHY NOT A MODEL. Three reasons, in order of how much they matter:
 *
 *   1. A wrong answer here is worse than no answer. "Which customers are at
 *      highest risk?" is a question somebody acts on before a phone call, and a
 *      fluent guess is indistinguishable from a correct one.
 *   2. `ai.enabled` is false and the gateway does not exist. A drawer that only
 *      worked once a model was wired would be a drawer that never worked.
 *   3. The interesting questions are all aggregations the engines can answer
 *      exactly. "Who should I contact today?" is a sort, not an inference.
 *
 * When `ai.enabled` is on, `js/scorecard/ai.js` may rewrite the PROSE of an
 * answer — the accounts, counts and scores stay as computed here, and the
 * answer is marked model-derived where it appears. An unmatched question says
 * so and offers what it can answer, rather than improvising.
 *
 * Pure. No I/O, no clock — `asOf` rides in on the rows.
 */

"use strict";

C360.portfolioQuery = (function () {

    var util = C360.util;

    function money(value) {
        return value === null || value === undefined
            ? "not recorded"
            : util.formatMoney(value);
    }

    /** One account reference in an answer: enough to render and to click. */
    function ref(row, note) {
        return {
            accountId: row.accountId,
            accountName: row.accountName,
            priorityLevel: row.priorityLevel,
            priorityScore: row.priorityScore,
            healthScore: row.healthAvailable ? row.healthScore : null,
            healthAvailable: row.healthAvailable,
            primaryQueue: row.primaryQueue,
            accountValue: row.accountValue,
            renewalDays: row.renewalDays,
            note: note || null
        };
    }

    function answer(spec) {
        return {
            question: spec.question,
            /** The one-line answer. Always a claim about real rows. */
            headline: spec.headline,
            /** Supporting sentences. */
            detail: util.list(spec.detail),
            /** Accounts the answer is about, clickable. */
            accounts: util.list(spec.accounts),
            /** How the answer was arrived at — shown, not hidden. */
            method: spec.method,
            /** record | derived | model */
            provenance: "derived",
            matched: true
        };
    }

    // -----------------------------------------------------------------
    // The queries
    // -----------------------------------------------------------------

    /**
     * Each entry: the phrases that select it, and the query that answers it.
     * Phrases are matched as substrings against the lower-cased question, so
     * "who should I contact today?" and "contact today" both land here.
     */
    var QUERIES = [
        {
            key: "contactToday",
            label: "Who should I contact today?",
            match: ["contact today", "who should i contact", "who do i call",
                    "who should i care about", "today"],
            run: function (rows) {
                var urgent = rows.filter(function (item) {
                    return (item.priorityLevel === "P0" || item.priorityLevel === "P1")
                        && item.nextAction;
                }).sort(function (a, b) { return b.priorityScore - a.priorityScore; });

                if (!urgent.length) {
                    return answer({
                        question: "Who should I contact today?",
                        headline: "Nothing in this portfolio is urgent today.",
                        detail: ["No account is at P0 or P1 with an action attached. "
                            + "That is a real answer, not an empty result."],
                        method: "Accounts at P0 or P1 with at least one recommendation, "
                              + "ordered by priority score.",
                        accounts: []
                    });
                }

                return answer({
                    question: "Who should I contact today?",
                    headline: util.plural(urgent.length, "account") + " need"
                        + (urgent.length === 1 ? "s" : "") + " attention today.",
                    detail: urgent.slice(0, 3).map(function (item) {
                        return item.accountName + " — " + item.nextAction.label
                            + ". " + item.nextAction.why;
                    }),
                    method: "Accounts at P0 or P1 with at least one recommendation, "
                          + "ordered by priority score.",
                    accounts: urgent.map(function (item) {
                        return ref(item, item.nextAction.label);
                    })
                });
            }
        },

        {
            key: "highestRisk",
            label: "Which customers are at highest risk?",
            match: ["highest risk", "at risk", "most at risk", "churn", "losing"],
            run: function (rows) {
                var atRisk = rows.filter(function (item) {
                    return item.primaryQueue === "save";
                }).sort(function (a, b) { return b.priorityScore - a.priorityScore; });

                var arr = atRisk.reduce(function (sum, item) {
                    return sum + (item.accountValue || 0);
                }, 0);

                if (!atRisk.length) {
                    return answer({
                        question: "Which customers are at highest risk?",
                        headline: "No account is in the SAVE queue.",
                        detail: ["Retention risk requires a cancellation signal, a "
                            + "competitor threat, a renewal risk or measurable "
                            + "relationship deterioration. None is currently on record. "
                            + "A low health score alone does not qualify."],
                        method: "Accounts whose primary queue is SAVE.",
                        accounts: []
                    });
                }

                return answer({
                    question: "Which customers are at highest risk?",
                    headline: util.plural(atRisk.length, "account") + " in the SAVE "
                        + "queue, together worth " + money(arr) + " of recorded ARR.",
                    detail: atRisk.slice(0, 4).map(function (item) {
                        return item.accountName + " · " + item.priorityLevel + " "
                            + Math.round(item.priorityScore) + " — " + item.headline;
                    }).concat(["Retention risk is judged on signals, not on health: an "
                        + "account can be unhealthy and not at risk, or healthy and "
                        + "about to leave."]),
                    method: "Accounts whose primary queue is SAVE, ordered by priority "
                          + "score. ARR summed over those with a recorded contract value.",
                    accounts: atRisk.map(function (item) { return ref(item, item.headline); })
                });
            }
        },

        {
            key: "expansion",
            label: "Show me expansion opportunities.",
            match: ["expansion", "grow", "upsell", "opportunit"],
            run: function (rows) {
                var growing = rows.filter(function (item) {
                    return item.primaryQueue === "grow";
                }).sort(function (a, b) {
                    return (b.accountValue || 0) - (a.accountValue || 0);
                });

                if (!growing.length) {
                    return answer({
                        question: "Show me expansion opportunities.",
                        headline: "No account is in the GROW queue.",
                        detail: ["GROW requires a qualified opportunity — a customer-stated "
                            + "intention or a comparable order increase. A gap in our own "
                            + "product catalogue does not qualify, which is why this list "
                            + "is shorter than a product-gap report would be."],
                        method: "Accounts whose primary queue is GROW.",
                        accounts: []
                    });
                }

                return answer({
                    question: "Show me expansion opportunities.",
                    headline: util.plural(growing.length, "account")
                        + " with a qualified expansion signal.",
                    detail: growing.slice(0, 4).map(function (item) {
                        return item.accountName + " — " + item.headline
                            + " (ARR " + money(item.accountValue) + ")";
                    }),
                    method: "Accounts whose primary queue is GROW, ordered by recorded ARR.",
                    accounts: growing.map(function (item) { return ref(item, item.headline); })
                });
            }
        },

        {
            key: "whyAccount",
            label: "Why is this account a priority?",
            match: ["why is", "why does", "explain"],
            /** Needs an account name in the question; resolved in `ask()`. */
            needsAccount: true,
            run: function (rows, context) {
                var row = context.account;

                var reasons = util.list(row.reasons);
                var fired = util.list(row.firedOverrides);

                return answer({
                    question: "Why is " + row.accountName + " " + row.priorityLevel + "?",
                    headline: row.accountName + " is " + row.priorityLevel + " · "
                        + Math.round(row.priorityScore) + ", set by "
                        + (row.model.priority.levelSetBy === "override"
                            ? "a critical override" : "the weighted score") + ".",
                    detail: [row.model.priority.primaryReason]
                        .concat(fired.map(function (override) {
                            return override.level + " override: " + override.reason;
                        }))
                        .concat(reasons.filter(function (reason) {
                            return reason.kind === "factor";
                        }).slice(0, 3).map(function (reason) { return reason.text; }))
                        .concat([row.healthAvailable
                            ? "Health is " + Math.round(row.healthScore) + " ("
                              + row.healthBand + "). Health and priority are calculated "
                              + "separately and are allowed to disagree."
                            : "Health could not be scored for this account, so priority "
                              + "stands on its own factors."]),
                    method: "The account's own priority reasons and fired overrides.",
                    accounts: [ref(row, row.headline)]
                });
            }
        },

        {
            key: "worsening",
            label: "Which accounts have worsening health?",
            match: ["worsening", "declining", "getting worse", "dropped", "trend"],
            run: function (rows) {
                var moved = rows.map(function (item) {
                    var changes = C360.history.changesFor(item.accountId, item.model);
                    var health = changes.filter(function (change) {
                        return change.kind === "health" && change.to < change.from;
                    })[0];
                    return health ? { row: item, change: health } : null;
                }).filter(Boolean).sort(function (a, b) {
                    return (a.change.to - a.change.from) - (b.change.to - b.change.from);
                });

                if (!moved.length) {
                    // The honest answer, which is about the DATA and not the
                    // portfolio: with fewer than two stored runs there is
                    // nothing to compare, and no trend is invented to fill it.
                    var runs = C360.history.runCount();
                    return answer({
                        question: "Which accounts have worsening health?",
                        headline: runs < 2
                            ? "Not answerable yet — only " + util.plural(runs, "scoring run")
                              + " is recorded in this session."
                            : "No account's health has fallen since the previous run.",
                        detail: runs < 2
                            ? ["A trend needs two stored runs to compare. Refresh the "
                               + "portfolio again and this question becomes answerable. No "
                               + "previous score is invented to answer it sooner."]
                            : ["Health moved by less than a point on every account, or "
                               + "upward."],
                        method: "Stored run history, comparing the latest run against the "
                              + "previous one.",
                        accounts: []
                    });
                }

                return answer({
                    question: "Which accounts have worsening health?",
                    headline: util.plural(moved.length, "account")
                        + " lost health since the previous run.",
                    detail: moved.slice(0, 4).map(function (entry) {
                        return entry.row.accountName + " — " + entry.change.text;
                    }),
                    method: "Stored run history, comparing the latest run against the "
                          + "previous one.",
                    accounts: moved.map(function (entry) {
                        return ref(entry.row, entry.change.text);
                    })
                });
            }
        },

        {
            key: "renewals",
            label: "Which renewals are coming up?",
            match: ["renewal", "renew", "expiring", "coming up"],
            run: function (rows) {
                var upcoming = rows.filter(function (item) {
                    return item.renewalDays !== null && item.renewalDays <= 120;
                }).sort(function (a, b) { return a.renewalDays - b.renewalDays; });

                if (!upcoming.length) {
                    return answer({
                        question: "Which renewals are coming up?",
                        headline: "No recorded renewal falls within the next 120 days.",
                        detail: ["Accounts with no contract record are not counted here — "
                            + "that is missing data, not an absent renewal."],
                        method: "Accounts with a recorded renewal date within 120 days.",
                        accounts: []
                    });
                }

                var arr = upcoming.reduce(function (sum, item) {
                    return sum + (item.accountValue || 0);
                }, 0);

                return answer({
                    question: "Which renewals are coming up?",
                    headline: util.plural(upcoming.length, "renewal") + " within 120 days, "
                        + "covering " + money(arr) + " of recorded ARR.",
                    detail: upcoming.slice(0, 5).map(function (item) {
                        return item.accountName + " — " + item.renewalDays + " days ("
                            + item.priorityLevel + ", ARR " + money(item.accountValue) + ")";
                    }),
                    method: "Accounts with a recorded renewal date within 120 days, "
                          + "soonest first.",
                    accounts: upcoming.map(function (item) {
                        return ref(item, item.renewalDays + " days");
                    })
                });
            }
        },

        {
            key: "slaBreaches",
            label: "Where are we breaching SLA?",
            match: ["sla", "breach", "overdue ticket", "late"],
            run: function (rows) {
                var breaching = rows.filter(function (item) {
                    return !!item.slaBreach;
                }).sort(function (a, b) {
                    return b.slaBreach.days - a.slaBreach.days;
                });

                if (!breaching.length) {
                    return answer({
                        question: "Where are we breaching SLA?",
                        headline: "No account has a ticket past its SLA.",
                        detail: ["SLA hours are per severity, from configuration — a "
                            + "critical ticket has 24 hours, a low one 240."],
                        method: "Accounts where the critical-ticket-beyond-SLA override "
                              + "fired.",
                        accounts: []
                    });
                }

                return answer({
                    question: "Where are we breaching SLA?",
                    headline: util.plural(breaching.length, "account")
                        + " have a ticket past SLA.",
                    detail: breaching.slice(0, 5).map(function (item) {
                        return item.accountName + " — " + item.slaBreach.days
                            + " days open (" + item.slaBreach.label + ")";
                    }),
                    method: "Accounts where the critical-ticket-beyond-SLA override fired, "
                          + "worst first.",
                    accounts: breaching.map(function (item) {
                        return ref(item, item.slaBreach.days + " days open");
                    })
                });
            }
        },

        {
            key: "quiet",
            label: "Which accounts need nothing today?",
            match: ["need nothing", "no action", "quiet", "healthy accounts", "fine"],
            run: function (rows) {
                var quiet = rows.filter(function (item) {
                    return item.primaryQueue === null;
                }).sort(function (a, b) {
                    return (b.accountValue || 0) - (a.accountValue || 0);
                });

                return answer({
                    question: "Which accounts need nothing today?",
                    headline: util.plural(quiet.length, "account") + " of " + rows.length
                        + " need no action today.",
                    detail: quiet.length
                        ? ["No rule fired on these accounts, so they are in no queue. "
                           + "That is a deliberate answer — an ENGAGE item is not "
                           + "manufactured to avoid an empty row."]
                        : ["Every account in this portfolio has at least one rule firing."],
                    method: "Accounts with no primary queue.",
                    accounts: quiet.map(function (item) { return ref(item, null); })
                });
            }
        },

        {
            key: "portfolioShape",
            label: "How is the portfolio doing overall?",
            match: ["overall", "portfolio doing", "summary", "how are we", "shape"],
            run: function (rows, context) {
                var summary = context.summary;

                return answer({
                    question: "How is the portfolio doing overall?",
                    headline: summary.total + " accounts: " + summary.levels.P0 + " at P0, "
                        + summary.levels.P1 + " at P1, " + summary.needAction
                        + " with an action outstanding.",
                    detail: [
                        "Health: " + summary.bands.healthy + " healthy, "
                            + summary.bands.atRisk + " at risk, "
                            + summary.bands.critical + " critical, "
                            + summary.bands.unavailable + " not scoreable.",
                        "Queues: " + summary.queues.save + " SAVE, "
                            + summary.queues.fix + " FIX, " + summary.queues.grow
                            + " GROW, " + summary.queues.engage + " ENGAGE, and "
                            + summary.queues.none + " needing nothing.",
                        summary.arrTotal === null
                            ? "No contract value is recorded, so portfolio ARR is unknown."
                            : "Recorded ARR is " + money(summary.arrTotal) + " across "
                              + summary.arrKnownFor + " of " + summary.total
                              + " accounts"
                              + (summary.arrCoversAll ? "." : " — the rest record no value.")
                    ],
                    method: "The portfolio roll-up. Health bands and priority levels each "
                          + "sum to the account total; queue counts do not, because "
                          + "accounts needing nothing are in no queue.",
                    accounts: []
                });
            }
        }
    ];

    // -----------------------------------------------------------------
    // Ask
    // -----------------------------------------------------------------

    /**
     * Every account named in the question. Longest name first, so "ABC Waste"
     * beats "ABC".
     */
    function accountsIn(question, rows) {
        var text = String(question || "").toLowerCase();
        var candidates = util.list(rows).slice().sort(function (a, b) {
            return String(b.accountName).length - String(a.accountName).length;
        });

        return candidates.filter(function (row) {
            var name = String(row.accountName).toLowerCase();
            if (text.indexOf(name) !== -1) { return true; }
            // Also match on the distinctive first word — "why is acme p0" should
            // find "Acme Transportation".
            var first = name.split(" ")[0];
            return first.length >= 4 && text.indexOf(first) !== -1;
        });
    }

    /**
     * The single account a question is about, or null.
     *
     * Returns null when MORE THAN ONE account matches, so the caller can ask
     * which one rather than picking arbitrarily. Two customers can genuinely
     * share a name, and silently answering about the wrong one is exactly the
     * confident-but-wrong failure this whole module is built to avoid.
     */
    function accountIn(question, rows) {
        var matches = accountsIn(question, rows);
        return matches.length === 1 ? matches[0] : null;
    }

    /**
     * Answer a question about the portfolio.
     *
     * @param {string} question
     * @param {object} view  the output of C360.portfolio.build
     * @returns {object} an answer, always — an unmatched question gets an
     *          explicit "cannot answer that" with the list of what it can,
     *          because a plausible answer to a misread question is the one
     *          failure mode worth engineering against.
     */
    function ask(question, view) {
        var rows = util.list(view && view.allRows);
        var text = String(question || "").trim().toLowerCase();

        if (!text) {
            return {
                question: "",
                headline: "Ask a question about the portfolio.",
                detail: [],
                accounts: [],
                method: null,
                provenance: "derived",
                matched: false,
                suggestions: suggestions()
            };
        }

        var named = accountsIn(question, rows);

        // Ambiguity is reported, never resolved by guessing.
        if (named.length > 1) {
            return {
                question: question,
                headline: "More than one account matches that name.",
                detail: ["Pick the account you meant. Answering about the wrong one "
                    + "would be worse than asking."],
                accounts: named.map(function (row) {
                    return ref(row, row.headline);
                }),
                method: "Name match against the loaded portfolio.",
                provenance: "derived",
                matched: false,
                ambiguous: true,
                suggestions: suggestions()
            };
        }

        var context = {
            summary: view.summary,
            account: named.length === 1 ? named[0] : null
        };

        // An account named with "why" wins over a generic match, because
        // "why is Acme P0" is a question about Acme, not about risk in general.
        var ordered = QUERIES.slice().sort(function (a, b) {
            if (a.needsAccount && context.account) { return -1; }
            if (b.needsAccount && context.account) { return 1; }
            return 0;
        });

        for (var i = 0; i < ordered.length; i++) {
            var query = ordered[i];
            if (query.needsAccount && !context.account) { continue; }

            var hit = query.match.some(function (phrase) {
                return text.indexOf(phrase) !== -1;
            });
            if (!hit) { continue; }

            try {
                var result = query.run(rows, context);
                result.queryKey = query.key;
                return result;
            } catch (error) {
                console.error("Customer 360: portfolio query \"" + query.key
                    + "\" failed.", error);
            }
        }

        // A named account with no matched intent still deserves its explanation.
        if (context.account) {
            var explain = QUERIES.filter(function (q) { return q.key === "whyAccount"; })[0];
            var explained = explain.run(rows, context);
            explained.queryKey = explain.key;
            return explained;
        }

        return {
            question: question,
            headline: "That question cannot be answered from the portfolio data.",
            detail: ["Rather than guess at what was meant, here is what this panel can "
                + "answer exactly, from the same rows the Command Center is showing."],
            accounts: [],
            method: null,
            provenance: "derived",
            matched: false,
            suggestions: suggestions()
        };
    }

    /** The suggested questions the drawer offers. */
    function suggestions() {
        return QUERIES.filter(function (query) {
            return !query.needsAccount;
        }).map(function (query) {
            return { key: query.key, label: query.label };
        });
    }

    return {
        ask: ask,
        suggestions: suggestions,
        accountIn: accountIn,
        accountsIn: accountsIn,
        QUERIES: QUERIES
    };
}());
