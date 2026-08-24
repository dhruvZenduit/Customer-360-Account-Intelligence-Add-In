/**
 * Customer 360 — PORTFOLIO SCORECARD CONFIGURATION
 * ================================================
 * Every tunable the Customer Portfolio Command Center reads. One file, because
 * the whole point of global rule G8 is that a human can find and argue about a
 * threshold without reading the engine that consumes it.
 *
 * The same rule as `js/core/config.js` applies: this file ships to the browser,
 * so it must never contain an API key, token or credential. The model call in
 * `js/scorecard/ai.js` is a gateway endpoint like every other source.
 *
 * Blocks appear in phase order. Nothing here is a score; everything here is a
 * weight, a threshold, a mapping or a label.
 */

"use strict";

C360.scorecardConfig = {

    /**
     * Bumped whenever a weight, threshold, pattern or mapping below changes.
     *
     * Phase 9 stores this with every feedback record, because "cancellationSignal
     * produced twelve false positives" is only interpretable if you know which
     * version of the patterns produced them.
     */
    version: "1.0.0",

    // =================================================================
    // PHASE 1 — identity, segments, lifecycle
    // =================================================================

    identity: {
        /**
         * A source below this confidence is NOT attached to the account.
         *
         * This is the single most important number in the file. Attaching the
         * wrong company's news to an account destroys trust in every other
         * number on the page, so a loose name match (70%) deliberately does not
         * clear the bar.
         */
        minAttachConfidencePct: 85,

        /** Confidence awarded per match strategy, strongest first. */
        matchConfidence: {
            exactAccountId: 100,
            verifiedDomain: 95,
            billingAccountId: 95,
            geotabDatabase: 95,
            nameAndDomain: 90,
            normalisedName: 70
        },

        /**
         * Order the strategies are attempted in. The first one that matches
         * wins and is recorded as `matchedBy`.
         */
        matchOrder: ["exactAccountId", "verifiedDomain", "billingAccountId",
                     "geotabDatabase", "nameAndDomain", "normalisedName"],

        /**
         * Stripped for COMPARISON only. The display name always comes from CRM —
         * "ABC Logistics Inc." is what the customer calls itself, and the
         * normalised form exists solely so the three spellings of it collapse
         * onto one master id.
         */
        legalSuffixes: ["inc", "inc.", "llc", "l.l.c.", "ltd", "ltd.", "corp",
                        "corporation", "co", "co.", "company", "limited", "plc", "gmbh"],

        /** Source systems an account can be linked into. */
        sourceSystems: ["crm", "emailDomain", "ticketOrg", "quote", "billing",
                        "geotab", "cameraPortal", "contract", "renewal",
                        "website", "external"],

        /** Human labels for the link rows in the Phase 7 evidence drawer. */
        sourceSystemLabels: {
            crm: "CRM Account",
            emailDomain: "Customer Email Domain",
            ticketOrg: "Ticket Organization",
            quote: "Quote / Estimate",
            billing: "Billing Account",
            geotab: "MyGeotab Database",
            cameraPortal: "Camera Portal",
            contract: "Contract",
            renewal: "Renewal Record",
            website: "Customer Website",
            external: "External Research"
        },

        matchLabels: {
            exactAccountId: "Exact Account ID",
            verifiedDomain: "Matched via verified domain",
            billingAccountId: "Matched via billing account ID",
            geotabDatabase: "Matched via MyGeotab database",
            nameAndDomain: "Matched by company name + domain",
            normalisedName: "Matched by company name only"
        }
    },

    /**
     * Per-segment expectations. A Strategic account nobody has reviewed in 100
     * days is overdue; a Small Business account at the same age is not. Any
     * engine that wants a review cadence reads it from here — the global
     * `config.thresholds.staleReviewDays` stays as the fallback default.
     */
    accountSegmentRules: {
        "strategic":      { reviewOverdueDays:  90, renewalWindowDays: 120, label: "Strategic / Enterprise", strategicWeight: 100 },
        "mid-market":     { reviewOverdueDays: 120, renewalWindowDays:  90, label: "Mid-Market",             strategicWeight: 65 },
        "small-business": { reviewOverdueDays: 180, renewalWindowDays:  60, label: "Small Business",         strategicWeight: 35 },
        "new-onboarding": { reviewOverdueDays:  30, renewalWindowDays:  90, label: "New Onboarding",         strategicWeight: 55 },
        "long-term":      { reviewOverdueDays: 150, renewalWindowDays:  90, label: "Long-Term Customer",     strategicWeight: 70 },
        "suspended":      { reviewOverdueDays: null, renewalWindowDays: null, label: "Suspended",            strategicWeight: 40 },
        "seasonal":       { reviewOverdueDays: 180, renewalWindowDays:  90, label: "Seasonal",               strategicWeight: 45 }
    },

    defaultSegment: "mid-market",

    /**
     * Evidence-driven segment resolution. `account.segment` on the CRM record
     * always wins; these rules only run when the CRM did not say.
     */
    segmentRules: {
        /** Newer than this and the account is still onboarding. */
        newOnboardingWithinDays: 120,
        /** A customer for longer than this is a long-term customer. */
        longTermAfterDays: 1095,
        /** Asset-count bands used when the CRM records no segment. */
        assetBands: [
            { min: 500, segment: "strategic" },
            { min: 100, segment: "mid-market" },
            { min: 0,   segment: "small-business" }
        ]
    },

    lifecycleStages: ["onboarding", "adoption", "mature", "expansion",
                      "renewal", "at-risk", "churned", "suspended"],

    lifecycleLabels: {
        onboarding: "Onboarding",
        adoption: "Adoption",
        mature: "Mature",
        expansion: "Expansion",
        renewal: "Renewal",
        "at-risk": "At Risk",
        churned: "Churned",
        suspended: "Suspended",
        unknown: "Unknown"
    },

    /**
     * Lifecycle is derived from evidence, never guessed. These are the windows
     * the evidence is measured against.
     */
    lifecycleRules: {
        onboardingWithinDays: 90,
        adoptionWithinDays: 270,
        renewalWindowDays: 90,
        /** Statuses that put an account straight into a terminal stage. */
        suspendedStatuses: ["suspended", "on hold", "hold"],
        churnedStatuses: ["cancelled", "canceled", "churned", "terminated", "closed"]
    },

    // =================================================================
    // PHASE 2 — health + data confidence
    // =================================================================

    health: {
        weights: {
            product:      0.25,
            support:      0.20,
            relationship: 0.20,
            commercial:   0.25,
            outcomes:     0.10
        },

        categoryLabels: {
            product:      "Product & Device Health",
            support:      "Support & Service Health",
            relationship: "Engagement & Relationship",
            commercial:   "Commercial & Retention",
            outcomes:     "Outcomes & Value"
        },

        /** Bands used for the label under the score. */
        bands: [
            { min: 70, label: "HEALTHY",  tone: "good"  },
            { min: 40, label: "AT RISK",  tone: "watch" },
            { min:  0, label: "CRITICAL", tone: "bad"   }
        ],

        /**
         * An unavailable category is never scored 0. Either the remaining
         * weights re-normalise to 1.0 (and the breakdown says so), or health is
         * reported unavailable once too few categories have data.
         */
        missingCategoryPolicy: "renormalise",   // "renormalise" | "unavailable"
        minScoredCategories: 3,

        /**
         * A neutral starting point for a category that has data but no signal
         * either way. Not a score of 100 — "nothing is wrong that we can see"
         * is not the same as "everything is excellent".
         */
        neutralCategoryScore: 75,

        /**
         * Sentiment cannot exceed this share of the relationship category while
         * uncorroborated. One short frustrated email is not a retention crisis;
         * a frustrated email plus repeat complaints plus a competitor reference
         * plus an escalation is.
         */
        uncorroboratedSentimentMaxWeight: 0.25,

        /** Signals that corroborate negative sentiment. */
        sentimentCorroboratingKeys: ["repeatIssue", "technicalEscalation",
                                     "billingEscalation", "competitorMention",
                                     "ageingTickets", "downgradeRequest",
                                     "cancellationSignal"],

        /** Device-health signal thresholds. */
        device: {
            notCommunicatingWarnPct: 5,
            notCommunicatingBadPct: 15,
            portalUsageDeclinePct: 20,
            /** Camera availability below this is a warning. */
            cameraAvailabilityWarnPct: 90
        },

        /**
         * Support scoring weights ticket QUALITY, never ticket count.
         *
         * Calibrated so one critical, escalated, SLA-breached ticket lands the
         * category in the low 30s rather than flat on 0. Bottoming out loses the
         * gradient: an account with one such ticket and an account with six
         * would read identically, and the second one is much worse.
         */
        support: {
            severityPenalty: { critical: 30, high: 17, medium: 7, low: 2 },
            slaBreachPenalty: 18,
            repeatIssuePenalty: 12,
            escalationPenalty: 12,
            customerImpactPenalty: 8,
            /** Penalty per week a critical ticket stays open, capped. */
            agePenaltyPerWeek: 3,
            agePenaltyCap: 12,
            /** A resolved ticket is mild evidence that support works. */
            resolvedCredit: 1.5,
            resolvedCreditCap: 12
        },

        relationship: {
            reviewOverduePenalty: 24,
            noReviewPenalty: 18,
            stakeholderGapPenalty: 8,
            stakeholderGapCap: 24,
            negativeSentimentPenalty: 30,
            noRecentContactPenalty: 14,
            /** No recorded contact in this long is a disengagement signal. */
            contactStaleDays: 60
        },

        commercial: {
            cancellationPenalty: 70,
            competitorPenalty: 45,
            downgradePenalty: 35,
            pastDuePenalty: 25,
            renewalApproachingPenalty: 12,
            staleQuotePenalty: 10,
            orderVolumeDownPenalty: 15,
            orderVolumeUpCredit: 8,
            /**
             * Floor the retention-relevant penalties impose regardless of how
             * healthy the order history looks. A cancellation request must not
             * be averaged away by three good quarters.
             */
            retentionSignalCeiling: 30
        },

        outcomes: {
            trainingCompletedCredit: 8,
            recommendationImplementedCredit: 8,
            improvementCredit: 10,
            /** Wording used when there is simply nothing measurable. */
            limitedLabel: "Outcomes data limited"
        },

        confidence: {
            /** Weighting of each confidence input. Must sum to 1. */
            inputs: {
                freshness: 0.25,
                categoryCoverage: 0.25,
                sourceReliability: 0.20,
                identityConfidence: 0.15,
                recentActivity: 0.10,
                conflicts: 0.05
            },

            /** Below this, the UI must lead with the limitation, not the score. */
            lowConfidencePct: 60,

            /**
             * Per-source reliability, 0-1. Internal records are what they are;
             * external research is a match on a company, not a system of record.
             */
            sourceReliability: {
                internal: 1,
                website: 0.8,
                external: 0.6
            },

            /** Freshness horizons reuse the cache TTL classes from config.js. */
            freshnessClassBySource: {
                account: "internal",
                quotes: "internal",
                orders: "internal",
                tickets: "internal",
                billing: "internal",
                technical: "internal",
                reviews: "internal",
                contacts: "internal",
                geotab: "internal",
                deviceHealth: "internal",
                website: "website",
                external: "external"
            },

            /** Source rows rendered in the Phase 7 confidence drawer. */
            sourceRows: [
                { key: "account",      label: "CRM data" },
                { key: "tickets",      label: "Ticket data" },
                { key: "deviceHealth", label: "Device health" },
                { key: "reviews",      label: "Account review" },
                { key: "external",     label: "External research" },
                { key: "contacts",     label: "Contact information" }
            ],

            stateLabels: {
                recent: "Recent",
                ageing: "Ageing",
                stale: "Stale",
                partial: "Partially verified",
                missing: "Not available"
            }
        }
    },

    // =================================================================
    // PHASE 3 — priority + critical overrides
    // =================================================================

    priority: {
        weights: {
            riskSeverity:        0.35,
            timeSensitivity:     0.25,
            strategicImportance: 0.20,
            overdueCommitments:  0.10,
            expansionReadiness:  0.10
        },

        factorLabels: {
            riskSeverity:        "Risk Severity",
            timeSensitivity:     "Time Sensitivity",
            strategicImportance: "Account Value / Strategic Importance",
            overdueCommitments:  "Overdue Commitments",
            expansionReadiness:  "Expansion Readiness"
        },

        /** Score -> level. Override floors are applied on top of this. */
        levelFromScore: [
            { min: 85, level: "P0" },
            { min: 70, level: "P1" },
            { min: 50, level: "P2" },
            { min:  0, level: "P3" }
        ],

        levelLabels: { P0: "Immediate", P1: "High", P2: "Medium", P3: "Routine" },

        /** P0 is most urgent. Used to compare an override floor with a scored level. */
        levelRank: { P0: 0, P1: 1, P2: 2, P3: 3 },

        /** P3 is the default floor — nothing has to fire for an account to be P3. */
        defaultLevel: "P3",

        overrides: {
            p0: ["explicitCancellationRequest", "explicitCompetitorSwitch", "safetyCritical",
                 "hosComplianceCritical", "executiveEscalation", "serviceOutage"],
            p1: ["criticalTicketBeyondSla", "renewalWindowWithNegativeSignals",
                 "overdueCommitment"],
            p2: ["quoteAwaitingResponse", "accountReviewOverdue", "qualifiedExpansion"]
        },

        /**
         * Display labels for the override rules.
         *
         * Written out rather than derived from the rule name, because
         * de-camelCasing produces "Critical Ticket Beyond Sla" — and an
         * interface that mangles its own acronyms reads as unfinished no matter
         * how correct the number beside it is. These are also shorter than the
         * rule names, which matters in a dense queue row.
         */
        overrideLabels: {
            explicitCancellationRequest: "Cancellation signal",
            explicitCompetitorSwitch: "Competitor threat",
            safetyCritical: "Safety incident",
            hosComplianceCritical: "HOS / compliance",
            executiveEscalation: "Executive escalation",
            serviceOutage: "Service outage",
            criticalTicketBeyondSla: "SLA breach",
            renewalWindowWithNegativeSignals: "Renewal risk",
            overdueCommitment: "Overdue commitment",
            quoteAwaitingResponse: "Quote awaiting response",
            accountReviewOverdue: "Account review overdue",
            qualifiedExpansion: "Expansion signal"
        },

        /**
         * Which signals count as "negative" for renewalWindowWithNegativeSignals.
         * Enumerated deliberately: "health is low" is not a negative signal, it
         * is a different number, and coupling the two is what Phase 3 exists to
         * prevent.
         */
        negativeSignalKeys: ["technicalEscalation", "billingEscalation", "repeatIssue",
                             "ageingTickets", "staleReview", "orderVolumeDown",
                             "competitorMention", "downgradeRequest"],

        /**
         * Deterministic detection patterns over unstructured source text.
         * Evidence keeps the matched span, which is what lets a user spot a
         * false positive — and these WILL produce false positives ("we are
         * evaluating our routes"). Phase 9's feedback loop is how they get
         * tuned, which is exactly why they live in config.
         */
        detection: {
            cancellation:      ["cancel", "cancellation", "terminate", "terminating",
                                "not renewing", "end our contract"],
            competitorSwitch:  ["switching to", "moving to", "evaluating", "competitor", "rfp"],
            executiveEscalation: ["escalated to", "our ceo", "our vp", "executive"],
            downgrade:         ["downgrade", "reduce", "fewer vehicles", "scale back"],
            /**
             * Deliberately narrow. A bare "safety" matched a review topic of
             * "Safety programme rollout" and a news item announcing a new
             * Director of Safety, and fired a P0 on both — a planned programme
             * and a hire are not incidents. Patterns here have to describe
             * something that HAPPENED.
             */
            safety:            ["safety incident", "safety critical", "safety failure",
                                "collision", "accident", "injury", "unsafe",
                                "safety alerts not", "near miss"],
            hosCompliance:     ["hours of service", "dot audit", "compliance violation",
                                "eld mandate", "hos records incomplete", "hos violation"],
            outage:            ["outage", "system down", "platform down", "total loss of service"],
            negativeSentiment: ["frustrated", "unacceptable", "disappointed", "third time",
                                "still not fixed", "losing patience"]
        },

        /** Text fields on a record that detection is allowed to read. */
        detectionFields: ["subject", "summary", "body", "statement", "detail", "note",
                          "customerImpact", "title"],

        /**
         * WHICH RECORD CLASSES each pattern set may read.
         *
         * Scoping matters as much as the patterns do. An operational incident is
         * recorded on a ticket or an escalation; a customer intention is
         * expressed in a communication or captured in a review's concerns. Let
         * the safety patterns read reviews and a QBR topic of "Safety programme
         * rollout" becomes a P0 — which is a false positive severe enough to
         * make the whole override engine untrustworthy.
         */
        detectionScope: {
            cancellation:        ["communications", "reviews"],
            competitorSwitch:    ["communications", "reviews"],
            executiveEscalation: ["communications", "reviews"],
            downgrade:           ["communications", "reviews"],
            negativeSentiment:   ["communications"],
            safety:              ["tickets", "technicalIssues"],
            hosCompliance:       ["tickets", "technicalIssues"],
            outage:              ["tickets", "technicalIssues"]
        },

        /** Record classes read when a pattern set has no scope entry. */
        defaultDetectionScope: ["communications", "tickets", "reviews",
                                "billingIssues", "technicalIssues"],

        /** SLA hours by ticket severity, for criticalTicketBeyondSla. */
        slaHours: { critical: 24, high: 72, medium: 120, low: 240 },

        /** Priority-factor scoring inputs. */
        factors: {
            riskSeverityScore: { High: 95, Medium: 65, Low: 35 },
            /** Days-to-deadline bands for time sensitivity. */
            timeSensitivityBands: [
                { withinDays: 0,  score: 100 },
                { withinDays: 3,  score: 92 },
                { withinDays: 7,  score: 84 },
                { withinDays: 14, score: 72 },
                { withinDays: 30, score: 60 },
                { withinDays: 60, score: 45 },
                { withinDays: 90, score: 32 }
            ],
            /** No deadline in sight is not urgent, but it is not zero risk either. */
            timeSensitivityFloor: 12,
            overdueCommitmentBase: 55,
            overdueCommitmentPerCommitment: 15,
            overdueCommitmentAgeBonusPerWeek: 5,
            expansionScore: { High: 85, Medium: 60, Low: 35 },
            expansionFloor: 10
        }
    },

    // =================================================================
    // PHASE 4 — action queues
    // =================================================================

    queues: {
        /** SAVE > FIX > GROW > ENGAGE. Retention risk outranks everything else. */
        precedence: ["save", "fix", "grow", "engage"],

        labels: { save: "SAVE", fix: "FIX", grow: "GROW", engage: "ENGAGE" },

        descriptions: {
            save:   "Retention and relationship risk",
            fix:    "Operational and service issues",
            grow:   "Qualified opportunities",
            engage: "Relationship building"
        },

        rules: {
            save: ["cancellationSignal", "competitorThreat", "renewalRisk",
                   "relationshipDeterioration"],
            fix:  ["technicalEscalation", "billingIssue", "deviceProblem",
                   "slaBreach", "overdueSupportIssue"],
            grow: ["fleetExpansion", "newFacility", "newVehicles",
                   "unusedProductOpportunity", "newMarketExpansion"],
            engage: ["accountReviewOverdue", "trainingRequired", "inactiveCustomer",
                     "stakeholderCoverageGap"]
        },

        /** Short label shown on the card. The full recommendation comes from Phase 5. */
        actionLabels: {
            cancellationSignal:        "Prepare retention call",
            competitorThreat:          "Prepare retention strategy",
            renewalRisk:               "Start renewal conversation",
            relationshipDeterioration: "Schedule relationship review",
            technicalEscalation:       "Escalate internally",
            billingIssue:              "Resolve billing issue",
            deviceProblem:             "Generate device audit",
            slaBreach:                 "Escalate internally",
            overdueSupportIssue:       "Chase resolution ETA",
            fleetExpansion:            "Explore expansion",
            newFacility:               "Explore expansion",
            newVehicles:               "Explore expansion",
            unusedProductOpportunity:  "Recommend targeted training",
            newMarketExpansion:        "Explore expansion",
            accountReviewOverdue:      "Prepare account brief",
            trainingRequired:          "Recommend targeted training",
            inactiveCustomer:          "Re-engage account",
            stakeholderCoverageGap:    "Identify missing stakeholders"
        },

        /**
         * A GROW entry requires a QUALIFIED opportunity. "No usage found for
         * product X" is a gap in our own catalogue coverage, not a customer
         * intention, and treating it as one is how a pipeline gets filled with
         * imaginary demand.
         */
        growRequiresQualifiedOpportunity: true,

        /** Opportunity confidence that counts as qualified. */
        qualifiedOpportunityConfidence: ["High", "Medium"],

        /** Relationship deterioration needs corroboration, not one bad email. */
        relationshipDeteriorationMinSignals: 2,

        /** No recorded activity in this long makes an account inactive. */
        inactiveDays: 120
    },

    // =================================================================
    // PHASE 5 — recommended actions
    // =================================================================

    actions: {
        /** Signal/rule -> ordered steps. Data, not branches. */
        mappings: {
            cancellationSignal: {
                steps: ["Call customer", "Identify root cause", "Review contract",
                        "Prepare retention options"],
                owners: ["Account Manager"], drafts: ["customerEmail", "internalEscalation"]
            },
            criticalTicketBeyondSla: {
                steps: ["Escalate internally", "Obtain ETA", "Prepare proactive customer update"],
                owners: ["Account Manager", "Technical Support"],
                drafts: ["internalEscalation", "customerEmail"]
            },
            inactiveQuote: {
                steps: ["Draft follow-up", "Identify decision blocker"],
                owners: ["Sales"], drafts: ["followUpMessage"]
            },
            accountReviewOverdue: {
                steps: ["Prepare account brief", "Prepare meeting agenda", "Recommend review"],
                owners: ["Account Manager"], drafts: ["meetingAgenda"]
            },
            deviceHealthProblem: {
                steps: ["Generate device audit", "Identify affected vehicles",
                        "Create troubleshooting plan"],
                owners: ["Technical Support"], drafts: []
            },
            portalAdoptionDecline: {
                steps: ["Recommend targeted training", "Identify unused features"],
                owners: ["Customer Success"], drafts: ["customerEmail"]
            },
            safetyConcern: {
                steps: ["Prepare camera/coaching/safety recommendation"],
                owners: ["Customer Success"], drafts: []
            },
            competitorSignal: {
                steps: ["Summarize competitor signal", "Identify customer concern",
                        "Summarize current customer value", "Prepare retention strategy"],
                owners: ["Account Manager", "Leadership"], drafts: ["internalEscalation"]
            },
            overdueCommitment: {
                steps: ["Notify owner", "Prepare transparent customer update"],
                owners: ["Account Manager"], drafts: ["customerEmail"]
            },
            expansionReadiness: {
                steps: ["Identify relevant expansion solution", "Build business case"],
                owners: ["Sales"], drafts: ["meetingAgenda"]
            },
            billingIssue: {
                steps: ["Review disputed charge", "Confirm correct billing position",
                        "Prepare customer explanation"],
                owners: ["Billing", "Account Manager"], drafts: ["customerEmail"]
            }
        },

        /**
         * Queue rules that map onto a mapping under a different name. Keeps the
         * mapping table keyed by the ACTION, not by every rule that wants it.
         */
        ruleAliases: {
            competitorThreat: "competitorSignal",
            renewalRisk: "cancellationSignal",
            relationshipDeterioration: "accountReviewOverdue",
            technicalEscalation: "criticalTicketBeyondSla",
            slaBreach: "criticalTicketBeyondSla",
            overdueSupportIssue: "criticalTicketBeyondSla",
            deviceProblem: "deviceHealthProblem",
            fleetExpansion: "expansionReadiness",
            newFacility: "expansionReadiness",
            newVehicles: "expansionReadiness",
            newMarketExpansion: "expansionReadiness",
            unusedProductOpportunity: "portalAdoptionDecline",
            trainingRequired: "portalAdoptionDecline",
            inactiveCustomer: "accountReviewOverdue",
            stakeholderCoverageGap: "accountReviewOverdue",
            quoteAwaitingResponse: "inactiveQuote"
        },

        owners: ["Sean", "Account Manager", "Customer Success", "Technical Support",
                 "Billing", "Sales", "Product", "Leadership"],
        unassignedLabel: "Unassigned",

        dueDates: {
            P0: { label: "Today",                    businessDays: 0 },
            P1: { label: "Within 1 business day",    businessDays: 1 },
            P2: { label: "Within 3–5 business days", businessDays: 5 },
            P3: { label: "Routine",                  businessDays: null }
        },

        /** A hard deadline nearer than the priority-derived date wins. */
        hardDeadlineAnchors: ["sla", "renewal", "commitment", "quoteExpiry"],

        hardDeadlineLabels: {
            sla: "Before SLA expiry",
            renewal: "Before renewal",
            commitment: "Before committed date",
            quoteExpiry: "Before quote expiry",
            review: "Before next account review"
        },

        /**
         * Follow-up window for an unanswered quote. Distinct from
         * thresholds.staleQuoteDays (30): "should someone follow up?" and "is
         * this account's priority elevated?" are different questions.
         */
        quoteFollowUpBusinessDays: 5,

        /** Business-day arithmetic skips weekends. Holidays are additive here. */
        holidays: [],

        drafts: {
            kinds: ["customerEmail", "internalEscalation", "meetingAgenda", "followUpMessage"],
            kindLabels: {
                customerEmail: "Draft customer email",
                internalEscalation: "Draft internal escalation",
                meetingAgenda: "Draft meeting agenda",
                followUpMessage: "Draft follow-up message"
            },
            /** No send path exists before Phase 8, and it stays off after it. */
            sendingEnabled: false,
            requireVerifiedContact: true,
            /** Contact confidence levels that count as verified. */
            verifiedContactConfidence: ["Confirmed"],
            disabledSendReason: "No outbound integration is connected. Sending is disabled."
        },

        /** Emit nothing rather than a generic action. */
        allowGenericFallback: false,

        confidence: {
            /** Recommendation confidence follows the weakest evidence behind it. */
            highRequiresDirectRecord: true
        }
    },

    // =================================================================
    // PHASE 6 — portfolio command center
    // =================================================================

    portfolio: {
        topPriorityCount: 10,

        /** Ties on priority score break by health ascending, then renewal date ascending. */
        topPriorityTieBreakers: ["healthAsc", "renewalDateAsc"],

        /** Max reasons shown per top-priority row before "+N more". */
        maxReasonsPerRow: 3,

        /** Signal keys rolled up into the Portfolio Signals panel. */
        portfolioSignals: [
            { key: "expansionSignal",       label: "accounts showing expansion signals",     tone: "up"   },
            { key: "slaBreach",             label: "accounts have unresolved SLA breaches",  tone: "warn" },
            { key: "cancellationSignal",    label: "accounts have cancellation signals",     tone: "warn" },
            { key: "quoteAwaitingResponse", label: "accounts have quotes awaiting response", tone: "up"   },
            { key: "decliningEngagement",   label: "accounts show declining engagement",     tone: "down" }
        ],

        filters: {
            priority: ["all", "P0", "P1", "P2", "P3"],
            queue:    ["save", "fix", "grow", "engage"],
            health:   ["healthy", "atRisk", "critical", "unavailable"],
            segment:  ["strategic", "mid-market", "small-business"],
            theme:    ["renewal", "expansion", "support"]
        },

        filterLabels: {
            healthy: "Healthy", atRisk: "At Risk", critical: "Critical",
            unavailable: "Health unavailable",
            "strategic": "Strategic", "mid-market": "Mid-Market",
            "small-business": "Small Business",
            renewal: "Renewal", expansion: "Expansion", support: "Support",
            save: "Save", fix: "Fix", grow: "Grow", engage: "Engage", all: "All"
        },

        sorts: ["priority", "health", "accountValue", "renewalDate", "lastActivity",
                "risk", "opportunity"],
        sortLabels: {
            priority: "Priority", health: "Health", accountValue: "Account Value",
            renewalDate: "Renewal Date", lastActivity: "Last Activity",
            risk: "Risk", opportunity: "Opportunity"
        },
        defaultSort: "priority",

        /** Label that stops the four queue counts being read as a total. */
        noQueueLabel: "accounts need no action today",

        refresh: {
            scheduledLocalTime: "08:00",
            /** Manual only until a scheduler exists. Never a continuously running model. */
            mode: "manual",
            maxConcurrentAccounts: 4,
            /** Render partial results rather than failing the whole screen. */
            renderOnPartialFailure: true
        },

        /** How many prior portfolio runs are retained for "what changed" deltas. */
        historyRuns: 2
    },

    // =================================================================
    // PHASE 7 — display + explainability
    // =================================================================

    display: {
        /** Evidence grouping order in the drawer. */
        evidenceGroups: ["internal", "commercial", "communication", "external"],

        evidenceGroupLabels: {
            internal:      "Internal",
            commercial:    "Commercial",
            communication: "Communication",
            external:      "External"
        },

        /** Which record types land in which evidence group. */
        evidenceGroupByRecordType: {
            ticket: "internal",
            escalation: "internal",
            device: "internal",
            sla: "internal",
            quote: "commercial",
            order: "commercial",
            renewal: "commercial",
            contract: "commercial",
            commitment: "commercial",
            communication: "communication",
            email: "communication",
            review: "communication",
            news: "external",
            "website-signal": "external",
            website: "external"
        },

        /** Show identity confidence next to external evidence. */
        showIdentityConfidenceOnExternal: true,

        /** Drawers open on click, and are keyboard reachable. */
        drawersCollapsedByDefault: true,

        /** Decimal places in the breakdown arithmetic. */
        breakdownDecimals: 2,

        /** Below this confidence, lead with limitations rather than the score. */
        leadWithLimitationsBelowPct: 60,

        emptyEvidenceLabel: "No supporting records",
        unavailableLabel: "Data unavailable",
        noHistoryLabel: "Score history is not yet available for this account.",
        renormalisedNotice: "Weights re-normalised across the categories that have data."
    },

    // =================================================================
    // PHASE 8 — AI layer + approval gate
    // =================================================================

    ai: {
        /** Master switch. Off means the whole product still works, deterministically. */
        enabled: false,

        /** The model call is a gateway endpoint. No provider SDK in the client. */
        gatewayPath: "/ai/interpret",

        /** Only these tasks may be sent to a model. */
        allowedTasks: ["extractSignals", "summariseHistory", "interpretNotes",
                       "interpretEmail", "explainPriority", "generateActionPlan",
                       "draftCommunication", "prepareMeetingAgenda"],

        /** Explicitly forbidden. Enforced in code, not just documented. */
        forbiddenTasks: ["calculateHealth", "calculatePriority", "assignScore",
                         "sendCommunication", "modifyRecord"],

        /** Every model statement must cite at least one source record. */
        requireSourceRecords: true,

        /** Drop output whose factual claims are absent from the supplied context. */
        validateClaimsAgainstContext: true,

        /** Visible marker for model-derived content. */
        provenanceLabel: "AI-derived",
        provenanceValues: ["record", "derived", "model"],

        timeoutMs: 20000,
        maxRetries: 1,

        /** Degrade visibly to the deterministic fallback. */
        fallbackOnFailure: true,
        fallbackNotice: "AI summary unavailable — showing rule-based summary."
    },

    approval: {
        /** Actions that can never happen without an approval record. */
        gatedActions: ["sendCustomerEmail", "cancelContract", "changePricing", "issueCredit",
                       "modifyDevice", "writeCrmRecord", "closeTicket", "changeSubscription",
                       "commitToCustomer"],

        /** Still false after Phase 8. Enabling it is a separate, reviewed decision. */
        sendingEnabled: false,

        requireApprovalRecord: true,
        allowBulkApproval: false,
        allowAutoApproval: false,

        /** Re-validate human edits before approval. */
        revalidateEditedDrafts: true,

        noOutboundReason: "No outbound integration is connected, and sending is disabled in config."
    },

    // =================================================================
    // PHASE 9 — feedback + metrics
    // =================================================================

    feedback: {
        labels: {
            useful:         "Useful",
            incorrect:      "Incorrect",
            notNeeded:      "Not needed",
            alreadyHandled: "Already handled"
        },

        /**
         * The four outcomes are deliberately not collapsible into thumbs
         * up/down. Each one indicts something different: `incorrect` indicts
         * the signal rule, `notNeeded` the action mapping, `alreadyHandled`
         * the data freshness.
         */
        indicts: {
            useful: null,
            incorrect: "signal rule",
            notNeeded: "action mapping",
            alreadyHandled: "data freshness"
        },

        /** Ask for a reason on these. */
        promptForReasonOn: ["incorrect", "notNeeded"],

        /** Captured with every feedback record so old feedback stays interpretable. */
        captureContext: ["ruleId", "evidenceIds", "healthScore", "priorityScore",
                         "priorityLevel", "queue", "configVersion", "asOfDate"],

        /** Feedback never mutates a score or suppresses a rule automatically. */
        autoSuppressRules: false,

        /** Dismissal retains the record. */
        retainDismissed: true,

        /** "local" until a gateway write endpoint exists. The UI must say which. */
        storage: "local",
        localOnlyNotice: "Feedback is stored in this browser session only.",
        gatewayPath: "/feedback"
    },

    metrics: {
        tracked: ["hoursSaved", "recommendationsAccepted", "recommendationsRejected",
                  "falsePositivePriorityRate", "atRiskIdentified", "criticalResponseTime",
                  "accountReviewsCompleted", "quotesProgressed", "retentionInfluenced",
                  "expansionInfluenced"],

        labels: {
            hoursSaved: "Estimated hours saved",
            recommendationsAccepted: "Recommendations accepted",
            recommendationsRejected: "Recommendations rejected",
            falsePositivePriorityRate: "False-positive priority rate",
            atRiskIdentified: "At-risk customers identified",
            criticalResponseTime: "Critical response time",
            accountReviewsCompleted: "Account reviews completed",
            quotesProgressed: "Quotes progressed",
            retentionInfluenced: "Retention influenced",
            expansionInfluenced: "Expansion influenced"
        },

        /** Hours saved is an ESTIMATE from this constant. Always labelled as such. */
        estimatedMinutesSavedPerAction: 20,
        hoursSavedLabel: "Estimated hours saved",
        estimateNotice: "Estimate derived from a fixed per-action constant, not measured.",

        /** False-positive rate is reported per rule, never only globally. */
        falsePositiveRateByRule: true,

        /** Metrics that are correlation only. The UI must say so. */
        correlationOnly: ["retentionInfluenced", "expansionInfluenced",
                          "accountReviewsCompleted", "quotesProgressed"],
        correlationNotice: "Correlation only — not attributed to this system.",

        /** A metric without inputs reports this, never 0. */
        notMeasurableLabel: "Not yet measurable",

        /** No predictive modelling at MVP. */
        predictiveModelling: false
    }
};
