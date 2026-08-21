# Phase 9 — Feedback Loop & Success Metrics

**Goal:** let the user tell the system when it was wrong, and measure whether the Command
Center is actually saving time and catching risk.

| | |
| --- | --- |
| **Source sections** | Appendix A §41, §42, §45 |
| **Depends on** | Phase 8 |
| **Unlocks** | Everything after MVP — this is how the rules get tuned |
| **AI involved** | No — feedback capture is deterministic |

> Read [the global rules](./README.md#global-rules--these-apply-to-every-phase) first.

The Phase 3 keyword lists and Phase 2 thresholds are guesses. This phase is the mechanism
by which they stop being guesses. Do not treat it as optional polish.

---

## 1. In scope

- Per-recommendation feedback capture.
- Optional reason on negative feedback.
- Feedback storage and retrieval.
- The success-metrics layer.
- The full deterministic test-fixture suite (consolidated here).

## 2. Out of scope

- Predictive modelling, auto-tuning, learned weights. **Start with measurement.**
- Sending feedback anywhere outside the org's own store.

---

## 3. Feedback capture

Every recommendation can be marked:

```text
Useful
Incorrect
Not needed
Already handled
```

Optionally ask:

```text
Why was this incorrect?
```

Example record:

```text
Recommendation:
Call customer about camera issue.

Feedback:
Already handled.

Outcome:
Dismissed.
```

Requirements:

1. Feedback attaches to the **rule that fired**, not only to the account. Tuning needs to
   know that `cancellationSignal` produced twelve false positives — knowing that ACME got
   a bad recommendation is not actionable.
2. Store enough context to reproduce the decision: rule id, the evidence ids, the scores
   at the time, the config version. Without these, feedback six weeks old is unusable.
3. The four labels are distinct outcomes and must not be collapsed:
   - **Useful** — the recommendation was right and wanted.
   - **Incorrect** — the system's reasoning was wrong (a false positive). *This is the one
     that indicts a rule.*
   - **Not needed** — the reasoning was right but the action was not warranted. Indicts
     the action mapping, not the signal.
   - **Already handled** — reasoning and action were both right, the work was just already
     done. Indicts the data freshness, not the rules.

   Collapsing these into thumbs up/down destroys the only genuinely useful information here.
4. Feedback is never destructive. Marking a recommendation `Incorrect` records the
   judgment; it does not silently change a score or suppress the rule. Suppression is a
   deliberate config change a human makes after reading the aggregate.
5. Dismissing a recommendation must not delete it. It moves to a dismissed state with its
   feedback attached.
6. Store feedback for future evaluation. Where it is stored depends on the gateway — until
   a gateway write endpoint exists, `sessionStorage` via the existing `js/core/cache.js`
   is a stopgap and the UI must say the feedback is local-only. Do not imply persistence
   that does not exist.

---

## 4. Success metrics

Build a simple analytics layer for the Command Center. Track:

```text
Hours saved
Recommendations accepted
Recommendations rejected
False-positive priority rate
At-risk customers identified
Critical response time
Account reviews completed
Quotes progressed
Retention influenced
Expansion influenced
```

**Do NOT attempt sophisticated predictive modelling initially. Start with measurement.**

Honesty rules for each metric — this list is where a dashboard most easily starts lying:

| Metric | How it is derived | Caveat that must ship with it |
| ------ | ----------------- | ----------------------------- |
| Hours saved | Actions taken × a configured per-action time estimate | It is an **estimate from a constant**, and must be labelled as one. Never present it as measured. |
| Recommendations accepted / rejected | Feedback counts | Denominator is recommendations *with feedback*, not all recommendations. Show the response rate. |
| False-positive priority rate | `Incorrect` feedback ÷ recommendations with feedback, per rule | Per-rule, not global — a global rate hides which rule is broken. |
| At-risk customers identified | Accounts entering SAVE or P0/P1 | Identified, not saved. Do not imply outcome. |
| Critical response time | First action timestamp − P0/P1 detection timestamp | Needs action timestamps; unavailable until actions are tracked. |
| Account reviews completed | Reviews recorded after an ENGAGE recommendation | Correlation, not attribution. |
| Quotes progressed | Quote state change after a follow-up recommendation | Correlation, not attribution. |
| Retention influenced | Renewal after a SAVE recommendation | **Weakest metric here.** Label it as correlation. Never claim the system saved the account. |
| Expansion influenced | Order after a GROW recommendation | Same caveat. |

A metric whose inputs do not yet exist reports `Not yet measurable` — the same rule as
Phase 2's missing categories. Do not show a zero, and do not quietly drop it from the
dashboard.

---

## 5. Consolidated test fixtures

Create deterministic test fixtures. This suite is the regression net for the whole
product, so it lives here in consolidated form even though individual phases add to it.

| Scenario | Expected |
| -------- | -------- |
| Healthy account | High health, low priority, `P3` |
| Healthy account **plus** critical issue | High/medium health, `P0`/`P1` priority — verifies priority is independent of health |
| Cancellation | `P0` |
| Competitor switch | `P0` |
| Critical SLA breach | `P1` |
| Renewal <90 days + negative signals | `P1` |
| Overdue quote | `P2` |
| Account review overdue | `P2` |
| Healthy expansion opportunity | `P2`/`P3`, `GROW` |
| Missing data | No fabricated score inputs, lower confidence, graceful explanation |

Plus the Phase 9 additions:

| Scenario | Expected |
| -------- | -------- |
| Feedback on a recommendation | Rule id, evidence ids, scores and config version all captured |
| Same rule marked `Incorrect` ten times | Aggregate reports that rule's false-positive rate; the rule itself is unchanged |
| Recommendation dismissed | Retained in dismissed state with feedback attached; not deleted |
| Metric with missing inputs | `Not yet measurable`, not `0` |
| Hours-saved figure | Labelled as an estimate, with the per-action constant visible |
| Accept/reject rates | Show the feedback response rate alongside them |
| No gateway write endpoint | UI states feedback is stored locally only |

Every fixture is deterministic — fixed dates, no `Date.now()` in the assertions, no
randomness. The existing harness (`tests/run-tests.cjs`) already stubs `Date`, so pass an
explicit "as of" date through the engines rather than reading the clock inside them. If any
engine reads the clock directly, fix that here.

---

## 6. Files

### Create

```text
js/scorecard/feedback.js        capture, storage, retrieval, aggregation by rule
js/scorecard/metrics.js         metric derivation with availability reporting
js/ui/feedback.js               the four controls + optional reason prompt
tests/fixtures/scenarios/       the consolidated scenario suite from §5
tests/scenario-tests.cjs        runs every scenario against the full pipeline
```

### Touch

```text
index.html                      new scripts
js/ui/scorecard.js              feedback controls on each recommendation
js/ui/portfolio.js              metrics panel
js/core/scorecardConfig.js      the feedback + metrics blocks below
js/services/gatewayClient.js    feedback write endpoint, when one exists
tests/run-tests.cjs             load the scenario suite
```

---

## 7. Config added

```javascript
C360.scorecardConfig.feedback = {
    labels: {
        useful:         "Useful",
        incorrect:      "Incorrect",
        notNeeded:      "Not needed",
        alreadyHandled: "Already handled"
    },

    /** Ask for a reason on these. */
    promptForReasonOn: ["incorrect", "notNeeded"],

    /** Captured with every feedback record so old feedback stays interpretable. */
    captureContext: ["ruleId", "evidenceIds", "healthScore", "priorityScore",
                     "priorityLevel", "queue", "configVersion", "asOfDate"],

    /** Feedback never mutates a score or suppresses a rule automatically. */
    autoSuppressRules: false,

    /** Dismissal retains the record. */
    retainDismissed: true,

    /** "local" until a gateway write endpoint exists. The UI must say which. */
    storage: "local",
    localOnlyNotice: "Feedback is stored in this browser session only."
};

C360.scorecardConfig.metrics = {
    tracked: ["hoursSaved", "recommendationsAccepted", "recommendationsRejected",
              "falsePositivePriorityRate", "atRiskIdentified", "criticalResponseTime",
              "accountReviewsCompleted", "quotesProgressed", "retentionInfluenced",
              "expansionInfluenced"],

    /** Hours saved is an ESTIMATE from this constant. Always labelled as such. */
    estimatedMinutesSavedPerAction: 20,
    hoursSavedLabel: "Estimated hours saved",

    /** False-positive rate is reported per rule, never only globally. */
    falsePositiveRateByRule: true,

    /** Metrics that are correlation only. The UI must say so. */
    correlationOnly: ["retentionInfluenced", "expansionInfluenced",
                      "accountReviewsCompleted", "quotesProgressed"],
    correlationNotice: "Correlation only — not attributed to this system.",

    /** A metric without inputs reports this, never 0. */
    notMeasurableLabel: "Not yet measurable",

    /** No predictive modelling at MVP. */
    predictiveModelling: false
};
```

---

## 8. Tests

| # | Test | Expected |
| - | ---- | -------- |
| 9.1 | Each of the four labels | recorded as a distinct outcome, not collapsed |
| 9.2 | `Incorrect` feedback | prompts for a reason; reason stored when given, optional when not |
| 9.3 | Every feedback record | contains all `captureContext` fields |
| 9.4 | Ten `Incorrect` marks on one rule | aggregate reports that rule's rate; rule behaviour unchanged |
| 9.5 | `autoSuppressRules: false` | no rule is ever disabled by feedback |
| 9.6 | Dismissed recommendation | retained with feedback attached |
| 9.7 | Accept/reject rates | reported with the feedback response rate |
| 9.8 | False-positive rate | available per rule |
| 9.9 | Hours saved | labelled as an estimate, constant visible |
| 9.10 | Correlation-only metrics | render `correlationNotice` |
| 9.11 | Metric with no inputs | `Not yet measurable`, not `0` |
| 9.12 | `storage: "local"` | UI shows `localOnlyNotice` |
| 9.13 | All ten §5 scenarios | produce their expected level and queue |
| 9.14 | Healthy + critical issue scenario | health high, priority `P0`/`P1` — the independence check |
| 9.15 | Whole suite | deterministic across runs; no engine reads the clock directly |
| 9.16 | Config version changes | previously stored feedback still interpretable |

---

## 9. Exit criteria

- [ ] `js/scorecard/feedback.js` and `js/scorecard/metrics.js` exist and are pure where they can be.
- [ ] All four feedback labels are captured as distinct outcomes with full context.
- [ ] Feedback never mutates a score or suppresses a rule automatically.
- [ ] Dismissed recommendations are retained, not deleted.
- [ ] False-positive rate is reported per rule.
- [ ] Every metric either has real inputs or reports `Not yet measurable`.
- [ ] `Hours saved` is visibly an estimate; correlation-only metrics say so.
- [ ] No predictive modelling.
- [ ] Local-only storage is disclosed in the UI until a gateway endpoint exists.
- [ ] The consolidated scenario suite runs green, and includes the health/priority independence check.
- [ ] No engine reads the clock directly — "as of" is injected.
- [ ] All tests pass, including Phases 1–8.

---

## 10. Do NOT

- Do not collapse the four feedback labels into thumbs up/down.
- Do not auto-tune weights or auto-suppress rules from feedback.
- Do not delete a dismissed recommendation.
- Do not report a global false-positive rate only.
- Do not present `Hours saved` as measured.
- Do not claim the system retained or expanded an account.
- Do not show `0` for a metric that has no inputs.
- Do not imply feedback is persisted when it is session-local.
- Do not build predictive modelling in this phase.

---

## 11. After Phase 9

With measurement in place, the tuning loop opens up — in this order:

1. Read the per-rule false-positive rates. Fix the worst rule's patterns or thresholds in
   config. Re-run the scenario suite.
2. Only then consider widening the account set beyond the 20–30 MVP sample.
3. Only then consider whether any weight in Phases 2–3 should change, with the feedback
   data as the argument.
4. Predictive modelling, if ever, comes after all of the above — and after there is enough
   labelled feedback to evaluate it against.

The product goal does not change:

> **Who should I care about today, why, and exactly what should I do?**
