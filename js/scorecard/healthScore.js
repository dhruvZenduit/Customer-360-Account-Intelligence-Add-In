/**
 * Customer 360 — HEALTH ENGINE  (Phase 2)
 * =======================================
 * A deterministic 0-100 health score from five independently scored categories.
 *
 *     Product & Device Health    25%
 *     Support & Service Health   20%
 *     Engagement & Relationship  20%
 *     Commercial & Retention     25%
 *     Outcomes & Value           10%
 *
 * Three rules do most of the work here, and each one exists because the obvious
 * implementation is wrong:
 *
 *   MISSING IS NOT ZERO (G3). An account with no device-health feed is not an
 *   account with terrible device health. An unavailable category is excluded,
 *   the remaining weights re-normalise, and the GAP is reflected in confidence.
 *   `Health 61 (confidence 54%)` is honest; `Health 46` because a feed is
 *   missing is a lie the user cannot detect.
 *
 *   SUPPORT IS NOT A TICKET COUNT. Twenty resolved low-severity tickets is a
 *   customer who gets helped. One critical unresolved ticket past SLA is a
 *   customer who does not. Scoring by count inverts both.
 *
 *   SENTIMENT ALONE IS CAPPED. One short frustrated email is not a retention
 *   crisis. Uncorroborated sentiment cannot exceed
 *   `health.uncorroboratedSentimentMaxWeight` of the relationship category
 *   until another signal agrees with it.
 *
 * Every category carries the signals that produced it and a one-line `basis`.
 * A category score with no signal list is a bug, not a terse success.
 *
 * Pure: `asOf` is injected. This file never reads the clock, and it never sees
 * the priority score — the independence Phase 3 depends on starts here.
 */

"use strict";

