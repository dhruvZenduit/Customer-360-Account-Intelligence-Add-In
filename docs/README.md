# Customer Portfolio Command Center — Phased Build Plan

This folder breaks the **Customer Portfolio Health & Action Scorecard** brief into
**nine sequential phases**, one document each.

The brief is preserved verbatim in [Appendix A](./appendix-a-source-spec.md).
The phase-level master plan is [`../newStuff.txt`](../newStuff.txt).

---

## What we are building

We are adding a layer to the **existing** Customer 360 / Account Intelligence add-in.
We are not building a new app and not replacing what is there.

The layer answers four questions per account:

1. How healthy is this customer?
2. How urgently should we act?
3. Why is this customer receiving this priority?
4. What specifically should we do next?

And it produces **three separate outputs** — never collapsed into one number:

```text
HEALTH SCORE        How healthy is the account?
PRIORITY SCORE      How urgently should someone act?
RECOMMENDED ACTION  What specifically should happen next?
```

A customer can legitimately be `Health 75 / Priority P1 91` (healthy account, one
critical unresolved camera issue) or `Health 42 / Priority P3 48` (unhealthy account,
nothing to do today). If your implementation cannot produce both of those, the two
scores are still coupled somewhere.

---

## Phase index

| Phase | Document | Goal | Depends on |
| ----: | -------- | ---- | ---------- |
| 1 | [Foundation, Identity & Data Model](./phase-1-foundation-identity-data-model.md) | Canonical account identity, segments, lifecycle, config skeleton | — |
| 2 | [Health Engine & Data Confidence](./phase-2-health-engine.md) | Deterministic 0–100 health across 5 categories, plus confidence % | 1 |
| 3 | [Priority Engine & Critical Overrides](./phase-3-priority-and-overrides.md) | P0–P3 level and 0–100 priority score, with recorded reasons | 1, 2 |
| 4 | [Action Queues](./phase-4-action-queues.md) | SAVE / FIX / GROW / ENGAGE classification | 2, 3 |
| 5 | [Recommended Action Engine](./phase-5-action-engine.md) | Why / Evidence / Action / Owner / Due / Confidence | 3, 4 |
| 6 | [Portfolio Command Center](./phase-6-portfolio-command-center.md) | Portfolio dashboard, Top 10 queue, filters, daily refresh | 4, 5 |
| 7 | [Account Detail & Explainability](./phase-7-account-detail-and-explainability.md) | Scorecard on the Customer 360 page, evidence drawers | 5, 6 |
| 8 | [AI Layer & Human Approval](./phase-8-ai-layer-and-approval.md) | AI for interpretation and drafting only, behind an approval gate | 7 |
| 9 | [Feedback Loop & Success Metrics](./phase-9-feedback-and-metrics.md) | Useful / Incorrect / Not needed / Already handled, plus analytics | 8 |

Phases 1–7 are **fully deterministic**. No AI is introduced until Phase 8, and only
after deterministic scoring demonstrably works.

---

## Global rules — these apply to EVERY phase

Read these before opening any phase document. They are not restated in full inside
each one.

### G1. Keep the four layers separate

```text
FACTS     Direct information from source systems.
          "3 cameras are not communicating." / "Ticket #1234 open 12 days."

SIGNALS   Interpretation of multiple facts.
          "Account may have elevated retention risk."

SCORES    Deterministic calculations.
          "Health = 42, Priority = 91."

ACTIONS   Recommended response.
          "Escalate camera issue internally and obtain ETA before contacting the customer."
```

Do not mix these concepts in one module, one object, or one UI block.
The existing add-in already follows this shape in `js/intelligence/`
(`facts.js` → `signals.js` → `risks.js` / `opportunities.js` → `recommendations.js`).
Extend that pipeline; do not fork it.

### G2. Scoring is deterministic code, never the model

Every weight, threshold and formula is implemented in JavaScript and unit-tested.
AI may extract signals and write prose. AI may **not** produce the number.

### G3. Missing data is missing, not zero

```text
Data unavailable
```

Never convert an absent metric into `0`. An account with no device-health feed is not
an account with terrible device health. Missing data lowers **confidence**, not health.

### G4. Nothing is displayed without an explanation

Never render `Priority: 92` on its own. Every score, level and action carries a
`Why?` and an evidence trail back to the source record.

### G5. The pipeline must be traversable in both directions

```text
DATA → SIGNALS → HEALTH → PRIORITY → ACTION

ACTION → WHY? → SIGNALS → EVIDENCE → SOURCE
```

### G6. Read-only plus recommendation, until explicitly changed

