# Phase 3 — Priority Engine & Critical Overrides

**Goal:** produce urgency as a **separate** output from health — a P0–P3 level and a
0–100 priority score — with a critical-override engine that records why it fired.

| | |
| --- | --- |
| **Source sections** | Appendix A §12, §13, §14, §15, §39 |
| **Depends on** | Phases 1, 2 |
| **Unlocks** | Phases 4, 5, 6, 7 |
| **AI involved** | No |

> Read [the global rules](./README.md#global-rules--these-apply-to-every-phase) first.
> G2 (deterministic) and G4 (never unexplained) govern this phase.

This is the phase where the product's core claim is either true or false. Health and
priority must be able to disagree:

```text
Health: 75    Priority: P1 / 91    (healthy account, critical unresolved camera issue)
Health: 42    Priority: P3 / 48    (unhealthy account, nothing urgent today)
```

---

## 1. In scope

- The critical-override engine (P0/P1/P2/P3 rules), each with a recorded reason and source.
- The weighted priority score.
- The combined `{ level, score, reasons, primaryReason }` output.
- The priority explanation payload.

## 2. Out of scope

- Queue classification (Phase 4) — priority says *how urgently*, queues say *what kind*.
- Action text, owner, due date (Phase 5).
- Any UI (Phases 6–7).

---

## 3. Order of operations

The weighted health score **must not** be the only mechanism determining urgency. Run the
override engine as a distinct step:

```text
signals + health + segment + lifecycle
        ↓
  OVERRIDE ENGINE          -> a floor on the priority level, with a reason
        ↓
  PRIORITY SCORE           -> weighted 0-100, deterministic
        ↓
  { level, score, reasons }
```

An override sets a **floor**, not a fixed value. A P1 override on an account whose scored
priority would otherwise be P0 stays P0. Overrides can only raise urgency, never lower it.

---

## 4. Critical override rules

### P0 — Immediate

```text
Explicit cancellation request
Explicit competitor-switch request
Safety-critical issue
HOS/compliance-critical problem
Executive escalation
Service outage
```

### P1 — High

```text
Critical ticket beyond SLA
Renewal within 90 days + negative signals
Overdue commitment made to customer
```

### P2 — Medium

```text
Quotation awaiting response beyond defined period
Account review overdue
Qualified expansion opportunity
```

### P3 — Routine

```text
Healthy account
Routine engagement
Long-term nurture
Non-urgent opportunity
```

Every rule is a named, individually testable function. Every fired rule records **why**
and **from where**:

```text
P0 OVERRIDE

Reason:
Customer explicitly requested cancellation.

Source:
Email — Aug 20, 2026

This override takes precedence over the
weighted health score.
```

Notes on specific rules:

- *"Renewal within 90 days + negative signals"* — the 90 days comes from the segment's
  `renewalWindowDays` (Phase 1), not a literal. "Negative signals" must be an explicit,
  enumerated list in config, not "health is low".
- *"Quotation awaiting response beyond defined period"* — reuse
  `config.thresholds.staleQuoteDays` and the existing `staleQuotes` signal.
- *"Account review overdue"* — from the segment's `reviewOverdueDays`.
- *"Overdue commitment"* — requires a commitment record with a date that has passed.
  If commitments are not yet a tracked source, this rule reports itself as unavailable
  rather than never firing silently. Note it in the Phase 1 audit.
- P3 is the **default floor**, not an override. Nothing needs to fire for an account to be P3.

Cancellation, competitor-switch and executive-escalation detection reads unstructured
text. In Phase 3 that detection is **deterministic keyword/pattern matching over source
records**, with the matched span kept as evidence. AI-assisted extraction arrives in
Phase 8 and must not change the score — it only proposes signals that the same
deterministic rules then act on.

---

## 5. Priority score

| Factor | Weight |
| ------ | -----: |
| Risk Severity | 35% |
| Time Sensitivity | 25% |
| Account Value / Strategic Importance | 20% |
| Overdue Commitments | 10% |
| Expansion Readiness | 10% |

```text
Priority =
  Risk Severity         × 0.35
+ Time Sensitivity      × 0.25
+ Strategic Importance  × 0.20
+ Overdue Commitments   × 0.10
+ Expansion Readiness   × 0.10
```

Implemented deterministically. The AI does not calculate the final number.

Each factor is itself 0–100 and carries its inputs:

- **Risk Severity** — severity and unresolved state of the worst active risk. Reuse
  `js/intelligence/risks.js`.
- **Time Sensitivity** — days to the nearest hard deadline (renewal, SLA, commitment,
  quote expiry). Nearer is higher.
- **Strategic Importance** — segment plus account value. From Phase 1; never inferred
  from how loud the account has been.
- **Overdue Commitments** — count and age of missed commitments.
- **Expansion Readiness** — qualified opportunity strength. Reuse
  `js/intelligence/opportunities.js`.

Note that Expansion Readiness *raises* priority. A healthy account with a strong
expansion signal should surface — that is the GROW queue in Phase 4 — so do not treat
priority as a synonym for risk.

---

## 6. Level and score are both required

Priority is represented as **both**:

```text
P0
91 / 100
```

```text
P2
67 / 100
```

```text
P0 = Immediate
P1 = High
P2 = Medium
P3 = Routine
```

The mapping from score to level, and the interaction with the override floor:

```text
level = max( levelFromScore(score), overrideFloor )     where P0 > P1 > P2 > P3
```

`levelFromScore` boundaries live in config. When the two disagree, the explanation must
say which one set the level.

---

## 7. Every priority explains itself

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

Requirements:

1. `reasons[]` is ordered by contribution, highest first.
2. `primaryReason` is the override that set the floor if one fired, otherwise the
   highest-contributing factor.
3. Every reason links to evidence — the ticket, quote, email or record it came from.
4. Never render a bare number. `Priority: 92` with no `Why?` is a defect, not a styling gap.

---

## 8. Required output shape

`C360.priority.build(bundle, signals, health, identity, segment)`:

```javascript
{
  level: "P0",
  score: 91,
  levelSetBy: "override",              // "override" | "score"
  overrides: [
    {
      rule: "explicitCancellationRequest",
      level: "P0",
      reason: "Customer explicitly requested cancellation.",
      source: { type: "email", id: "...", date: "2026-08-20", excerpt: "..." },
      fired: true
    }
  ],
  factors: [
    { key: "riskSeverity", label: "Risk Severity", score: 95, weight: 0.35,
      contribution: 33.25, inputs: [ ... ] }
    // ... four more
  ],
  reasons: [
    { text: "Cancellation language detected", evidence: [ ... ] }
  ],
  primaryReason: "Explicit cancellation signal",
  unavailableFactors: []               // e.g. commitments not tracked yet
}
```

An unavailable factor follows the same rule as Phase 2: re-normalise the remaining
weights and say so. Do not score it 0.

---

## 9. Config added

```javascript
C360.scorecardConfig.priority = {
    weights: {
        riskSeverity:        0.35,
        timeSensitivity:     0.25,
        strategicImportance: 0.20,
        overdueCommitments:  0.10,
        expansionReadiness:  0.10
    },

    /** Score -> level. Override floors are applied on top of this. */
    levelFromScore: [
        { min: 85, level: "P0" },
        { min: 70, level: "P1" },
        { min: 50, level: "P2" },
        { min:  0, level: "P3" }
    ],

    levelLabels: { P0: "Immediate", P1: "High", P2: "Medium", P3: "Routine" },

    overrides: {
        p0: ["explicitCancellationRequest", "explicitCompetitorSwitch", "safetyCritical",
             "hosComplianceCritical", "executiveEscalation", "serviceOutage"],
        p1: ["criticalTicketBeyondSla", "renewalWindowWithNegativeSignals",
             "overdueCommitment"],
        p2: ["quoteAwaitingResponse", "accountReviewOverdue", "qualifiedExpansion"]
    },

    /** Which signals count as "negative" for renewalWindowWithNegativeSignals. */
    negativeSignalKeys: ["technicalEscalation", "billingEscalation", "repeatIssue",
                         "ageingTickets", "staleReview", "orderVolumeDown",
                         "competitorMention", "downgradeRequest"],

    /** Deterministic detection patterns. Evidence keeps the matched span. */
    detection: {
        cancellation:      ["cancel", "cancellation", "terminate", "terminating", "not renewing", "end our contract"],
        competitorSwitch:  ["switching to", "moving to", "evaluating", "competitor", "rfp"],
        executiveEscalation: ["escalated to", "our ceo", "our vp", "executive"],
        downgrade:         ["downgrade", "reduce", "fewer vehicles", "scale back"]
    },

    /** SLA hours by ticket severity, for criticalTicketBeyondSla. */
    slaHours: { critical: 24, high: 72, medium: 120, low: 240 }
};
```

Keyword lists are a starting point and a known weak spot — they will produce false
positives ("we are evaluating our routes"). Phase 9's feedback loop is how they get
tuned. Keep them in config precisely so they can be argued about.

---

## 10. Tests

The critical tests are the ones that prove health and priority are independent.

| # | Test | Expected |
| - | ---- | -------- |
| 3.1 | Healthy account, no issues | High health, low priority, `P3` |
| 3.2 | Healthy account **plus** one critical unresolved issue | High/medium health, `P0`/`P1` priority |
| 3.3 | Unhealthy account, nothing urgent | Low health, `P3` |
| 3.4 | Explicit cancellation request | `P0`, `levelSetBy: "override"` |
| 3.5 | Explicit competitor-switch request | `P0` |
| 3.6 | Critical ticket past SLA | `P1` (or higher if score exceeds it) |
| 3.7 | Renewal in <90 days plus negative signals | `P1` |
| 3.8 | Renewal in <90 days, **no** negative signals | not `P1` by this rule |
| 3.9 | Overdue quote past `staleQuoteDays` | `P2` |
| 3.10 | Account review overdue for its segment | `P2` |
| 3.11 | Same review age, different segment | fires for one, not the other |
| 3.12 | Healthy expansion opportunity | `P2`/`P3`, priority raised by expansion factor |
| 3.13 | P1 override on an account scoring 92 | stays `P0` — floor, not assignment |
| 3.14 | Every fired override | has `reason` **and** `source` |
| 3.15 | Sum of factor contributions | equals `score` |
| 3.16 | Commitments source unavailable | listed in `unavailableFactors`, weights re-normalised, never scored 0 |
| 3.17 | Any priority output | `reasons[]` non-empty and `primaryReason` set |
| 3.18 | Missing data | no fabricated score inputs, lower confidence, graceful explanation |
| 3.19 | `build()` twice on same input | identical output |

Test 3.2 is the one that verifies the whole design. If it fails, priority is still a
function of health.

---

## 11. Exit criteria

- [ ] `js/scorecard/overrides.js` and `js/scorecard/priority.js` exist, are pure, and are loaded by `index.html`.
- [ ] Every override rule is a named function with its own test.
- [ ] Overrides raise but never lower the level, and record reason + source.
- [ ] The weighted formula matches §5 exactly and is covered by a hand-arithmetic test.
- [ ] Output carries `level`, `score`, `levelSetBy`, `factors[]`, `reasons[]`, `primaryReason`.
- [ ] Tests 3.1–3.3 together demonstrate health and priority are independent.
- [ ] All weights, boundaries, SLA hours and detection patterns read from `scorecardConfig`.
- [ ] `node tests/run-tests.cjs` passes, including Phases 1–2.

---

## 12. Do NOT

- Do not derive priority from health, or health from priority.
- Do not let an override set the level downward.
- Do not fire an override without recording its reason and source record.
- Do not let the model compute the score.
- Do not hardcode 90 days, SLA hours, or any keyword list in a rule body.
- Do not emit a priority with an empty `reasons[]`.
- Do not treat priority as risk-only — expansion readiness is a legitimate 10%.
