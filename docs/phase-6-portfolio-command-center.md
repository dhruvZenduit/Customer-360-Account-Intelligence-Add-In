# Phase 6 — Portfolio Command Center

**Goal:** the most important new screen — see the whole portfolio at once, not one account
at a time, and know who to care about today.

| | |
| --- | --- |
| **Source sections** | Appendix A §16, §17, §33, §34, §35, §37, §38, §46 |
| **Depends on** | Phases 4, 5 |
| **Unlocks** | Phase 7 |
| **AI involved** | No |

> Read [the global rules](./README.md#global-rules--these-apply-to-every-phase) first.
> G4 (never unexplained) and G9 (existing conventions, `c360-` prefix, no build step)
> govern this phase.

This is the first phase that ships UI. Everything it renders comes from Phases 1–5 — the
screen computes nothing of its own.

---

## 1. In scope

- Portfolio-level scoring run across all accounts, with the daily refresh model.
- Portfolio summary counts.
- Top 10 Priority Queue.
- Four action-queue panels.
- Portfolio (trending) signals.
- Filters, sorting and search.

## 2. Out of scope

- The account detail page (Phase 7). Clicking an account navigates there; Phase 6 only
  needs the route.
- AI summaries (Phase 8).

---

## 3. Portfolio summary

```text
PORTFOLIO OVERVIEW

Total Accounts              127

Healthy                      74
At Risk                      31
Critical                     22

P0                             3
P1                            11
P2                            29
P3                            84
```

```text
SAVE                            8
FIX                            14
GROW                           21
ENGAGE                         32
```

And the compact header form:

```text
CUSTOMER PORTFOLIO COMMAND CENTER

42 Accounts

────────────────────────────────────

P0 IMMEDIATE       2
P1 HIGH            7
P2 MEDIUM         14
P3 ROUTINE        19

────────────────────────────────────

SAVE              4
FIX               8
GROW              9
ENGAGE           21
```

**Every number is calculated from the actual portfolio.** No placeholders in shipped code.

Two reconciliation rules the UI must respect:

- Health bands (Healthy / At Risk / Critical) sum to the total, and so do P0–P3. If they
  do not, show the discrepancy rather than hiding it.
- Queue counts are by `primaryQueue` (Phase 4) and do **not** sum to the total, because
  accounts with nothing outstanding are in no queue. Label them so this is obvious —
  e.g. `21 accounts need no action today`.
- Accounts whose health is unavailable (Phase 2, `minScoredCategories`) get their own
  count. Do not file them under Critical.

---

## 4. Top 10 Priority Queue

**Top Accounts Requiring Attention** — dynamically calculated, ordered by priority score
descending, ties broken by health ascending then renewal date ascending.

```text
#1  ACME TRANSPORTATION
    P0 • 94
    Health: 42

    Cancellation signal
    Critical camera issue
    Renewal in 61 days

    → Review account
```

```text
#2  ABC LOGISTICS
    P1 • 87
    Health: 51

    Critical ticket beyond SLA
    Overdue commitment

    → Review account
```

```text
#3  XYZ FLEET
    P2 • 78
    Health: 73

    Strong expansion signal
    Recent fleet purchase

    → Review account
```

Each row shows priority level, priority score, health score, and the top reasons from
`priority.reasons[]` (capped, with a `+N more` affordance). Note row #3: a healthy
account with a strong expansion signal belongs in the top ten. The screen is not a
risk list.

Make the count configurable (`topPriorityCount`), defaulting to 10.

---

## 5. Portfolio signals

Roll signals up so leadership can read the portfolio, not just accounts.

```text
↑ 8 accounts showing expansion signals

⚠ 5 accounts have unresolved SLA breaches

⚠ 3 accounts have cancellation signals

↑ 12 accounts have quotes awaiting response

↓ 7 accounts show declining engagement
```

Each line is a signal key, a direction/tone, a count, and a click-through that filters
the account list to exactly those accounts. A count you cannot drill into is a number
nobody trusts.

---

## 6. Filters

```text
All   P0   P1   P2   P3

Save   Fix   Grow   Engage

Healthy   At Risk   Critical

Strategic   Mid-Market   Small Business

Renewal   Expansion   Support
```

Sorting:

```text
Priority
Health
Account Value
Renewal Date
Last Activity
Risk
Opportunity
```

Filters combine (AND across groups, OR within a group). The active filter set and sort are
reflected in the URL so a view can be shared or reloaded — the add-in already reads
runtime overrides from query parameters (`?dataSource=`, `?gateway=`), so extend that
pattern rather than inventing a new one.

The existing toolbar (`#c360-toolbar`, `config.dateFilters`, `config.sourceFilters`)
already implements this interaction style for a single account. Reuse the component, do
not build a second filter system.

---

## 7. Search

```text
Search account
Search company
Search contact
Search issue
```

Returns matching accounts. The existing `#c360-search` combobox in `index.html` already
does account search with proper ARIA wiring (`role="combobox"`, `aria-expanded`,
`aria-controls`, `role="listbox"`). Extend its result set to cover company, contact and
issue matches — do not add a second search box. Each result says *why* it matched
("matched contact: John Reyes") so a hit on an issue is not mistaken for a name match.

---

## 8. Daily portfolio refresh

```text
08:00
     ↓
Pull account data
     ↓
Normalize
     ↓
Detect signals
     ↓
Calculate health
     ↓
Calculate priority
     ↓
Apply overrides
     ↓
Generate actions
     ↓
Update portfolio queue
```

Requirements:

1. **Do not require the model to run continuously.** A controlled refresh model, run on a
   schedule or on demand.
2. The refresh is a batch over the existing per-account pipeline. Reuse
   `js/orchestrator.js` and `cachedService` rather than writing a parallel fetch path.
   Respect `config.cacheTtlMs` and honour the existing manual-refresh bypass.
3. Show `Last updated <timestamp>` prominently, plus a manual **Refresh Portfolio**
   control — the single-account page already has `Refresh Intelligence`, mirror it.
4. Partial failure is normal at portfolio scale. Render what succeeded, list what failed
   per source, and never let one account's failed fetch blank the screen. The existing
   `#c360-source-status` block is the precedent.
5. Concurrency must be bounded so 127 accounts do not open 127 simultaneous requests.
6. MVP scale is 20–30 accounts; the code should not fall over at ten times that, but do
   not build for thousands.

---

## 9. Target layout

```text
╔════════════════════════════════════════════════════════════╗
║ CUSTOMER PORTFOLIO COMMAND CENTER                          ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║ 127 ACCOUNTS       3 P0       11 P1       29 P2            ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║ TOP PRIORITIES                                             ║
║                                                            ║
║ 🔴 ACME TRANSPORTATION                    P0   94          ║
║    Cancellation + critical camera issue                    ║
║    → Retention intervention                                ║
║                                                            ║
║ 🟠 ABC LOGISTICS                          P1   87          ║
║    SLA breach + overdue commitment                         ║
║    → Escalate support                                      ║
║                                                            ║
║ 🟡 XYZ FLEET                              P2   78          ║
║    Fleet expansion signal                                  ║
║    → Explore expansion                                     ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║ ACTION QUEUES                                              ║
║                                                            ║
║ SAVE          4        FIX          8                      ║
║ GROW          9        ENGAGE      21                      ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║ PORTFOLIO SIGNALS                                          ║
║                                                            ║
║ ↑ 8 expansion signals                                      ║
║ ⚠ 5 SLA breaches                                           ║
║ ⚠ 3 cancellation signals                                   ║
║ ↑ 12 inactive quotes                                       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

Accessibility: colour is never the only carrier of meaning. The existing `health.js`
already models this with a `tone` field plus a printed state word — the red/orange/yellow
dots above must always sit next to the `P0` / `P1` / `P2` text. Screen-reader users get
the level, not the colour.

---

## 10. Files

### Create

```text
js/scorecard/portfolio.js    roll-up, top-N, portfolio signals, filter + sort + search logic
js/ui/portfolio.js           the Command Center screen
```

### Touch

```text
index.html          new scripts (after js/ui/render.js, before js/ui/app.js); a container
                    div for the portfolio view, id-prefixed c360-
addin.css           portfolio styles, c360- prefixed
js/ui/app.js        route between portfolio view and account view
js/orchestrator.js  batch refresh entry point
tests/check-app.cjs, tests/check-wiring.cjs   extend for the new screen
```

`js/scorecard/portfolio.js` must stay pure — roll-up in, view model out. All I/O stays in
the orchestrator, all DOM in `js/ui/portfolio.js`. That split is what lets the roll-up be
tested in Node.

---

## 11. Config added

```javascript
C360.scorecardConfig.portfolio = {
    topPriorityCount: 10,

    /** Ties on priority score break by health ascending, then renewal date ascending. */
    topPriorityTieBreakers: ["healthAsc", "renewalDateAsc"],

    /** Max reasons shown per top-priority row before "+N more". */
    maxReasonsPerRow: 3,

    /** Signal keys rolled up into the Portfolio Signals panel. */
    portfolioSignals: [
        { key: "expansionSignal",   label: "accounts showing expansion signals",  tone: "up"   },
        { key: "slaBreach",         label: "accounts have unresolved SLA breaches", tone: "warn" },
        { key: "cancellationSignal", label: "accounts have cancellation signals",  tone: "warn" },
        { key: "quoteAwaitingResponse", label: "accounts have quotes awaiting response", tone: "up" },
        { key: "decliningEngagement", label: "accounts show declining engagement", tone: "down" }
    ],

    filters: {
        priority: ["all", "P0", "P1", "P2", "P3"],
        queue:    ["save", "fix", "grow", "engage"],
        health:   ["healthy", "atRisk", "critical", "unavailable"],
        segment:  ["strategic", "mid-market", "small-business"],
        theme:    ["renewal", "expansion", "support"]
    },

    sorts: ["priority", "health", "accountValue", "renewalDate", "lastActivity",
            "risk", "opportunity"],
    defaultSort: "priority",

    refresh: {
        scheduledLocalTime: "08:00",
        /** Manual only until a scheduler exists. Never a continuously running model. */
        mode: "manual",
        maxConcurrentAccounts: 4,
        /** Render partial results rather than failing the whole screen. */
        renderOnPartialFailure: true
    }
};
```

---

## 12. Tests

| # | Test | Expected |
| - | ---- | -------- |
| 6.1 | Health-band counts | sum to the total account count |
| 6.2 | P0–P3 counts | sum to the total account count |
| 6.3 | Queue counts | do **not** claim to sum to total; `none` count is reported |
| 6.4 | Accounts with unavailable health | counted separately, not as Critical |
| 6.5 | Top-10 ordering | priority score descending |
| 6.6 | Tied priority scores | broken by health ascending, then renewal date |
| 6.7 | Healthy P2 expansion account | can appear in the top ten |
| 6.8 | Every portfolio-signal count | matches the number of accounts its filter returns |
| 6.9 | Two filters from different groups | AND semantics |
| 6.10 | Two filters from the same group | OR semantics |
| 6.11 | Filter + sort state | round-trips through the URL |
| 6.12 | Search by contact name | returns the account with a match reason |
| 6.13 | Search by issue | returns the account with a match reason |
| 6.14 | One account's fetch fails | other accounts still render; failure listed |
| 6.15 | Refresh with 30 accounts | concurrency never exceeds `maxConcurrentAccounts` |
| 6.16 | Empty portfolio | renders an explained empty state, not a broken screen |
| 6.17 | Every rendered number | traceable to a computed value; no hardcoded sample data |
| 6.18 | Mock data source active | `#c360-mock-banner` visible |
| 6.19 | Priority level | conveyed as text, not only colour |
| 6.20 | `portfolio.build()` twice | identical output |

---

## 13. Exit criteria

- [ ] `js/scorecard/portfolio.js` is pure and unit-tested in Node; `js/ui/portfolio.js` holds all DOM.
- [ ] Every displayed count derives from the actual portfolio; no placeholder numbers ship.
- [ ] Top-N queue is dynamically calculated with documented tie-breaking.
- [ ] Four queue panels render Phase 4 cards, ordered by priority score.
- [ ] Portfolio signals are click-through filters whose counts reconcile.
- [ ] All filters, sorts and search work and survive a reload via the URL.
- [ ] Refresh is manual or scheduled — never a continuously running model — with `Last updated` shown.
- [ ] Partial failure renders partial results plus a per-source failure list.
- [ ] Every id and class is `c360-` prefixed; priority is never colour-only.
- [ ] The existing single-account view still works unchanged.
- [ ] `node tests/run-tests.cjs`, `tests/check-app.cjs` and `tests/check-wiring.cjs` all pass.

---

## 14. Do NOT

- Do not compute scores in the UI layer.
- Do not ship placeholder counts.
- Do not build a second search box or a second filter system.
- Do not blank the screen because one account failed to load.
- Do not run the model continuously.
- Do not present queue counts as if they sum to the portfolio total.
- Do not rely on colour alone for priority.
- Do not open one request per account without a concurrency bound.
