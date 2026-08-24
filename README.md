# Customer 360 — Account Intelligence Add-In

An internal MyGeotab add-in with two screens, answering two questions.

The **Customer Portfolio Command Center** answers the portfolio question:

> **Who should I care about today, why, and exactly what should I do?**

The **account view** answers the single-account question it always did:

> **What do I need to know about this customer before I contact them?**

Select an account and the page assembles internal activity, the customer's own
website, public web research, contacts, risks, opportunities and recommended
next actions into a single scannable view — now with a scorecard above it that
scores the account, explains every number, and says what to do next.

## The three outputs, never collapsed into one

```text
HEALTH SCORE        How healthy is the account?          0-100, five categories
PRIORITY SCORE      How urgently should someone act?     P0-P3 + 0-100
RECOMMENDED ACTION  What specifically should happen?     why / evidence / owner / due
```

These are calculated **independently** and are allowed to disagree. An account
can legitimately be `Health 85 / Priority P1` — healthy, with one critical
unresolved camera issue — or `Health 42 / Priority P3` — unhealthy, with nothing
to do today. Both appear in the test suite, and the second-to-last check in
`tests/scenario-tests.cjs` exists to prove the first: if priority were quietly a
function of health, that test fails and nothing else compensates for it.

Scoring is **deterministic JavaScript**. The AI layer may propose a signal and
write prose; it never produces a number. Turning AI off changes no score
anywhere — there is a test for that too.

---

## Status at a glance

