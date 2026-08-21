# Phase 7 — Account Detail Integration & Explainability

**Goal:** put the scorecard on the existing Customer 360 account page, and make every
number traceable back to the source record that produced it.

| | |
| --- | --- |
| **Source sections** | Appendix A §11, §26, §27, §28, §36, §39, §46, §47 |
| **Depends on** | Phases 5, 6 |
| **Unlocks** | Phases 8, 9 |
| **AI involved** | No |

> Read [the global rules](./README.md#global-rules--these-apply-to-every-phase) first.
> G4 (never unexplained), G5 (traversable both ways) and G10 (do not break what exists)
> govern this phase.

This is the phase that makes the product trustworthy. Everything before it computes;
this one proves the computation to a sceptical human.

---

## 1. In scope

- The scorecard block at the top of the existing account page.
- Health breakdown drawer showing the real arithmetic.
- Priority explanation drawer.
- Data-confidence drawer.
- Evidence panel grouped by source class.
- "What changed" block.
- Navigation from the Command Center and back.

## 2. Out of scope

- AI summaries and AI-written drafts (Phase 8).
- Feedback controls (Phase 9).
- Any change to how the existing Customer 360 sections fetch or render their data.

---

## 3. Page structure

Clicking an account in the portfolio opens the **existing** Customer 360 page with the new
scorecard displayed prominently above the existing sections.

```text
CUSTOMER 360

ACME TRANSPORTATION

────────────────────────

HEALTH
42 / 100

PRIORITY
P0 — 91

CONFIDENCE
84%

────────────────────────

WHAT CHANGED

...

────────────────────────

WHY THIS ACCOUNT IS PRIORITY

...

────────────────────────

RECOMMENDED NEXT ACTION

...

────────────────────────

CUSTOMER 360 DATA

Quotes
Orders
Tickets
Reviews
Billing
Technical
Website
External
Contacts
Timeline
```

The existing sections keep their current order and behaviour. The scorecard is inserted
above them, between `#c360-account-header` and `#c360-content`.

The fuller target, with the recommendation expanded:

```text
CUSTOMER 360
ACME TRANSPORTATION

HEALTH        42 / 100    AT RISK
PRIORITY      P0          94 / 100
CONFIDENCE    84%

────────────────────────────────────

WHY PRIORITY?

• Cancellation language detected
• Critical camera issue
• Renewal within 61 days
• Strategic account

────────────────────────────────────

WHAT CHANGED?

• Camera issue escalated
• Quote inactive
• Renewal approaching

────────────────────────────────────

RECOMMENDED ACTION

Escalate the camera issue internally,
obtain an ETA, and prepare a retention
conversation.

OWNER    Sean + Technical Support
DUE      Today

────────────────────────────────────

EVIDENCE

[View CRM]  [View Tickets]  [View Quote]
[View Communication]  [View External Research]

────────────────────────────────────

CUSTOMER 360   (existing sections, unchanged)
```

---

## 4. Health display

At the top of each account page:

```text
ACCOUNT HEALTH

42 / 100

AT RISK

Product Health       61
Support Health       38
Relationship         47
Commercial           29
Outcomes             72

Confidence            84%
```

Use the same transparent breakdown **everywhere** the score appears — the portfolio row,
the account header, the drawer. Never display:

```text
42 — At Risk
```

with no explanation.

A category reported unavailable shows `Data unavailable`, not a dash and not a zero. If
weights were re-normalised (Phase 2), say so on the face of the breakdown, not only in
the drawer.

---

## 5. Score explanation drawer

Clicking `Health: 42` shows the arithmetic:

```text
HEALTH SCORE BREAKDOWN

Product & Device
61 × 25% = 15.25

Support
38 × 20% = 7.60

Relationship
47 × 20% = 9.40

Commercial
29 × 25% = 7.25

Outcomes
72 × 10% = 7.20

──────────────────

Health Score
46.70
```

Requirements:

1. Use the **actual calculated values**. Do not hardcode the example numbers above.
2. The rendered lines must sum to the rendered total. If they do not, that is a bug in
   Phase 2 surfacing here — fail loudly rather than rounding it away.
3. Each category row expands to its signal list with the `basis` string from Phase 2:

   ```text
   Product & Device   61
   ⚠ 8% devices not communicating
   ✓ Camera availability healthy
   ⚠ Portal usage declining
   ✓ HOS activity stable
   ```

4. Each signal links to its evidence.

---

## 6. Priority explanation

```text
PRIORITY: P0

91 / 100

Why?

• Cancellation language detected
• Renewal approaching in 52 days
• 2 unresolved technical issues
• Strategic account
• One overdue commitment

Primary reason:
Explicit cancellation signal
```

Never display `Priority: 92` on its own. Always:

```text
92

Why?

Critical unresolved technical issue
+
Renewal within 60 days
+
Strategic account
+
Overdue commitment
```

When an override set the level, say so explicitly, using the Phase 3 `levelSetBy` field:

```text
P0 OVERRIDE

Reason:
Customer explicitly requested cancellation.

Source:
Email — Aug 20, 2026

This override takes precedence over the
weighted health score.
```

The drawer also shows the factor arithmetic, the same way health does — risk severity
95 × 35% = 33.25, and so on.

---

## 7. Data-confidence drawer

Clicking `Confidence 84%` shows:

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

Include the Phase 2 `limitations[]` list. When confidence is below
`config.confidence.lowConfidencePct`, the UI leads with the limitation rather than the
score — a health number built on two of five categories should not look as solid as one
built on five.

---

## 8. Evidence panel

Every score and every recommendation has an evidence drawer, grouped by source class:

```text
WHY IS THIS ACCOUNT P0?

[View Evidence]

Internal:
• Ticket #1234 — Critical — Aug 6
• Ticket #1255 — Critical — Aug 12

Commercial:
• Renewal — Oct 15

Communication:
• Cancellation language — Aug 20

External:
• Competitor deployment mentioned — Aug 18
```

Requirements:

1. Every evidence entry links to the actual record — deep-link where the source system
   supports it, and otherwise scroll to the corresponding existing Customer 360 section.
   Both count as "reaching the source"; a dead label does not.
2. External evidence must display its Phase 1 identity confidence. An article matched at
   90% is shown as matched at 90%, so the user can discount it.
3. Evidence is never empty. A score component with no evidence renders as
   `No supporting records` rather than an empty box.
4. Text-derived evidence (cancellation language, competitor mention) shows the matched
   excerpt with its date and source. This is what lets the user immediately spot a false
   positive — and Phase 9 is how that judgment gets recorded.

---

## 9. What changed

Reuse the existing `C360.signals.whatChanged()` — it already exists and is already wired
into `intelligenceEngine.js`. Phase 7 extends it to include scorecard deltas:

```text
WHAT CHANGED

• Camera issue escalated              (support health 52 → 38)
• Quote inactive                      (new P2 override)
• Renewal approaching                 (61 days)
• Priority raised P2 → P0             (cancellation signal, Aug 20)
```

Score deltas need a stored previous run. Until the Phase 6 refresh has persisted at least
two runs, show the signal changes only and say the score history is not yet available.
Do not invent a previous value to compute a delta against.

---

## 10. Bidirectional traversal

The design principle this phase must satisfy:

```text
DATA → SIGNALS → HEALTH → PRIORITY → ACTION
```

and backwards, at every step:

```text
ACTION → WHY? → SIGNALS → EVIDENCE → SOURCE
```

Concretely: from any recommendation the user reaches its `why`, from `why` the signals,
from a signal its evidence, from evidence the source record — with no dead ends. Walk this
path manually for at least three fixture accounts before calling the phase done.

The system must not become a generic "AI customer summary." A narrative paragraph you
cannot click into is exactly the failure mode.

---

## 11. Files

### Create

```text
js/ui/scorecard.js    account scorecard block + drawers
```

### Touch

```text
index.html      new script (after js/ui/render.js); scorecard container div, c360- prefixed
addin.css       scorecard + drawer styles, c360- prefixed
js/ui/app.js    render the scorecard, wire routing from the portfolio
js/ui/render.js reuse existing section renderers for evidence deep-links
js/ui/components.js  reuse existing drawer/disclosure components if present
tests/check-app.cjs, tests/check-wiring.cjs   extend for the new block
```

Do not modify `js/intelligence/*` or any service in this phase. If the UI needs a value
that does not exist, add it in the owning engine phase, not here.

---

## 12. Config added

```javascript
C360.scorecardConfig.display = {
    /** Evidence grouping order in the drawer. */
    evidenceGroups: ["internal", "commercial", "communication", "external"],

    evidenceGroupLabels: {
        internal:      "Internal",
        commercial:    "Commercial",
        communication: "Communication",
        external:      "External"
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
    unavailableLabel: "Data unavailable"
};
```

---

## 13. Tests

| # | Test | Expected |
| - | ---- | -------- |
| 7.1 | Health score rendered anywhere | breakdown is reachable from it |
| 7.2 | Breakdown rows | sum to the displayed total at `breakdownDecimals` |
| 7.3 | Breakdown values | come from the engine, never hardcoded |
| 7.4 | Unavailable category | renders `Data unavailable`, not `0` or `—` |
| 7.5 | Re-normalised weights | stated on the face of the breakdown |
| 7.6 | Priority displayed | `Why?` list present and non-empty |
| 7.7 | Override-set level | override reason and source both rendered |
| 7.8 | Confidence below threshold | limitations rendered above the number |
| 7.9 | Every evidence entry | resolves to a real record or an existing page section |
| 7.10 | External evidence | shows identity confidence |
| 7.11 | Score component with no evidence | renders `No supporting records` |
| 7.12 | Text-derived evidence | shows the matched excerpt, date and source |
| 7.13 | No prior run stored | "score history not yet available", no invented delta |
| 7.14 | Traversal walk | action → why → signals → evidence → source, no dead ends, 3 fixtures |
| 7.15 | Existing account page sections | order and behaviour unchanged |
| 7.16 | Portfolio → account → back | preserves the portfolio's filters and sort |
| 7.17 | All new ids and classes | `c360-` prefixed |
| 7.18 | Drawers | keyboard reachable, correct ARIA expanded state |
| 7.19 | Mock data source | banner still visible on the account page |

---

## 14. Exit criteria

- [ ] `js/ui/scorecard.js` exists, holds all scorecard DOM, and computes nothing.
- [ ] Health, Priority and Confidence appear at the top of the account page, each with a drawer.
- [ ] The health breakdown shows real arithmetic that sums to the displayed total.
- [ ] The priority drawer names the override when one set the level.
- [ ] The confidence drawer lists per-source states and limitations.
- [ ] Every evidence entry reaches a real record or an existing page section.
- [ ] External evidence carries identity confidence.
- [ ] "What changed" includes score deltas once history exists, and never invents one.
- [ ] The backwards traversal is verified by hand on three fixtures.
- [ ] Existing Customer 360 sections are unchanged.
- [ ] Navigation from and back to the Command Center preserves filter state.
- [ ] All tests pass, including Phases 1–6.

---

## 15. Do NOT

- Do not display any score without its explanation.
- Do not hardcode the example numbers in this document.
- Do not round a mismatch away — surface it.
- Do not render an evidence label that goes nowhere.
- Do not invent a previous score to show a trend.
- Do not compute anything in `js/ui/scorecard.js`.
- Do not reorder or restyle the existing Customer 360 sections.
- Do not let the scorecard become an unclickable narrative paragraph.
