# Phase 4 — Action Queues (SAVE / FIX / GROW / ENGAGE)

**Goal:** classify what *kind* of attention each account needs into four separate queues,
so nobody has to read one giant undifferentiated list.

| | |
| --- | --- |
| **Source sections** | Appendix A §18, §19 |
| **Depends on** | Phases 2, 3 |
| **Unlocks** | Phases 5, 6 |
| **AI involved** | No |

> Read [the global rules](./README.md#global-rules--these-apply-to-every-phase) first.

Priority says *how urgently*. Queues say *what kind of work*. They are orthogonal — a P0
can be a SAVE or a FIX, and a P3 can be a GROW.

---

## 1. In scope

- Deterministic classification of every account into one primary queue.
- Secondary queue membership where the evidence genuinely supports more than one.
- Queue counts for the portfolio roll-up in Phase 6.
- The per-queue card data structure.

## 2. Out of scope

- The action text itself (Phase 5) — Phase 4 produces `→ Prepare retention call` as a
  *label*, the fully-evidenced recommendation comes next.
- Portfolio screen layout (Phase 6).

---

## 3. The four queues

Do **NOT** create one giant list.

### SAVE — retention and relationship risk

```text
Cancellation
Competitor threat
Renewal risk
Relationship deterioration
```

### FIX — operational and service issues

```text
Technical escalation
Billing issue
Device problem
SLA breach
Overdue support issue
```

### GROW — qualified opportunities

```text
Fleet expansion
New facility
New vehicles
Unused product opportunity
Expansion into new market
```

### ENGAGE — relationship building

```text
Account review overdue
Training required
Inactive customer
Stakeholder coverage gap
```

---

## 4. Classification rules

Each queue is entered by named, individually testable rules that read the signals from
Phase 1–3 — never by re-deriving facts.

Precedence when an account qualifies for more than one:

```text
SAVE  >  FIX  >  GROW  >  ENGAGE
```

Rationale: retention risk outranks an operational problem, which outranks an
opportunity, which outranks routine relationship work. An account with both a
cancellation signal and an SLA breach belongs in SAVE — but the FIX evidence must still
travel with it, because fixing the ticket is very likely *how* you save the account.

Requirements:

1. `primaryQueue` — exactly one, decided by the precedence above.
2. `queues[]` — every queue the account legitimately qualifies for, each with the rule
   that put it there and its evidence.
3. **Do not** put an account in a queue on health score alone. A low health score is not
   by itself a SAVE; a cancellation signal, a renewal risk, a competitor threat or
   measurable relationship deterioration is.
4. **Do not** put an account in GROW without a *qualified* opportunity. "No usage found
   for product X" is a product gap, not a qualified opportunity — the existing
   `js/intelligence/opportunities.js` already words this carefully, and
   `config.productCatalogue` is explicitly our own catalogue, not a claim about the
   customer. Keep that discipline.
5. An account with nothing to do is in **no** queue. Do not manufacture an ENGAGE item to
   avoid an empty row. The portfolio summary is allowed to say most accounts need nothing.
6. Precedence and rule-to-queue mapping live in config.

---

## 5. Card shape and UI contract

Phase 6 renders these; Phase 4 defines the data.

```text
┌───────────────────────────────────────────┐
│ SAVE                                      │
│                                           │
│ ACME Transportation          P0           │
│ Cancellation signal                       │
│                                           │
│ → Prepare retention call                  │
└───────────────────────────────────────────┘
```

```text
┌───────────────────────────────────────────┐
│ FIX                                       │
│                                           │
│ ABC Logistics                 P1          │
│ Critical ticket beyond SLA                │
│                                           │
│ → Escalate internally                     │
└───────────────────────────────────────────┘
```

Each card carries: account name, priority level, the one-line reason, and the action
label. Cards inside a queue are ordered by priority score descending.

---

## 6. Required output shape

`C360.queues.classify(account, signals, health, priority)`:

```javascript
{
  primaryQueue: "save",                       // save | fix | grow | engage | null
  queues: [
    {
      key: "save",
      label: "SAVE",
      rules: [
        { rule: "cancellationSignal",
          reason: "Cancellation signal",
          evidence: [ { type: "email", id: "...", date: "2026-08-20" } ] }
      ],
      actionLabel: "Prepare retention call"
    },
    {
      key: "fix",
      label: "FIX",
      rules: [ { rule: "criticalTicketBeyondSla", reason: "Critical ticket beyond SLA", evidence: [ ... ] } ],
      actionLabel: "Escalate internally"
    }
  ]
}
```

And a portfolio-level roll-up used by Phase 6:

```javascript
C360.queues.rollup(scoredAccounts)
// -> { save: 4, fix: 8, grow: 9, engage: 21, none: 85 }
```

Counted by `primaryQueue`, so the queue counts plus `none` equal the account total. State
this in the UI so nobody reads the four numbers as adding up to the portfolio.

---

## 7. Config added

```javascript
C360.scorecardConfig.queues = {
    precedence: ["save", "fix", "grow", "engage"],

    labels: { save: "SAVE", fix: "FIX", grow: "GROW", engage: "ENGAGE" },

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

    /** A GROW entry requires a qualified opportunity, not merely an absence of usage. */
    growRequiresQualifiedOpportunity: true
};
```

---

## 8. Tests

| # | Test | Expected |
| - | ---- | -------- |
| 4.1 | Cancellation signal | `primaryQueue: "save"` |
| 4.2 | Cancellation signal **and** SLA breach | primary SAVE, FIX present in `queues[]` with its evidence |
| 4.3 | SLA breach only | `primaryQueue: "fix"` |
| 4.4 | Healthy account with qualified fleet-expansion signal | `primaryQueue: "grow"`, P2/P3 |
| 4.5 | Product gap only ("no usage found") | **not** in GROW |
| 4.6 | Account review overdue for its segment | `primaryQueue: "engage"` |
| 4.7 | Low health score, no risk signal | **not** in SAVE |
| 4.8 | Healthy account, nothing outstanding | `primaryQueue: null`, `queues: []` |
| 4.9 | Every queue entry | has a `rule`, a `reason` and non-empty `evidence` |
| 4.10 | `rollup()` | queue counts + `none` equals the account total |
| 4.11 | Cards within a queue | ordered by priority score descending |
| 4.12 | Precedence reordered in config | classification follows the new precedence |
| 4.13 | `classify()` twice on same input | identical output |

---

## 9. Exit criteria

- [ ] `js/scorecard/queues.js` exists, is pure, and is loaded by `index.html`.
- [ ] Four queues, one `primaryQueue`, full `queues[]` membership with evidence.
- [ ] Precedence and rule mapping read from `scorecardConfig`.
- [ ] No account enters a queue on health score alone.
- [ ] No account enters GROW without a qualified opportunity.
- [ ] Accounts with nothing to do are in no queue.
- [ ] `rollup()` reconciles against the total account count.
- [ ] `node tests/run-tests.cjs` passes, including Phases 1–3.

---

## 10. Do NOT

- Do not build one combined list.
- Do not classify on health score alone.
- Do not manufacture an ENGAGE item so a row is not empty.
- Do not count an account in more than one queue in the roll-up.
- Do not treat a product-catalogue gap as a qualified opportunity.
- Do not put the full recommendation text here — that is Phase 5.
