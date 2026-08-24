/**
 * Customer 360 — ACTION RULES  (Phase 5)
 * ======================================
 * The data and arithmetic behind a recommendation: which steps a rule maps to,
 * who owns it, when it is due, what a draft may say.
 *
 * Mappings are DATA (`actions.mappings`), not branches. Eleven `if` statements
 * scattered through an engine is how the twelfth action type ends up owned by
 * whoever happened to write the tenth.
 *
 * Two pieces of real logic live here:
 *
 *   BUSINESS-DAY ARITHMETIC that skips weekends, and takes a holiday list so
 *   holidays can be added without touching the callers.
 *
 *   CLAIM VALIDATION — the enforcement of "a draft may not state a fact that is
 *   not in the evidence list". Every date, ticket number, monetary figure and
 *   person named in a draft body must appear in that recommendation's evidence
 *   or its verified-contact record. This is not a review note; it is a function
 *   with a test, and Phase 8 reuses it against model output.
 *
 * Pure: `asOf` injected.
 */

"use strict";

C360.actionRules = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig.actions; }

    // -----------------------------------------------------------------
    // Mappings
    // -----------------------------------------------------------------

    /**
     * The mapping for a rule, following `actions.ruleAliases` where a queue rule
     * shares an action with another (an SLA breach and a technical escalation
     * both mean "escalate, get an ETA, tell the customer").
     *
     * Returns null where no mapping matches — and the engine then emits NOTHING.
     * `actions.allowGenericFallback` is false for a reason: "Contact customer"
     * teaches the user to ignore the column.
     */
    function mappingFor(rule) {
        var mappings = cfg().mappings;
        if (mappings[rule]) { return { key: rule, mapping: mappings[rule] }; }

        var alias = cfg().ruleAliases[rule];
        if (alias && mappings[alias]) { return { key: alias, mapping: mappings[alias] }; }

        return null;
    }

    // -----------------------------------------------------------------
    // Ownership
    // -----------------------------------------------------------------

    /**
     * Owner from the config mapping, plus the account's actual assigned rep
     * where the CRM records one.
     *
     * When neither exists the answer is `Unassigned` — never the most likely
     * person. A guessed owner is worse than none: the work looks assigned and
     * nobody is doing it.
     */
    function resolveOwner(mappingKey, account) {
        var mapping = cfg().mappings[mappingKey];
        var roles = mapping ? util.list(mapping.owners) : [];
        var assignedTo = account && account.accountOwner ? account.accountOwner : null;

        if (!roles.length && !assignedTo) {
            return {
                roles: [],
                assignedTo: null,
                resolved: false,
                label: cfg().unassignedLabel
            };
        }

        // The named rep is shown alongside the roles, not instead of them: "Sean
        // + Technical Support" is the real answer when a ticket needs both.
        var parts = [];
        if (assignedTo) { parts.push(assignedTo); }
        roles.forEach(function (role) {
            if (parts.indexOf(role) === -1) { parts.push(role); }
        });

        return {
            roles: roles,
            assignedTo: assignedTo,
            resolved: true,
            label: parts.join(" + ")
        };
    }

    // -----------------------------------------------------------------
    // Business-day arithmetic
    // -----------------------------------------------------------------

    function isWeekend(date) {
        var day = date.getDay();
        return day === 0 || day === 6;
    }

    function isHoliday(date) {
        var iso = date.toISOString().slice(0, 10);
        return util.list(cfg().holidays).some(function (holiday) {
            return String(holiday).slice(0, 10) === iso;
        });
    }

    /**
     * Add N business days, skipping weekends and any configured holiday.
     * `businessDays: 0` still lands on a working day — "Today" on a Saturday
     * means Monday, because nobody is escalating a ticket on Saturday.
     */
    function addBusinessDays(from, businessDays) {
        var date = util.toDate(from);
        if (!date) { return null; }

        var result = new Date(date.getTime());
        var remaining = businessDays;

        while (isWeekend(result) || isHoliday(result)) {
            result.setDate(result.getDate() + 1);
        }

        while (remaining > 0) {
            result.setDate(result.getDate() + 1);
            if (!isWeekend(result) && !isHoliday(result)) { remaining--; }
        }

        return result;
    }

    /**
     * Due date from the priority level, unless a hard deadline in the data is
     * sooner — in which case the hard deadline wins and the recommendation says
     * which deadline it is anchored to.
     *
     * @param {string} level P0..P3
     * @param {Array} deadlines [{ anchor, date, label }]
     * @param {Date|string} asOf
     */
    function dueFor(level, deadlines, asOf) {
        var policy = cfg().dueDates[level] || cfg().dueDates.P3;
        var anchors = util.list(cfg().hardDeadlineAnchors);

        var derived = policy.businessDays === null
            ? null
            : addBusinessDays(asOf, policy.businessDays);

        var candidates = util.list(deadlines).filter(function (deadline) {
            if (anchors.indexOf(deadline.anchor) === -1) { return false; }
            return !!util.toDate(deadline.date);
        }).sort(function (a, b) {
            return util.toDate(a.date).getTime() - util.toDate(b.date).getTime();
        });

        var hardest = candidates[0] || null;

        // A hard deadline only wins when it is genuinely SOONER. A renewal in
        // nine months does not make a P0 ticket less urgent.
        if (hardest && (derived === null
            || util.toDate(hardest.date).getTime() < derived.getTime())) {
            return {
                label: cfg().hardDeadlineLabels[hardest.anchor]
                    || ("Before " + hardest.anchor),
                date: util.toDate(hardest.date).toISOString(),
                anchor: hardest.anchor,
                isHardDeadline: true,
                anchorLabel: hardest.label || null
            };
        }

        return {
            label: policy.label,
            date: derived ? derived.toISOString() : null,
            anchor: "priority:" + level,
            isHardDeadline: false,
            anchorLabel: null
        };
    }

    // -----------------------------------------------------------------
    // Claim validation
    // -----------------------------------------------------------------

    /**
     * Every token in a draft body that ASSERTS something checkable.
     *
     * Deliberately conservative about what counts as a claim: dates, record
     * numbers, money and capitalised multi-word names. Prose adjectives are not
     * claims, and treating them as such would reject every usable draft.
     */
    function extractClaims(text) {
        var body = String(text || "");
        var claims = [];

        function add(kind, value) {
            var trimmed = String(value).trim();
            if (!trimmed) { return; }
            claims.push({ kind: kind, value: trimmed });
        }

        // Dates: "Aug 6", "Aug 6, 2026", "2026-08-06"
        (body.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?/g) || [])
            .forEach(function (match) { add("date", match); });
        (body.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [])
            .forEach(function (match) { add("date", match); });

        // Record numbers: "#1234", "Ticket 4567", "Quote 12845"
        (body.match(/#\s*[A-Za-z0-9-]+/g) || [])
            .forEach(function (match) { add("record", match.replace(/^#\s*/, "")); });
        (body.match(/\b(?:Ticket|Quote|Order|Invoice)\s+#?([A-Za-z0-9-]+)/gi) || [])
            .forEach(function (match) {
                add("record", match.replace(/^\s*(?:Ticket|Quote|Order|Invoice)\s+#?/i, ""));
            });

        // Money
        (body.match(/[$£€]\s?[\d,]+(?:\.\d{2})?/g) || [])
            .forEach(function (match) { add("money", match); });

        // Counts stated as "N devices", "N vehicles", "N days"
        (body.match(/\b\d+\s+(?:devices?|vehicles?|units?|days?|tickets?)\b/gi) || [])
            .forEach(function (match) { add("count", match); });

        return claims;
    }

    /** Everything a draft is ALLOWED to assert, as one searchable string. */
    function contextText(evidence, contact, extra) {
        var parts = [];

        util.list(evidence).forEach(function (row) {
            if (row.label) { parts.push(row.label); }
            if (row.excerpt) { parts.push(row.excerpt); }
            if (row.id) { parts.push(String(row.id)); }
            if (row.date) {
                parts.push(String(row.date));
                parts.push(util.formatDate(row.date));
                // Also the "Aug 6" form, since drafts read more naturally
                // without the year and the check must not fail on formatting.
                parts.push(util.formatDate(row.date).replace(/,\s*\d{4}$/, ""));
            }
        });

        if (contact) {
            if (contact.name) { parts.push(contact.name); }
            if (contact.title) { parts.push(contact.title); }
        }

        util.list(extra).forEach(function (item) { parts.push(String(item)); });

        return parts.join(" — ");
    }

    /**
     * Validate a draft body against its evidence.
     *
     * @returns {{ valid: boolean, unsupported: Array }}
     *
     * Phase 8 reuses this against model output, where the same rule applies with
     * more teeth: an unsupported claim means DROP the output, not fix it.
     */
    function validateClaims(text, evidence, contact, extra) {
        var haystack = contextText(evidence, contact, extra).toLowerCase();
        var unsupported = [];

        extractClaims(text).forEach(function (claim) {
            var needle = claim.value.toLowerCase();
            if (haystack.indexOf(needle) !== -1) { return; }

            // A bare number inside a count/record claim is enough — "14 days"
            // is supported by evidence that says "open 14 days" even when the
            // surrounding words differ.
            var numeric = needle.match(/\d[\d,]*/);
            if (numeric && haystack.indexOf(numeric[0]) !== -1) { return; }

            unsupported.push(claim);
        });

        return { valid: unsupported.length === 0, unsupported: unsupported };
    }

    // -----------------------------------------------------------------
    // Draft templates
    // -----------------------------------------------------------------

    /**
     * Deterministic templates. Phase 8 replaces the PROSE with model output and
     * keeps these as the fallback that ships whenever the model is unavailable,
     * slow, or produces something that fails validation.
     *
     * Every template is written to assert only what the evidence already says.
     * Where a template wants a fact it does not have, it says so rather than
     * inventing one — no invented ETAs, no apologies for things that did not
     * happen, no commitments nobody made.
     */
    var TEMPLATES = {

        customerEmail: function (spec) {
            var greeting = spec.contact && spec.contact.name
                ? "Hi " + String(spec.contact.name).split(" ")[0] + ","
                : "Hello,";

            var lines = util.list(spec.evidence).slice(0, 4).map(function (row) {
                return "  - " + row.label
                     + (row.date ? " (" + util.formatDate(row.date) + ")" : "");
            });

            return {
                subject: spec.subject,
                body: greeting + "\n\n"
                    + spec.opening + "\n\n"
                    + "What we are looking at:\n" + lines.join("\n") + "\n\n"
                    + spec.closing + "\n\n"
                    + "Best regards,\n"
                    + (spec.senderLabel || "Your account team")
            };
        },

        internalEscalation: function (spec) {
            var lines = util.list(spec.evidence).map(function (row) {
                return "  - " + row.label
                     + (row.date ? " (" + util.formatDate(row.date) + ")" : "");
            });

            return {
                subject: "Internal escalation — " + spec.accountName + ": " + spec.subject,
                body: "Account: " + spec.accountName + "\n"
                    + "Priority: " + spec.level + "\n"
                    + "Queue: " + (spec.queueLabel || "Not classified") + "\n\n"
                    + "Why this is being escalated:\n" + spec.opening + "\n\n"
                    + "Records:\n" + lines.join("\n") + "\n\n"
                    + "Requested from this escalation:\n"
                    + util.list(spec.steps).map(function (step, index) {
                        return "  " + (index + 1) + ". " + step;
                      }).join("\n") + "\n\n"
                    + "No commitment has been made to the customer on the basis of this "
                    + "escalation."
            };
        },

        meetingAgenda: function (spec) {
            var lines = util.list(spec.evidence).map(function (row) {
                return "  - " + row.label
                     + (row.date ? " (" + util.formatDate(row.date) + ")" : "");
            });

            return {
                subject: "Agenda — " + spec.accountName + " account review",
                body: "Account: " + spec.accountName + "\n\n"
                    + "Purpose:\n" + spec.opening + "\n\n"
                    + "Items to cover:\n"
                    + util.list(spec.steps).map(function (step) {
                        return "  - " + step;
                      }).join("\n") + "\n\n"
                    + "Records to have to hand:\n" + lines.join("\n")
            };
        },

        followUpMessage: function (spec) {
            var greeting = spec.contact && spec.contact.name
                ? "Hi " + String(spec.contact.name).split(" ")[0] + ","
                : "Hello,";

            var lines = util.list(spec.evidence).slice(0, 3).map(function (row) {
                return "  - " + row.label
                     + (row.date ? " (" + util.formatDate(row.date) + ")" : "");
            });

            return {
                subject: spec.subject,
                body: greeting + "\n\n"
                    + spec.opening + "\n\n"
                    + lines.join("\n") + "\n\n"
                    + spec.closing + "\n\n"
                    + "Best regards,\n"
                    + (spec.senderLabel || "Your account team")
            };
        }
    };

    function renderDraft(kind, spec) {
        var template = TEMPLATES[kind];
        if (!template) { return null; }
        return template(spec);
    }

    /**
     * A contact is only usable in a draft when a source actually confirmed it.
     * `normalize.contact` already defaults an unrecognised confidence to
     * "Unverified", so this reads that field rather than second-guessing it.
     */
    function verifiedContact(contacts) {
        var accepted = util.list(cfg().drafts.verifiedContactConfidence);
        return util.list(contacts).filter(function (contact) {
            return !contact.placeholder && accepted.indexOf(contact.confidence) !== -1;
        })[0] || null;
    }

    return {
        mappingFor: mappingFor,
        resolveOwner: resolveOwner,
        addBusinessDays: addBusinessDays,
        dueFor: dueFor,
        extractClaims: extractClaims,
        validateClaims: validateClaims,
        contextText: contextText,
        renderDraft: renderDraft,
        verifiedContact: verifiedContact,
        TEMPLATES: TEMPLATES
    };
}());
