# Appendix A — Source Spec (verbatim)

> This is the ORIGINAL, unedited 48-section brief, preserved byte-for-byte below the
> rule so nothing is lost in the phased rewrite. The phased plan lives in
> [`../newStuff.txt`](../newStuff.txt) and the per-phase docs in this folder.
>
> If a phase doc and this appendix disagree, THIS APPENDIX WINS — it is the source of truth.

---

# CUSTOMER 360 → PORTFOLIO COMMAND CENTER

## Add Customer Portfolio Health & Action Scorecard

You are working inside an EXISTING **Customer 360 / Account Intelligence Add-In**.

Do NOT create a separate application.

Do NOT replace the existing Customer 360 functionality.

Your task is to add a new **Customer Portfolio Health & Action Scorecard / Command Center** layer on top of the existing Customer 360 system.

The goal is to transform the existing Customer 360 from a passive account-information dashboard into an actionable portfolio command center.

---

# 1. PRODUCT GOAL

The system should continuously review customer signals and answer four questions:

> **1. How healthy is this customer?**

> **2. How urgently should we act?**

> **3. Why is this customer receiving this priority?**

> **4. What specifically should we do next?**

The system must produce THREE separate primary outputs:

```text
HEALTH SCORE
How healthy is the account?

PRIORITY SCORE
How urgently should someone act?

RECOMMENDED ACTION
What specifically should happen next?
```

Do NOT collapse these into one score.

A customer can have:

```text
Health: 75
Priority: P1 / 91
```

because the account is generally healthy but has a critical unresolved camera issue.

Another customer could have:

```text
Health: 42
Priority: P3 / 48
```

because the account is unhealthy but there is no immediate action required.

---

# 2. EXISTING CUSTOMER 360 DATA

Reuse the existing Customer 360 data architecture.

The system should use existing account intelligence wherever available:

```text
Account
Quotes
Orders
Tickets
Account Reviews
Billing Issues
Technical Issues
Customer Website
External Web Research
Company Updates
Purchases
Expansion
Downsizing
Decision Makers
Contacts
Timeline
```

Add the following new intelligence layer:

```text
Device/Product Health
Support Health
Relationship Health
Commercial/Retention Health
Outcome/Value Health

        ↓

HEALTH SCORE

        +

Critical Overrides

        ↓

PRIORITY SCORE

        ↓

SAVE / FIX / GROW / ENGAGE

        ↓

RECOMMENDED ACTION
```

---

# 3. IMPORTANT ARCHITECTURE RULE

Separate the system into:

## FACTS

Direct information from source systems.

Example:

```text
3 cameras are not communicating.

Ticket #1234 has been open for 12 days.

Renewal date:
October 15, 2026.

Customer mentioned competitor X in an email.
```

## SIGNALS

Interpretation of multiple facts.

Example:

```text
Account may have elevated retention risk.
```

## SCORES

Deterministic calculations.

Example:

```text
Health = 42
Priority = 91
```

## ACTIONS

Recommended response.

Example:

```text
Escalate camera issue internally and obtain ETA
before contacting the customer.
```

Do not mix these concepts.

---

# 4. HEALTH SCORE

Create a transparent 0–100 Health Score.

The default scorecard should contain five categories.

| Category                  | Weight |
| ------------------------- | -----: |
| Product & Device Health   |    25% |
| Support & Service Health  |    20% |
| Engagement & Relationship |    20% |
| Commercial & Retention    |    25% |
| Outcomes & Value          |    10% |

Each category must independently produce a:

```text
0–100 score
```

Then calculate:

```text
Health Score =
(Product Health × 0.25)
+
(Support Health × 0.20)
+
(Relationship Health × 0.20)
+
(Commercial Health × 0.25)
+
(Outcomes Health × 0.10)
```

Do not allow the LLM to silently determine this calculation.

The formula must be implemented deterministically in code.

---

# 5. PRODUCT & DEVICE HEALTH — 25%

