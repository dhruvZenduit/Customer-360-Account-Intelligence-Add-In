/**
 * Customer 360 — RISKS
 * ====================
 * Layer 3a of the intelligence engine.
 *
 * A risk is only ever produced from signals that already exist, so every risk
 * inherits real evidence. There are no risk scores here: a number like "72/100"
 * would imply a calibration this data does not support (spec section 20).
 *
 * SEVERITY is stated as a rule, not a feeling:
 *
 *   High   — an unresolved escalation is involved, OR three or more records
 *            back the same problem
 *   Medium — a single unresolved problem, or a pattern without escalation
 *   Low    — a gap in our own records rather than an observed problem
 *
 * That rule is applied by severityFor() below and shown in the UI tooltip, so
 * a user can disagree with the threshold instead of guessing at it.
 */

"use strict";

C360.risks = (function () {

    var util = C360.util;

    function makeRisk(spec) {
        return {
            id: spec.id,
            title: spec.title,
            category: spec.category,
            severity: spec.severity,
            severityBasis: spec.severityBasis,
            statement: spec.statement,
            confidence: spec.confidence,
            evidence: util.list(spec.evidence)
        };
    }

    /** Index the signal list by key for straightforward lookups. */
    function indexSignals(signals) {
        var index = {};
        util.list(signals).forEach(function (signal) {
            index[signal.key] = index[signal.key] || [];
            index[signal.key].push(signal);
        });
        return index;
    }

    function severityFor(signal, involvesEscalation) {
        if (involvesEscalation) {
            return { severity: "High", basis: "An unresolved escalation is involved." };
        }
        if (signal.evidence.length >= 3) {
            return { severity: "High", basis: util.plural(signal.evidence.length, "record") + " back this." };
        }
        if (signal.evidence.length >= 1) {
            return { severity: "Medium", basis: util.plural(signal.evidence.length, "record") + " backs this." };
        }
        return { severity: "Low", basis: "Based on the absence of a record rather than an observed problem." };
    }

    function build(signals, data) {
        var index = indexSignals(signals);
        var out = [];

        // ---- Technical -------------------------------------------------
        util.list(index.technicalEscalation).forEach(function (signal) {
            var sev = severityFor(signal, true);
            out.push(makeRisk({
                id: "risk-technical-escalation",
                title: "Technical risk",
                category: "support",
                severity: sev.severity,
                severityBasis: sev.basis,
                statement: signal.statement + " Contacting the customer before these are addressed "
                         + "risks walking into a known problem.",
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        util.list(index.ageingTickets).forEach(function (signal) {
            var sev = severityFor(signal, false);
            out.push(makeRisk({
                id: "risk-ageing-tickets",
                title: "Support responsiveness risk",
                category: "support",
                severity: sev.severity,
                severityBasis: sev.basis,
                statement: signal.statement,
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        util.list(index.repeatIssue).forEach(function (signal, i) {
            var sev = severityFor(signal, false);
            out.push(makeRisk({
                id: "risk-repeat-issue-" + i,
                title: "Recurring issue risk",
                category: "support",
                severity: sev.severity,
                severityBasis: sev.basis,
                statement: signal.statement,
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        // ---- Billing ---------------------------------------------------
        util.list(index.billingEscalation).forEach(function (signal) {
            var sev = severityFor(signal, true);
            out.push(makeRisk({
                id: "risk-billing-escalation",
                title: "Billing risk",
                category: "support",
                severity: sev.severity,
                severityBasis: sev.basis,
                statement: signal.statement + " Unresolved billing disputes tend to block renewals "
                         + "and new commercial activity.",
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        // ---- Relationship ----------------------------------------------
        util.list(index.staleReview).forEach(function (signal) {
            var sev = severityFor(signal, false);
            out.push(makeRisk({
                id: "risk-stale-review",
                title: "Relationship risk",
                category: "relationship",
                severity: sev.severity,
                severityBasis: sev.basis,
                statement: signal.statement,
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        util.list(index.noReview).forEach(function (signal) {
            out.push(makeRisk({
                id: "risk-no-review",
                title: "Relationship risk",
                category: "relationship",
                severity: "Low",
                severityBasis: "Based on the absence of a record rather than an observed problem.",
                statement: signal.statement + " The absence of a record does not confirm that no "
                         + "review took place.",
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        // ---- Commercial -------------------------------------------------
        util.list(index.staleQuotes).forEach(function (signal) {
            var sev = severityFor(signal, false);
            out.push(makeRisk({
                id: "risk-stale-quote",
                title: "Commercial risk",
                category: "commercial",
                severity: sev.severity,
                severityBasis: sev.basis,
                statement: signal.statement,
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        util.list(index.orderVolume).forEach(function (signal) {
            if (signal.direction !== "down") { return; }
            var sev = severityFor(signal, false);
            out.push(makeRisk({
                id: "risk-order-decline",
                title: "Commercial risk",
                category: "commercial",
                severity: sev.severity,
                severityBasis: sev.basis,
                statement: signal.statement + " A sustained decline would reduce the account's "
                         + "recurring volume.",
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        util.list(index.publicContraction).forEach(function (signal) {
            var sev = severityFor(signal, false);
            out.push(makeRisk({
                id: "risk-public-contraction",
                title: "Account contraction risk",
                category: "growth",
                severity: sev.severity,
                severityBasis: sev.basis,
                statement: signal.statement + " Reduced customer operations may translate into "
                         + "fewer assets on the platform, though no such reduction has been "
                         + "recorded internally.",
                confidence: signal.confidence,
                evidence: signal.evidence
            }));
        });

        // ---- Customer-stated concerns from the latest review -------------
        var review = C360.signals.latestReview(data);
        if (review && review.concerns.length) {
            out.push(makeRisk({
                id: "risk-review-concerns",
                title: "Customer-stated concerns",
                category: "relationship",
                severity: "Medium",
                severityBasis: "Raised by the customer directly in an account review.",
                statement: "At the " + review.reviewType.toLowerCase() + " on "
                         + util.formatDate(review.date) + " the customer raised: "
                         + review.concerns.join("; ") + ".",
                // The customer said it; that is as direct as evidence gets.
                confidence: C360.config.confidence.HIGH,
                evidence: [{
                    id: "fact-review-" + review.id,
                    statement: review.reviewType + " on " + util.formatDate(review.date),
                    source: "internal",
                    sourceLabel: review.sourceLabel,
                    date: review.date,
                    url: review.url,
                    recordType: "review",
                    recordId: review.id,
                    mock: review.mock
                }]
            }));
        }

        var order = { High: 0, Medium: 1, Low: 2 };
        out.sort(function (a, b) { return order[a.severity] - order[b.severity]; });

        return out;
    }

    return {
        build: build,
        severityFor: severityFor
    };
}());
