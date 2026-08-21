# Phase 5 — Recommended Action Engine

**Goal:** turn every queue entry into a specific, evidenced, owned, dated recommendation —
never "Contact customer."

| | |
| --- | --- |
| **Source sections** | Appendix A §20, §21, §22, §23, §24 |
| **Depends on** | Phases 3, 4 |
| **Unlocks** | Phases 6, 7, 8, 9 |
| **AI involved** | No — drafts are templated here, AI drafting arrives in Phase 8 |

> Read [the global rules](./README.md#global-rules--these-apply-to-every-phase) first.
> G6 (read-only, approval required) and G7 (never fabricate) govern this phase.

---

## 1. In scope

- Deterministic signal → action mappings.
- The seven-part recommendation record.
- Owner assignment.
- Due-date derivation from priority.
- Templated draft communications, held as drafts.

## 2. Out of scope

- AI-generated draft prose (Phase 8). Phase 5 uses deterministic templates so the
  approval flow, the UI and the tests can all be built and verified without a model.
- Actually sending anything, ever, without explicit human approval.

---

## 3. Every recommendation has seven parts

```text
WHY
EVIDENCE
ACTION
OWNER
DUE DATE
DRAFT
CONFIDENCE
```

A recommendation missing any of the first five is a defect. `DRAFT` is optional per action
type. `CONFIDENCE` is required and reuses the existing vocabulary in
`config.confidence` (`High` / `Medium` / `Low`) so the wording never drifts.

Worked example:

```text
RECOMMENDED ACTION

Why:
Customer has a critical camera issue open for 14 days
and the ticket has exceeded SLA.

Evidence:
• Ticket #1234
• Opened Aug 6
• SLA breached Aug 9
• Last customer update Aug 15

Action:
Escalate internally, obtain a confirmed resolution ETA,
then proactively update the customer.

Suggested owner:
Account Manager + Technical Support

Due:
Today

Confidence:
High
```

Note the *shape* of that action: internal escalation **before** customer contact. The
engine must be able to express ordering like this — an action is a short ordered list of
steps, not a single sentence.

---

## 4. Deterministic action mappings

Implement these as data, not as branches scattered through the code.

### Cancellation

Signal: `Cancellation language`

```text
Call customer
Identify root cause
Review contract
Prepare retention options
```

### Critical ticket

Signal: `Critical unresolved ticket`

```text
Escalate internally
Obtain ETA
Prepare proactive customer update
```

### Inactive quote

Signal: `Quote > 5 business days without response`

```text
Draft follow-up
Identify decision blocker
```

Note this threshold (5 business days) differs from the Phase 3 override threshold
(`config.thresholds.staleQuoteDays`, currently 30). They are answering different
questions — "should someone follow up?" versus "is this account's priority elevated?" —
so keep both, name them differently, and put the follow-up window in config as
`quoteFollowUpBusinessDays`.

### Account review overdue

```text
Prepare account brief
Prepare meeting agenda
Recommend review
```

### Device health problem

```text
Generate device audit
Identify affected vehicles
Create troubleshooting plan
```

### Portal adoption decline

```text
Recommend targeted training
Identify unused features
```

### Safety concern

```text
Prepare camera/coaching/safety recommendation
```

### Competitor signal

```text
Summarize competitor signal
Identify customer concern
Summarize current customer value
Prepare retention strategy
```

### Overdue commitment

```text
Notify owner
Prepare transparent customer update
```

### Strong health + operational pain

```text
Identify relevant expansion solution
Build business case
```

Where no mapping matches, emit **no** recommendation. Do not fall back to "Contact
customer" — a generic action is worse than none, because it trains the user to ignore the
column.

---

## 5. Ownership

Every action has an owner. Possible owners:

```text
Sean
Account Manager
Customer Success
Technical Support
Billing
Sales
Product
Leadership
```

An owner may be a combination (`Account Manager + Technical Support`).

When the owner cannot be determined:

```text
Owner:
Unassigned
```

**Do not guess.** Owner assignment is a config-driven mapping from action type to owner
role, plus the account's actual assigned rep where the CRM records one. If the CRM has no
rep, the answer is `Unassigned`, not the most likely person.

---

## 6. Due dates

Generated from actual urgency, driven by the Phase 3 priority level:

```text
P0    Today
P1    Within 1 business day
P2    Within 3–5 business days
P3    Routine
```

Other permitted forms, when a hard date exists in the data:

```text
Today
Tomorrow
Within 3 business days
Before renewal
Before next account review
```

Make these configurable. Where a hard deadline exists (renewal date, SLA expiry,
commitment date) and it is sooner than the priority-derived date, the hard deadline wins
and the recommendation says which deadline it is anchored to. Business-day arithmetic
must skip weekends; holidays are out of scope for MVP but the helper should take a
holiday list so it can be added.

---

## 7. Draft communications

The system can generate:

```text
Customer email
Internal escalation
Meeting agenda
Follow-up message
```

These **must remain drafts**.

```text
DRAFT CUSTOMER EMAIL

Subject:
Following up on your camera issue

Hi John,

I wanted to follow up on the camera issue affecting
your fleet...

[Edit Draft]

[Approve & Send]
```

Requirements:

1. The default implementation **must not** send. There is no send path in Phase 5 at all —
   `[Approve & Send]` is wired to the approval flow in Phase 8, and until then it is
   disabled with a visible reason.
2. A draft may only name a **verified** contact. The existing
   `js/intelligence/recommendations.js` already enforces "a recommendation may only name a
   verified contact" (contacts are ranked before recommendations run, in
   `intelligenceEngine.js`) — keep that invariant.
