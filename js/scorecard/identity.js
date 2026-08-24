/**
 * Customer 360 — MASTER CUSTOMER IDENTITY  (Phase 1)
 * ==================================================
 * One account, resolvable across every source system, before any scoring runs.
 *
 * The problem this solves is unglamorous and fatal if skipped: these are one
 * company, and a name comparison alone will not tell you that —
 *
 *     "ABC Logistics Inc."   "ABC Logistics"   "ABC Logistics LLC"
 *
 * — while these two are NOT one company, and a loose name comparison will
 * happily merge them:
 *
 *     "Northline Freight Systems"   "Northline Foods"
 *
 * So every link records HOW it matched and how confident that match is, and a
 * link below `identity.minAttachConfidencePct` is reported as unmatched rather
 * than attached. That threshold matters most for external research: attaching
 * the wrong company's news to an account destroys trust in every other number
 * on the page, and one bad article is enough to do it.
 *
 * Pure: same input, same output, no I/O, no clock.
 */

"use strict";

C360.identity = (function () {

    var util = C360.util;

    function cfg() { return C360.scorecardConfig.identity; }

    // -----------------------------------------------------------------
    // Name normalisation — for COMPARISON only
    // -----------------------------------------------------------------

    /**
     * Strip legal suffixes and punctuation so the three spellings of one
     * company collapse onto one comparable form.
     *
     * The result is never displayed. The display name always comes from CRM,
     * because "abc logistics" is not what the customer calls itself.
     */
    function normaliseName(name) {
        if (!name) { return ""; }

        var suffixes = util.list(cfg().legalSuffixes).map(function (s) {
            return String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
        });

        var words = String(name)
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter(Boolean);

        // Only trailing suffixes are dropped. "Corporate Express Freight" keeps
        // its first word; "Express Freight Corp" loses its last.
        while (words.length > 1 && suffixes.indexOf(words[words.length - 1]) !== -1) {
            words.pop();
        }

        return words.join(" ");
    }

    /** Domain, lower-cased, without a leading www. Null when absent. */
    function normaliseDomain(value) {
        if (!value) { return null; }
        var s = String(value).trim().toLowerCase();
        if (s.indexOf("://") !== -1) { s = util.hostOf(s) || s; }
        s = s.replace(/^www\./, "").replace(/\/.*$/, "");
        return s || null;
    }

    /** Domain part of an email address, or null. */
    function domainOfEmail(email) {
        if (!email) { return null; }
        var parts = String(email).split("@");
        return parts.length === 2 ? normaliseDomain(parts[1]) : null;
    }

    // -----------------------------------------------------------------
    // Match strategies
    // -----------------------------------------------------------------

    /**
     * Each strategy answers one question: "does this source record belong to
     * this account?" They are attempted in `identity.matchOrder`, strongest
     * first, and the first one that says yes is recorded as `matchedBy`.
     *
     * Every strategy returns true/false only. Confidence comes from the
     * strategy's own entry in `identity.matchConfidence` — a strategy cannot
     * award itself a better number than config says it is worth.
     */
    var STRATEGIES = {

        /** The source carries our own CRM account id. Nothing beats this. */
        exactAccountId: function (account, source) {
            if (!source.accountId) { return false; }
            return String(source.accountId) === String(account.id);
        },

        /**
         * The source's domain matches a domain we have verified for this
         * account. `verified` is required: an unverified domain scraped from a
         * news article is a name match wearing a domain's clothes.
         */
        verifiedDomain: function (account, source) {
            var accountDomain = normaliseDomain(account.domain);
            if (!accountDomain) { return false; }
            var sourceDomain = normaliseDomain(source.domain) || domainOfEmail(source.email);
            if (!sourceDomain) { return false; }
            return source.domainVerified === true && sourceDomain === accountDomain;
        },

        billingAccountId: function (account, source) {
            if (!source.billingAccountId || !account.billingAccountId) { return false; }
            return String(source.billingAccountId) === String(account.billingAccountId);
        },

        geotabDatabase: function (account, source) {
            if (!source.geotabDatabase || !account.geotabDatabase) { return false; }
            return String(source.geotabDatabase).toLowerCase()
                === String(account.geotabDatabase).toLowerCase();
        },

        /**
         * Name and domain agree. Two independent weak signals pointing the same
         * way, which is why this scores above a bare name match.
         */
        nameAndDomain: function (account, source) {
            var accountDomain = normaliseDomain(account.domain);
            var sourceDomain = normaliseDomain(source.domain) || domainOfEmail(source.email);
            if (!accountDomain || !sourceDomain || accountDomain !== sourceDomain) { return false; }
            var a = normaliseName(account.name);
            var b = normaliseName(source.name);
            return !!a && a === b;
        },

        /**
         * Names agree and nothing else does. Worth 70% in config, which is
         * BELOW the default attach threshold — deliberately. This strategy
         * exists to report a near-miss as unmatched, not to attach one.
         */
        normalisedName: function (account, source) {
            var a = normaliseName(account.name);
            var b = normaliseName(source.name);
            return !!a && a === b;
        }
    };

    /**
     * Best available strategy for one source record.
     * @returns {{matchedBy: string, confidencePct: number}|null}
     */
    function match(account, source) {
        var order = util.list(cfg().matchOrder);
        var confidence = cfg().matchConfidence || {};

        for (var i = 0; i < order.length; i++) {
            var name = order[i];
            var strategy = STRATEGIES[name];
            if (!strategy) { continue; }

            var fired = false;
            try {
                fired = strategy(account, source) === true;
            } catch (error) {
                // A malformed source record must not take identity resolution
                // down for the whole account.
                console.warn("Customer 360: identity strategy \"" + name + "\" failed.", error);
                fired = false;
            }

            if (fired) {
                var pct = confidence[name];
                return {
                    matchedBy: name,
                    confidencePct: typeof pct === "number" ? pct : 0
                };
            }
        }
        return null;
    }

    // -----------------------------------------------------------------
    // Resolve
    // -----------------------------------------------------------------

    /**
     * Stable master id. Derived from the CRM id, which is the one identifier we
     * own — deriving it from the name would mean a rename silently created a
     * second customer.
     */
    function masterIdFor(account) {
        return "mc-" + util.slug(account && account.id ? account.id : "unknown");
    }

    /**
     * @param {object} input
     *   {
     *     account: normalised CRM account (required — it is the anchor),
     *     sources: [ { system, id, name, domain, domainVerified, accountId,
     *                  billingAccountId, geotabDatabase, email, label } ]
     *   }
     * @returns {object} { masterCustomerId, displayName, normalisedName, domain,
     *                     links[], unmatched[], confidencePct, attachedSystems[] }
     */
    function resolve(input) {
        var data = input || {};
        var account = data.account || null;
        var sources = util.list(data.sources);
        var labels = cfg().sourceSystemLabels || {};
        var matchLabels = cfg().matchLabels || {};
        var minPct = cfg().minAttachConfidencePct;

        if (!account) {
            return {
                masterCustomerId: null,
                displayName: null,
                normalisedName: "",
                domain: null,
                links: [],
                unmatched: sources.map(function (source) {
                    return {
                        system: source.system || null,
                        id: source.id || null,
                        label: source.label || labels[source.system] || null,
                        matchedBy: null,
                        confidencePct: 0,
                        reason: "No account record to match against."
                    };
                }),
                confidencePct: 0,
                attachedSystems: []
            };
        }

        var links = [];
        var unmatched = [];

        // The CRM record is the anchor, not a candidate. It is what every other
        // source is being matched TO, so it is attached at 100% by definition.
        links.push({
            system: "crm",
            id: String(account.id),
            label: labels.crm || "CRM Account",
            name: account.name || null,
            matchedBy: "exactAccountId",
            matchedByLabel: matchLabels.exactAccountId || "Exact Account ID",
            confidencePct: cfg().matchConfidence.exactAccountId,
            attached: true
        });

        sources.forEach(function (source) {
            // Never double-attach the anchor.
            if (source.system === "crm") { return; }

            var result = match(account, source);
            var entry = {
                system: source.system || null,
                id: source.id === undefined || source.id === null ? null : String(source.id),
                label: source.label || labels[source.system] || util.humanize(source.system),
                name: source.name || null,
                matchedBy: result ? result.matchedBy : null,
                matchedByLabel: result ? (matchLabels[result.matchedBy] || util.humanize(result.matchedBy)) : null,
                confidencePct: result ? result.confidencePct : 0,
                attached: false
            };

            if (!result) {
                entry.reason = "No match strategy identified this source as this account.";
                unmatched.push(entry);
                return;
            }

            if (entry.confidencePct < minPct) {
                // Surfaced, not dropped. A near-miss the user can see is a
                // near-miss the user can correct; a silently discarded source
                // looks exactly like a source that does not exist.
                entry.reason = "Matched only by " + (entry.matchedByLabel || entry.matchedBy)
                             + " (" + entry.confidencePct + "%), below the "
                             + minPct + "% required to attach.";
                unmatched.push(entry);
                return;
            }

            entry.attached = true;
            links.push(entry);
        });

        // Overall identity confidence is the WEAKEST attached link, not the
        // average. An account whose external research is attached at 90% is
        // only 90% certain about that research, and averaging it against three
        // 100% internal links would hide exactly the link worth doubting.
        var confidencePct = links.reduce(function (lowest, link) {
            return Math.min(lowest, link.confidencePct);
        }, 100);

        return {
            masterCustomerId: masterIdFor(account),
            displayName: account.name || null,
            normalisedName: normaliseName(account.name),
            domain: normaliseDomain(account.domain),
            links: links,
            unmatched: unmatched,
            confidencePct: confidencePct,
            attachedSystems: links.map(function (link) { return link.system; })
        };
    }

    /** Confidence recorded for one system, or null when it is not attached. */
    function confidenceFor(identity, system) {
        var link = util.list(identity && identity.links).filter(function (entry) {
            return entry.system === system;
        })[0];
        return link ? link.confidencePct : null;
    }

    /** Whether a system cleared the attach threshold. */
    function isAttached(identity, system) {
        return util.list(identity && identity.attachedSystems).indexOf(system) !== -1;
    }

    /**
     * Build the source-descriptor list for `resolve()` from a loaded bundle.
     *
     * Kept here rather than in the orchestrator so the mapping from "what we
     * fetched" to "what claims to be this account" is testable in Node.
     */
    function describeSources(bundle) {
        var data = bundle || {};
        var account = data.account || {};
        var out = [];

        function push(system, id, extra) {
            var entry = { system: system, id: id };
            Object.keys(extra || {}).forEach(function (key) { entry[key] = extra[key]; });
            out.push(entry);
        }

        // Internal systems all carry our own account id, so they match exactly.
        if (util.list(data.quotes).length) {
            push("quote", "quotes", { accountId: account.id, name: account.name });
        }
        if (util.list(data.tickets).length) {
            push("ticketOrg", "tickets", { accountId: account.id, name: account.name });
        }
        if (util.list(data.billingIssues).length || account.billingAccountId) {
            push("billing", "billing", {
                accountId: account.id,
                billingAccountId: account.billingAccountId || null,
                name: account.name
            });
        }
        if (account.geotabDatabase) {
            push("geotab", account.geotabDatabase, {
                geotabDatabase: account.geotabDatabase,
                name: account.name
            });
        }
        if (account.domain) {
            push("emailDomain", account.domain, {
                domain: account.domain,
                domainVerified: true,
                name: account.name
            });
        }
        if (data.contract) {
            push("contract", data.contract.id || "contract", {
                accountId: data.contract.accountId || account.id,
                name: account.name
            });
        }
        if (data.contract && data.contract.renewalDate) {
            push("renewal", (data.contract.id || "contract") + "-renewal", {
                accountId: data.contract.accountId || account.id,
                name: account.name
            });
        }
        if (data.deviceHealth) {
            push("cameraPortal", "device-health", {
                accountId: data.deviceHealth.accountId || account.id,
                name: account.name
            });
        }

        // The customer's own website is matched on its verified domain.
        if (data.website) {
            push("website", data.website.url || "website", {
                domain: normaliseDomain(data.website.url) || normaliseDomain(account.domain),
                domainVerified: true,
                name: account.name
            });
        }

        // External research is the one that must earn its place. It matches on
        // name + domain at 90% when the article names the domain, and on name
        // alone at 70% when it does not — which is below the threshold.
        util.list(data.external).forEach(function (item) {
            push("external", item.id, {
                name: item.matchedName || account.name,
                domain: item.matchedDomain || null,
                domainVerified: item.domainVerified === true
            });
        });

        return out;
    }

    return {
        resolve: resolve,
        describeSources: describeSources,
        normaliseName: normaliseName,
        normaliseDomain: normaliseDomain,
        confidenceFor: confidenceFor,
        isAttached: isAttached,
        STRATEGIES: STRATEGIES
    };
}());