Evaluate signals such as:

* Non-communicating devices
* Camera availability
* Portal usage
* HOS activity
* Unused hardware
* Device health
* Product utilization
* Device connectivity

Create a transparent sub-score.

Example:

```text
Product & Device Health

Score: 61 / 100

Signals:
⚠ 8% devices not communicating
✓ Camera availability healthy
⚠ Portal usage declining
✓ HOS activity stable
```

Do not invent metrics that the available data does not support.

If device-health data is unavailable:

```text
Data unavailable
```

Do not convert missing data into a zero.

---

# 6. SUPPORT & SERVICE HEALTH — 20%

Evaluate:

* Ticket severity
* Ticket age
* SLA breaches
* Repeat issues
* Unresolved escalations
* Billing escalations
* Technical escalations
* Customer impact

Do NOT use ticket count alone.

A customer with 20 low-severity resolved tickets may be healthier than a customer with one critical unresolved ticket.

Prioritize:

```text
Severity
Age
Recurrence
SLA breach
Customer impact
Escalation
```

Example:

```text
Support & Service Health

Score: 38 / 100

⚠ Critical ticket open 14 days
⚠ SLA breached
⚠ Repeat camera issue
✓ 7 lower-priority tickets resolved
```

---

# 7. ENGAGEMENT & RELATIONSHIP — 20%

Evaluate:

* Last contact
* Email response
* Sentiment
* Stakeholder coverage
* Meeting attendance
* Account review frequency
* Decision-maker engagement
* Response patterns
* Relationship activity

Do NOT let email sentiment alone determine health.

Sentiment must be supported by other evidence where possible.

For example:

```text
Negative email
+
Repeated complaints
+
Competitor reference
+
Escalation
```

is a much stronger risk signal than:

```text
One short frustrated email
```

---

# 8. COMMERCIAL & RETENTION — 25%

Evaluate:

* Renewal date
* Past-due invoices
* Cancellation language
* Downgrade requests
* Competitor activity
* Quotes
* Orders
* Renewal status
* Commercial engagement

Important signals:

```text
Cancellation request
Competitor switch request
Downgrade request
Renewal approaching
Past-due balance
Inactive quote
Reduced purchasing
```

This category should be particularly important because commercial/retention risk can exist even when product health is good.

---

# 9. OUTCOMES & VALUE — 10%

Evaluate available evidence such as:

* Completed training
* Implemented recommendations
* Safety improvements
* Fuel improvements
* Utilization improvements
* Operational improvements
* Customer outcomes

Do not fabricate business outcomes.

If measurable outcomes are unavailable:

```text
Outcomes data limited
```

Do not automatically assume the customer has poor outcomes.

---

# 10. DATA CONFIDENCE SCORE

In addition to Health and Priority, display:

```text
Confidence: XX%
```

This is NOT the same as health.

Confidence measures how complete and reliable the underlying account data is.

Example:

```text
Health: 42 / 100
Priority: 91 / 100
Confidence: 84%
```

Confidence should consider:

* Data freshness
* Number of populated signal categories
* Source reliability
* Account identity confidence
* Availability of recent activity
* Conflicting information

Example:

```text
Confidence: 84%

Based on:
✓ CRM data
✓ Ticket history
✓ Device data
✓ Recent account review
✓ External company research
```

If important data is missing:

```text
Confidence: 54%

Limited device-health data available.
No recent account review found.
```

---

# 11. HEALTH DISPLAY

At the top of each account page, display:

```text
ACCOUNT HEALTH

42 / 100

AT RISK

Product Health       61
Support Health       38
Relationship         47
Commercial           29
Outcomes             72

Confidence            84%
```

Use the same transparent breakdown everywhere.

Do not display only:

```text
42 — At Risk
```

without explanation.

---

# 12. CRITICAL OVERRIDES

The weighted health score MUST NOT be the only mechanism determining urgency.

Implement a separate override engine.

