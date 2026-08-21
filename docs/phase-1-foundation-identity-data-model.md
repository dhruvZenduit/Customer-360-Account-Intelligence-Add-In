# Phase 1 — Foundation, Identity & Data Model

**Goal:** establish a canonical account identity, a normalised signal model, and the
configuration skeleton that every later phase reads from — without changing any
existing Customer 360 behaviour.

| | |
| --- | --- |
| **Source sections** | Appendix A §2, §3, §29, §30, §31, §32, §43, §48 |
| **Depends on** | — |
| **Unlocks** | Every other phase |
| **AI involved** | No |

> Read [the global rules](./README.md#global-rules--these-apply-to-every-phase) first.
> G1 (layer separation), G3 (missing ≠ zero), G8 (nothing hardcoded) and G10 (do not
> break what exists) do most of the work in this phase.

---

## 1. In scope

- Audit of the existing add-in — what data and intelligence already exists.
- **Master Customer Identity** layer with per-source identity confidence.
- **Account segments** and **customer lifecycle** stage resolution.
- Normalised **account + signal** models the scoring engines will consume.
- A single new config file holding every tunable the scorecard will need.
- The MVP fixture set (20–30 accounts).

## 2. Out of scope

- Any score. No health, no priority, no queues, no actions.
- Any new UI screen. Phase 1 ships engine-only, verified by tests.
- Any AI call.

---

## 3. Inspect before you build

The scorecard is additive, so start by writing down what already exists. Current state:

```text
js/core/namespace.js        window.C360 root, VERSION
js/core/config.js           dataSource, cache TTLs, date filters, contactProfiles, thresholds,
                            productCatalogue, confidence vocabulary
js/core/util.js             date/list helpers (daysAgo, relativeDays, byDateDesc, plural, list)
js/core/cache.js            sessionStorage-backed cache with bypass

js/intelligence/normalize.js        raw source records -> normalised shapes
js/intelligence/facts.js           FACTS layer
js/intelligence/signals.js         SIGNALS layer (openTickets, openEscalations, latestReview,
                                   whatChanged, orderVolume, staleQuotes, repeatIssue,
                                   ageingTickets, staleReview, publicGrowth, publicContraction)
js/intelligence/risks.js           risk derivation
js/intelligence/opportunities.js   opportunity derivation
js/intelligence/health.js          qualitative health — see the warning below
js/intelligence/recommendations.js action derivation
js/intelligence/timeline.js        timeline
js/intelligence/summary.js         narrative summary
js/intelligence/intelligenceEngine.js  pure pipeline entry point

js/services/*.js            one service per source, behind cachedService + dataSource
                            (mock | gateway), gatewayClient holds the HTTP contract
js/ui/{app,render,components}.js   the existing single-account dashboard
tests/run-tests.cjs         Node harness loading the browser sources against a window stub
```

Deliverable: a short `docs/phase-1-audit.md` (write it as you go) listing, for each of
the sixteen existing Customer 360 data areas, whether it is **available**, **partially
available**, or **not wired**, and which service exposes it.

```text
Account            Quotes           Orders            Tickets
Account Reviews    Billing Issues   Technical Issues  Customer Website
External Research  Company Updates  Purchases         Expansion
Downsizing         Decision Makers  Contacts          Timeline
```

Then record which of the **new** intelligence inputs have no source yet:

```text
Device/Product Health
Support Health
Relationship Health
Commercial/Retention Health
Outcome/Value Health
```

Anything with no source must be reported as `Data unavailable` downstream — never as a
zero, and never invented.

### ⚠ Known conflict to resolve in this phase

`js/intelligence/health.js` is **deliberately non-numeric**. Its header says so:

> *"DELIBERATELY NOT NUMERIC (spec section 8). A bar reading 'Support 60' implies that
> support health is measurable to within a percentage point and that 60 is meaningfully
> worse than 65. Neither is true of this data."*

It produces four qualitative dimensions (Commercial, Support, Relationship, Growth)
with a state word and the rule that produced it.

The new brief requires a **numeric 0–100 score across five categories**
(Product & Device, Support & Service, Engagement & Relationship, Commercial &
Retention, Outcomes & Value).

These are two different products, not a refactor. Decide now and record the decision:

- **Recommended:** leave `health.js` untouched and add `js/scorecard/healthScore.js`
  alongside it. The qualitative dimensions become the *plain-language* rendering of the
  numeric sub-scores, so the old objection is answered by always printing the reasoning
  next to the number (which G4 requires anyway).
- Alternative: retire the qualitative view and migrate its callers. Costs more, and
  loses the existing wording.

Do not silently rewrite `health.js` into a scorer. It has three categories in common
with the new model and one (`Growth`) that does not map.

---

## 4. Files

### Create

```text
js/core/scorecardConfig.js      every scorecard tunable (see §8 below)
js/scorecard/identity.js        master identity resolution + identity confidence
js/scorecard/segments.js        segment + lifecycle resolution
tests/fixtures/accounts/*.json  20-30 labelled MOCK accounts
tests/fixtures/README.md        what each fixture is meant to prove
docs/phase-1-audit.md           the data audit deliverable
```

### Touch

```text
index.html                  add the two new scripts, after core, before intelligence
js/services/mockData.js     extend with the fixture set (keep it labelled MOCK)
tests/run-tests.cjs         load the new files, add the Phase 1 assertions
```

Do **not** touch `js/intelligence/*` in this phase.

---

## 5. Master Customer Identity

This is the critical architectural requirement. Before any advanced scoring, one
account must be resolvable across every source system.

```text
Master Customer ID
        |
        +── CRM Account
        |
        +── Customer Email Domain
        |
        +── Ticket Organization
        |
        +── Quote / Estimate
        |
        +── Billing Account
        |
        +── MyGeotab Database
        |
        +── Camera Portal
        |
        +── Contract
        |
        +── Renewal Record
```

Names alone are **not** sufficient. All three of these may be one company:

```text
"ABC Logistics Inc."
"ABC Logistics"
"ABC Logistics LLC"
```

Requirements:

1. `identity.resolve(sources)` returns one canonical identity object with a stable
   `masterCustomerId` and a `links[]` array — one entry per source system.
2. Each link records **how** it was matched and a **confidence** percentage:

   ```text
   CRM:              Exact Account ID              Confidence: 100%
   Ticket:           Matched via CRM account ID    Confidence: 100%
   External Website: Matched via verified domain   Confidence:  95%
   External News:    Matched by company name + domain  Confidence: 90%
   ```

3. Match strategies, strongest first — record which one fired:
   `exactAccountId` → `verifiedDomain` → `billingAccountId` → `geotabDatabase` →
   `normalisedName + domain` → `normalisedName`.
4. Name normalisation strips legal suffixes and punctuation for comparison only. The
   display name always comes from CRM, never from the normalised form.
5. **A source whose identity confidence is below the configured minimum must not be
   attached to the account.** This matters most for external research — attaching the
   wrong company's news to an account destroys trust in the whole product.
6. Unmatched sources are surfaced as unmatched, not dropped silently.

---

## 6. Account segments

Different customers require different expectations, so thresholds are per-segment.

```text
Strategic / Enterprise
Mid-Market
Small Business
New Onboarding
Long-Term Customer
Suspended
Seasonal
```

The segment influences engagement expectations, account-review cadence, priority,
renewal thresholds and expansion expectations. For example:

```text
Strategic Account   Account review overdue after  90 days
Small Business      Account review overdue after 180 days
```

These live in `accountSegmentRules` in config. Do **not** hardcode them anywhere else
in the codebase. Note that the existing `config.thresholds.staleReviewDays` is a single
global value (365) — Phase 1 makes it segment-aware without removing the global default.

---

## 7. Customer lifecycle

```text
Onboarding
Adoption
Mature
Expansion
Renewal
At Risk
Churned
Suspended
```

The same signal is interpreted differently by lifecycle stage:

```text
Low portal usage

  Onboarding:  Potential adoption problem
  Mature:      Potential disengagement
  At Risk:     Additional risk signal
```

`segments.resolve(account, data)` returns `{ segment, lifecycle, basis }` where `basis`
is the one-line rule that produced each — same pattern the existing `health.js` uses for
its dimensions. Lifecycle is derived from evidence (contract start, renewal date,
cancellation records, suspension flags), never guessed.

---

## 8. Config added

New file `js/core/scorecardConfig.js`, hanging off `C360.scorecardConfig`. Phase 1
creates the file and populates the identity, segment and lifecycle sections; later
phases add their own blocks to the same file.

```javascript
C360.scorecardConfig = {

    identity: {
        /** A source below this confidence is NOT attached to the account. */
        minAttachConfidencePct: 85,
        /** Confidence awarded per match strategy. */
        matchConfidence: {
            exactAccountId: 100,
            verifiedDomain: 95,
            billingAccountId: 95,
            geotabDatabase: 95,
            nameAndDomain: 90,
            normalisedName: 70
        },
        /** Stripped for comparison only; display name always comes from CRM. */
        legalSuffixes: ["inc", "inc.", "llc", "l.l.c.", "ltd", "ltd.", "corp",
                        "corporation", "co", "co.", "company", "limited", "plc", "gmbh"]
    },

    accountSegmentRules: {
        "strategic":      { reviewOverdueDays:  90, renewalWindowDays: 120, label: "Strategic / Enterprise" },
        "mid-market":     { reviewOverdueDays: 120, renewalWindowDays:  90, label: "Mid-Market" },
        "small-business": { reviewOverdueDays: 180, renewalWindowDays:  60, label: "Small Business" },
        "new-onboarding": { reviewOverdueDays:  30, renewalWindowDays:  90, label: "New Onboarding" },
        "long-term":      { reviewOverdueDays: 150, renewalWindowDays:  90, label: "Long-Term Customer" },
        "suspended":      { reviewOverdueDays: null, renewalWindowDays: null, label: "Suspended" },
        "seasonal":       { reviewOverdueDays: 180, renewalWindowDays:  90, label: "Seasonal" }
    },

    defaultSegment: "mid-market",

    lifecycleStages: ["onboarding", "adoption", "mature", "expansion",
                      "renewal", "at-risk", "churned", "suspended"]
};
```

---

## 9. Tests

Add to `tests/run-tests.cjs` (or a new `tests/scorecard-tests.cjs` loaded by it):

| # | Test | Expected |
| - | ---- | -------- |
| 1.1 | `"ABC Logistics Inc."`, `"ABC Logistics"`, `"ABC Logistics LLC"` | resolve to one `masterCustomerId` |
| 1.2 | Two genuinely different companies with similar names | resolve to two distinct ids |
| 1.3 | Source matched only by loose name (70%) with threshold 85 | **not** attached; reported as unmatched |
| 1.4 | Every attached link | carries a `matchedBy` and a numeric `confidencePct` |
| 1.5 | Strategic vs Small Business account, both 100 days since review | overdue for Strategic, not for Small Business |
| 1.6 | Account with no contract or renewal record | lifecycle resolved from evidence or reported unknown — never guessed |
| 1.7 | Missing data area | reported as unavailable, never coerced to `0` |
| 1.8 | Existing test suite | still passes unchanged |
| 1.9 | Fixture set | 20–30 accounts, every MVP category represented, all labelled MOCK |

---

## 10. Exit criteria

- [ ] `docs/phase-1-audit.md` exists and classifies all sixteen existing data areas plus the five new ones.
- [ ] The `health.js` numeric-vs-qualitative decision is written down in that audit.
- [ ] `C360.scorecardConfig` exists, is loaded by `index.html`, and contains no secrets.
- [ ] `identity.resolve()` is pure and returns `masterCustomerId` + `links[]` with per-link confidence.
- [ ] No source below `minAttachConfidencePct` is attached to an account.
- [ ] `segments.resolve()` returns `{ segment, lifecycle, basis }`.
- [ ] 20–30 labelled fixtures covering all eight MVP categories.
- [ ] `node tests/run-tests.cjs` passes, including the pre-existing tests.
- [ ] The existing Customer 360 UI is byte-for-byte unchanged in behaviour.

---

## 11. Do NOT

- Do not add a score of any kind in this phase.
- Do not attach external research to an account on a name match alone.
- Do not turn missing data into `0`.
- Do not hardcode a segment threshold outside `accountSegmentRules`.
- Do not rewrite `js/intelligence/health.js`.
- Do not create unlabelled fake customer data.
- Do not claim a gateway endpoint exists if it does not — `config.gatewayBaseUrl` is still empty.