The system must never automatically send customer email, cancel contracts, change
pricing, issue credits, modify devices, write to CRM, close tickets, change
subscriptions, or commit anything to a customer. See Phase 8.

### G7. Never fabricate

No invented contacts, tickets, quotes, scores, signals, outcomes, financials or
company information. Development fixtures are allowed only when clearly labelled as
mock — the add-in already renders a `#c360-mock-banner` for exactly this. Keep using it.

Do not claim an API integration exists if it does not.

### G8. Nothing hardcoded that a human might want to argue about

Thresholds, weights, cadences, segment rules and due-date policies all live in config.
`js/core/config.js` already has a `thresholds` block whose comment states this
rationale — follow it.

### G9. Respect the existing add-in's conventions

- No build step, no dependencies. Classic scripts, each adding one property to `window.C360`.
- Load order in `index.html` is dependency order: core → normalise → services → intelligence → ui.
- Every DOM id and class is prefixed `c360-`, because MyGeotab injects this page into its own document.
- No secrets in client code. Credentials live behind the gateway (`js/services/gatewayClient.js`).
- Tests are plain Node against a `window` stub: `node tests/run-tests.cjs`.
- Engine functions are pure — same input, same output, no I/O. That is what makes them testable without a browser.

### G10. Do not break what exists

The current Customer 360 must keep working at every commit. The scorecard is
**additive**. If a phase needs to change existing behaviour, say so explicitly in that
phase's *Files touched* section, and cover it with a test first.

---

## MVP scope (applies to Phases 1–7)

Start with **20–30 accounts**, deliberately sampled to include:

```text
Healthy
At Risk
High Value
Recently Cancelled
Expansion
Technical Problems
Billing Problems
Inactive
```

The first end-to-end version must: import CRM / ticket / quote / device-health data,
normalise account identity, calculate deterministic health, calculate deterministic
priority, apply critical overrides, generate the four queues, explain every score with
evidence, generate recommended actions, generate communication drafts, require approval
for external actions, and record feedback. That list maps exactly onto Phases 1–9.

---

## Proposed new file layout

New code lands under `js/scorecard/` so the existing `js/intelligence/` tree stays
recognisable. Each phase document names its exact files.

```text
js/core/scorecardConfig.js        weights, thresholds, segments, SLAs, due-date policy
js/scorecard/identity.js          Phase 1  master account identity + identity confidence
js/scorecard/segments.js          Phase 1  segment + lifecycle resolution
js/scorecard/healthScore.js       Phase 2  five category sub-scores + weighted 0-100
js/scorecard/confidence.js        Phase 2  data-confidence percentage
js/scorecard/overrides.js         Phase 3  P0-P3 critical override engine
js/scorecard/priority.js          Phase 3  weighted 0-100 priority score
js/scorecard/queues.js            Phase 4  SAVE / FIX / GROW / ENGAGE
js/scorecard/actionRules.js       Phase 5  signal -> action mappings
js/scorecard/actionEngine.js      Phase 5  assembles Why/Evidence/Action/Owner/Due
js/scorecard/portfolio.js         Phase 6  portfolio roll-up, top-N, filters, refresh
js/scorecard/scorecardEngine.js   Phase 2+ single entry point, mirrors intelligenceEngine.js
js/ui/portfolio.js                Phase 6  Command Center screen
js/ui/scorecard.js                Phase 7  account-level scorecard + evidence drawers
js/scorecard/ai.js                Phase 8  AI adapters (interpretation + drafting only)
js/scorecard/feedback.js          Phase 9  feedback capture
js/scorecard/metrics.js           Phase 9  success metrics
tests/fixtures/                   Phase 1+ deterministic scenario fixtures
```

---

## How to use a phase document

Each one has the same sections:

1. **Goal** — one sentence.
2. **Source sections** — which parts of Appendix A it implements.
3. **Depends on / Unlocks**.
4. **In scope / Out of scope**.
5. **Files to create / Files to touch**.
6. **Requirements** — the normative detail.
7. **Config added**.
8. **Tests**.
9. **Exit criteria** — a checklist. Do not start the next phase until these pass.
10. **Do NOT** — the traps specific to this phase.

---

## Before you write any code

1. Inspect the existing Customer 360 repository.
2. Understand its current architecture.
3. Identify what already exists.
4. Reuse existing APIs, services and components.
5. Do not duplicate existing account intelligence.
6. Add the scorecard as a new intelligence layer.
7. Keep scoring deterministic.
8. Keep AI explainable.
9. Keep external actions human-approved.
10. Build the portfolio view before attempting sophisticated autonomous behaviour.

The finished product is a transparent Customer Portfolio Command Center that answers:

> **Who should I care about today, why, and exactly what should I do?**
