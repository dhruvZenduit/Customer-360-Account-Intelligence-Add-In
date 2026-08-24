/**
 * Customer 360 — PORTFOLIO ROLL-UP  (Phase 6)
 * ===========================================
 * Roll-up in, view model out. Every number the Command Center prints is
 * computed here, so it can be tested in Node — `js/ui/portfolio.js` holds the
 * DOM and computes nothing.
 *
 * Three reconciliation rules the view model enforces rather than trusts:
 *
 *   HEALTH BANDS SUM TO THE TOTAL, and so do P0-P3. When they do not, the
 *   discrepancy is reported in the view model rather than hidden — a summary
 *   that quietly does not add up is worse than one that says it does not.
 *
 *   QUEUE COUNTS DO NOT SUM TO THE TOTAL, because an account with nothing
 *   outstanding is in no queue. So `none` is counted and labelled, and four
 *   numbers are never printed as though they were a total.
 *
 *   ACCOUNTS WITH UNAVAILABLE HEALTH GET THEIR OWN COUNT. Filing them under
 *   Critical would turn "we have no device data" into "this customer is in
 *   trouble", which is the exact lie Phase 2 exists to prevent.
 *
 * Every portfolio-signal count is a filter that returns exactly those accounts.
 * A count you cannot drill into is a number nobody trusts.
 *
 * Pure. No DOM, no I/O, no clock.
 */

"use strict";