Critical events can immediately increase Priority.

Implement these rules:

### P0

```text
Explicit cancellation request
Explicit competitor-switch request
Safety-critical issue
HOS/compliance-critical problem
Executive escalation
Service outage
```

### P1

```text
Critical ticket beyond SLA
Renewal within 90 days + negative signals
Overdue commitment made to customer
```

### P2

```text
Quotation awaiting response beyond defined period
Account review overdue
Qualified expansion opportunity
```

### P3

```text
Healthy account
Routine engagement
Long-term nurture
Non-urgent opportunity
```

The override engine must record WHY the override happened.

Example:

```text
P0 OVERRIDE

Reason:
Customer explicitly requested cancellation.

Source:
Email — Aug 20, 2026

This override takes precedence over the
weighted health score.
```

---

# 13. PRIORITY SCORE

After critical overrides, calculate a separate Priority Score.

Use:

| Factor                               | Weight |
| ------------------------------------ | -----: |
| Risk Severity                        |    35% |
| Time Sensitivity                     |    25% |
| Account Value / Strategic Importance |    20% |
| Overdue Commitments                  |    10% |
| Expansion Readiness                  |    10% |

Formula:

```text
Priority =
Risk Severity × 0.35
+
Time Sensitivity × 0.25
+
Strategic Importance × 0.20
+
Overdue Commitments × 0.10
+
Expansion Readiness × 0.10
```

Implement this deterministically.

Do not let the AI calculate the final number.

---

# 14. PRIORITY OVERRIDE MODEL

Priority should be represented as BOTH:

```text
Priority Level
```

and:

```text
Priority Score
```

Example:

```text
P0
91 / 100
```

or:

```text
P2
67 / 100
```

Priority levels:

```text
P0 = Immediate
P1 = High
P2 = Medium
P3 = Routine
```

---

# 15. PRIORITY EXPLANATION

Every priority score MUST explain itself.

Example:

```text
PRIORITY: P0

91 / 100

Why?

• Cancellation language detected
• Renewal approaching in 52 days
• 2 unresolved technical issues
• Strategic account
• One overdue commitment

Primary reason:
Explicit cancellation signal
```

Never display a mysterious score.

---

# 16. PORTFOLIO COMMAND CENTER

Add a portfolio-level dashboard.

This is the most important new screen.

Instead of only looking at one account, Sean should be able to see the entire portfolio.

Example:

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

---

# 17. TOP 10 PRIORITY QUEUE

Create:

## Top Accounts Requiring Attention

Example:

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

This queue should be dynamically calculated.

---

# 18. ACTION QUEUES

Do NOT create one giant list.

Create four separate queues.

## SAVE

Retention and relationship risk.

Examples:

```text
Cancellation
Competitor threat
Renewal risk
Relationship deterioration
```

## FIX

Operational/service issues.

Examples:

```text
Technical escalation
Billing issue
Device problem
SLA breach
Overdue support issue
```

## GROW

Qualified opportunities.

Examples:

```text
Fleet expansion
New facility
New vehicles
Unused product opportunity
Expansion into new market
```

## ENGAGE

Relationship-building actions.

Examples:

```text
Account review overdue
Training required
Inactive customer
Stakeholder coverage gap
```

---

# 19. ACTION QUEUE UI

Display:

```text
┌───────────────────────────────────────────┐
│ SAVE                                      │
│                                           │
│ ACME Transportation          P0           │
│ Cancellation signal                       │
│                                           │
│ → Prepare retention call                 │
└───────────────────────────────────────────┘
```

```text
┌───────────────────────────────────────────┐
│ FIX                                       │
│                                           │
│ ABC Logistics                 P1          │
│ Critical ticket beyond SLA               │
│                                           │
│ → Escalate internally                     │
└───────────────────────────────────────────┘
```

---

# 20. RECOMMENDED ACTION ENGINE

The system must go beyond:

```text
Contact customer.
```

Every recommendation must contain:

