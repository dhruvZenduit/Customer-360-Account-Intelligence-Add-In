# Phase 8 — AI Layer & Human Approval

**Goal:** add AI for interpretation and generation only, behind an explicit approval gate —
after deterministic scoring already works.

| | |
| --- | --- |
| **Source sections** | Appendix A §24, §25, §40, §47 |
| **Depends on** | Phase 7 |
| **Unlocks** | Phase 9 |
| **AI involved** | Yes — and only here |

> Read [the global rules](./README.md#global-rules--these-apply-to-every-phase) first.
> G2 (deterministic scoring), G6 (read-only + approval) and G7 (never fabricate) govern
> this phase absolutely.

**Precondition:** do not start this phase until Phases 1–7 pass their exit criteria. The
whole product works without AI. AI makes it more useful, not more correct.

---

## 1. In scope

- AI-assisted signal extraction from unstructured text, proposed to the deterministic rules.
- AI summaries, explanations and narrative account history.
- AI-written drafts replacing the Phase 5 templates.
- The human approval gate for every external or high-impact action.
- Provenance labelling: what came from a model versus a record.

## 2. Out of scope

- AI computing any score, weight or level.
- Autonomous action of any kind.
- Fine-tuning or model training.

---

## 3. What AI is for

```text
Extracting signals
Summarizing account history
Interpreting unstructured notes
Interpreting emails
Identifying probable risks
Identifying probable opportunities
Explaining priorities
Generating action plans
Drafting communications
Preparing meeting agendas
```

## 4. What AI must never silently do

```text
Calculate health
Calculate priority
Invent evidence
Invent contacts
Invent account activity
Invent financial information
Invent customer sentiment
Take external actions
```

**Use deterministic code for scoring. Use AI for interpretation and generation.**

The dividing line, stated as an implementation rule:

> AI may *propose a signal*. The deterministic engine decides whether that signal fires a
> rule, and the deterministic engine alone produces the number.

So an AI-extracted "cancellation language detected" enters the pipeline as a **proposed
signal with its source excerpt**, is subject to the same Phase 3 override rules as a
keyword match, and is labelled as model-derived wherever it appears. If the model is
removed, every score stays identical — only the recall of text-derived signals drops.

---

## 5. Provenance is mandatory

Every field the model touched is labelled. Non-negotiable, because Phase 7 promised the
user they could trace anything.

```javascript
{
  text: "Customer appears frustrated with repeated camera failures.",
  provenance: "model",                  // "record" | "derived" | "model"
  model: "claude-opus-5",
  sourceRecords: ["email-8821", "ticket-1234"],
  excerpt: "this is the third time this month",
  confidence: "Medium"
}
```

Rules:

1. `provenance: "model"` renders with a visible marker in the UI. Not a tooltip.
2. `sourceRecords` must be non-empty. A model statement with no source record is dropped,
   not displayed.
3. An assertion the model makes that is **not** supported by a listed source record is a
   fabrication. Validate before display: every date, ticket number, monetary figure and
   person named in model output must appear in the supplied context. Drop the output if it
   does not — do not "fix" it silently.
4. Model output is never written back into the fact or signal store as if it were a record.

---

## 6. Human approval gate

The system is initially:

**READ-ONLY + RECOMMENDATION**

AI must NOT automatically:

```text
Send customer emails
Cancel contracts
Change pricing
Issue credits
Modify devices
Change CRM records
Close tickets
Change subscriptions
Commit to customers
```

Any external or high-impact action requires explicit user approval. The UI must make the
distinction obvious:

```text
AI RECOMMENDATION
        ↓
USER REVIEW
        ↓
APPROVE
        ↓
ACTION
```

Requirements:

1. There is exactly **one** code path capable of an outbound effect, and it requires an
   explicit approval record. No service, no draft renderer and no AI adapter may perform
   an outbound call.
2. Approval records who approved, what exactly they approved (the final edited content,
   not the generated content), and when.
3. `sendingEnabled` stays `false` by default even after this phase. Turning it on is a
   deliberate, separately reviewed change — not a consequence of finishing Phase 8.
4. Edited drafts are re-validated against §5 rule 3 before approval. A human editing in a
   claim is still a claim that needs evidence.
5. Approval is per-action, never a blanket "approve all".
6. No auto-approve, no timed approval, no "approve unless cancelled".

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

`[Approve & Send]` remains disabled with a visible reason until an outbound integration
exists and has been separately approved.

---

## 7. Where AI plugs in

| Insertion point | Replaces / adds | Deterministic fallback |
| --------------- | --------------- | ---------------------- |
| Signal extraction from email and notes | Adds recall over Phase 3 keyword matching | Keyword patterns in `scorecardConfig.priority.detection` |
| Account history summary | Adds narrative to Phase 7 | Existing `js/intelligence/summary.js` |
| Priority explanation prose | Rewrites the Phase 3 `reasons[]` into prose | The bullet list itself |
| Recommendation prose | Rewrites the Phase 5 `action.summary` | The mapped `steps[]` |
| Draft communications | Replaces the Phase 5 templates | The templates |
| Meeting agendas | New | Templated agenda from account facts |

Every row has a fallback, and the fallback is what ships when the model is unavailable,
slow, rate-limited or produces output that fails validation. Degradation must be visible
(`AI summary unavailable — showing rule-based summary`), never silent.

---

## 8. Files

### Create

```text
js/scorecard/ai.js              adapter: prompt construction, response validation, provenance
js/scorecard/approval.js        approval records, the single gated action path
js/ui/approval.js               review + approve UI
tests/fixtures/ai-responses/    recorded model responses, including malformed ones
```

### Touch

```text
index.html                      new scripts
js/scorecard/actionEngine.js    accept AI prose where available, keep templates as fallback
js/ui/scorecard.js              provenance markers, approval controls
js/services/gatewayClient.js    the model call goes through the gateway — no key in the client
js/core/scorecardConfig.js      the ai + approval blocks below
```

**Critical:** the model API key never reaches the browser. `js/core/config.js` already
states this rule for the whole add-in — *"this file ships to the browser, so it must never
contain an API key, token, or credential. Secrets live only behind the gateway."* The AI
call is a gateway endpoint like every other source. Do not add a client-side provider SDK.

AI calls must be testable without a network: `js/scorecard/ai.js` takes an injectable
transport, and the fixtures include malformed, truncated and fabricating responses so the
validation path is covered.

---

## 9. Config added

```javascript
C360.scorecardConfig.ai = {
    /** Master switch. Off means the whole product still works, deterministically. */
    enabled: false,

    /** The model call is a gateway endpoint. No provider SDK in the client. */
    gatewayPath: "/ai/interpret",

    /** Only these tasks may be sent to a model. */
    allowedTasks: ["extractSignals", "summariseHistory", "interpretNotes",
                   "interpretEmail", "explainPriority", "generateActionPlan",
                   "draftCommunication", "prepareMeetingAgenda"],

    /** Explicitly forbidden. Enforced in code, not just documented. */
    forbiddenTasks: ["calculateHealth", "calculatePriority", "assignScore",
                     "sendCommunication", "modifyRecord"],

    /** Every model statement must cite at least one source record. */
    requireSourceRecords: true,

    /** Drop output whose factual claims are absent from the supplied context. */
    validateClaimsAgainstContext: true,

    /** Visible marker for model-derived content. */
    provenanceLabel: "AI-derived",

    timeoutMs: 20000,
    maxRetries: 1,

    /** Degrade visibly to the deterministic fallback. */
    fallbackOnFailure: true,
    fallbackNotice: "AI summary unavailable — showing rule-based summary."
};

C360.scorecardConfig.approval = {
    /** Actions that can never happen without an approval record. */
    gatedActions: ["sendCustomerEmail", "cancelContract", "changePricing", "issueCredit",
                   "modifyDevice", "writeCrmRecord", "closeTicket", "changeSubscription",
                   "commitToCustomer"],

    /** Still false after Phase 8. Enabling it is a separate, reviewed decision. */
    sendingEnabled: false,

    requireApprovalRecord: true,
    allowBulkApproval: false,
    allowAutoApproval: false,

    /** Re-validate human edits before approval. */
    revalidateEditedDrafts: true
};
```

---

## 10. Tests

| # | Test | Expected |
| - | ---- | -------- |
| 8.1 | AI disabled | every Phase 1–7 test still passes, scores identical |
| 8.2 | AI enabled | health and priority scores **byte-identical** to AI-disabled |
| 8.3 | Model proposes a cancellation signal | routed through the deterministic override rule, not applied directly |
| 8.4 | Model output with no `sourceRecords` | dropped, not displayed |
| 8.5 | Model output citing a ticket absent from context | rejected as fabrication |
| 8.6 | Model output naming a contact absent from context | rejected |
| 8.7 | Model output containing an unsupported date or figure | rejected |
| 8.8 | Every model-derived field in the DOM | carries a visible provenance marker |
| 8.9 | Model call times out | deterministic fallback renders with a visible notice |
| 8.10 | Malformed / truncated model response | handled, fallback renders, nothing thrown to the user |
| 8.11 | A forbidden task requested | refused in code, before any transport call |
| 8.12 | Any gated action without an approval record | refused |
| 8.13 | `sendingEnabled: false` | `[Approve & Send]` disabled with a visible reason |
| 8.14 | Bulk approve attempted | refused |
| 8.15 | Human edits a draft to add an unevidenced claim | re-validation flags it before approval |
| 8.16 | Approval record | captures approver, final content, timestamp |
| 8.17 | Client bundle | contains no API key or credential |
| 8.18 | AI adapter | fully testable with the injected transport, no network |

Tests 8.2 and 8.12 are the ones that matter. 8.2 proves scoring is deterministic; 8.12
proves nothing can escape to a customer without a human.

---

## 11. Exit criteria

- [ ] Phases 1–7 exit criteria all still pass with `ai.enabled: false`.
- [ ] Enabling AI changes no score anywhere (test 8.2).
- [ ] AI-proposed signals go through the same deterministic rules as pattern matches.
- [ ] Forbidden tasks are refused in code, not merely documented.
- [ ] Every model-derived field carries `provenance`, `sourceRecords` and a visible UI marker.
- [ ] Claim validation rejects fabricated dates, figures, tickets and people.
- [ ] Every AI insertion point has a deterministic fallback that degrades visibly.
- [ ] Exactly one gated code path can produce an outbound effect, and it requires an approval record.
- [ ] `sendingEnabled` is still `false`; `[Approve & Send]` is disabled with a stated reason.
- [ ] No bulk approval, no auto-approval, no timed approval.
- [ ] No credential in any client file; the model call goes through the gateway.
- [ ] All tests pass, including Phases 1–7.

---

## 12. Do NOT

- Do not let the model produce, adjust or round any score.
- Do not display a model statement with no source record.
- Do not "correct" a fabricating response — drop it.
- Do not put a provider SDK or an API key in the browser.
- Do not enable sending as part of this phase.
- Do not add bulk or automatic approval.
- Do not fall back silently — the user must know they are reading the rule-based version.
- Do not start this phase before Phase 7's exit criteria pass.
- Do not let the product become a generic AI customer summary. The pipeline is still
  `DATA → SIGNALS → HEALTH → PRIORITY → ACTION`, traversable backwards.
