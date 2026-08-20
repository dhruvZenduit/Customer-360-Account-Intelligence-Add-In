/**
 * Customer 360 — SIGNALS
 * ======================
 * Layer 2 of the intelligence engine (spec section 40).
 *
 * A SIGNAL is a pattern across one or more facts. Signals interpret; facts do
 * not. So every signal carries:
 *
 *   - a statement written in hedged language (spec section 42): "indicates",
 *     "suggests", "no evidence found" — never "will", "plans to", "definitely"
 *   - the facts it was derived from
 *   - a confidence level, assigned by the rule in section 26's terms:
 *       High   — the source states it directly
 *       Medium — several independent signals point the same way
 *       Low    — a reasonable inference from limited evidence
 *
 * Adding a rule means adding one function to RULES. Each rule receives the
 * normalised bundle plus the fact index, and returns zero or more signals.
 */

"use strict";

C360.signals = (function () {

    var util = C360.util;

    function conf() { return C360.config.confidence; }
    function thresholds() { return C360.config.thresholds; }

    function makeSignal(spec) {
        return {
            id: spec.id,
            key: spec.key,
            label: spec.label,
            /** up | down | warn | flat — drives the glyph, not a colour alone. */
            direction: spec.direction,
            statement: spec.statement,
            confidence: spec.confidence,
            category: spec.category,
            evidence: util.list(spec.evidence)
        };
    }

    // -----------------------------------------------------------------
    // Helpers shared by the rules
    // -----------------------------------------------------------------

    function openTickets(data) {
        return util.list(data.tickets).filter(function (t) { return t.isOpen; });
    }

    function openEscalations(items) {
        return util.list(items).filter(function (item) { return item.state !== "RESOLVED"; });
    }

    function latestReview(data) {
        return util.list(data.reviews).slice().sort(util.byDateDesc)[0] || null;
    }

    function sharesProduct(a, b) {
        return a.products.some(function (product) {
            return b.products.indexOf(product) !== -1;
        });
    }

    /**
     * Latest order paired with the most recent EARLIER order that covers at
     * least one of the same products.
     *
     * Comparability matters: 75 cameras against 50 telematics units is not a
     * volume change, it is two different purchases. When nothing comparable
     * exists, this returns null and no volume signal is produced.
     */
    function comparableOrderPair(data) {
        var orders = util.list(data.orders)
            .filter(function (o) { return o.quantity !== null && o.date; })
            .slice()
            .sort(util.byDateDesc);

        if (orders.length < 2) { return null; }

        var latest = orders[0];
        for (var i = 1; i < orders.length; i++) {
            if (sharesProduct(latest, orders[i])) {
                return { latest: latest, previous: orders[i] };
            }
        }
        return null;
    }

    // -----------------------------------------------------------------
    // Rules
    // -----------------------------------------------------------------

    var RULES = {

        /** Order volume moved materially against a comparable earlier order. */
        orderVolume: function (data, facts) {
            var pair = comparableOrderPair(data);
            if (!pair) { return []; }

            var change = util.pctChange(pair.previous.quantity, pair.latest.quantity);
            if (change === null || Math.abs(change) < thresholds().orderVolumeChangePct) {
                return [];
            }

            var up = change > 0;
            var evidence = [
                facts.get("order", pair.latest.id),
                facts.get("order", pair.previous.id)
            ].filter(Boolean);

            return [makeSignal({
                id: "signal-order-volume",
                key: "orderVolume",
                label: up ? "Order volume increased" : "Order volume decreased",
                direction: up ? "up" : "down",
                statement: "Order quantity " + (up ? "increased" : "decreased") + " "
                         + util.formatPct(change) + " compared with the previous comparable order ("
                         + pair.previous.quantity + " to " + pair.latest.quantity + " units).",
                // Both quantities are stated directly on the order records.
                confidence: conf().HIGH,
                category: "commercial",
                evidence: evidence
            })];
        },

        /** Quotes awaiting a customer decision, and whether they are stalling. */
        openQuotes: function (data, facts) {
            var open = util.list(data.quotes).filter(function (q) { return q.isOpen; });
            if (!open.length) { return []; }

            var out = [];
            var evidence = facts.forRecords("quote", open);

            out.push(makeSignal({
                id: "signal-open-quotes",
                key: "openQuotes",
                label: util.plural(open.length, "open quote"),
                direction: "flat",
                statement: util.plural(open.length, "quote is", "quotes are")
                         + " awaiting a customer decision.",
                confidence: conf().HIGH,
                category: "commercial",
                evidence: evidence
            }));

            var stale = open.filter(function (q) {
                var age = util.daysAgo(q.date);
                return age !== null && age > thresholds().staleQuoteDays;
            });

            if (stale.length) {
                out.push(makeSignal({
                    id: "signal-stale-quotes",
                    key: "staleQuotes",
                    label: "Quote not converting",
                    direction: "warn",
                    statement: util.plural(stale.length, "open quote has", "open quotes have")
                             + " been outstanding for more than "
                             + thresholds().staleQuoteDays + " days without a recorded decision.",
                    confidence: conf().HIGH,
                    category: "commercial",
                    evidence: facts.forRecords("quote", stale)
                }));
            }

            return out;
        },

        /** Unresolved escalations, split by kind because they are acted on differently. */
        escalations: function (data, facts) {
            var out = [];
            var billing = openEscalations(data.billingIssues);
            var technical = openEscalations(data.technicalIssues);

            if (billing.length) {
                out.push(makeSignal({
                    id: "signal-billing-escalation",
                    key: "billingEscalation",
                    label: "Billing escalation open",
                    direction: "warn",
                    statement: util.plural(billing.length, "billing escalation is", "billing escalations are")
                             + " unresolved.",
                    confidence: conf().HIGH,
                    category: "support",
                    evidence: facts.forRecords("escalation", billing)
                }));
            }

            if (technical.length) {
                out.push(makeSignal({
                    id: "signal-technical-escalation",
                    key: "technicalEscalation",
                    label: "Technical escalation open",
                    direction: "warn",
                    statement: util.plural(technical.length, "technical escalation is", "technical escalations are")
                             + " unresolved.",
                    confidence: conf().HIGH,
                    category: "support",
                    evidence: facts.forRecords("escalation", technical)
                }));
            }

            return out;
        },

        /** The same issue category coming back repeatedly. */
        repeatIssues: function (data, facts) {
            var byCategory = {};
            util.list(data.tickets).forEach(function (ticket) {
                if (!ticket.issueCategory) { return; }
                byCategory[ticket.issueCategory] = byCategory[ticket.issueCategory] || [];
                byCategory[ticket.issueCategory].push(ticket);
            });

            return Object.keys(byCategory).filter(function (category) {
                return byCategory[category].length >= thresholds().repeatIssueCount;
            }).map(function (category) {
                var tickets = byCategory[category];
                return makeSignal({
                    id: "signal-repeat-" + util.slug(category),
                    key: "repeatIssue",
                    label: "Repeated " + category.toLowerCase() + " issues",
                    direction: "warn",
                    statement: util.plural(tickets.length, "ticket") + " in the "
                             + category.toLowerCase() + " category, which suggests a recurring problem "
                             + "rather than isolated incidents.",
                    // The count is directly observed; "recurring" is the reading of it.
                    confidence: conf().MEDIUM,
                    category: "support",
                    evidence: facts.forRecords("ticket", tickets)
                });
            });
        },

        /** Open tickets that have been sitting. */
        ageingTickets: function (data, facts) {
            var ageing = openTickets(data).filter(function (ticket) {
                var age = util.daysAgo(ticket.opened);
                return age !== null && age > thresholds().ageingTicketDays;
            });
            if (!ageing.length) { return []; }

            return [makeSignal({
                id: "signal-ageing-tickets",
                key: "ageingTickets",
                label: "Ageing open tickets",
                direction: "warn",
                statement: util.plural(ageing.length, "open ticket has", "open tickets have")
                         + " been open longer than " + thresholds().ageingTicketDays + " days.",
                confidence: conf().HIGH,
                category: "support",
                evidence: facts.forRecords("ticket", ageing)
            })];
        },

        /**
         * Public growth indicators. Website and external items are combined
         * because agreement between two independent sources is exactly what
         * raises confidence from "one source said so" to "several signals".
         */
        publicGrowth: function (data, facts) {
            var websiteSignals = util.list(data.website && data.website.growthSignals);
            var externalGrowth = util.list(data.external).filter(function (item) {
                return ["expansion", "acquisition", "contract", "procurement", "partnership"]
                    .indexOf(item.category) !== -1;
            });

            if (!websiteSignals.length && !externalGrowth.length) { return []; }

            var evidence = facts.forRecords("website-signal", websiteSignals)
                .concat(facts.forRecords("news", externalGrowth));

            var sourceCount = (websiteSignals.length ? 1 : 0) + (externalGrowth.length ? 1 : 0);

            return [makeSignal({
                id: "signal-public-growth",
                key: "publicGrowth",
                label: "Public growth activity",
                direction: "up",
                statement: "Public sources report " + util.plural(evidence.length, "recent development")
                         + " consistent with operational growth. The reports do not state the size of "
                         + "any fleet or asset change.",
                confidence: sourceCount > 1 ? conf().MEDIUM : conf().HIGH,
                category: "growth",
                evidence: evidence
            })];
        },

        /** Public contraction indicators — closures, losses, layoffs. */
        publicContraction: function (data, facts) {
            var items = util.list(data.external).filter(function (item) {
                return item.category === "contraction";
            });
            if (!items.length) { return []; }

            return [makeSignal({
                id: "signal-public-contraction",
                key: "publicContraction",
                label: "Public contraction activity",
                direction: "down",
                statement: "Public sources report " + util.plural(items.length, "development")
                         + " consistent with reduced operations. The reports do not state the "
                         + "operational impact on this account.",
                confidence: conf().HIGH,
                category: "growth",
                evidence: facts.forRecords("news", items)
            })];
        },

        /** Leadership change at the customer, from any public source. */
        leadershipChange: function (data, facts) {
            var items = util.list(data.external).filter(function (item) {
                return item.category === "leadership";
            });
            if (!items.length) { return []; }

            return [makeSignal({
                id: "signal-leadership-change",
                key: "leadershipChange",
                label: "Leadership change reported",
                direction: "flat",
                statement: "A leadership change has been reported publicly, which may change who "
                         + "owns decisions on this account.",
                confidence: conf().HIGH,
                category: "leadership",
                evidence: facts.forRecords("news", items)
            })];
        },

        /** How long since anyone sat down with this customer. */
        relationshipCadence: function (data, facts) {
            var review = latestReview(data);

            if (!review) {
                return [makeSignal({
                    id: "signal-no-review",
                    key: "noReview",
                    label: "No account review on record",
                    direction: "warn",
                    statement: "No account review is recorded for this account in the available "
                             + "internal data.",
                    // Absence of a record is weak evidence: the meeting may
                    // have happened and simply not been logged.
                    confidence: conf().LOW,
                    category: "relationship",
                    evidence: []
                })];
            }

            var age = util.daysAgo(review.date);
            if (age === null) { return []; }

            var evidence = [facts.get("review", review.id)].filter(Boolean);

            if (age > thresholds().staleReviewDays) {
                return [makeSignal({
                    id: "signal-stale-review",
                    key: "staleReview",
                    label: "Account review overdue",
                    direction: "warn",
                    statement: "The most recent account review was " + age + " days ago, longer than "
                             + "the " + thresholds().staleReviewDays + "-day cadence this dashboard "
                             + "treats as current.",
                    confidence: conf().HIGH,
                    category: "relationship",
                    evidence: evidence
                })];
            }

            return [makeSignal({
                id: "signal-review-cadence",
                key: "reviewCadence",
                label: "Account review cadence",
                direction: age > thresholds().agingReviewDays ? "warn" : "flat",
                statement: "The most recent account review was " + age + " days ago.",
                confidence: conf().HIGH,
                category: "relationship",
                evidence: evidence
            })];
        },

        /**
         * Products in our catalogue with no evidence of use on this account.
         *
         * Deliberately worded as absence of EVIDENCE, not absence of usage
         * (spec section 19) — internal data is incomplete and a customer may
         * well be using something we cannot see from here.
         */
        productGaps: function (data) {
            var catalogue = util.list(C360.config.productCatalogue);
            var account = data.account;
            if (!catalogue.length || !account) { return []; }

            var owned = {};
            util.list(account.products).forEach(function (product) {
                owned[String(product).toLowerCase()] = true;
            });
            util.list(data.orders).forEach(function (order) {
                order.products.forEach(function (product) {
                    owned[String(product).toLowerCase()] = true;
                });
            });

            var missing = catalogue.filter(function (product) {
                var name = String(product).toLowerCase();
                return !Object.keys(owned).some(function (have) {
                    return have.indexOf(name) !== -1 || name.indexOf(have) !== -1;
                });
            });

            if (!missing.length) { return []; }

            return [makeSignal({
                id: "signal-product-gap",
                key: "productGap",
                label: "Product coverage gap",
                direction: "flat",
                statement: "No current usage found in available internal data for: "
                         + missing.join(", ") + ".",
                // Inference from an absence — the weakest evidence there is.
                confidence: conf().LOW,
                category: "commercial",
                evidence: []
            })];
        },

        /**
         * Fleet size stated publicly against the asset count we hold.
         * Only produced when both numbers exist; the website figure is a
         * quoted statement, so this compares like with like only when the
         * statement contains a number we can read.
         */
        fleetDiscrepancy: function (data, facts) {
            var account = data.account;
            var website = data.website;
            if (!account || !website || !website.fleetStatement) { return []; }

            var known = data.geotab && data.geotab.available && data.geotab.deviceCount !== null
                ? data.geotab.deviceCount
                : account.assetCount;
            if (known === null || known === undefined) { return []; }

            // Read the first number out of the quoted statement. If the site
            // stated no number, no comparison is possible and none is made.
            var match = String(website.fleetStatement).replace(/,/g, "").match(/\d{2,}/);
            if (!match) { return []; }

            var stated = Number(match[0]);
            var change = util.pctChange(known, stated);
            if (change === null || Math.abs(change) < 0.15) { return []; }

            var fact = facts.get("website", "fleet");

            return [makeSignal({
                id: "signal-fleet-gap",
                key: "fleetGap",
                label: "Stated fleet exceeds assets on platform",
                direction: change > 0 ? "up" : "down",
                statement: "The customer's website states a fleet of about " + stated
                         + ", while " + known + " assets are recorded against this account. "
                         + "The two figures may count different things.",
                // Two numbers that may not be measuring the same population.
                confidence: conf().LOW,
                category: "growth",
                evidence: [fact].filter(Boolean)
            })];
        }
    };

    // -----------------------------------------------------------------
    // Build
    // -----------------------------------------------------------------

    /**
     * Run every rule. A rule that throws is skipped and logged rather than
     * taking the dashboard down — one bad rule must not cost the user the
     * other fifteen.
     */
    function build(data, facts) {
        var out = [];
        Object.keys(RULES).forEach(function (name) {
            try {
                out = out.concat(util.list(RULES[name](data, facts)));
            } catch (error) {
                console.error("Customer 360: signal rule \"" + name + "\" failed.", error);
            }
        });
        return out;
    }

    /**
     * "What changed" (spec section 22): the subset of signals that represent
     * recent movement, not standing state.
     *
     * A signal qualifies when any fact behind it is inside the recent window,
     * or when the signal is inherently about a change of state.
     */
    function whatChanged(signals) {
        var windowDays = thresholds().recentActivityDays;

        var alwaysChange = ["orderVolume", "publicGrowth", "publicContraction",
                            "leadershipChange", "staleReview", "noReview", "fleetGap"];

        return util.list(signals).filter(function (signal) {
            if (alwaysChange.indexOf(signal.key) !== -1) { return true; }
            return signal.evidence.some(function (fact) {
                var age = util.daysAgo(fact.date);
                return age !== null && age <= windowDays;
            });
        }).map(function (signal) {
            return {
                id: "change-" + signal.id,
                direction: signal.direction,
                label: signal.label,
                statement: signal.statement,
                confidence: signal.confidence,
                category: signal.category,
                evidence: signal.evidence
            };
        });
    }

    return {
        build: build,
        whatChanged: whatChanged,
        RULES: RULES,
        comparableOrderPair: comparableOrderPair,
        openTickets: openTickets,
        openEscalations: openEscalations,
        latestReview: latestReview
    };
}());
