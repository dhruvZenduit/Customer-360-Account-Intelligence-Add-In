/**
 * Customer 360 — ACCOUNT HEALTH
 * =============================
 * Four qualitative dimensions: Commercial, Support, Relationship, Growth.
 *
 * DELIBERATELY NOT NUMERIC (spec section 8). A bar reading "Support 60" implies
 * that support health is measurable to within a percentage point and that 60 is
 * meaningfully worse than 65. Neither is true of this data. So each dimension
 * resolves to a named state plus the one-line rule that produced it, and the UI
 * prints both — the user can see the reasoning and disagree with it.
 *
 * If a defensible scoring methodology is ever established, this is the only
 * file that needs to change.
 */

"use strict";

C360.health = (function () {

    var util = C360.util;

    /**
     * tone drives the visual treatment. It is a severity class, never the only
     * carrier of meaning — the state word is always printed alongside it.
     */
    function dimension(name, state, tone, basis, evidence) {
        return {
            dimension: name,
            state: state,
            tone: tone,                 // good | watch | bad | neutral
            basis: basis,
            evidence: util.list(evidence)
        };
    }

    function has(signals, key) {
        return util.list(signals).some(function (signal) { return signal.key === key; });
    }

    function find(signals, key) {
        return util.list(signals).filter(function (signal) { return signal.key === key; });
    }

    function evidenceOf(signals, keys) {
        var out = [];
        util.list(signals).forEach(function (signal) {
            if (keys.indexOf(signal.key) !== -1) { out = out.concat(signal.evidence); }
        });
        return out;
    }

    // -----------------------------------------------------------------

    function commercial(data, signals) {
        var thresholds = C360.config.thresholds;

        var recentOrders = util.list(data.orders).filter(function (order) {
            var age = util.daysAgo(order.date);
            return age !== null && age <= 90;
        });
        var openQuotes = util.list(data.quotes).filter(function (quote) { return quote.isOpen; });
        var declining = find(signals, "orderVolume").some(function (s) { return s.direction === "down"; });
        var growing = find(signals, "orderVolume").some(function (s) { return s.direction === "up"; });

        if (declining) {
            return dimension("Commercial", "At risk", "bad",
                "Latest comparable order is smaller than the previous one.",
                evidenceOf(signals, ["orderVolume"]));
        }
        if (recentOrders.length && (growing || openQuotes.length)) {
            return dimension("Commercial", "Strong", "good",
                util.plural(recentOrders.length, "order") + " in the last 90 days"
                + (openQuotes.length ? " and " + util.plural(openQuotes.length, "open quote") : "") + ".",
                evidenceOf(signals, ["orderVolume", "openQuotes"]));
        }
        if (recentOrders.length || openQuotes.length) {
            return dimension("Commercial", "Steady", "good",
                "Some commercial activity in the last 90 days, without a clear trend.",
                evidenceOf(signals, ["openQuotes"]));
        }
        if (has(signals, "staleQuotes")) {
            return dimension("Commercial", "At risk", "bad",
                "An open quote has gone past the conversion window with no decision recorded.",
                evidenceOf(signals, ["staleQuotes"]));
        }
        return dimension("Commercial", "Quiet", "watch",
            "No orders or open quotes recorded in the last 90 days.", []);
    }

    function support(data, signals) {
        var escalations = C360.signals.openEscalations(data.billingIssues)
            .concat(C360.signals.openEscalations(data.technicalIssues));
        var open = C360.signals.openTickets(data);

        if (escalations.length) {
            return dimension("Support", "At risk", "bad",
                util.plural(escalations.length, "escalation is", "escalations are") + " unresolved.",
                evidenceOf(signals, ["technicalEscalation", "billingEscalation"]));
        }
        if (has(signals, "repeatIssue") || has(signals, "ageingTickets")) {
            return dimension("Support", "Watch", "watch",
                "Open tickets are ageing, or the same issue category keeps recurring.",
                evidenceOf(signals, ["repeatIssue", "ageingTickets"]));
        }
        if (open.length) {
            return dimension("Support", "Healthy", "good",
                util.plural(open.length, "open ticket") + ", none escalated or ageing.", []);
        }
        if (!util.list(data.tickets).length) {
            return dimension("Support", "No activity", "neutral",
                "No tickets recorded for this account in the available data.", []);
        }
        return dimension("Support", "Healthy", "good", "No open tickets.", []);
    }

    function relationship(data, signals) {
        var review = C360.signals.latestReview(data);
        var thresholds = C360.config.thresholds;

        if (!review) {
            return dimension("Relationship", "Unknown", "neutral",
                "No account review is recorded, so relationship health cannot be assessed.", []);
        }

        var age = util.daysAgo(review.date);
        var concerns = review.concerns.length;

        if (age !== null && age > thresholds.staleReviewDays) {
            return dimension("Relationship", "At risk", "bad",
                "Last review was " + age + " days ago.",
                evidenceOf(signals, ["staleReview"]));
        }
        if (concerns) {
            return dimension("Relationship", "Watch", "watch",
                util.plural(concerns, "concern was", "concerns were")
                + " raised at the last review " + util.relativeDays(review.date).toLowerCase() + ".",
                evidenceOf(signals, ["reviewCadence"]));
        }
        if (age !== null && age > thresholds.agingReviewDays) {
            return dimension("Relationship", "Watch", "watch",
                "Last review was " + age + " days ago.",
                evidenceOf(signals, ["reviewCadence"]));
        }
        return dimension("Relationship", "Healthy", "good",
            "Reviewed " + util.relativeDays(review.date).toLowerCase() + " with no concerns recorded.",
            evidenceOf(signals, ["reviewCadence"]));
    }

    function growth(data, signals) {
        var up = has(signals, "publicGrowth")
              || find(signals, "orderVolume").some(function (s) { return s.direction === "up"; });
        var down = has(signals, "publicContraction")
              || find(signals, "orderVolume").some(function (s) { return s.direction === "down"; });

        if (up && down) {
            return dimension("Growth", "Mixed", "watch",
                "Both growth and contraction indicators are present.",
                evidenceOf(signals, ["publicGrowth", "publicContraction", "orderVolume"]));
        }
        if (down) {
            return dimension("Growth", "Negative", "bad",
                "Contraction indicators found in public sources or order history.",
                evidenceOf(signals, ["publicContraction", "orderVolume"]));
        }
        if (up) {
            return dimension("Growth", "Positive", "good",
                "Growth indicators found in public sources or order history.",
                evidenceOf(signals, ["publicGrowth", "orderVolume"]));
        }
        return dimension("Growth", "No signal", "neutral",
            "No growth or contraction indicators found in the available data.", []);
    }

    function build(data, signals) {
        return [
            commercial(data, signals),
            support(data, signals),
            relationship(data, signals),
            growth(data, signals)
        ];
    }

    return { build: build };
}());