```text
WHY
EVIDENCE
ACTION
OWNER
DUE DATE
DRAFT
CONFIDENCE
```

Example:

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

---

# 21. ACTION RULES

Implement deterministic action mappings where possible.

### Cancellation

Signal:

```text
Cancellation language
```

Action:

```text
Call customer
Identify root cause
Review contract
Prepare retention options
```

### Critical ticket

Signal:

```text
Critical unresolved ticket
```

Action:

```text
Escalate internally
Obtain ETA
Prepare proactive customer update
```

### Inactive quote

Signal:

```text
Quote > 5 business days without response
```

Action:

```text
Draft follow-up
Identify decision blocker
```

### Account review overdue

Action:

```text
Prepare account brief
Prepare meeting agenda
Recommend review
```

### Device health problem

Action:

```text
Generate device audit
Identify affected vehicles
Create troubleshooting plan
```

### Portal adoption decline

Action:

```text
Recommend targeted training
Identify unused features
```

### Safety concern

Action:

```text
Prepare camera/coaching/safety recommendation
```

### Competitor signal

Action:

```text
Summarize competitor signal
Identify customer concern
Summarize current customer value
Prepare retention strategy
```

### Overdue commitment

Action:

```text
Notify owner
Prepare transparent customer update
```

### Strong health + operational pain

Action:

```text
Identify relevant expansion solution
Build business case
```

---

# 22. ACTION OWNERSHIP

Every action should have an owner.

Possible owners:

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

If owner cannot be determined:

```text
Owner:
Unassigned
```

Do not guess.

---

# 23. DUE DATES

Every actionable recommendation should have a due date.

Examples:

```text
Today
Tomorrow
Within 3 business days
Before renewal
Before next account review
```

Due dates should be generated from the actual urgency.

For P0:

```text
Today
```

For P1:

```text
Within 1 business day
```

For P2:

```text
Within 3–5 business days
```

For P3:

```text
Routine
```

Make these configurable.

---

# 24. DRAFT COMMUNICATIONS

The system can generate:

### Customer email

### Internal escalation

### Meeting agenda

### Follow-up message

But these MUST remain drafts.

Example:

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

The default implementation MUST NOT automatically send.

---

# 25. HUMAN APPROVAL

This system is initially:

**READ-ONLY + RECOMMENDATION**

AI must NOT automatically:

* Send customer emails
* Cancel contracts
* Change pricing
* Issue credits
* Modify devices
* Change CRM records
* Close tickets
* Change subscriptions
* Commit to customers

Any external or high-impact action requires explicit user approval.

The UI should make this distinction obvious:

```text
AI RECOMMENDATION
        ↓
USER REVIEW
        ↓
APPROVE
        ↓
ACTION
```

---

# 26. EVIDENCE PANEL

Every score and recommendation should have an evidence drawer.

Example:

```text
WHY IS THIS ACCOUNT P0?

[View Evidence]

Internal:
• Ticket #1234 — Critical — Aug 6
• Ticket #1255 — Critical — Aug 12

Commercial:
• Renewal — Oct 15

Communication:
• Cancellation language — Aug 20

External:
• Competitor deployment mentioned — Aug 18
```

This is essential for trust.

---

# 27. SCORE EXPLANATION

When the user clicks:

```text
Health: 42
```

show:

```text
HEALTH SCORE BREAKDOWN

Product & Device
61 × 25% = 15.25

Support
38 × 20% = 7.60

Relationship
47 × 20% = 9.40

Commercial
29 × 25% = 7.25

Outcomes
72 × 10% = 7.20

──────────────────

Health Score
46.70
```

Use the actual calculated values.

Do not hardcode example numbers.

---

# 28. DATA CONFIDENCE

Add:

```text
Confidence
84%
```

Clicking it should show:

```text
DATA CONFIDENCE

CRM data                 ✓ Recent
Ticket data              ✓ Recent
Device health            ✓ Recent
Account review           ✓ Recent
External research        ✓ Recent
Contact information      ⚠ Partially verified

Overall confidence:
84%
```