C360.healthScore = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig.health; }
    function ev() { return C360.evidence; }

    /** Clamp to the 0-100 range every category promises. */
    function clamp(value) {
        if (value === null || value === undefined || isNaN(value)) { return null; }
        return Math.max(0, Math.min(100, value));
    }

    function signal(tone, text, evidence, basisNote) {
        return {
            /** good | warn | bad | info — never colour alone in the UI. */
            tone: tone,
            text: text,
            evidence: util.list(evidence),
            note: basisNote || null
        };
    }

    /**
     * A category result. `available: false` means we had nothing to judge —
     * `score` is null, and the caller must not substitute a number for it.
     */
    function category(key, spec) {
        return {
            key: key,
            label: cfg().categoryLabels[key] || util.humanize(key),
            score: spec.available ? clamp(spec.score) : null,
            available: spec.available === true,
            signals: util.list(spec.signals),
            basis: spec.basis,
            /** Why the category could not be scored, when it could not be. */
            unavailableReason: spec.available ? null : (spec.unavailableReason || null)
        };
    }

    /** Index signals from js/intelligence/signals.js by key. */
    function indexSignals(signals) {
        var index = {};
        util.list(signals).forEach(function (item) {
            index[item.key] = index[item.key] || [];
            index[item.key].push(item);
        });
        return index;
    }

    function hasSignal(index, key) {
        return !!(index[key] && index[key].length);
    }

    // =================================================================
    // 1. Product & Device Health — 25%
    // =================================================================

    /**
     * Reads the device-health feed and portal usage. When neither exists this
     * category is unavailable — NOT zero, and not "healthy by default" either.
     * The only device-side source in the add-in today is geotabService, so
     * whatever it cannot supply genuinely does not exist.
     */
    function product(bundle, index, asOf) {
        var device = bundle.deviceHealth || null;
        var portal = bundle.portalUsage || null;
        var geotab = bundle.geotab || null;
        var limits = cfg().device;
        var signals = [];
        var score = cfg().neutralCategoryScore;
        var reasons = [];

        var haveDevice = !!(device && device.available);
        var havePortal = !!(portal && portal.available);
        var haveGeotab = !!(geotab && geotab.available && geotab.deviceCount !== null);

        if (!haveDevice && !havePortal && !haveGeotab) {
            return category("product", {
                available: false,
                unavailableReason: "No device-health feed, portal-usage feed or MyGeotab session "
                                 + "is available for this account.",
                basis: "Device and product data unavailable, so this category is excluded from "
                     + "the weighted score rather than scored as zero.",
                signals: []
            });
        }

        if (haveDevice) {
            var total = device.deviceCount;
            var down = device.notCommunicating;

            if (total !== null && total !== undefined && total > 0
                && down !== null && down !== undefined) {
                var pct = (down / total) * 100;
                var deviceEvidence = [ev().make({
                    label: down + " of " + total + " devices not communicating",
                    type: "device",
                    id: device.id || "device-health",
                    date: device.asOf || null,
                    source: "internal",
                    sourceLabel: device.sourceLabel || "Device health",
                    mock: device.mock === true
                })];

                if (pct >= limits.notCommunicatingBadPct) {
                    // Scaled, not a flat penalty: 40% of a fleet dark is a
                    // different problem from 16%.
                    var overshoot = Math.min(1, (pct - limits.notCommunicatingBadPct) / 25);
                    score -= 35 + (overshoot * 25);
                    signals.push(signal("bad",
                        Math.round(pct) + "% of devices not communicating", deviceEvidence));
                    reasons.push(Math.round(pct) + "% of devices not communicating");
                } else if (pct >= limits.notCommunicatingWarnPct) {
                    score -= 18;
                    signals.push(signal("warn",
                        Math.round(pct) + "% of devices not communicating", deviceEvidence));
                    reasons.push(Math.round(pct) + "% of devices not communicating");
                } else {
                    score += 8;
                    signals.push(signal("good",
                        "Device connectivity healthy (" + Math.round(pct) + "% not communicating)",
                        deviceEvidence));
                }
            }

            if (device.cameraAvailabilityPct !== null && device.cameraAvailabilityPct !== undefined) {
                var camEvidence = [ev().make({
                    label: "Camera availability " + device.cameraAvailabilityPct + "%",
                    type: "device",
                    id: (device.id || "device-health") + "-cameras",
                    date: device.asOf || null,
                    source: "internal",
                    sourceLabel: device.sourceLabel || "Device health",
                    mock: device.mock === true
                })];

                if (device.cameraAvailabilityPct < limits.cameraAvailabilityWarnPct) {
                    score -= 15;
                    signals.push(signal("warn",
                        "Camera availability " + device.cameraAvailabilityPct + "%", camEvidence));
                    reasons.push("camera availability below "
                        + limits.cameraAvailabilityWarnPct + "%");
                } else {
                    signals.push(signal("good", "Camera availability healthy", camEvidence));
                }
            }
        }

        if (havePortal && portal.changePct !== null && portal.changePct !== undefined) {
            var portalEvidence = [ev().make({
                label: "Portal usage " + (portal.changePct < 0 ? "down " : "up ")
                     + Math.abs(Math.round(portal.changePct)) + "%",
                type: "device",
                id: "portal-usage",
                date: portal.asOf || null,
                source: "internal",
                sourceLabel: portal.sourceLabel || "Portal usage",
                mock: portal.mock === true
            })];

            if (portal.changePct <= -limits.portalUsageDeclinePct) {
                score -= 16;
                signals.push(signal("warn", "Portal usage declining", portalEvidence));
                reasons.push("portal usage declining");
            } else {
                signals.push(signal("good", "Portal usage stable", portalEvidence));
            }
        }

        if (bundle.hosActivity && bundle.hosActivity.available) {
            var hosOk = bundle.hosActivity.state === "stable";
            if (!hosOk) { score -= 12; reasons.push("HOS activity unstable"); }
            signals.push(signal(hosOk ? "good" : "warn",
                "HOS activity " + (bundle.hosActivity.state || "state not recorded"),
                [ev().make({
                    label: "HOS activity " + (bundle.hosActivity.state || "unrecorded"),
                    type: "device",
                    id: "hos-activity",
                    date: bundle.hosActivity.asOf || null,
                    source: "internal",
                    sourceLabel: "HOS activity"
                })]));
        }

        // A category with data but no signal either way still needs a signal
        // list, so the UI never renders a bare number.
        if (!signals.length) {
            signals.push(signal("info",
                "Device data present but no connectivity, camera or usage metric was reported",
                haveGeotab ? [ev().make({
                    label: util.plural(geotab.deviceCount, "device") + " on the MyGeotab database",
                    type: "device",
                    id: "geotab-" + (geotab.database || "session"),
                    source: "internal",
                    sourceLabel: "MyGeotab assets"
                })] : []));
        }

        return category("product", {
            available: true,
            score: score,
            signals: signals,
            basis: reasons.length
                ? "Scored from device connectivity, camera availability and portal usage: "
                  + reasons.join("; ") + "."
                : "Device and usage metrics available and within configured thresholds."
        });
    }

    // =================================================================
    // 2. Support & Service Health — 20%
    // =================================================================

    /**
     * Weighted by severity, age, recurrence, SLA breach, escalation and
     * recorded customer impact. Never by count.
     *
     * The test that matters: an account with twenty resolved low-severity
     * tickets must score HIGHER than an account with one critical unresolved
     * ticket. Doubling the ticket count at constant severity must barely move
     * the number.
     */
    function support(bundle, index, asOf) {
        var tickets = util.list(bundle.tickets);
        var billing = util.list(bundle.billingIssues);
        var technical = util.list(bundle.technicalIssues);
        var weights = cfg().support;
        var slaHours = C360.scorecardConfig.priority.slaHours;

        if (!tickets.length && !billing.length && !technical.length) {
            return category("support", {
                available: false,
                unavailableReason: "No ticket, billing-escalation or technical-escalation records "
                                 + "are available for this account.",
                basis: "No support records available, so this category is excluded rather than "
                     + "scored as zero — a customer who has never raised a ticket is not a "
                     + "customer with bad support.",
                signals: []
            });
        }

        var signals = [];
        var score = 100;
        var reasons = [];

        var open = tickets.filter(function (ticket) { return ticket.isOpen; });
        var resolved = tickets.filter(function (ticket) { return !ticket.isOpen; });

        // ---- Open tickets, weighted by what they actually are -----------
        open.forEach(function (ticket) {
            var severity = String(ticket.priority || "medium").toLowerCase();
            var penalty = weights.severityPenalty[severity];
            if (penalty === undefined) { penalty = weights.severityPenalty.medium; }

            var age = util.daysAgo(ticket.opened, asOf);
            var agePenalty = 0;
            if (age !== null && age > 0) {
                agePenalty = Math.min(weights.agePenaltyCap,
                    (age / 7) * weights.agePenaltyPerWeek);
            }

            var slaLimitHours = slaHours[severity];
            var breached = slaLimitHours !== undefined && age !== null
                        && (age * 24) > slaLimitHours;

            var total = penalty + agePenalty
                      + (breached ? weights.slaBreachPenalty : 0)
                      + (ticket.escalated ? weights.escalationPenalty : 0);

            score -= total;

            var text = util.humanize(severity) + " ticket " + ticket.number
                     + (age !== null ? " open " + age + " days" : " open")
                     + (breached ? ", SLA breached" : "")
                     + (ticket.escalated ? ", escalated" : "");

            signals.push(signal(
                severity === "critical" || breached ? "bad" : "warn",
                text,
                [ev().make({
                    label: "Ticket " + ticket.number + " — " + (ticket.subject || "no subject"),
                    type: "ticket",
                    id: ticket.id,
                    date: ticket.opened,
                    url: ticket.url,
                    source: "internal",
                    sourceLabel: ticket.sourceLabel,
                    mock: ticket.mock
                })]));

            if (breached) { reasons.push("ticket " + ticket.number + " past SLA"); }
        });

        // ---- Recurrence ------------------------------------------------
        util.list(index.repeatIssue).forEach(function (item) {
            score -= weights.repeatIssuePenalty;
            reasons.push("recurring " + (item.label || "issue").toLowerCase());
            signals.push(signal("warn", item.label, ev().fromFacts(item.evidence)));
        });

        // ---- Unresolved escalations ------------------------------------
        C360.signals.openEscalations(billing).forEach(function (issue) {
            score -= weights.escalationPenalty
                   + (issue.customerImpact ? weights.customerImpactPenalty : 0);
            reasons.push("open billing escalation");
            signals.push(signal("bad",
                "Billing escalation unresolved: " + (issue.subject || "no subject recorded"),
                [ev().fromRecord(issue, { type: "escalation" })].filter(Boolean)));
        });

        C360.signals.openEscalations(technical).forEach(function (issue) {
            score -= weights.escalationPenalty
                   + (issue.customerImpact ? weights.customerImpactPenalty : 0);
            reasons.push("open technical escalation");
            signals.push(signal("bad",
                "Technical escalation unresolved: " + (issue.subject || "no subject recorded"),
                [ev().fromRecord(issue, { type: "escalation" })].filter(Boolean)));
        });

        // ---- Credit for tickets that actually got resolved -------------
        // Capped, and small. Resolving tickets is the baseline expectation, not
        // an achievement that offsets an unresolved critical one.
        if (resolved.length) {
            var credit = Math.min(weights.resolvedCreditCap,
                resolved.length * weights.resolvedCredit);
            score += credit;
            signals.push(signal("good",
                util.plural(resolved.length, "lower-priority ticket") + " resolved",
                ev().fromFacts([])));
        }

        if (!signals.length) {
            signals.push(signal("good", "No open support issues on record", []));
        }

        return category("support", {
            available: true,
            score: score,
            signals: signals,
            basis: reasons.length
                ? "Weighted by severity, age, SLA breach, recurrence and escalation: "
                  + reasons.join("; ") + "."
                : util.plural(tickets.length, "ticket") + " on record, none open or breaching SLA."
        });
    }

    // =================================================================
    // 3. Engagement & Relationship — 20%
    // =================================================================

    /**
     * Review cadence comes from the SEGMENT rules (Phase 1), not the global
     * `config.thresholds.staleReviewDays` — that is the whole reason segments
     * exist.
     *
     * The sentiment cap is enforced here rather than documented: negative
     * sentiment with no corroborating signal can only spend
     * `uncorroboratedSentimentMaxWeight` of its penalty.
     */
    function relationship(bundle, index, asOf, segment, roleGaps) {
        var reviews = util.list(bundle.reviews);
        var communications = util.list(bundle.communications);
        var contacts = util.list(bundle.contacts);
        var weights = cfg().relationship;

        if (!reviews.length && !communications.length && !contacts.length) {
            return category("relationship", {
                available: false,
                unavailableReason: "No account review, communication or contact records are "
                                 + "available for this account.",
                basis: "No relationship data available, so this category is excluded rather "
                     + "than scored as zero.",
                signals: []
            });
        }

        var signals = [];
        var score = 100;
        var reasons = [];

        // ---- Review cadence, per segment -------------------------------
        var latest = C360.signals.latestReview(bundle);
        var cadence = segment && segment.rules ? segment.rules.reviewOverdueDays : null;

        if (!latest) {
            score -= weights.noReviewPenalty;
            reasons.push("no account review on record");
            signals.push(signal("warn", "No account review on record", []));
        } else {
            var age = util.daysAgo(latest.date, asOf);
            var reviewEvidence = [ev().fromRecord(latest, {
                type: "review",
                label: (latest.reviewType || "Account review") + " — "
                     + util.formatDate(latest.date)
            })].filter(Boolean);

            if (cadence !== null && cadence !== undefined && age !== null && age > cadence) {
                score -= weights.reviewOverduePenalty;
                reasons.push("account review " + age + " days old against a "
                    + cadence + "-day cadence for " + segment.segmentLabel);
                signals.push(signal("warn",
                    "Account review " + age + " days old (" + segment.segmentLabel
                    + " cadence: " + cadence + " days)", reviewEvidence));
            } else {
                signals.push(signal("good",
                    "Account review " + (age === null ? "on record" : age + " days old")
                    + (cadence ? " (within the " + cadence + "-day cadence)" : ""),
                    reviewEvidence));
            }
        }

        // ---- Stakeholder coverage --------------------------------------
        var gaps = util.list(roleGaps);
        if (gaps.length) {
            var gapPenalty = Math.min(weights.stakeholderGapCap,
                gaps.length * weights.stakeholderGapPenalty);
            score -= gapPenalty;
            reasons.push(util.plural(gaps.length, "stakeholder role") + " with no known contact");
            signals.push(signal("warn",
                "No known contact for: " + gaps.join(", "), []));
        } else if (contacts.length) {
            signals.push(signal("good", "Key stakeholder roles covered", []));
        }

        // ---- Recency of contact ----------------------------------------
        var lastContact = communications.slice().sort(util.byDateDesc)[0] || null;
        if (lastContact) {
            var contactAge = util.daysAgo(lastContact.date, asOf);
            var contactEvidence = [ev().fromRecord(lastContact, {
                type: "communication",
                label: (lastContact.subject || "Communication") + " — "
                     + util.formatDate(lastContact.date)
            })].filter(Boolean);

            if (contactAge !== null && contactAge > weights.contactStaleDays) {
                score -= weights.noRecentContactPenalty;
                reasons.push("no recorded contact in " + contactAge + " days");
                signals.push(signal("warn",
                    "Last recorded contact " + contactAge + " days ago", contactEvidence));
            } else {
                signals.push(signal("good",
                    "Last recorded contact " + util.relativeDays(lastContact.date, asOf),
                    contactEvidence));
            }
        }

        // ---- Sentiment, capped until corroborated ----------------------
        var sentimentHits = C360.detect.across(communications, "negativeSentiment", {
            type: "communication"
        });

        if (sentimentHits.length) {
            var corroborating = util.list(cfg().sentimentCorroboratingKeys)
                .filter(function (key) { return hasSignal(index, key); });

            var full = weights.negativeSentimentPenalty;
            var applied = corroborating.length
                ? full
                : full * cfg().uncorroboratedSentimentMaxWeight;

            score -= applied;

            var sentimentEvidence = sentimentHits.map(function (hit) { return hit.evidence; });

            if (corroborating.length) {
                reasons.push("negative sentiment corroborated by "
                    + corroborating.join(", "));
                signals.push(signal("bad",
                    "Negative sentiment corroborated by " + util.plural(corroborating.length, "other signal"),
                    sentimentEvidence,
                    "Full weight applied because " + corroborating.join(", ")
                        + " point the same way."));
            } else {
                reasons.push("negative sentiment detected but uncorroborated");
                signals.push(signal("warn",
                    "Negative sentiment detected in customer communication",
                    sentimentEvidence,
                    "Capped at " + Math.round(cfg().uncorroboratedSentimentMaxWeight * 100)
                        + "% of its weight: no other signal corroborates it."));
            }
        }

        if (!signals.length) {
            signals.push(signal("info", "Relationship records present but no cadence, "
                + "coverage or sentiment signal was produced", []));
        }

        return category("relationship", {
            available: true,
            score: score,
            signals: signals,
            basis: reasons.length
                ? "Scored from review cadence, stakeholder coverage, contact recency and "
                  + "corroborated sentiment: " + reasons.join("; ") + "."
                : "Review cadence, stakeholder coverage and contact recency all within "
                  + "configured expectations."
        });
    }

    // =================================================================
    // 4. Commercial & Retention — 25%
    // =================================================================

    /**
     * Joint-highest weight, because commercial risk exists independently of
     * product health — and this is the category where that most often bites.
     *
     * `retentionSignalCeiling` is the mechanism: once a cancellation request,
     * competitor switch or downgrade is on record, the category CANNOT score
     * above that ceiling no matter how good the order history looks. A healthy
     * order history masking a cancellation request is the exact failure this
     * category is weighted to prevent.
     */
    function commercial(bundle, index, asOf, segment) {
        var quotes = util.list(bundle.quotes);
        var orders = util.list(bundle.orders);
        var contract = bundle.contract || null;
        var weights = cfg().commercial;

        if (!quotes.length && !orders.length && !contract) {
            return category("commercial", {
                available: false,
                unavailableReason: "No quote, order or contract records are available for "
                                 + "this account.",
                basis: "No commercial data available, so this category is excluded rather "
                     + "than scored as zero.",
                signals: []
            });
        }

        var signals = [];
        var score = 100;
        var reasons = [];
        var retentionSignalFired = false;

        // ---- Retention-relevant signals, read from source text ---------
        var cancellation = C360.detect.inBundle(bundle, "cancellation", { type: "communication" });
        var competitor = C360.detect.inBundle(bundle, "competitorSwitch", { type: "communication" });
        var downgrade = C360.detect.inBundle(bundle, "downgrade", { type: "communication" });

        if (contract && contract.cancellationRequested === true) {
            cancellation = cancellation.concat([{
                excerpt: null,
                evidence: ev().make({
                    label: "Contract record flags a cancellation request",
                    type: "contract",
                    id: contract.id || "contract",
                    date: contract.cancellationRequestedDate || null,
                    source: "internal",
                    sourceLabel: "Contract",
                    mock: contract.mock === true
                })
            }]);
        }

        if (cancellation.length) {
            score -= weights.cancellationPenalty;
            retentionSignalFired = true;
            reasons.push("cancellation language on record");
            signals.push(signal("bad", "Cancellation signal detected",
                cancellation.map(function (hit) { return hit.evidence; })));
        }

        if (competitor.length) {
            score -= weights.competitorPenalty;
            retentionSignalFired = true;
            reasons.push("competitor-switch language on record");
            signals.push(signal("bad", "Competitor switch signal detected",
                competitor.map(function (hit) { return hit.evidence; })));
        }

        if (downgrade.length) {
            score -= weights.downgradePenalty;
            retentionSignalFired = true;
            reasons.push("downgrade language on record");
            signals.push(signal("bad", "Downgrade request detected",
                downgrade.map(function (hit) { return hit.evidence; })));
        }

        // ---- Past-due balance ------------------------------------------
        if (contract && contract.pastDueAmount !== null && contract.pastDueAmount !== undefined
            && contract.pastDueAmount > 0) {
            score -= weights.pastDuePenalty;
            reasons.push("past-due balance of "
                + util.formatMoney(contract.pastDueAmount, contract.currency));
            signals.push(signal("warn",
                "Past-due balance " + util.formatMoney(contract.pastDueAmount, contract.currency),
                [ev().make({
                    label: "Past-due balance "
                         + util.formatMoney(contract.pastDueAmount, contract.currency),
                    type: "contract",
                    id: contract.id || "contract",
                    date: contract.pastDueSince || null,
                    source: "internal",
                    sourceLabel: "Billing account",
                    mock: contract.mock === true
                })]));
        }

        // ---- Renewal window, per segment -------------------------------
        var renewalWindow = segment && segment.rules ? segment.rules.renewalWindowDays : null;
        var renewalIn = contract ? C360.segments.daysUntil(contract.renewalDate, asOf) : null;

        if (renewalIn !== null && renewalWindow !== null && renewalWindow !== undefined
            && renewalIn >= 0 && renewalIn <= renewalWindow) {
            score -= weights.renewalApproachingPenalty;
            reasons.push("renewal in " + renewalIn + " days");
            signals.push(signal("warn",
                "Renewal in " + renewalIn + " days (" + segment.segmentLabel
                + " window: " + renewalWindow + " days)",
                [ev().make({
                    label: "Renewal date " + util.formatDate(contract.renewalDate),
                    type: "renewal",
                    id: (contract.id || "contract") + "-renewal",
                    date: contract.renewalDate,
                    source: "internal",
                    sourceLabel: "Contract",
                    mock: contract.mock === true
                })]));
        } else if (renewalIn !== null && renewalIn >= 0) {
            signals.push(signal("good",
                "Renewal " + renewalIn + " days away, outside the "
                + (renewalWindow === null ? "configured" : renewalWindow + "-day") + " window",
                [ev().make({
                    label: "Renewal date " + util.formatDate(contract.renewalDate),
                    type: "renewal",
                    id: (contract.id || "contract") + "-renewal",
                    date: contract.renewalDate,
                    source: "internal",
                    sourceLabel: "Contract",
                    mock: contract.mock === true
                })]));
        }

        // ---- Quote and order activity ----------------------------------
        if (hasSignal(index, "staleQuotes")) {
            score -= weights.staleQuotePenalty;
            reasons.push("open quote not converting");
            index.staleQuotes.forEach(function (item) {
                signals.push(signal("warn", item.label, ev().fromFacts(item.evidence)));
            });
        }

        util.list(index.orderVolume).forEach(function (item) {
            if (item.direction === "down") {
                score -= weights.orderVolumeDownPenalty;
                reasons.push("order volume decreased");
                signals.push(signal("warn", item.label, ev().fromFacts(item.evidence)));
            } else if (item.direction === "up") {
                score += weights.orderVolumeUpCredit;
                signals.push(signal("good", item.label, ev().fromFacts(item.evidence)));
            }
        });

        if (!signals.length) {
            signals.push(signal("good",
                "Commercial records present with no retention, billing or renewal signal", []));
        }

        // The ceiling. Applied last, so no amount of positive credit can lift
        // an account with a live retention signal back into healthy territory.
        var clamped = clamp(score);
        if (retentionSignalFired && clamped > weights.retentionSignalCeiling) {
            clamped = weights.retentionSignalCeiling;
            reasons.push("capped at " + weights.retentionSignalCeiling
                + " because a retention signal is live");
        }

        return category("commercial", {
            available: true,
            score: clamped,
            signals: signals,
            basis: reasons.length
                ? "Scored from retention signals, billing position, renewal window and "
                  + "commercial activity: " + reasons.join("; ") + "."
                : "Commercial records available with no retention or billing signal."
        });
    }

    // =================================================================
    // 5. Outcomes & Value — 10%
    // =================================================================

    /**
     * The most likely category to be genuinely unmeasurable at MVP, which is
     * what the 10% weight reflects.
     *
     * Critically: an ABSENCE of outcome evidence is not evidence of POOR
     * outcomes. No data means unavailable, reported as
     * `health.outcomes.limitedLabel` — never a low score.
     */
    function outcomes(bundle) {
        var record = bundle.outcomes || null;
        var weights = cfg().outcomes;

        if (!record || record.available !== true) {
            return category("outcomes", {
                available: false,
                unavailableReason: weights.limitedLabel,
                basis: weights.limitedLabel + " — no completed training, implemented "
                     + "recommendation or measured improvement is recorded. An absence of "
                     + "outcome evidence is not evidence of poor outcomes.",
                signals: []
            });
        }

        var signals = [];
        var score = cfg().neutralCategoryScore;
        var reasons = [];

        function outcomeEvidence(label, id, date) {
            return [ev().make({
                label: label,
                type: "review",
                id: id,
                date: date || null,
                source: "internal",
                sourceLabel: record.sourceLabel || "Customer outcomes",
                mock: record.mock === true
            })];
        }

        if (record.trainingCompleted) {
            score += weights.trainingCompletedCredit;
            reasons.push("training completed");
            signals.push(signal("good", "Training completed",
                outcomeEvidence("Training completed", "outcome-training",
                    record.trainingCompletedDate)));
        }

        if (record.recommendationsImplemented) {
            score += weights.recommendationImplementedCredit;
            reasons.push(util.plural(record.recommendationsImplemented, "recommendation")
                + " implemented");
            signals.push(signal("good",
                util.plural(record.recommendationsImplemented, "recommendation") + " implemented",
                outcomeEvidence("Recommendations implemented", "outcome-recommendations", null)));
        }

        util.list(record.improvements).forEach(function (improvement, position) {
            score += weights.improvementCredit;
            reasons.push(improvement.label || "measured improvement");
            signals.push(signal("good",
                improvement.label
                    + (improvement.change ? " (" + improvement.change + ")" : ""),
                outcomeEvidence(improvement.label, "outcome-improvement-" + position,
                    improvement.date)));
        });

        if (!signals.length) {
            return category("outcomes", {
                available: false,
                unavailableReason: weights.limitedLabel,
                basis: weights.limitedLabel + " — the outcomes feed is present but records no "
                     + "completed training, implemented recommendation or measured improvement.",
                signals: []
            });
        }

        return category("outcomes", {
            available: true,
            score: score,
            signals: signals,
            basis: "Scored from recorded customer outcomes: " + reasons.join("; ") + "."
        });
    }

    // =================================================================
    // Weighting
    // =================================================================

    function bandFor(score) {
        var bands = util.list(cfg().bands);
        for (var i = 0; i < bands.length; i++) {
            if (score >= bands[i].min) { return bands[i]; }
        }
        return bands[bands.length - 1] || { label: "CRITICAL", tone: "bad" };
    }

    /**
     * Apply the weights, re-normalising across the categories that have data.
     *
     * The invariant the tests check, and the UI renders: the sum of
     * `contribution` equals `score`, and the sum of `effectiveWeight` equals 1
     * whenever anything is scored at all.
     */
    function weight(categories) {
        var declared = cfg().weights;
        var available = categories.filter(function (item) { return item.available; });
        var excluded = categories.filter(function (item) { return !item.available; });

        var availableWeight = available.reduce(function (total, item) {
            return total + (declared[item.key] || 0);
        }, 0);

        var renormalised = excluded.length > 0 && availableWeight > 0 && availableWeight < 1;

        categories.forEach(function (item) {
            item.weight = declared[item.key] || 0;
            if (!item.available) {
                item.effectiveWeight = 0;
                item.contribution = 0;
                return;
            }
            item.effectiveWeight = availableWeight > 0
                ? item.weight / availableWeight
                : item.weight;
            item.contribution = item.score * item.effectiveWeight;
        });

        var score = categories.reduce(function (total, item) {
            return total + item.contribution;
        }, 0);

        return {
            score: score,
            renormalised: renormalised,
            availableCount: available.length,
            excluded: excluded.map(function (item) { return item.key; })
        };
    }

    // =================================================================
    // Build
    // =================================================================

    /**
     * @param {object} bundle   scorecard bundle (see scorecardEngine.js)
     * @param {Array}  signals  output of C360.signals.build
     * @param {object} identity output of C360.identity.resolve
     * @param {object} segment  output of C360.segments.resolve
     * @param {object} options  { asOf, roleGaps, sourceStates }
     * @returns {object} the health model Phase 7 renders
     */
    function build(bundle, signals, identity, segment, options) {
        var data = bundle || {};
        var opts = options || {};
        var asOf = opts.asOf || null;
        var index = indexSignals(signals);

        var categories = [
            product(data, index, asOf),
            support(data, index, asOf),
            relationship(data, index, asOf, segment, opts.roleGaps),
            commercial(data, index, asOf, segment),
            outcomes(data)
        ];

        var weighted = weight(categories);
        var confidence = C360.confidence.build(data, {
            categories: categories,
            identity: identity,
            asOf: asOf,
            sourceStates: opts.sourceStates,
            signals: signals
        });

        // Too little data to claim a health score at all. Reported as
        // unavailable WITH a reason, never as a low number.
        if (weighted.availableCount < cfg().minScoredCategories) {
            return {
                score: null,
                available: false,
                unavailableReason: "Only " + weighted.availableCount + " of "
                    + categories.length + " health categories have data; at least "
                    + cfg().minScoredCategories + " are required to report a health score.",
                band: null,
                categories: categories,
                excludedCategories: weighted.excluded,
                renormalised: false,
                confidence: confidence
            };
        }

        var band = bandFor(weighted.score);

        return {
            /** Unrounded. The UI rounds; the arithmetic must still reconcile. */
            score: weighted.score,
            available: true,
            unavailableReason: null,
            band: band.label,
            bandTone: band.tone,
            categories: categories,
            excludedCategories: weighted.excluded,
            renormalised: weighted.renormalised,
            confidence: confidence
        };
    }

    return {
        build: build,
        bandFor: bandFor,
        /** Exposed for the per-category tests in tests/scorecard-tests.cjs. */
        categories: {
            product: product,
            support: support,
            relationship: relationship,
            commercial: commercial,
            outcomes: outcomes
        }
    };
}());