C360.portfolio = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig.portfolio; }

    /**
     * The SLA breach on an account, as a number of days.
     *
     * Read off the fired override's FIRST evidence row, which the override has
     * already ordered worst-severity-first — the same ticket its `reason`
     * string names.
     *
     * Picking the oldest breach instead looked more alarming and was worse: a
     * queue row would read "SLA breach · 33 days" beside a reason naming a
     * different, 12-day ticket. Two numbers disagreeing on one row is how a
     * user stops believing either of them, and severity is the right ordering
     * anyway — a critical ticket 12 days late matters more than a medium one 33
     * days late.
     */
    function slaBreachOf(model, asOf) {
        var override = util.list(model.priority && model.priority.firedOverrides)
            .filter(function (item) { return item.rule === "criticalTicketBeyondSla"; })[0];
        if (!override) { return null; }

        var evidence = util.list(override.evidence)[0];
        if (!evidence) { return null; }

        var days = util.daysAgo(evidence.date, asOf);
        if (days === null) { return null; }

        return {
            days: days,
            ticketId: evidence.id,
            label: evidence.label,
            /** How many tickets are breaching in total, for the drawer. */
            count: util.list(override.evidence).length
        };
    }

    /**
     * The single most useful thing to do on this account, if anything.
     *
     * The first recommendation, which is already ordered by queue precedence
     * (SAVE before FIX before GROW before ENGAGE) — so "next best" is the
     * engine's ordering, not a judgement the view makes.
     */
    function nextActionOf(model) {
        var recommendation = util.list(model.recommendations)[0];
        if (!recommendation) { return null; }

        var labels = C360.scorecardConfig.queues.actionLabels;
        return {
            id: recommendation.id,
            rule: recommendation.rule,
            queue: recommendation.queue,
            /** The short imperative for the headline. */
            label: labels[recommendation.rule] || recommendation.action.summary,
            summary: recommendation.action.summary,
            why: recommendation.why,
            steps: util.list(recommendation.action.steps),
            owner: recommendation.owner.label,
            due: recommendation.due.label,
            confidence: recommendation.confidence,
            evidence: util.list(recommendation.evidence)
        };
    }

    /**
     * One row per account, flattened from a scorecard model into the fields the
     * screen sorts, filters, searches and renders.
     *
     * `asOf` comes from the model, never the clock, so the row is as
     * deterministic as the model behind it.
     */
    function row(model) {
        var summary = model.summary || {};
        var asOf = model.asOf || null;
        var renewalDays = C360.segments.daysUntil(summary.renewalDate, asOf);

        return {
            accountId: model.accountId,
            accountName: model.accountName,
            healthScore: summary.healthScore,
            healthBand: summary.healthBand,
            healthAvailable: summary.healthAvailable === true,
            confidencePct: summary.confidencePct,
            priorityLevel: summary.priorityLevel,
            priorityScore: summary.priorityScore,
            primaryQueue: summary.primaryQueue,
            segment: summary.segment,
            segmentLabel: model.segment ? model.segment.segmentLabel : null,
            lifecycle: summary.lifecycle,
            lifecycleLabel: model.segment ? model.segment.lifecycleLabel : null,
            renewalDate: summary.renewalDate,
            /** Days to renewal, or null. Negative once it has passed. */
            renewalDays: renewalDays === null || renewalDays < 0 ? null : renewalDays,
            accountValue: summary.accountValue,
            recommendationCount: summary.recommendationCount,
            reasons: util.list(model.priority && model.priority.reasons),
            queues: model.queues || { primaryQueue: null, queues: [] },
            firedOverrides: util.list(model.priority && model.priority.firedOverrides),

            /** The one-line reason the queue row shows under the account name. */
            headline: model.priority ? model.priority.primaryReason : null,
            slaBreach: slaBreachOf(model, asOf),
            nextAction: nextActionOf(model),
            asOf: asOf,

            /** The full model, so a row can open the account view without refetching. */
            model: model
        };
    }

    // -----------------------------------------------------------------
    // Summary counts
    // -----------------------------------------------------------------

    /**
     * Health bands, priority levels and queues, all counted from the actual
     * portfolio. No placeholder ever ships.
     */
    function summarise(rows) {
        var bands = { healthy: 0, atRisk: 0, critical: 0, unavailable: 0 };
        var levels = { P0: 0, P1: 0, P2: 0, P3: 0 };

        util.list(rows).forEach(function (item) {
            if (!item.healthAvailable) {
                bands.unavailable++;
            } else if (item.healthBand === "HEALTHY") {
                bands.healthy++;
            } else if (item.healthBand === "AT RISK") {
                bands.atRisk++;
            } else {
                bands.critical++;
            }

            if (levels[item.priorityLevel] !== undefined) {
                levels[item.priorityLevel]++;
            }
        });

        var total = util.list(rows).length;
        var bandSum = bands.healthy + bands.atRisk + bands.critical + bands.unavailable;
        var levelSum = levels.P0 + levels.P1 + levels.P2 + levels.P3;
        var queueCounts = C360.queues.rollup(rows);

        /**
         * Portfolio ARR. Summed only over accounts that actually record a
         * contract value — `valueKnownFor` says how many, so the figure is never
         * read as covering the whole portfolio when it does not.
         */
        var withValue = util.list(rows).filter(function (item) {
            return item.accountValue !== null && item.accountValue !== undefined;
        });
        var arrTotal = withValue.reduce(function (sum, item) {
            return sum + item.accountValue;
        }, 0);

        /** Accounts with at least one recommendation to act on. */
        var needAction = util.list(rows).filter(function (item) {
            return item.recommendationCount > 0;
        }).length;

        return {
            total: total,
            bands: bands,
            levels: levels,
            queues: queueCounts,

            /** P0 + P1 — the "act today" count the header strip leads with. */
            urgent: levels.P0 + levels.P1,
            needAction: needAction,
            arrTotal: withValue.length ? arrTotal : null,
            arrKnownFor: withValue.length,
            arrCoversAll: withValue.length === total,

            /**
             * Surfaced, not asserted. If either sum is wrong the screen says so
             * instead of printing numbers that do not reconcile.
             */
            reconciliation: {
                bandsSumToTotal: bandSum === total,
                levelsSumToTotal: levelSum === total,
                bandSum: bandSum,
                levelSum: levelSum,
                /** Queue counts are NOT expected to sum to the total. */
                queuesPlusNone: queueCounts.save + queueCounts.fix + queueCounts.grow
                              + queueCounts.engage + queueCounts.none,
                queuesReconcile: (queueCounts.save + queueCounts.fix + queueCounts.grow
                                + queueCounts.engage + queueCounts.none) === total
            },

            /** e.g. "21 accounts need no action today" */
            noQueueLabel: queueCounts.none + " " + cfg().noQueueLabel
        };
    }

    // -----------------------------------------------------------------
    // Top priorities
    // -----------------------------------------------------------------

    /**
     * Ordered by priority score descending, ties broken by health ascending then
     * renewal date ascending — the documented tie-break from Phase 6 §4.
     *
     * Health ascending as the first tie-break is deliberate: given two equally
     * urgent accounts, the sicker one goes first.
     *
     * This is not a risk list. A healthy account with a strong expansion signal
     * belongs in the top ten, and the sort makes no attempt to keep it out.
     */
    function topPriorities(rows, count) {
        var limit = count === undefined ? cfg().topPriorityCount : count;
        var maxReasons = cfg().maxReasonsPerRow;

        var sorted = util.list(rows).slice().sort(function (a, b) {
            var byScore = (b.priorityScore || 0) - (a.priorityScore || 0);
            if (byScore !== 0) { return byScore; }

            // healthAsc — an unavailable health sorts last, because we cannot
            // claim it is worse than a known-bad score.
            var ha = a.healthAvailable ? a.healthScore : Infinity;
            var hb = b.healthAvailable ? b.healthScore : Infinity;
            if (ha !== hb) { return ha - hb; }

            // renewalDateAsc — no renewal date sorts last, same reasoning.
            var ra = util.toDate(a.renewalDate);
            var rb = util.toDate(b.renewalDate);
            if (ra && rb) { return ra.getTime() - rb.getTime(); }
            if (ra) { return -1; }
            if (rb) { return 1; }

            return 0;
        });

        return sorted.slice(0, limit).map(function (item, index) {
            var reasons = item.reasons.map(function (reason) { return reason.text; });
            return {
                rank: index + 1,
                accountId: item.accountId,
                accountName: item.accountName,
                priorityLevel: item.priorityLevel,
                priorityScore: item.priorityScore,
                healthScore: item.healthScore,
                healthAvailable: item.healthAvailable,
                healthBand: item.healthBand,
                primaryQueue: item.primaryQueue,
                reasons: reasons.slice(0, maxReasons),
                /** "+N more" affordance rather than a truncated list with no hint. */
                moreReasons: Math.max(0, reasons.length - maxReasons),
                actionLabel: item.queues.queues.length ? item.queues.queues[0].actionLabel : null
            };
        });
    }

    // -----------------------------------------------------------------
    // Portfolio signals
    // -----------------------------------------------------------------

    /**
     * Which accounts a portfolio signal covers.
     *
     * Each signal is a PREDICATE over rows, not a stored count — that is what
     * guarantees the count and the click-through filter can never disagree
     * (Phase 6 test 6.8).
     */
    var SIGNAL_PREDICATES = {
        expansionSignal: function (item) {
            return item.primaryQueue === "grow"
                || item.firedOverrides.some(function (o) { return o.rule === "qualifiedExpansion"; });
        },
        slaBreach: function (item) {
            return item.firedOverrides.some(function (o) {
                return o.rule === "criticalTicketBeyondSla";
            });
        },
        cancellationSignal: function (item) {
            return item.firedOverrides.some(function (o) {
                return o.rule === "explicitCancellationRequest";
            });
        },
        quoteAwaitingResponse: function (item) {
            return item.firedOverrides.some(function (o) {
                return o.rule === "quoteAwaitingResponse";
            });
        },
        decliningEngagement: function (item) {
            return util.list(item.queues.queues).some(function (queue) {
                return util.list(queue.rules).some(function (rule) {
                    return rule.rule === "trainingRequired"
                        || rule.rule === "inactiveCustomer"
                        || rule.rule === "relationshipDeterioration";
                });
            });
        }
    };

    function signals(rows) {
        return util.list(cfg().portfolioSignals).map(function (spec) {
            var predicate = SIGNAL_PREDICATES[spec.key];
            var matching = predicate
                ? util.list(rows).filter(predicate)
                : [];

            return {
                key: spec.key,
                label: spec.label,
                tone: spec.tone,
                count: matching.length,
                /** The exact account ids the count refers to — the drill-through. */
                accountIds: matching.map(function (item) { return item.accountId; })
            };
        }).filter(function (signal) { return signal.count > 0; });
    }

    // -----------------------------------------------------------------
    // Latest portfolio signals
    // -----------------------------------------------------------------

    /**
     * A chronological feed of what the portfolio actually recorded, newest
     * first.
     *
     * Every entry is a REAL source record with a REAL date — a fired override's
     * evidence, or a queue rule's. Nothing is synthesised, and the timestamps
     * are the records' own, not the time of the scoring run. That distinction
     * matters: a feed showing "12:26" for every entry because that is when the
     * refresh ran would look live and mean nothing.
     *
     * The UI labels this "Latest portfolio signals · last updated HH:MM" rather
     * than anything implying a continuously running process, because nothing
     * runs continuously.
     */
    function signalFeed(rows, limit) {
        var out = [];
        var seen = {};

        util.list(rows).forEach(function (item) {
            function push(evidence, tone, text) {
                if (!evidence || !evidence.date) { return; }
                var key = item.accountId + ":" + evidence.type + ":" + evidence.id;
                if (seen[key]) { return; }
                seen[key] = true;
                out.push({
                    accountId: item.accountId,
                    accountName: item.accountName,
                    date: evidence.date,
                    tone: tone,
                    text: text,
                    recordType: evidence.type,
                    recordId: evidence.id,
                    excerpt: evidence.excerpt || null
                });
            }

            // Fired overrides first: these are the statements the product is
            // most confident about.
            item.firedOverrides.forEach(function (override) {
                var tone = override.level === "P0" ? "critical"
                         : override.level === "P1" ? "warning" : "info";
                push(util.list(override.evidence)[0], tone, override.rule);
            });

            // Then the queue rules, which cover the operational signals an
            // override does not (device problems, expansion, coverage gaps).
            util.list(item.queues.queues).forEach(function (queue) {
                util.list(queue.rules).forEach(function (rule) {
                    var tone = queue.key === "save" ? "critical"
                             : queue.key === "fix" ? "warning"
                             : queue.key === "grow" ? "healthy" : "info";
                    push(util.list(rule.evidence)[0], tone, rule.reason);
                });
            });
        });

        return out.sort(util.byDateDesc).slice(0, limit || 12);
    }

    // -----------------------------------------------------------------
    // Portfolio matrix
    // -----------------------------------------------------------------

    /**
     * Health (x) against priority (y), as percentages, ready to position.
     *
     * Priority is inverted so HIGH sits at the top, which is how the axis is
     * labelled and how anybody reads it.
     *
     * An account whose health is unavailable is NOT plotted at zero — it is
     * returned in `unplaced` with its reason. Dropping it silently would hide
     * it; plotting it at zero would assert it is critical, which is exactly the
     * lie Phase 2 exists to prevent.
     */
    function matrix(rows) {
        var placed = [];
        var unplaced = [];

        util.list(rows).forEach(function (item) {
            if (!item.healthAvailable) {
                unplaced.push({
                    accountId: item.accountId,
                    accountName: item.accountName,
                    priorityLevel: item.priorityLevel,
                    priorityScore: item.priorityScore,
                    reason: "Health could not be scored, so this account cannot be "
                          + "placed on the health axis."
                });
                return;
            }

            placed.push({
                accountId: item.accountId,
                accountName: item.accountName,
                /** 0 = critical health (left), 100 = healthy (right). */
                x: Math.max(0, Math.min(100, item.healthScore)),
                /** 0 = low priority (bottom), 100 = high priority (top). */
                y: Math.max(0, Math.min(100, item.priorityScore)),
                healthScore: item.healthScore,
                healthBand: item.healthBand,
                priorityLevel: item.priorityLevel,
                priorityScore: item.priorityScore,
                primaryQueue: item.primaryQueue,
                accountValue: item.accountValue,
                renewalDays: item.renewalDays,
                segmentLabel: item.segmentLabel
            });
        });

        // Most urgent last, so the dots that matter paint on top.
        placed.sort(function (a, b) { return a.priorityScore - b.priorityScore; });

        return { placed: placed, unplaced: unplaced };
    }

    // -----------------------------------------------------------------
    // Filters
    // -----------------------------------------------------------------

    /**
     * Filters combine AND across groups, OR within a group.
     *
     * So {priority: ["P0","P1"], queue: ["save"]} means "P0 or P1, AND in the
     * SAVE queue" — which is what a user selecting two priority chips and one
     * queue chip means by it.
     */
    var FILTER_PREDICATES = {
        priority: function (item, value) {
            return value === "all" || item.priorityLevel === value;
        },
        queue: function (item, value) {
            return item.primaryQueue === value;
        },
        health: function (item, value) {
            if (value === "unavailable") { return !item.healthAvailable; }
            if (!item.healthAvailable) { return false; }
            if (value === "healthy") { return item.healthBand === "HEALTHY"; }
            if (value === "atRisk") { return item.healthBand === "AT RISK"; }
            if (value === "critical") { return item.healthBand === "CRITICAL"; }
            return false;
        },
        segment: function (item, value) {
            return item.segment === value;
        },
        theme: function (item, value) {
            if (value === "renewal") {
                return item.lifecycle === "renewal"
                    || item.firedOverrides.some(function (o) {
                        return o.rule === "renewalWindowWithNegativeSignals";
                    });
            }
            if (value === "expansion") {
                return item.primaryQueue === "grow" || item.lifecycle === "expansion";
            }
            if (value === "support") {
                return item.primaryQueue === "fix";
            }
            return false;
        },
        /** Used by the portfolio-signal click-through. */
        accountIds: function (item, value) {
            return item.accountId === value;
        }
    };

    function applyFilters(rows, filters) {
        var active = filters || {};

        return util.list(rows).filter(function (item) {
            return Object.keys(active).every(function (group) {
                var values = util.list(active[group]);
                if (!values.length) { return true; }

                var predicate = FILTER_PREDICATES[group];
                if (!predicate) { return true; }

                // OR within the group.
                return values.some(function (value) { return predicate(item, value); });
            });
        });
    }

    // -----------------------------------------------------------------
    // Sorting
    // -----------------------------------------------------------------

    /** Missing values sort LAST in every comparator, never as zero. */
    function nullsLast(a, b, compare) {
        var aMissing = a === null || a === undefined;
        var bMissing = b === null || b === undefined;
        if (aMissing && bMissing) { return 0; }
        if (aMissing) { return 1; }
        if (bMissing) { return -1; }
        return compare(a, b);
    }

    var SORTS = {
        priority: function (a, b) {
            return (b.priorityScore || 0) - (a.priorityScore || 0);
        },
        health: function (a, b) {
            return nullsLast(
                a.healthAvailable ? a.healthScore : null,
                b.healthAvailable ? b.healthScore : null,
                function (x, y) { return x - y; });
        },
        accountValue: function (a, b) {
            return nullsLast(a.accountValue, b.accountValue, function (x, y) { return y - x; });
        },
        renewalDate: function (a, b) {
            return nullsLast(a.renewalDate, b.renewalDate, function (x, y) {
                return util.toDate(x).getTime() - util.toDate(y).getTime();
            });
        },
        lastActivity: function (a, b) {
            return nullsLast(lastActivityOf(a), lastActivityOf(b), function (x, y) {
                return util.toDate(y).getTime() - util.toDate(x).getTime();
            });
        },
        risk: function (a, b) {
            var order = { save: 0, fix: 1, engage: 2, grow: 3 };
            var oa = order[a.primaryQueue];
            var ob = order[b.primaryQueue];
            if (oa === undefined) { oa = 9; }
            if (ob === undefined) { ob = 9; }
            if (oa !== ob) { return oa - ob; }
            return (b.priorityScore || 0) - (a.priorityScore || 0);
        },
        opportunity: function (a, b) {
            var oa = a.primaryQueue === "grow" ? 0 : 1;
            var ob = b.primaryQueue === "grow" ? 0 : 1;
            if (oa !== ob) { return oa - ob; }
            return (b.priorityScore || 0) - (a.priorityScore || 0);
        }
    };

    function lastActivityOf(item) {
        var model = item.model;
        if (!model) { return null; }
        var everything = util.list(model.recommendations).reduce(function (all, rec) {
            return all.concat(util.list(rec.evidence));
        }, []);
        var newest = everything.filter(function (row) { return row.date; })
            .sort(util.byDateDesc)[0];
        return newest ? newest.date : null;
    }

    function applySort(rows, sortId) {
        var compare = SORTS[sortId] || SORTS[cfg().defaultSort];
        return util.list(rows).slice().sort(compare);
    }

    // -----------------------------------------------------------------
    // Search
    // -----------------------------------------------------------------

    /**
     * Search across account, company, contact and issue — and SAY WHY each hit
     * matched, so a hit on a ticket subject is not mistaken for a name match.
     */
    function search(rows, query) {
        var q = String(query || "").trim().toLowerCase();
        if (!q) { return []; }

        var out = [];

        util.list(rows).forEach(function (item) {
            var model = item.model || {};
            var bundle = model.bundle || {};
            var reasons = [];

            if (item.accountName && item.accountName.toLowerCase().indexOf(q) !== -1) {
                reasons.push({ kind: "account", text: "matched account name" });
            }

            var normalised = C360.identity.normaliseName(item.accountName);
            if (normalised && normalised.indexOf(q) !== -1 && !reasons.length) {
                reasons.push({ kind: "company", text: "matched company name" });
            }

            util.list(bundle.contacts).forEach(function (contact) {
                if (contact.name && contact.name.toLowerCase().indexOf(q) !== -1) {
                    reasons.push({ kind: "contact", text: "matched contact: " + contact.name });
                }
            });

            util.list(bundle.tickets).forEach(function (ticket) {
                var subject = String(ticket.subject || "").toLowerCase();
                var number = String(ticket.number || "").toLowerCase();
                if (subject.indexOf(q) !== -1 || number === q) {
                    reasons.push({
                        kind: "issue",
                        text: "matched issue: " + (ticket.subject || "ticket " + ticket.number)
                    });
                }
            });

            if (!reasons.length) { return; }

            out.push({
                accountId: item.accountId,
                accountName: item.accountName,
                priorityLevel: item.priorityLevel,
                /** Only the first two reasons, or a hit reads as an essay. */
                matchReasons: reasons.slice(0, 2),
                matchReason: reasons[0].text
            });
        });

        return out;
    }

    // -----------------------------------------------------------------
    // URL state
    // -----------------------------------------------------------------

    /**
     * Filter and sort state in the query string, so a view can be shared or
     * survive a reload. Extends the pattern the add-in already uses for
     * `?dataSource=` and `?gateway=` rather than inventing a second mechanism.
     */
    function toQuery(state) {
        var parts = [];
        var filters = (state && state.filters) || {};

        Object.keys(filters).forEach(function (group) {
            var values = util.list(filters[group]);
            if (!values.length) { return; }
            parts.push(encodeURIComponent(group) + "=" + values.map(encodeURIComponent).join(","));
        });

        if (state && state.sort) { parts.push("sort=" + encodeURIComponent(state.sort)); }
        if (state && state.view) { parts.push("view=" + encodeURIComponent(state.view)); }
        if (state && state.accountId) {
            parts.push("account=" + encodeURIComponent(state.accountId));
        }

        return parts.join("&");
    }

    function fromQuery(query) {
        var groups = Object.keys(cfg().filters);
        var state = { filters: {}, sort: cfg().defaultSort, view: null, accountId: null };

        String(query || "").replace(/^[?#]/, "").split("&").forEach(function (pair) {
            if (!pair) { return; }
            var bits = pair.split("=");
            var key = decodeURIComponent(bits[0] || "");
            var value = decodeURIComponent(bits.slice(1).join("=") || "");
            if (!key || !value) { return; }

            if (key === "sort") {
                if (util.list(cfg().sorts).indexOf(value) !== -1) { state.sort = value; }
                return;
            }
            if (key === "view") { state.view = value; return; }
            if (key === "account") { state.accountId = value; return; }

            if (groups.indexOf(key) !== -1) {
                var allowed = util.list(cfg().filters[key]);
                state.filters[key] = value.split(",").filter(function (item) {
                    return allowed.indexOf(item) !== -1;
                });
                if (!state.filters[key].length) { delete state.filters[key]; }
            }
        });

        return state;
    }

    // -----------------------------------------------------------------
    // Build
    // -----------------------------------------------------------------

    /**
     * @param {Array} models  scorecard models, one per account
     * @param {object} options
     *   filters    { priority: [...], queue: [...], ... }
     *   sort       one of portfolio.sorts
     *   failures   [{ accountId, source, error }] — accounts or sources that
     *              failed to load. Rendered, never allowed to blank the screen.
     *   lastUpdated
     * @returns {object} the view model js/ui/portfolio.js renders
     */
    function build(models, options) {
        var opts = options || {};
        var rows = util.list(models).map(row);

        var summary = summarise(rows);
        var portfolioSignals = signals(rows);

        var filtered = applyFilters(rows, opts.filters);
        var sorted = applySort(filtered, opts.sort || cfg().defaultSort);

        var queueCards = {};
        util.list(C360.scorecardConfig.queues.precedence).forEach(function (key) {
            queueCards[key] = C360.queues.cards(rows, key);
        });

        /**
         * The priority queue for the left panel: P0 and P1 only, most urgent
         * first. Deliberately not the top-N list — the top-N is capped at ten
         * and includes P2s, and an operational queue should show everything
         * that is actually urgent and nothing that is not.
         */
        var urgentRows = rows.filter(function (item) {
            return item.priorityLevel === "P0" || item.priorityLevel === "P1";
        }).sort(function (a, b) {
            return (b.priorityScore || 0) - (a.priorityScore || 0);
        });

        return {
            /** Every count below is derived from `models`. Nothing is a placeholder. */
            summary: summary,
            signals: portfolioSignals,
            /** Top-N is computed over the FULL portfolio, not the filtered view. */
            topPriorities: topPriorities(rows, cfg().topPriorityCount),
            queueCards: queueCards,

            /** The three-panel command center's own views over the same rows. */
            urgent: urgentRows,
            feed: signalFeed(rows, 14),
            matrix: matrix(rows),

            rows: sorted,
            allRows: rows,
            filters: opts.filters || {},
            sort: opts.sort || cfg().defaultSort,

            /** Partial failure is normal at portfolio scale; it is shown, not fatal. */
            failures: util.list(opts.failures),
            partial: util.list(opts.failures).length > 0,

            lastUpdated: opts.lastUpdated || null,
            empty: rows.length === 0
        };
    }

    /** Find one row by account id. */
    function rowFor(view, accountId) {
        return util.list(view && view.allRows).filter(function (item) {
            return item.accountId === accountId;
        })[0] || null;
    }

    return {
        build: build,
        row: row,
        rowFor: rowFor,
        summarise: summarise,
        topPriorities: topPriorities,
        signals: signals,
        signalFeed: signalFeed,
        matrix: matrix,
        nextActionOf: nextActionOf,
        slaBreachOf: slaBreachOf,
        applyFilters: applyFilters,
        applySort: applySort,
        search: search,
        toQuery: toQuery,
        fromQuery: fromQuery,
        SIGNAL_PREDICATES: SIGNAL_PREDICATES,
        SORTS: SORTS
    };
}());
