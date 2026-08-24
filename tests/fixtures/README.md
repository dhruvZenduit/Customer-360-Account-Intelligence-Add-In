# Test fixtures

Three sets, each answering a different question.

```text
accounts/       WHICH ACCOUNTS exist in the MVP sample, and what each one proves
scenarios/      WHICH BEHAVIOUR is expected, end to end, for a given situation
ai-responses/   WHAT THE VALIDATION LAYER must reject when a model misbehaves
```

Everything here is **invented sample data**. Every record carries `mock: true`,
every company name is fictional, and every domain uses `.example`, which
[RFC 2606](https://www.rfc-editor.org/rfc/rfc2606) reserves so it cannot resolve
to a real business. Nothing in this directory describes a real customer.

---

## `accounts/` — the MVP sample

26 accounts, one JSON manifest each, covering all eight MVP categories:

| Category | Count | Accounts |
| -------- | ----: | -------- |
| Healthy | 3 | `acc-010`, `acc-011`, `acc-012` |
| At Risk | 5 | `acc-001`, `acc-002`, `acc-020`, `acc-021`, `acc-022` |
| High Value | 4 | `acc-004`, `acc-030`, `acc-031`, `acc-032` |
| Recently Cancelled | 2 | `acc-040`, `acc-041` |
| Expansion | 3 | `acc-050`, `acc-051`, `acc-052` |
| Technical Problems | 3 | `acc-060`, `acc-061`, `acc-062` |
| Billing Problems | 2 | `acc-070`, `acc-071` |
| Inactive | 4 | `acc-003`, `acc-080`, `acc-081`, `acc-082` |

Each manifest carries a `proves` field saying what that fixture is for, and a
`sources` block recording which sources it does and does not carry.

**The manifests are generated, not hand-written.** The data itself lives in
`js/services/mockData.js`, because that is what the running add-in loads — a
second copy here would drift, and a manifest that disagrees with the data it
describes is worse than no manifest. Regenerate after changing the fixture set:

```bash
node tests/fixtures/generate.cjs
```

`tests/scorecard-tests.cjs` then **asserts** the manifests against the live
fixture set, so a fixture cannot quietly lose its device feed and stop
exercising the unavailable-category path while the manifest still claims it has
one.

### Why `commitments` is sometimes `null`

```text
"commitments": null   this deployment does not track commitments at all
"commitments": 0      commitments are tracked; none are outstanding
```

Phase 3 treats these differently: the first is an **unavailable factor** whose
weight is re-normalised away, the second is a factor scoring zero. Collapsing
them would either hide a data gap or invent one. Both appear in the sample —
`acc-003`, `acc-004` and `acc-081` are untracked; the rest are tracked.

---

## `scenarios/` — the consolidated regression suite

17 scenarios, run by `tests/scenario-tests.cjs` through the **full** pipeline:
identity → segment → health → priority → overrides → queues → actions.

Each file declares its own data and its own expectations, so adding a scenario is
a data file rather than a code change:

```json
{
  "id": "healthy-plus-critical",
  "proves": "...",
  "data": { "account": { }, "tickets": [ ] },
  "expect": { "level": ["P0", "P1"], "queue": "fix", "healthAtLeast": 40 }
}
```

Dates are **relative tokens** — `"-14d"`, `"+61d"` — resolved against a fixed
`asOf` that is injected into the engines. Absolute dates would silently stop
meaning what they were written to mean the moment anyone changed `asOf`: a
"renewal in 61 days" scenario would quietly become "renewal 300 days ago" and
the renewal rule it was written to test would stop firing without any test going
red.

Nothing in the suite reads the clock, and no engine does either. That is what
makes it usable for judging a config change: run it before, change a threshold,
run it after, and every difference is attributable.

### The scenarios that matter most

| Scenario | Why it is the important one |
| -------- | --------------------------- |
| `healthy-plus-critical` | **The independence check.** Same account as `healthy`, plus one critical ticket past SLA. Health must stay high; priority must jump to P0/P1. If this fails, priority is still a function of health and the product's central claim is false — no other passing test compensates. |
| `renewal-no-negatives` | The *negative* half of a rule. An approaching renewal on a clean account is not urgent, and "health is low" is deliberately not one of the enumerated negative signals. |
| `review-overdue` / `review-overdue-small` | A pair with the *same* review age and different segments. This is what makes the per-segment thresholds real rather than decorative. |
| `safety-programme-is-not-an-incident` | A regression test for a real false positive. A QBR topic of "Safety programme rollout" and a news item appointing a Director of Safety both once fired the P0 safety override. |
| `missing-data` | No fabricated score inputs. Health is reported unavailable *with a reason*, confidence drops, and the limitations list says what is missing. |

---

## `ai-responses/` — recorded model responses

Eight recordings, including the ones that misbehave. `js/scorecard/ai.js` takes
an **injectable transport**, so the whole Phase 8 validation path is testable
with no network at all.

| Fixture | What it exercises |
| ------- | ----------------- |
| `valid-summary.json` | The happy path: a statement citing a record that is actually in the context. |
| `no-source-records.json` | A statement citing nothing → dropped, not displayed. |
| `unknown-source-record.json` | Cites a ticket absent from the context → rejected. |
| `fabricated-figure.json` | Invents a ticket number, a date and a figure. The fabricating statement is dropped and the valid one beside it survives. |
| `invented-contact.json` | Names a person who is nowhere in the context — the most damaging fabrication available, because it is the one that reaches the `To:` line of a draft. |
| `malformed.json` | Not an object at all. Falls back; nothing is thrown at the user. |
| `truncated.json` | Well-formed but empty — cut off before any statement arrived. |
| `forbidden-task.json` | What a confused gateway might return for `calculateHealth`. Unreachable in practice, because the adapter refuses forbidden tasks *before* any transport call — recorded to document that the refusal is the client's job too. |

A fabricating response is **dropped, never repaired**. Correcting one claim would
mean trusting the rest of a response that came from the same place.
