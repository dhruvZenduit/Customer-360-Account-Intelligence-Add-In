# Phase 1 — Data audit and architectural decisions

The Phase 1 deliverable: what already exists in Customer 360, what the scorecard
needs and does not have, and the decisions taken where the new brief and the
existing add-in disagreed.

Written against the repository as it stands after Phases 1–9.

---

## 1. The sixteen existing data areas

`available` — a service exists and returns real shapes.
`partial` — a service exists but the data behind it is thinner than the name suggests.
`not wired` — no service, or no source behind the service.

| Data area | State | Service | Notes |
| --------- | ----- | ------- | ----- |
| Account | available | `accountService` | The anchor record. Identity resolution treats it as authoritative, never as a candidate. |
| Quotes | available | `quoteService` | `isOpen` derives from a canonical status list in `normalize.js`. Drives the stale-quote override. |
| Orders | available | `orderService` | `signals.comparableOrderPair()` already refuses to compare non-comparable products — reused rather than re-derived. |
| Tickets | available | `ticketService` | Severity, age, escalation and SLA all read from here. The support category depends on this one source more than any other. |
| Account Reviews | available | `accountReviewService` | Also the **fallback** commitments source — see §4. |
| Billing Issues | available | `billingService` | `escalationState()` leaves an unrecognised status unresolved rather than guessing. |
| Technical Issues | available | `technicalService` | Same. Carries `customerImpact` only where a source actually recorded it. |
| Customer Website | available | `websiteResearchService` | Growth signals feed the `newFacility` GROW rule. `fleetStatement` stays a quoted string, never parsed into a number. |
| External Research | available | `webResearchService` | **The one source identity confidence really guards.** See §3. |
| Company Updates | available | `webResearchService` | Same source, categorised (`expansion`, `acquisition`, `leadership`, …). |
| Purchases | available | `orderService` | Same records as Orders. |
| Expansion | partial | `opportunities.js` | Derived, not fetched. A *qualified* opportunity needs a customer-stated intention or a comparable order increase — a product-catalogue gap does not qualify. |
| Downsizing | partial | `signals.js` | Only the `orderVolume` down-direction and `publicContraction` exist. No downgrade-request source. |
| Decision Makers | partial | `contactService` | Ranked by `contactProfiles`. Confidence defaults to `Unverified`, which is what gates draft emails. |
| Contacts | available | `contactService` | `roleGaps()` reused directly for the relationship category and the `stakeholderCoverageGap` rule. |
| Timeline | available | `timeline.js` | Derived view over the same records. Used as the evidence fallback target for communications. |

### MyGeotab

`geotabService` is the one genuinely connected integration, and it is scoped to a
single database — the one the signed-in user is on. It can only speak about an
account whose `geotabDatabase` matches the session. That constraint is respected
rather than papered over, and the scorecard treats a non-matching session as
*no device data*, not as zero devices.

---

## 2. The five new intelligence inputs

None of these had a source before this work. All five now have a service, a
gateway contract and MOCK fixtures — and **none is connected to a real system**.

| Input | Source added | State | Consequence when absent |
| ----- | ------------ | ----- | ----------------------- |
| Device/Product Health | `deviceHealthService` | not wired (mock only) | Product category `Data unavailable`; weights re-normalise; confidence drops. |
| Support Health | already available | available | Computed from the existing ticket and escalation records. |
| Relationship Health | partial | partial | Reviews and contacts exist; `communicationService` (email) is mock only, so sentiment detection has nothing real to read. |
| Commercial/Retention | partial | partial | Quotes and orders exist; `contractService` (renewal date, past-due, cancellation flag) is mock only. |
| Outcome/Value Health | `outcomeService` | not wired (mock only) | Outcomes category reports `Outcomes data limited`. Never inferred as *poor* outcomes. |

Two further sources were needed and added on the same terms:

| Input | Source | Notes |
| ----- | ------ | ----- |
| Communications | `communicationService` | The input to **all** deterministic text detection. An empty feed does not make an account safe — it makes the cancellation, competitor and escalation rules blind, which is what the confidence figure exists to say. |
| Commitments | `commitmentService` | Returns `null` when untracked, which is a different statement from `[]`. See §4. |

The gateway endpoints for all six are specified in `js/services/gatewayClient.js`.
`config.gatewayBaseUrl` is still empty, so nothing calls them.

---

## 3. Identity confidence, and why the threshold is 85

`identity.minAttachConfidencePct` is the single most consequential number in
`scorecardConfig.js`.

The strategies and what they are worth:

```text
exactAccountId     100    the source carries our own CRM account id
verifiedDomain      95    a domain we have verified for this account
billingAccountId    95
geotabDatabase      95
nameAndDomain       90    two independent weak signals agreeing
normalisedName      70    names match and nothing else does
```

`normalisedName` scores **below** the threshold on purpose. A bare name match
does not attach — it is reported as *unmatched*, with the reason, so the near
miss is visible and correctable.

This matters almost entirely for external research. `"Northline Freight Systems"`
and `"Northline Foods"` normalise differently, but a looser matcher would merge
them, and one wrong news article on an account destroys trust in every other
number on the page. The cost of the strict threshold is recall on genuine
matches; that is the right trade, and it is a config value so it can be argued
with.

Overall identity confidence is the **weakest attached link, not the average**.
An account whose external research attaches at 90% is 90% certain about that
research, and averaging it against three 100% internal links would hide exactly
the link worth doubting.

---

## 4. `commitments: null` vs `[]`

