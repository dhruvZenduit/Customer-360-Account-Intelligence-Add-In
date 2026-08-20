# Customer 360 — Account Intelligence Add-In

An internal MyGeotab add-in that answers one question about a customer account:

> **What do I need to know about this customer before I contact them?**

Select an account and the page assembles internal activity, the customer's own
website, public web research, contacts, risks, opportunities and recommended
next actions into a single scannable view.

---

## Status at a glance

| | |
|---|---|
| **MyGeotab API** | **CONNECTED** — live asset counts, when open inside MyGeotab on the matching database |
| **CRM / quotes / orders / tickets / billing / reviews / contacts** | **MOCK** — no backend exists yet; see [What is required to go live](#what-is-required-to-go-live) |
| **Customer website research** | **MOCK** — needs a server-side extractor |
| **External web research** | **MOCK** — needs a server-side research endpoint |
| **Build** | No build step. Static files, no dependencies. |
| **Tests** | 255 checks across three suites, all passing (125 logic + 38 app shell + 92 wiring) |

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

js/orchestrator.js                parallel fan-out + per-source status
js/ui/components.js               HTML building blocks
js/ui/render.js                   one function per dashboard section
js/ui/app.js                      state, events, screen flow
js/addin.js                       MyGeotab lifecycle entry point

tests/run-tests.cjs               logic + rendering (125 checks)
tests/check-app.cjs               app shell screen flow (38 checks)
tests/check-wiring.cjs            script/id/load-order consistency (92 checks)
```

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
- **No numeric health scores.** Four qualitative states, each with its basis
  printed next to it, because the data does not support a defensible scale.
- **No language model.** The account summary is composed deterministically
  from counted and quoted values. There is no step where free text is
  generated, so there is nothing to hallucinate.

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
node tests/run-tests.cjs      # logic + rendering + XSS + privacy allow-list
node tests/check-app.cjs      # app shell screen flow
node tests/check-wiring.cjs   # script paths, element ids, load order
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

- No numeric health scoring — see the reasoning in `js/intelligence/health.js`.
- No LLM summarisation. If one is added, it must sit behind the existing
  evidence structure: every sentence keeps its `evidence` array, and a
  sentence without evidence must not be displayable.
- No write-back to CRM. This add-in is read-only by design.