Again, do not fabricate confidence.

Implement a transparent confidence methodology.

---

# 29. ACCOUNT SEGMENTS

Different customers require different expectations.

Create account segments:

```text
Strategic / Enterprise
Mid-Market
Small Business
New Onboarding
Long-Term Customer
Suspended
Seasonal
```

The segment should influence:

* Engagement expectations
* Account review cadence
* Priority
* Renewal thresholds
* Expansion expectations

Example:

```text
Strategic Account
Account review overdue after 90 days

Small Business
Account review overdue after 180 days
```

These should be configurable.

Do NOT hardcode these thresholds throughout the codebase.

Create configuration:

```javascript
accountSegmentRules
```

---

# 30. CUSTOMER LIFECYCLE

Also consider lifecycle stage:

```text
Onboarding
Adoption
Mature
Expansion
Renewal
At Risk
Churned
Suspended
```

The same signal should be interpreted differently depending on lifecycle.

Example:

```text
Low portal usage

Onboarding:
Potential adoption problem

Mature:
Potential disengagement

At Risk:
Additional risk signal
```

---

# 31. MASTER CUSTOMER IDENTITY

This is a critical architectural requirement.

Before advanced scoring, establish a master account identity.

The system needs to map:

```text
Master Customer ID
        |
        +── CRM Account
        |
        +── Customer Email Domain
        |
        +── Ticket Organization
        |
        +── Quote / Estimate
        |
        +── Billing Account
        |
        +── MyGeotab Database
        |
        +── Camera Portal
        |
        +── Contract
        |
        +── Renewal Record
```

Do not assume names alone are sufficient.

Example:

```text
"ABC Logistics Inc."
"ABC Logistics"
"ABC Logistics LLC"
```

may represent the same company.

Create a canonical account identity layer.

---

# 32. IDENTITY CONFIDENCE

Every source-to-account mapping should have a confidence level.

Example:

```text
CRM:
Exact Account ID
Confidence: 100%

Ticket:
Matched via CRM account ID
Confidence: 100%

External Website:
Matched via verified domain
Confidence: 95%

External News:
Matched by company name + domain
Confidence: 90%
```

Do not attach external information to an account if identity confidence is too low.

Create a configurable minimum threshold.

---

# 33. DAILY PORTFOLIO REFRESH

The Command Center should support a daily portfolio refresh.

Conceptually:

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

Do not require the AI model to be running continuously.

Start with a controlled refresh model.

---

# 34. PORTFOLIO SUMMARY

At the top of the Command Center display:

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

Also:

```text
SAVE                            8
FIX                            14
GROW                           21
ENGAGE                         32
```

These numbers must be calculated from the actual portfolio.

---

# 35. TRENDING SIGNALS

Add:

## Portfolio Signals

Example:

```text
↑ 8 accounts showing expansion signals

⚠ 5 accounts have unresolved SLA breaches

⚠ 3 accounts have cancellation signals

↑ 12 accounts have quotes awaiting response

↓ 7 accounts show declining engagement
```

This lets leadership understand the portfolio, not just individual accounts.

---

# 36. ACCOUNT DETAIL VIEW

Clicking an account from the queue should open the existing Customer 360 page with the new scorecard prominently displayed.

Structure:

```text
CUSTOMER 360

ACME TRANSPORTATION

────────────────────────

HEALTH
42 / 100

PRIORITY
P0 — 91

CONFIDENCE
84%

────────────────────────

WHAT CHANGED

...

────────────────────────

WHY THIS ACCOUNT IS PRIORITY

...

────────────────────────

RECOMMENDED NEXT ACTION

...

────────────────────────

CUSTOMER 360 DATA

Quotes
Orders
Tickets
Reviews
Billing
Technical
Website
External
Contacts
Timeline
...
```

---

# 37. FILTERS