| | |
|---|---|
| **MyGeotab API** | **CONNECTED** — live asset counts, when open inside MyGeotab on the matching database |
| **CRM / quotes / orders / tickets / billing / reviews / contacts** | **MOCK** — no backend exists yet; see [What is required to go live](#what-is-required-to-go-live) |
| **Customer website research** | **MOCK** — needs a server-side extractor |
| **External web research** | **MOCK** — needs a server-side research endpoint |
| **Device health / portal usage / contracts / commitments / communications / outcomes** | **MOCK** — the six sources the scorecard added; endpoints specified, none connected |
| **AI layer** | **OFF** (`scorecardConfig.ai.enabled: false`). The product is fully functional without it. |
| **Outbound actions** | **NONE POSSIBLE.** `approval.sendingEnabled: false`, and exactly one code path could ever send anything. |
| **Build** | No build step. Static files, no dependencies. |
| **Tests** | 875 checks across three suites, all passing (659 logic + 69 app shell + 147 wiring) |

While any source is mocked, a banner across the top of the dashboard says so,
and every invented record carries a `MOCK` badge. Nothing on the page can be
mistaken for a real customer record.

---

## Architecture

Plain HTML/CSS/JS with no build step, matching the other add-ins in this org
(`Addin_3/Speeding-Events-Counter`, `Add-ON/addon-1`): a `config.json`
manifest, the `geotab.addin.<name>` lifecycle, prefixed ids and classes, and
static hosting.

```
CUSTOMER ACCOUNT
      |
      v
 accountService                         (identify the account — required)
      |
      +----------------+----------------+----------------+
      |                |                |                |
      v                v                v                v
  INTERNAL         WEBSITE            WEB            MYGEOTAB
  quoteService     websiteResearch    webResearch    geotabService
  orderService     Service            Service        (live assets)
  ticketService
  billingService
  technicalService
  accountReviewService
  contactService
      |                |                |                |
      +----------------+----------------+----------------+
                       |
                       v
                 orchestrator            (parallel; one failure ≠ page failure)
                       |
                       v
                  normalize              (one shape, provenance on every record)
                       |
                       v
              intelligenceEngine
                       |
        FACTS -> SIGNALS -> RISKS / OPPORTUNITIES -> RECOMMENDATIONS
                       |
                       v
                   render -> app         (dashboard)
```

### Files

```
index.html                        page shell + script load order
addin.css                         all styling, scoped under #c360-app
config.json                       MyGeotab add-in manifest

js/core/namespace.js              the single C360 global
js/core/config.js                 every tunable: data source, cache TTLs,
                                  contact profiles, rule thresholds
js/core/util.js                   dates, money, HTML escaping, URL safety
js/core/cache.js                  TTL cache (sessionStorage, memory fallback)

js/services/mockData.js           the invented sample dataset
js/services/gatewayClient.js      HTTP client for a backend gateway + the
                                  outbound privacy allow-list
js/services/dataSource.js         adapter switchboard: mock | gateway
js/services/cachedService.js      shared cache-then-fetch lifecycle
js/services/accountService.js     account search + record
js/services/quoteService.js       quotes
js/services/orderService.js       orders
js/services/ticketService.js      support tickets
js/services/billingService.js     escalated billing issues
js/services/technicalService.js   escalated technical issues
js/services/accountReviewService.js  QBR / EBR records
js/services/websiteResearchService.js customer website extraction
js/services/webResearchService.js external web research
js/services/contactService.js     contacts, website leadership merge, ranking
js/services/geotabService.js      LIVE MyGeotab integration

js/intelligence/normalize.js      the normalised data model
js/intelligence/facts.js          layer 1 — what sources recorded
js/intelligence/signals.js        layer 2 — patterns across facts
js/intelligence/risks.js          layer 3a
js/intelligence/opportunities.js  layer 3b
js/intelligence/recommendations.js layer 4
js/intelligence/health.js         four qualitative dimensions
js/intelligence/timeline.js       unified chronological stream
js/intelligence/summary.js        composed account summary
js/intelligence/intelligenceEngine.js  runs the pipeline (pure function)

js/core/scorecardConfig.js        every scorecard tunable: weights, thresholds,
                                  segment rules, override patterns, action
                                  mappings, feedback + metric policy
js/services/scorecardSourceService.js  the six new sources (all mock)

js/scorecard/evidence.js          one evidence shape, shared by every engine
js/scorecard/detect.js            deterministic keyword detection + scope
js/scorecard/identity.js          Phase 1 — master identity + per-link confidence
js/scorecard/segments.js          Phase 1 — segment + lifecycle from evidence
js/scorecard/healthScore.js       Phase 2 — five categories -> weighted 0-100
js/scorecard/confidence.js        Phase 2 — data confidence, a separate number
js/scorecard/overrides.js         Phase 3 — P0-P3 override engine (a floor)
js/scorecard/priority.js          Phase 3 — weighted 0-100 urgency
js/scorecard/queues.js            Phase 4 — SAVE / FIX / GROW / ENGAGE
js/scorecard/actionRules.js       Phase 5 — mappings, owners, due dates, claims
js/scorecard/actionEngine.js      Phase 5 — the seven-part recommendation
js/scorecard/scorecardEngine.js   the pipeline entry point (pure)
js/scorecard/portfolio.js         Phase 6 — roll-up, top-N, filters, search
js/scorecard/ai.js                Phase 8 — model adapter + claim validation
js/scorecard/approval.js          Phase 8 — the ONE gated action path
js/scorecard/feedback.js          Phase 9 — four outcomes, per-rule aggregate
js/scorecard/metrics.js           Phase 9 — measurement, with its caveats

js/orchestrator.js                parallel fan-out + per-source status
                                  + the bounded-concurrency portfolio batch
js/ui/components.js               HTML building blocks
js/ui/render.js                   one function per dashboard section
js/ui/portfolio.js                Phase 6 — the Command Center screen
js/ui/scorecard.js                Phase 7 — account scorecard + drawers
js/ui/approval.js                 Phase 8 — draft review, and why it cannot send
js/ui/feedback.js                 Phase 9 — the four controls + aggregate
js/ui/app.js                      state, events, screen flow, routing
js/addin.js                       MyGeotab lifecycle entry point

docs/                             the nine-phase build plan + Appendix A
docs/phase-1-audit.md             data audit + the architectural decisions taken

tests/run-tests.cjs               logic + rendering (659 checks, loads the two below)
tests/scorecard-tests.cjs         Phases 1-9, numbered to the phase docs
tests/scenario-tests.cjs          17 end-to-end scenarios
tests/check-app.cjs               app shell screen flow (69 checks)
tests/check-wiring.cjs            script/id/load-order consistency (147 checks)
tests/fixtures/                   26 MOCK accounts, 17 scenarios, 8 AI responses
tests/fixtures/generate.cjs       regenerates the account + AI fixtures
```

The `js/intelligence/` tree is **unchanged**. The scorecard is a new layer beside
it that reuses its facts, signals, risks and opportunities rather than forking
them — `js/intelligence/health.js` in particular is deliberately non-numeric and
stays that way. The reasoning is recorded in
[`docs/phase-1-audit.md`](docs/phase-1-audit.md#5-the-healthjs-decision--recorded-as-phase-1-requires).

---

## Data sources

The UI never blends these three categories. Each record carries a badge, and
the Sources section at the bottom groups every fact by where it came from.

**Internal** — `[Internal CRM]` and `[Support]`
account record, quotes, orders, tickets, escalated billing issues, escalated
technical issues, account reviews, known contacts, plus live MyGeotab asset
counts.

**Customer website** — `[Customer Website]`
company description, services, locations, markets served, fleet size as the
site states it, growth signals, leadership.

**External web** — `[Web]`
trade press and public announcements: expansion, contraction, acquisitions,
contract wins, procurement, leadership changes.

---

## How the intelligence works

Four layers, each citing the one below it.

**FACTS** — one sentence per record a source actually produced, with source,
date and link. No adjectives, no inference.

> Order 98765 for 75 units ($61,250) was placed Jul 30, 2026.

**SIGNALS** — patterns across facts. Hedged wording, always with a confidence
level: *High* = the source states it directly, *Medium* = several independent
signals agree, *Low* = an inference from limited evidence.

> Order quantity increased 50% compared with the previous comparable order
> (50 to 75 units). — Confidence: High

**RISKS and OPPORTUNITIES** — derived only from signals, so they inherit real
evidence. Opportunities are rendered as three separate labelled parts:
evidence, interpretation, suggested action. Risks state a severity *and the
rule that produced it*.

**RECOMMENDATIONS** — 3–5 prioritised actions generated from the risks and
opportunities, capped so the list stays a set of next actions rather than a
backlog.

### Rules enforced in code, not just documented

- **Nothing is invented.** A missing field normalises to `null` and renders as
  "Not available" — never a zero, never a placeholder value.
- **No fabricated contacts.** A contact is only created from a record that
  named a person. Email addresses are never guessed. A role we looked for and
  did not find is reported as an explicit gap.
- **No unverified names in actions.** A recommendation may only name a
  contact whose confidence is `Confirmed`; otherwise the action becomes
  "identify a verified contact".
- **Absence of evidence is stated as such.** Product gaps read "No current
  usage found in available internal data", never "the customer does not use".
- **No numeric health scores in THIS layer.** `js/intelligence/health.js`
  reports four qualitative states, each with its basis printed next to it,
  because a bar reading "Support 60" implies a precision this data does not
  have. The scorecard layer does produce a numeric score, and answers the same
  objection differently: it never prints a number without the arithmetic that
  produced it. Both views ship; the reasoning is in
  [`docs/phase-1-audit.md`](docs/phase-1-audit.md#5-the-healthjs-decision--recorded-as-phase-1-requires).
- **No language model in the scoring path, ever.** Every score, band, level and
  due date is deterministic JavaScript. The AI layer (`js/scorecard/ai.js`) is
  off by default and, when on, may only *propose a signal* and *rewrite prose* —
  the deterministic rules decide whether a signal fires, and they alone produce
  the number. Test 8.2 asserts that enabling AI leaves every score
  byte-identical. Model output with no source record is dropped; model output
  asserting a date, figure, ticket or person absent from its context is dropped
  rather than corrected.

---

### Scorecard rules enforced in code

The nine-phase brief is mostly a list of ways this kind of product goes wrong.
Each of these is a function with a test, not a note in a document:

| Rule | Where it is enforced | Test |
| ---- | -------------------- | ---- |
| Missing data is never scored `0` | `healthScore.js` — an unavailable category is excluded and the weights re-normalise | 1.7, 2.2, 2.11 |
| Health and priority are independent | `priority.js` never reads `health.score` | **3.2**, 9.14 |
| An override raises urgency, never lowers it | `priority.js` applies the floor upward only | 3.13 |
| Support is not a ticket count | `healthScore.js` weights severity, age, SLA, recurrence | 2.4, 2.5 |
| Sentiment alone is capped | uncorroborated sentiment spends 25% of its weight | 2.6, 2.7 |
| A cancellation is not masked by good orders | `retentionSignalCeiling` caps the category | 2.8 |
| A low health score is not a SAVE | `queues.js` never reads `health.score` | 4.7 |
| A product gap is not a GROW | `growRequiresQualifiedOpportunity` | 4.5 |
| An account with nothing to do is in no queue | `primaryQueue: null` | 4.8 |
| No generic "Contact customer" action | `allowGenericFallback: false`; no mapping → no recommendation | 5.2 |
| An owner is never guessed | `Unassigned` when no rep and no mapping | 5.5 |
| A draft asserts nothing unevidenced | `actionRules.validateClaims()` | **5.12** |
| A draft names only verified contacts | otherwise suppressed, with the reason | 5.11 |
| Enabling AI changes no score | AI proposes signals; rules decide | **8.2** |
| A model statement with no source is dropped | `ai.validateStatement()` | 8.4–8.7 |
| A fabrication is dropped, never repaired | same | 8.5 |
| Nothing outbound without approval | `approval.perform()` is the only path | **8.12** |
| Feedback never suppresses a rule | `autoSuppressRules: false` | 9.4, 9.5 |
| A metric with no inputs says so | `Not yet measurable`, never `0` | 9.11 |
| No engine reads the clock | `asOf` is injected everywhere | 9.15 |

The four in bold are the ones worth re-running first after any change.

---

## Portfolio refresh

The Command Center is a **batch over the same per-account pipeline** — not a
parallel fetch path — so caching, per-source failure isolation and the
manual-refresh bypass all behave exactly as they do on the account page.

```text
Refresh portfolio  ->  bounded fan-out (max 4 accounts at once)
                   ->  per account: the existing 17-source load
                   ->  scorecardEngine per account
                   ->  portfolio.build()  ->  the screen
```

Two properties are load-bearing and both are tested:

- **Concurrency is bounded.** 127 accounts must not open 127 simultaneous
  requests. The observed peak is returned on the result so the cap is measured
  rather than assumed.
- **Partial failure renders.** One account failing to load lists that account and
  shows the rest. Per-source failures inside a successfully loaded account are
  listed too, because the account rendered but its picture is incomplete.

Refresh is **manual or scheduled — never a continuously running model.**

---

## Privacy and security

- **No API keys in this repository or in any browser file.** A static page
  cannot hold a credential. Every credentialed call belongs behind the
  gateway.
- **Internal data never leaves for the public internet.** The two research
  endpoints receive only `domain`, `company` and `days`. This is enforced by
  an allow-list in `gatewayClient.buildResearchParams()` — any other key is
  structurally dropped, and a test asserts that ticket notes, invoice ids and
  internal notes cannot pass through it.
- **External research is treated as untrusted input.** All source-supplied
  text is HTML-escaped and all URLs are restricted to `http(s)` before
  rendering. Tests cover script-tag, event-handler and `javascript:` payloads.
- **Caching uses sessionStorage**, not localStorage, so cached CRM and support
  data does not survive the tab.

---

## Caching and refresh

| Source class | Default TTL | Why |
|---|---|---|
| Internal | 5 minutes | Changes often, cheap to fetch |
| Customer website | 24 hours | Company sites change on the order of weeks |
| External web | 6 hours | Changes within a working day, not within a page view |

All configurable in `js/core/config.js`. **Refresh intelligence** drops every
cached entry for the account and refetches.

Changing the **period** filter (30 days / 90 days / 6 months / 12 months)
triggers no fetch at all: sources are always fetched over one wide window
(`config.fetchWindowDays`, 365 days) and the filter narrows only what is
displayed. This matters — the order-volume rule compares the latest order
against an older comparable one, so fetching only 30 days would silently
delete the signal.

---

## Failure handling

Each source is wrapped so a rejection becomes a status rather than an
exception. If external research fails, the strip under the account header
shows:

```
✓ Internal data       Loaded
✓ Customer website    Loaded
⚠ External web        Temporarily unavailable — last successful update Aug 18, 2026 9:04 AM
```

…and every other section still renders. The only failure that stops the page
is the account record itself, which produces an error screen with a retry,
because there is no account to show without it.

---

## Running it

**Locally** — open `index.html` in a browser, or serve the folder:

```bash
npx serve .          # or any static server
```

Outside MyGeotab the dashboard works fully; live MyGeotab asset counts report
as unavailable, which is stated on the account header.

**Tests** — no framework, no dependencies:

```bash
node tests/run-tests.cjs      # logic + rendering + XSS + privacy allow-list,
                              # and it loads:
                              #   tests/scorecard-tests.cjs   Phases 1-9
                              #   tests/scenario-tests.cjs    17 scenarios
node tests/check-app.cjs      # app shell screen flow, both views
node tests/check-wiring.cjs   # script paths, element ids, load order

# After changing the MOCK fixture set, regenerate the manifests and commit them.
# tests/scorecard-tests.cjs asserts them, so a fixture cannot quietly lose a
# source and stop exercising the path its manifest claims it covers.
node tests/fixtures/generate.cjs
```

**Useful query parameters**

| Parameter | Effect |
|---|---|
| `?accountId=acc-001` | Deep-link straight to an account |
| `?dataSource=gateway&gateway=https://…` | Point at a gateway without redeploying |
| `?simulateFailure=external,website` | Force sources to fail, to exercise the degraded UI |

**Deploying** — static hosting (Vercel, as with the sibling add-ins). After
deploying, set the `url` in `config.json` to the real deployment URL, then
upload `config.json` in MyGeotab under *System Settings → Add-Ins*.

---

## What is required to go live

Everything below is what stands between this and real data. The add-in is
built so that each item is a configuration change, not a rewrite.

### 1. An intelligence gateway (required)

A small server-side service holding the credentials and exposing read-only
JSON. Endpoints and response shapes are specified in the header comment of
`js/services/gatewayClient.js`; the field shapes it must produce are defined
by `js/intelligence/normalize.js`, which tolerates missing fields.

```
GET /accounts?q=                     GET /accounts/:id/reviews
GET /accounts/:id                    GET /accounts/:id/contacts
GET /accounts/:id/quotes             GET /research/website?domain=&company=
GET /accounts/:id/orders             GET /research/news?domain=&company=&days=
GET /accounts/:id/tickets
GET /accounts/:id/billing-issues
GET /accounts/:id/technical-issues
```

Then set `dataSource: "gateway"` and `gatewayBaseUrl` in `js/core/config.js`.

### 2. Access the gateway needs

| Data | System | What is needed |
|---|---|---|
| Accounts, quotes, orders, contacts | CRM | Read credentials and the account-id mapping used across systems |
| Tickets, escalations | Helpdesk | Read credentials; a rule for what counts as "escalated" |
| Billing disputes | Billing / finance | Read access to disputes and credit requests |
| Account reviews | Wherever QBR notes live | A structured or parseable source for concerns / commitments / follow-ups |
| Website extraction | — | A fetch-and-extract service for the customer's public site |
| Company news | — | A news/search provider subscription |

### 3. Authentication between add-in and gateway

The client sends `credentials: "include"`. The gateway needs a session or SSO
scheme that works inside the MyGeotab iframe, and CORS configured for the
add-in origin.

### 4. Configuration to replace before relying on it

- `config.productCatalogue` — currently a placeholder list of our product
  lines, used only for the product-gap signal.
- `config.thresholds` — the numbers behind every rule (10% order change,
  30-day stale quote, 365-day review cadence, 3 tickets = a repeat issue,
  14-day ageing ticket). These are judgement calls and should be argued about.
- `config.contactProfiles` — role priority per account type. Three profiles
  ship (`fleet-heavy`, `small-business`, `enterprise`); accounts select one via
  `account.contactProfile`.
- `account.geotabDatabase` — the CRM field that maps an account to its
  MyGeotab database. Without it, live asset counts stay unavailable.

### 5. Not built, and deliberately so

- **No write-back to CRM, and no outbound anything.** The add-in is read-only.
  Exactly one function could ever produce an outbound effect —
  `C360.approval.perform()` — and it refuses while
  `scorecardConfig.approval.sendingEnabled` is `false`, which it still is after
  Phase 8. Enabling it is a separate, separately reviewed decision, not a
  consequence of the approval flow existing.
- **No bulk approval, no auto-approval, no timed approval.** Each is refused in
  code at the point a caller would reach for it, rather than being absent and
  therefore easy to add.
- **No predictive modelling and no auto-tuning.** Phase 9 measures; it does not
  learn. Feedback never changes a score and never suppresses a rule —
  suppression is a config change a person makes after reading the per-rule
  false-positive rate.
- **No LLM in the scoring path.** If AI is enabled it may propose a signal and
  rewrite prose, behind the existing evidence structure: every model statement
  keeps its `sourceRecords`, and a statement without one is not displayable.

### 6. Where to start when a gateway does exist

In this order, because each step makes the next one measurable:

1. Wire the **communications** endpoint. Every deterministic text rule —
   cancellation, competitor switch, executive escalation, sentiment — currently
   reads only fixture emails, so its recall is a property of the fixtures.
2. Wire **contracts**. Renewal dates unlock the renewal override, the
   time-sensitivity factor and the SAVE queue's renewal-risk rule.
3. Wire **device health**. It is the heaviest health category at 25% and is
   unavailable on every real account until it exists.
4. Only then read the **per-rule false-positive rates** in the metrics panel and
   tune `scorecardConfig.priority.detection`. Re-run
   `node tests/run-tests.cjs` after every change — the 17 scenarios exist so
   that a threshold change has a visible, attributable effect.
5. Only after all of that, revisit any weight in Phases 2–3, with the feedback
   data as the argument.
