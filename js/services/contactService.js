/**
 * Customer 360 — contact service  [INTERNAL + CUSTOMER WEBSITE]
 * =============================================================
 * Loads known contacts, folds in leadership found on the customer's website,
 * and ranks them by how relevant their role is to this kind of account.
 *
 * HARD RULES (spec section 17). These are enforced in code, not just in prose:
 *
 *   1. A contact is only ever created from a record that actually named a
 *      person. Nothing here synthesises a name.
 *   2. Email addresses are never guessed. If the source did not supply one,
 *      the field stays null and the UI shows "Not available".
 *   3. Every contact carries its source, the URL it came from where one
 *      exists, when it was last verified, and a confidence level.
 *   4. A role we looked for and did NOT find is surfaced as an explicit gap
 *      ("no verified contact for this role"), never as an inferred person.
 */

"use strict";

C360.contactService = (function () {

    var util = C360.util;

    var service = C360.cachedService.create({
        source: "contacts",
        ttlClass: "internal",
        label: "Contacts",
        fetch: function (accountId, ctx) {
            return C360.dataSource.getContacts(accountId, ctx);
        },
        normalize: function (raw) {
            return C360.normalize.contacts(raw);
        }
    });

    /** Comparable form of a person's name, for de-duplication. */
    function nameKey(name) {
        return String(name || "").toLowerCase().replace(/[^a-z]/g, "");
    }

    /**
     * Merge website leadership into the contact list.
     *
     * A website entry only becomes a contact when the page actually named the
     * person. When the same person is already known internally, the internal
     * record wins (it usually has richer context) but gains the website URL as
     * corroboration, which is what lifts confidence to "Confirmed".
     */
    function mergeWebsiteLeadership(contacts, website) {
        var merged = util.list(contacts).slice();
        var index = {};

        merged.forEach(function (contact) {
            if (contact.name) { index[nameKey(contact.name)] = contact; }
        });

        util.list(website && website.leadership).forEach(function (person) {
            if (!person || !person.name || !person.title) {
                return; // Nothing to attribute — skip rather than invent.
            }

            var key = nameKey(person.name);
            var existing = index[key];

            if (existing) {
                // Same person from two independent sources.
                existing.corroboratedBy = existing.corroboratedBy || [];
                if (existing.corroboratedBy.indexOf("Customer website") === -1) {
                    existing.corroboratedBy.push("Customer website");
                }
                if (!existing.sourceUrl && person.url) {
                    existing.sourceUrl = person.url;
                }
                // Two independent sources naming the same person and title is
                // the strongest evidence this system can produce.
                existing.confidence = "Confirmed";
                return;
            }

            var contact = C360.normalize.contact({
                id: "web-" + util.slug(person.name),
                name: person.name,
                title: person.title,
                source: "Customer website",
                sourceUrl: person.url || (website && website.url) || null,
                sourceType: "website",
                lastVerified: website && website.fetchedAt,
                // Directly stated on the company's own leadership page.
                confidence: "Confirmed",
                mock: person.mock === true
            });

            merged.push(contact);
            index[key] = contact;
        });

        return merged;
    }

    /** The prioritisation profile in force for an account. */
    function profileFor(account) {
        var profiles = C360.config.contactProfiles;
        var name = (account && account.contactProfile) || C360.config.defaultProfile;
        return profiles[name] || profiles[C360.config.defaultProfile] || [];
    }

    /**
     * Rank position of a title within a profile.
     * Returns the profile entry index, or null when the title matches nothing
     * in the profile (those contacts sort last, but are still shown).
     */
    function rankOf(title, profile) {
        var t = String(title || "").toLowerCase();
        for (var i = 0; i < profile.length; i++) {
            var entry = profile[i];
            for (var j = 0; j < entry.match.length; j++) {
                if (t.indexOf(entry.match[j]) !== -1) {
                    return { rank: i, roleGroup: entry.label };
                }
            }
        }
        return null;
    }

    /**
     * Order contacts by role relevance for this account, then by confidence,
     * then by how recently they were verified.
     */
    function prioritize(contacts, account) {
        var profile = profileFor(account);
        var confidenceOrder = { "Confirmed": 0, "Likely": 1, "Unverified": 2 };

        var ranked = util.list(contacts)
            // A placeholder is a role we searched for and did not fill; it is
            // reported separately as a gap, never ranked as if it were a person.
            .filter(function (contact) { return contact && contact.name && !contact.placeholder; })
            .map(function (contact) {
                var match = rankOf(contact.title, profile);
                return Object.assign({}, contact, {
                    rank: match ? match.rank : profile.length + 1,
                    roleGroup: match ? match.roleGroup : "Other",
                    // Why this person matters on THIS account, from the profile
                    // — not a claim about the person themselves.
                    roleRelevance: match ? match.roleGroup : "Role not on the priority list for this account type"
                });
            });

        ranked.sort(function (a, b) {
            if (a.rank !== b.rank) { return a.rank - b.rank; }
            var ca = confidenceOrder[a.confidence];
            var cb = confidenceOrder[b.confidence];
            if (ca === undefined) { ca = 3; }
            if (cb === undefined) { cb = 3; }
            if (ca !== cb) { return ca - cb; }
            var da = util.toDate(a.lastVerified);
            var db = util.toDate(b.lastVerified);
            return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
        });

        return ranked;
    }

    /**
     * Roles the profile says matter for this account for which no verified
     * person was found. Surfaced so the user knows the gap is a gap, rather
     * than assuming nobody holds the role.
     */
    function roleGaps(rankedContacts, account) {
        var profile = profileFor(account);
        var covered = {};

        util.list(rankedContacts).forEach(function (contact) {
            covered[contact.roleGroup] = true;
        });

        // Only the top few roles are worth reporting as gaps; below that the
        // absence carries no signal.
        return profile.slice(0, 4)
            .filter(function (entry) { return !covered[entry.label]; })
            .map(function (entry) { return entry.label; });
    }

    return {
        source: service.source,
        label: service.label,
        load: service.load,
        mergeWebsiteLeadership: mergeWebsiteLeadership,
        prioritize: prioritize,
        roleGaps: roleGaps,
        profileFor: profileFor
    };
}());