The Portfolio Command Center must allow:

```text
All
P0
P1
P2
P3

Save
Fix
Grow
Engage

Healthy
At Risk
Critical

Strategic
Mid-Market
Small Business

Renewal
Expansion
Support
```

Also allow sorting by:

```text
Priority
Health
Account Value
Renewal Date
Last Activity
Risk
Opportunity
```

---

# 38. SEARCH

Allow:

```text
Search account
Search company
Search contact
Search issue
```

The search should return matching accounts.

---

# 39. EXPLAINABILITY

Never display:

```text
Priority: 92
```

without explanation.

Always provide:

```text
92

Why?

Critical unresolved technical issue
+
Renewal within 60 days
+
Strategic account
+
Overdue commitment
```

Every score should be explainable.

---

# 40. AI ROLE

AI should be used for:

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

AI should NOT silently:

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

Use deterministic code for scoring.

Use AI for interpretation and generation.

---

# 41. FEEDBACK LOOP

Add the ability for Sean to mark a recommendation:

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

Store feedback for future evaluation.

Example:

```text
Recommendation:
Call customer about camera issue.

Feedback:
Already handled.

Outcome:
Dismissed.
```

This becomes important for improving the system.

---

# 42. SUCCESS METRICS

Build a simple analytics layer for the Command Center.

Track:

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

Do NOT attempt sophisticated predictive modeling initially.

Start with measurement.

---

# 43. MVP SCOPE

Start with approximately:

```text
20–30 accounts
```

Include a balanced sample:

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

The first version should:

1. Import CRM data.
2. Import ticket data.
3. Import quote data.
4. Import device-health data.
5. Normalize account identity.
6. Calculate deterministic health scores.
7. Calculate deterministic priority scores.
8. Apply critical overrides.
9. Generate Save/Fix/Grow/Engage queues.
10. Explain every score with evidence.
11. Generate recommended actions.
12. Generate communication drafts.
13. Require approval for external actions.
14. Record feedback.

---

# 44. IMPLEMENTATION PHASES

Implement incrementally.

## Phase 1 — Data Model

Inspect the existing Customer 360.

Create normalized account/signal models.

Do not break existing functionality.

---

## Phase 2 — Health Engine

Implement:

```text
Product Health
Support Health
Relationship Health
Commercial Health
Outcome Health
```

Then:

```text
Weighted Health Score
```

---

## Phase 3 — Priority Engine

Implement:

```text
Risk Severity
Time Sensitivity
Strategic Importance
Overdue Commitments
Expansion Readiness
```

Then:

```text
Priority Score
```

---

## Phase 4 — Critical Overrides

Implement:

```text
P0
P1
P2
P3
```

with transparent reasons.

---

## Phase 5 — Action Queues

Implement:

```text
SAVE
FIX
GROW
ENGAGE
```

---

## Phase 6 — Action Engine

Implement recommended actions.

Each action must include:

```text
Why
Evidence
Action
Owner
Due Date
Confidence
```

---

## Phase 7 — Portfolio Command Center

Create the portfolio dashboard.

---

## Phase 8 — Account Detail Integration

Integrate the scorecard into the existing Customer 360 account page.

---

## Phase 9 — AI Layer

Only after deterministic scoring works:

Use AI for:

```text
Summaries
Signal extraction
Recommendations
Draft communications
```

---

## Phase 10 — Feedback

Add:

```text
Useful
Incorrect
Not Needed
Already Handled
```

---

# 45. TESTING

Create deterministic test fixtures.

At minimum test:

### Healthy account

Expected:

```text
High health
Low priority
P3
```

### Healthy account + critical issue

Expected:

```text
High/medium health
P0/P1 priority
```

This verifies that priority is independent of health.

### Cancellation

Expected:

```text
P0
```

### Competitor switch

Expected:

```text
P0
```

### Critical SLA breach

Expected:

```text
P1
```

### Renewal <90 days + negative signals

