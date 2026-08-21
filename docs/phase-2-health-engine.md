# Phase 2 — Health Engine & Data Confidence

**Goal:** produce a transparent, deterministic 0–100 Health Score from five independently
scored categories, plus a separate Data Confidence percentage.

| | |
| --- | --- |
| **Source sections** | Appendix A §4, §5, §6, §7, §8, §9, §10, §11, §27, §28 |
| **Depends on** | Phase 1 |
| **Unlocks** | Phases 3, 4, 7 |
| **AI involved** | No |

> Read [the global rules](./README.md#global-rules--these-apply-to-every-phase) first.
> G2 (deterministic scoring) and G3 (missing ≠ zero) are the whole point of this phase.

---

## 1. In scope

- Five category sub-scores, each 0–100, each with its own signal list.
- The weighted Health Score.
- The Data Confidence percentage — a separate concept from health.
- The score-breakdown data structure that Phase 7 will render.

## 2. Out of scope

- Priority. Health does not determine urgency (Phase 3).
- Actions and queues (Phases 4–5).
- The account-page UI (Phase 7). Phase 2 ships engine + tests.

---

## 3. The formula

| Category | Weight |
| -------- | -----: |
| Product & Device Health | 25% |
| Support & Service Health | 20% |
| Engagement & Relationship | 20% |
| Commercial & Retention | 25% |
| Outcomes & Value | 10% |

```text
Health Score =
  (Product Health      × 0.25)
+ (Support Health      × 0.20)
+ (Relationship Health × 0.20)
+ (Commercial Health   × 0.25)
+ (Outcomes Health     × 0.10)
```

Implemented deterministically in code. The model never determines this calculation, and
never adjusts a category score.

Each category must **independently** produce a 0–100 score, and must carry the signals
that produced it. A category score with no signal list attached is a bug.

### Handling an unavailable category

A category with no usable data reports:

```text
Data unavailable
```

It does **not** score 0. Two options, and the config picks which:

- **Recommended:** re-normalise the weights across the categories that do have data, and
  reflect the gap in Data Confidence. `Health 61 (confidence 54%)` is honest;
  `Health 46` because device data is missing is a lie.
- Alternative: report health as unavailable entirely once fewer than N categories have
  data. Set `minScoredCategories` for this.

Whichever is chosen, the breakdown must show which categories were excluded and that the
weights were re-normalised.

---

## 4. Product & Device Health — 25%

Evaluate signals such as:

```text
Non-communicating devices     Camera availability      Portal usage
HOS activity                  Unused hardware          Device health
Product utilization           Device connectivity
```

Target shape:

```text
Product & Device Health

Score: 61 / 100

Signals:
⚠ 8% devices not communicating
✓ Camera availability healthy
⚠ Portal usage declining
✓ HOS activity stable
```

Do not invent metrics the available data does not support. If the device-health feed is
absent, this whole category is `Data unavailable` — see §3. Today the only device-side
service is `js/services/geotabService.js`; whatever it cannot supply does not exist.

---

## 5. Support & Service Health — 20%

Evaluate:

```text
Ticket severity     Ticket age          SLA breaches      Repeat issues
Unresolved escalations   Billing escalations   Technical escalations   Customer impact
```

**Do NOT use ticket count alone.** A customer with 20 low-severity resolved tickets may
be healthier than a customer with one critical unresolved ticket. Weight by:

```text
Severity
Age
Recurrence
SLA breach
Customer impact
Escalation
```

```text
Support & Service Health

Score: 38 / 100

⚠ Critical ticket open 14 days
⚠ SLA breached
⚠ Repeat camera issue
✓ 7 lower-priority tickets resolved
```

Reuse the existing signal helpers rather than re-deriving them:
`C360.signals.openTickets()`, `C360.signals.openEscalations()`, and the `repeatIssue` /
`ageingTickets` signals, tuned by `config.thresholds.repeatIssueCount` and
`config.thresholds.ageingTicketDays`.

---

## 6. Engagement & Relationship — 20%

Evaluate:

```text
Last contact           Email response          Sentiment
Stakeholder coverage   Meeting attendance      Account review frequency
Decision-maker engagement    Response patterns    Relationship activity
```

**Do NOT let email sentiment alone determine health.** Sentiment must be corroborated.

```text
Negative email + repeated complaints + competitor reference + escalation
```

is a far stronger risk signal than:

```text
One short frustrated email
```

Enforce this in code: a sentiment-only input is capped at a configured maximum
contribution until at least one corroborating signal is present.

Review cadence comes from the Phase 1 segment rules, not the global
`config.thresholds.staleReviewDays`. Stakeholder coverage can reuse
`C360.contactService.roleGaps()`, which already exists.

---

## 7. Commercial & Retention — 25%

Evaluate:

```text
Renewal date        Past-due invoices     Cancellation language
Downgrade requests  Competitor activity   Quotes
Orders              Renewal status        Commercial engagement
```

Important signals:

```text
Cancellation request
Competitor switch request
Downgrade request
Renewal approaching
Past-due balance
Inactive quote
Reduced purchasing
```

This category carries the joint-highest weight because **commercial risk can exist even
when product health is good**. Keep the retention-relevant signals from collapsing into
the general commercial-activity picture — a healthy order history must not mask a
cancellation request. Renewal windows come from the segment rules.

---

## 8. Outcomes & Value — 10%

Evaluate available evidence such as:

```text
Completed training       Implemented recommendations    Safety improvements
Fuel improvements        Utilization improvements       Operational improvements
Customer outcomes
```

Do not fabricate business outcomes. When measurable outcomes are unavailable:

```text
Outcomes data limited
```

Do **not** assume poor outcomes from an absence of evidence. This is the most likely
category to be genuinely unmeasurable at MVP; the 10% weight reflects that.

---

## 9. Data Confidence — a separate output

Confidence is **not** health. It measures how complete and reliable the underlying
account data is.

```text
Health:     42 / 100
Priority:   91 / 100
Confidence: 84%
```

Confidence considers:

- Data freshness
- Number of populated signal categories
- Source reliability
- Account identity confidence (from Phase 1)
- Availability of recent activity
- Conflicting information

```text
Confidence: 84%

Based on:
✓ CRM data
✓ Ticket history
✓ Device data
✓ Recent account review
✓ External company research
```

and when data is thin:

```text
Confidence: 54%

Limited device-health data available.
No recent account review found.
```

The per-source detail Phase 7 will render:

```text
DATA CONFIDENCE

CRM data                 ✓ Recent
Ticket data              ✓ Recent
Device health            ✓ Recent
Account review           ✓ Recent
External research        ✓ Recent
Contact information      ⚠ Partially verified

Overall confidence:
84%
```

Implement a transparent methodology. Do not fabricate a confidence number, and do not
back-solve it to make a score look better. `config.cacheTtlMs` already encodes how
quickly each source class goes stale — reuse those horizons for the freshness input.

---

## 10. Required output shape

`C360.healthScore.build(bundle, signals, identity, segment)` returns a pure object:

```javascript
{
  score: 46.7,                      // unrounded; the UI rounds
  band: "AT RISK",                  // HEALTHY | AT RISK | CRITICAL, thresholds from config
  categories: [
    {
      key: "product",
      label: "Product & Device Health",
      score: 61,                    // or null when unavailable
      available: true,
      weight: 0.25,
      effectiveWeight: 0.25,        // differs from weight if re-normalised
      contribution: 15.25,          // score * effectiveWeight
      signals: [ { tone: "warn", text: "8% devices not communicating", evidence: [...] } ],
      basis: "one-line explanation of the rule that produced this score"
    }
    // ... four more
  ],
  excludedCategories: [],           // keys reported as Data unavailable
  renormalised: false,
  confidence: {
    pct: 84,
    sources: [ { label: "CRM data", state: "recent", note: null } ],
    limitations: [ "Limited device-health data available." ]
  }
}
```

The breakdown must be able to render the arithmetic exactly, with real values:

```text
HEALTH SCORE BREAKDOWN

Product & Device   61 × 25% = 15.25
Support            38 × 20% =  7.60
Relationship       47 × 20% =  9.40
Commercial         29 × 25% =  7.25
Outcomes           72 × 10% =  7.20
──────────────────
Health Score       46.70
```

Never hardcode the example numbers above. They are illustrative only.

---

## 11. Config added

```javascript
C360.scorecardConfig.health = {
    weights: {
        product:      0.25,
        support:      0.20,
        relationship: 0.20,
        commercial:   0.25,
        outcomes:     0.10
    },

    /** Bands used for the label under the score. */
    bands: [
        { min: 70, label: "HEALTHY",  tone: "good"  },
        { min: 40, label: "AT RISK",  tone: "watch" },
        { min:  0, label: "CRITICAL", tone: "bad"   }
    ],

    /** Unavailable categories: re-normalise the remaining weights, or report unavailable. */
    missingCategoryPolicy: "renormalise",   // "renormalise" | "unavailable"
    minScoredCategories: 3,

    /** Sentiment cannot exceed this share of the relationship category uncorroborated. */
    uncorroboratedSentimentMaxWeight: 0.25,

    /** Device-health signal thresholds. */
    device: {
        notCommunicatingWarnPct: 5,
        notCommunicatingBadPct: 15,
        portalUsageDeclinePct: 20
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
        lowConfidencePct: 60
    }
};
```

---

## 12. Tests

| # | Test | Expected |
| - | ---- | -------- |
| 2.1 | Known five sub-scores | weighted total matches hand-arithmetic to 2dp |
| 2.2 | Category with no data | `available: false`, `score: null`, **not** `0` |
| 2.3 | Same account, device data removed | health does not drop; confidence does |
| 2.4 | 20 low-severity resolved tickets vs 1 critical unresolved | the single-critical account scores lower on support |
| 2.5 | Ticket count doubled, severity unchanged | support score barely moves |
| 2.6 | One negative email, nothing else | relationship score capped by `uncorroboratedSentimentMaxWeight` |
| 2.7 | Negative email + complaints + competitor + escalation | materially lower relationship score than 2.6 |
| 2.8 | Healthy product signals + cancellation request | commercial score low, product score unaffected |
| 2.9 | No outcome evidence | reported as `Outcomes data limited`, not as poor outcomes |
| 2.10 | Every category available | `renormalised: false`, effective weights equal declared weights |
| 2.11 | Two categories unavailable | effective weights re-normalise to 1.0 |
| 2.12 | Fewer than `minScoredCategories` available | health reported unavailable with a reason |
| 2.13 | Sum of `contribution` values | equals `score` |
| 2.14 | Confidence inputs | weights sum to 1; result is 0–100 |
| 2.15 | Every category | carries a non-empty `basis` string |
| 2.16 | `build()` called twice on the same input | identical output (purity) |

---

## 13. Exit criteria

- [ ] `js/scorecard/healthScore.js` and `js/scorecard/confidence.js` exist, are pure, and are loaded by `index.html`.
- [ ] All five categories score independently, 0–100, each with signals and a basis.
- [ ] The weighted formula is in code, matches §3 exactly, and is covered by test 2.1.
- [ ] No unavailable category is ever scored as 0.
- [ ] Confidence is a separate number with its own per-source detail.
- [ ] The breakdown object can reproduce the arithmetic display with real values.
- [ ] Every health weight and threshold reads from `scorecardConfig`.
- [ ] `node tests/run-tests.cjs` passes, including all Phase 1 tests.
- [ ] The existing qualitative `js/intelligence/health.js` still works and is unmodified.

---

## 14. Do NOT

- Do not let AI compute or adjust any number here.
- Do not convert missing data into `0`.
- Do not score support by ticket count.
- Do not let email sentiment alone drive relationship health.
- Do not collapse health and confidence into one figure.
- Do not display a bare `42 — At Risk` with no breakdown.
- Do not hardcode the example numbers from this document.
- Do not let health influence priority — that coupling is what Phase 3 exists to avoid.