3. A draft may not state a fact that is not in the evidence list. No invented ETAs, no
   invented apologies for things that did not happen, no invented commitments.
4. Every draft is labelled `DRAFT` in the data, not only in the CSS.

---

## 8. Required output shape

`C360.actionEngine.build({ signals, risks, opportunities, contacts, health, priority, queues, segment })`:

```javascript
{
  recommendations: [
    {
      id: "rec-criticalTicket-1234",
      queue: "fix",
      rule: "criticalTicketBeyondSla",

      why: "Customer has a critical camera issue open for 14 days and the ticket has exceeded SLA.",

      evidence: [
        { label: "Ticket #1234", type: "ticket", id: "1234", date: "2026-08-06" },
        { label: "SLA breached Aug 9", type: "sla", date: "2026-08-09" },
        { label: "Last customer update Aug 15", type: "communication", date: "2026-08-15" }
      ],

      action: {
        summary: "Escalate internally, obtain a confirmed resolution ETA, then proactively update the customer.",
        steps: ["Escalate internally", "Obtain ETA", "Prepare proactive customer update"]
      },

      owner: { roles: ["Account Manager", "Technical Support"], assignedTo: null, resolved: true },

      due: { label: "Today", date: "2026-08-21", anchor: "priority:P0", isHardDeadline: false },

      drafts: [
        { kind: "customerEmail", subject: "Following up on your camera issue",
          body: "...", recipient: { contactId: "c-9", verified: true },
          status: "draft", sendable: false }
      ],

      confidence: "High"
    }
  ],
  suppressed: [
    { rule: "someRule", reason: "No verified contact available for the draft" }
  ]
}
```

`suppressed[]` matters: when the engine declines to recommend something, say why. Silent
omission is indistinguishable from a bug.

---

## 9. Config added

```javascript
C360.scorecardConfig.actions = {
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
        }
    },

    owners: ["Sean", "Account Manager", "Customer Success", "Technical Support",
             "Billing", "Sales", "Product", "Leadership"],
    unassignedLabel: "Unassigned",

    dueDates: {
        P0: { label: "Today",                  businessDays: 0 },
        P1: { label: "Within 1 business day",  businessDays: 1 },
        P2: { label: "Within 3–5 business days", businessDays: 5 },
        P3: { label: "Routine",                businessDays: null }
    },

    /** A hard deadline nearer than the priority-derived date wins. */
    hardDeadlineAnchors: ["sla", "renewal", "commitment", "quoteExpiry"],

    /** Follow-up window for an unanswered quote. Distinct from thresholds.staleQuoteDays. */
    quoteFollowUpBusinessDays: 5,

    drafts: {
        kinds: ["customerEmail", "internalEscalation", "meetingAgenda", "followUpMessage"],
        /** No send path exists before Phase 8. */
        sendingEnabled: false,
        requireVerifiedContact: true
    },

    /** Emit nothing rather than a generic action. */
    allowGenericFallback: false
};
```

---

## 10. Tests

| # | Test | Expected |
| - | ---- | -------- |
| 5.1 | Every recommendation | has why, evidence, action, owner, due, confidence |
| 5.2 | No mapping matches the signal | no recommendation emitted, and nothing generic |
| 5.3 | Critical-ticket recommendation | steps ordered escalate → ETA → customer update |
| 5.4 | Cancellation recommendation | four mapped steps, owner `Account Manager` |
| 5.5 | CRM has no assigned rep and no owner mapping | owner is `Unassigned`, not guessed |
| 5.6 | P0 recommendation | due `Today` |
| 5.7 | P1 recommendation | due within 1 business day |
| 5.8 | P2 on a Thursday | due date skips the weekend |
| 5.9 | P2 with SLA expiring tomorrow | due anchored to the SLA, `isHardDeadline: true` |
| 5.10 | Every draft | `status: "draft"`, `sendable: false` |
| 5.11 | No verified contact | customer-email draft suppressed with a reason in `suppressed[]` |
| 5.12 | Draft body | contains no claim absent from `evidence[]` |
| 5.13 | Evidence entries | every one resolves to a real source record id |
| 5.14 | Existing recommendation behaviour | `js/intelligence/recommendations.js` output unchanged |
| 5.15 | `build()` twice on same input | identical output |

Test 5.12 is the hard one and needs a real assertion, not a review note: assert that every
date, ticket number and named person appearing in a draft body also appears in that
recommendation's evidence or verified-contact record.

---

## 11. Exit criteria

- [ ] `js/scorecard/actionRules.js` and `js/scorecard/actionEngine.js` exist, are pure, and are loaded by `index.html`.
- [ ] All eleven mappings from §4 are implemented as config data.
- [ ] Every recommendation carries all seven parts, with `Unassigned` where owner is unknown.
- [ ] Due dates derive from priority, with hard deadlines overriding, and skip weekends.
- [ ] Drafts exist, are labelled draft in the data, and have no send path.
- [ ] Drafts only name verified contacts and only assert evidenced facts.
- [ ] `suppressed[]` explains every declined recommendation.
- [ ] No generic fallback action anywhere.
- [ ] `node tests/run-tests.cjs` passes, including Phases 1–4.

---

## 12. Do NOT

- Do not emit "Contact customer" or any other generic action.
- Do not guess an owner.
- Do not build a send path in this phase.
- Do not let a draft name an unverified contact or state an unevidenced fact.
- Do not drop a recommendation silently — record it in `suppressed[]`.
- Do not scatter action mappings through conditional branches.
- Do not reuse `staleQuoteDays` as the follow-up window; they answer different questions.