Expected:

```text
P1
```

### Overdue quote

Expected:

```text
P2
```

### Account review overdue

Expected:

```text
P2
```

### Healthy expansion opportunity

Expected:

```text
P2/P3
GROW
```

### Missing data

Expected:

```text
No fabricated score inputs
Lower confidence
Graceful explanation
```

---

# 46. FINAL UI

The finished Command Center should feel approximately like:

```text
╔════════════════════════════════════════════════════════════╗
║ CUSTOMER PORTFOLIO COMMAND CENTER                         ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║ 127 ACCOUNTS       3 P0       11 P1       29 P2           ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║ TOP PRIORITIES                                             ║
║                                                            ║
║ 🔴 ACME TRANSPORTATION                    P0   94          ║
║    Cancellation + critical camera issue                    ║
║    → Retention intervention                                ║
║                                                            ║
║ 🟠 ABC LOGISTICS                           P1   87          ║
║    SLA breach + overdue commitment                         ║
║    → Escalate support                                      ║
║                                                            ║
║ 🟡 XYZ FLEET                               P2   78          ║
║    Fleet expansion signal                                  ║
║    → Explore expansion                                    ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║ ACTION QUEUES                                              ║
║                                                            ║
║ SAVE          4        FIX          8                     ║
║ GROW          9        ENGAGE      21                     ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║ PORTFOLIO SIGNALS                                          ║
║                                                            ║
║ ↑ 8 expansion signals                                     ║
║ ⚠ 5 SLA breaches                                          ║
║ ⚠ 3 cancellation signals                                  ║
║ ↑ 12 inactive quotes                                      ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
```

Clicking an account opens:

```text
CUSTOMER 360
ACME TRANSPORTATION

HEALTH
42 / 100
AT RISK

PRIORITY
P0
94 / 100

CONFIDENCE
84%

────────────────────────────────────

WHY PRIORITY?

• Cancellation language detected
• Critical camera issue
• Renewal within 61 days
• Strategic account

────────────────────────────────────

WHAT CHANGED?

• Camera issue escalated
• Quote inactive
• Renewal approaching

────────────────────────────────────

RECOMMENDED ACTION

Escalate the camera issue internally,
obtain an ETA, and prepare a retention
conversation.

OWNER
Sean + Technical Support

DUE
Today

────────────────────────────────────

EVIDENCE

[View CRM]
[View Tickets]
[View Quote]
[View Communication]
[View External Research]

────────────────────────────────────

CUSTOMER 360

Quotes
Orders
Tickets
Reviews
Billing
Technical
Website
External Intelligence
Contacts
Timeline
```

---

# 47. MOST IMPORTANT DESIGN PRINCIPLE

The system must NOT become a generic "AI customer summary."

The primary workflow is:

```text
DATA
 ↓
SIGNALS
 ↓
HEALTH
 ↓
PRIORITY
 ↓
ACTION
```

And the user should be able to go backwards at every step:

```text
ACTION
 ↓
WHY?
 ↓
SIGNALS
 ↓
EVIDENCE
 ↓
SOURCE
```

That is what makes the Command Center trustworthy.

---

# 48. FINAL IMPLEMENTATION RULE

Before changing anything:

1. Inspect the existing Customer 360 repository.
2. Understand its current architecture.
3. Identify what already exists.
4. Reuse existing APIs/services/components.
5. Do not duplicate existing account intelligence.
6. Add the scorecard as a new intelligence layer.
7. Keep scoring deterministic.
8. Keep AI explainable.
9. Keep external actions human-approved.
10. Build the portfolio view before attempting sophisticated autonomous behavior.

Do not claim an API integration exists if it does not.

Do not create fake customer data except clearly labeled development fixtures.

Do not fabricate contacts, tickets, quotes, scores, health signals, or company information.

The finished product should be a **transparent Customer Portfolio Command Center** that helps Sean decide:

> **Who should I care about today, why, and exactly what should I do?**