Recorded here because it is the least obvious decision in the codebase and it
changes behaviour in two places.

```text
null   commitments are not a tracked source in this deployment
[]     commitments are tracked, and none are outstanding
```

- `null` → the `overdueCommitments` **factor** reports itself unavailable, its
  10% weight re-normalises across the other four, and the `overdueCommitment`
  **override** reports itself unavailable rather than sitting silent.
- `[]` → the factor scores 0 and the override does not fire.

Collapsing the two would either hide a data gap or invent one. A rule that can
never fire looks identical to a rule with nothing to report, which is why the
unavailable state is reported rather than merely handled.

**Fallback source.** Where no commitments feed exists, `scorecardEngine` promotes
the free-text `commitments[]` on account reviews. Those arrive *without* a due
date, and `overdueCommitment` requires one — so they never fire it. That is
correct: "Support to provide a root-cause summary" with no date attached is
undated, not overdue.

---

## 5. The `health.js` decision — recorded, as Phase 1 requires

`js/intelligence/health.js` is **deliberately non-numeric**. Its header argues
that a bar reading "Support 60" implies support health is measurable to a
percentage point and that 60 is meaningfully worse than 65, and that neither is
true of this data.

The new brief requires a numeric 0–100 score across five categories.

**Decision: leave `health.js` untouched and add `js/scorecard/healthScore.js`
alongside it.** Taken as the phase plan recommends.

The reasoning, and the honest concession:

- The original objection is *sound*. It is answered, not dismissed, by never
  printing a number without its arithmetic: every score in the scorecard carries
  a breakdown that reproduces it, a `basis` string per category, and a signal
  list with evidence. `Health 42` on its own would still be indefensible, and the
  UI has no code path that renders it.
- The two modules answer different questions. `health.js` says *what kind of
  trouble this account is in*, in words. `healthScore.js` says *how much*, so a
  portfolio of 127 accounts can be ranked. Ranking is the whole point of Phase 6
  and qualitative dimensions cannot do it.
- `Growth` (in `health.js`) has no counterpart in the five new categories, and
  `Outcomes & Value` has no counterpart in the old four. This is not a refactor
  in either direction.
- The cost is two health concepts in one product. That is a real cost. It is
  accepted because retiring the qualitative view would lose its wording and
  migrate its callers for no gain the numeric score does not already provide.

`health.js` is unmodified, still called by `intelligenceEngine.js`, and still
rendered in its existing section.

---

## 6. Deviations from the phase plan

Three, all deliberate.

### 6.1 Two shared helper modules not named in the plan

`js/scorecard/evidence.js` and `js/scorecard/detect.js`.

The plan lists a file per phase, but six engines (health, confidence, overrides,
priority, queues, actions) all need to turn a record into an evidence row, and
three need to run keyword detection over source text. Six local copies is how the
fifth quietly stops carrying the source date — and an evidence row that cannot
reach its record is exactly what Phase 7 forbids. Written once instead.

### 6.2 One service file for six sources

`js/services/scorecardSourceService.js` holds all six new `cachedService`
instances. Each is four lines of adapter wiring; six near-identical files would
say less than the one file's header does.

### 6.3 A declared segment travels on the contract record

Phase 1 forbids touching `js/intelligence/*`, and `normalize.js` — which lives
there — carries no account-level `segment` field. So an account-level segment
cannot survive normalisation today.

`segments.declaredSegment()` therefore reads `account.segment` **or**
`contract.segment`, and the contract is the one that actually arrives, because
`scorecardEngine.shapeContract()` is the scorecard's own code. A commercially
declared segment living on the contract record is defensible on its own terms.

If `normalize.js` is later extended with an account-level `segment`, it will be
picked up without any further change.

---

## 7. What is still missing

Honest list, for whoever picks this up next.

| Gap | Effect today |
| --- | ------------ |
| No gateway is deployed | Every source except MyGeotab is mock. The banner says so. |
| No email/communications store | Text detection reads only fixture emails, so cancellation and competitor recall is a property of the fixtures, not of the product. |
| No device-health feed | The heaviest health category (25%) is unavailable on any real account. |
| No commitments system | A 10% priority factor and one P1 override are unavailable. |
| No stored run history | "What changed" shows signal movement but no score delta until the portfolio refresh has persisted two runs. |
| No action timestamps | `criticalResponseTime` reports `Not yet measurable`. |
| Feedback is session-local | Cleared on reload. The UI says so; it must keep saying so until a write endpoint exists. |
| Keyword lists are guesses | Acknowledged in `scorecardConfig.priority.detection`. Phase 9's per-rule false-positive rate is the mechanism for fixing them, and it needs real usage before it says anything. |

---

## 8. Exit criteria

- [x] All sixteen existing data areas classified, with their service (§1).
- [x] All five new intelligence inputs classified, with the consequence of absence (§2).
- [x] The `health.js` numeric-vs-qualitative decision written down (§5).
- [x] `C360.scorecardConfig` exists, is loaded by `index.html`, contains no secrets.
- [x] `identity.resolve()` is pure and returns `masterCustomerId` + `links[]` with per-link confidence.
- [x] No source below `minAttachConfidencePct` is attached (test 1.3).
- [x] `segments.resolve()` returns `{ segment, lifecycle, basis }`.
- [x] 26 labelled MOCK fixtures covering all eight MVP categories (test 1.9).
- [x] `node tests/run-tests.cjs` passes, including every pre-existing test.
- [x] The existing Customer 360 account view is unchanged in behaviour.
