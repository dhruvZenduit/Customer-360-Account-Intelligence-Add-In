/**
 * Customer 360 — MOCK DATA SET
 * ============================
 *
 * ##  THIS IS NOT REAL CUSTOMER DATA.  ##
 *
 * No CRM, helpdesk, billing or web-research backend exists in this repository
 * (see README "API integrations"). Rather than pretend those integrations are
 * connected, every record below is invented sample data whose only job is to
 * exercise the UI and the intelligence rules.
 *
 * Every record carries `mock: true`. The UI reads that flag and paints a MOCK
 * badge on the record and a banner across the top of the dashboard, so a user
 * can never mistake this for the real account picture.
 *
 * Dates are generated as offsets from "now" at load time, so the fixture keeps
 * demonstrating recency logic instead of ageing into the "older" bucket.
 *
 * To replace this with real data, set C360.config.dataSource = "gateway" and
 * point config.gatewayBaseUrl at a backend implementing the contract in
 * gatewayClient.js. Nothing else in the app changes.
 */

"use strict";

C360.mockData = (function () {

    /** ISO timestamp for N days before now. */
    function ago(days) {
        var d = new Date();
        d.setDate(d.getDate() - days);
        return d.toISOString();
    }

    /**
     * ISO timestamp for N days AFTER now — renewal dates, quote expiries and
     * commitment dates that have not fallen due yet.
     *
     * Like ago(), these are offsets from load time rather than fixed dates, so
     * the fixture keeps demonstrating "renewal in 61 days" instead of ageing
     * into "renewal 400 days ago" and silently switching off every renewal rule.
     */
    function ahead(days) {
        var d = new Date();
        d.setDate(d.getDate() + days);
        return d.toISOString();
    }

    /** Every mock record is stamped so the UI can badge it. */
    function m(obj) {
        obj.mock = true;
        return obj;
    }

    // -----------------------------------------------------------------
    // Accounts
    // -----------------------------------------------------------------

    var accounts = [
        m({
            id: "acc-001",
            name: "Acme Transportation",
            industry: "Transportation & Logistics",
            status: "Active",
            customerSince: "2021-03-15",
            accountOwner: "Priya Raman",
            website: "https://www.acmetransportation.example",
            domain: "acmetransportation.example",
            headquarters: "Columbus, OH",
            employeeRange: "500-1,000",
            contactProfile: "fleet-heavy",
            products: ["Telematics Core", "Driver Safety Cameras", "Compliance / HOS"],
            assetCount: 412,
            assetCountSource: "CRM record",
            primaryContact: "Dana Whitfield",
            /**
             * When set, the add-in tries to read a live asset count from the
             * MyGeotab session — but only if the session is actually on this
             * database. See geotabService.js.
             */
            geotabDatabase: "acme_transport"
        }),
        m({
            id: "acc-002",
            name: "ABC Waste Services",
            industry: "Waste & Environmental Services",
            status: "Active — Renewal in 90 days",
            customerSince: "2019-08-02",
            accountOwner: "Marcus Bell",
            website: "https://www.abcwaste.example",
            domain: "abcwaste.example",
            headquarters: "Sacramento, CA",
            employeeRange: "200-500",
            contactProfile: "fleet-heavy",
            products: ["Telematics Core", "Compliance / HOS"],
            assetCount: 168,
            assetCountSource: "CRM record",
            primaryContact: "Ray Ortega",
            geotabDatabase: "abc_waste"
        }),
        m({
            id: "acc-003",
            name: "XYZ Logistics",
            industry: "Freight Brokerage",
            status: "Active",
            customerSince: "2025-11-20",
            accountOwner: "Priya Raman",
            website: null,
            domain: null,
            headquarters: "Not available",
            employeeRange: "20-50",
            contactProfile: "small-business",
            products: ["Telematics Core"],
            assetCount: 34,
            assetCountSource: "CRM record",
            primaryContact: null,
            geotabDatabase: null
        }),
        m({
            id: "acc-004",
            name: "Northline Freight Systems",
            industry: "Long-Haul Trucking",
            status: "Active",
            customerSince: "2018-01-11",
            accountOwner: "Sofia Nkemdirim",
            website: "https://www.northlinefreight.example",
            domain: "northlinefreight.example",
            headquarters: "Winnipeg, MB",
            employeeRange: "1,000-5,000",
            contactProfile: "enterprise",
            products: ["Telematics Core", "Driver Safety Cameras", "Routing & Dispatch", "Compliance / HOS"],
            assetCount: 1240,
            assetCountSource: "CRM record",
            primaryContact: "Alain Tremblay",
            geotabDatabase: "northline"
        })
    ];

    // -----------------------------------------------------------------
    // Per-account data. Keys match account.id.
    // Accounts deliberately differ in shape so every empty state, every
    // signal and every risk rule is reachable from the demo data.
    // -----------------------------------------------------------------

    var data = {

        // --------------------------------------------------------------
        // acc-001 — the "growth with a support problem" story
        // --------------------------------------------------------------
        "acc-001": {
            quotes: [
                m({ id: "Q-12845", number: "12845", date: ago(6), amount: 42500, currency: "USD",
                    status: "Sent", products: ["Driver Safety Cameras (75)", "Installation"],
                    owner: "Priya Raman", url: null,
                    title: "Fleet expansion package" }),
                m({ id: "Q-12690", number: "12690", date: ago(74), amount: 18200, currency: "USD",
                    status: "Accepted", products: ["Telematics Core (25)"],
                    owner: "Priya Raman", url: null,
                    title: "Q2 unit add-on" }),
                m({ id: "Q-12455", number: "12455", date: ago(160), amount: 9600, currency: "USD",
                    status: "Expired", products: ["Compliance / HOS (12)"],
                    owner: "Priya Raman", url: null,
                    title: "HOS seat expansion" })
            ],
            orders: [
                m({ id: "O-98765", number: "98765", date: ago(21), value: 61250, currency: "USD",
                    products: ["Telematics Core"], quantity: 75, status: "Fulfilled",
                    owner: "Priya Raman", url: null }),
                m({ id: "O-98110", number: "98110", date: ago(118), value: 40800, currency: "USD",
                    products: ["Telematics Core"], quantity: 50, status: "Fulfilled",
                    owner: "Priya Raman", url: null }),
                m({ id: "O-97540", number: "97540", date: ago(240), value: 39900, currency: "USD",
                    products: ["Telematics Core"], quantity: 48, status: "Fulfilled",
                    owner: "Marcus Bell", url: null })
            ],
            tickets: [
                m({ id: "T-4567", number: "4567", subject: "Devices not reporting after firmware update",
                    category: "Connectivity", opened: ago(12), lastUpdate: ago(2),
                    status: "Open", priority: "High", escalated: true, owner: "Tier 2 Support",
                    url: null }),
                m({ id: "T-4551", number: "4551", subject: "Camera events missing from portal",
                    category: "Data", opened: ago(19), lastUpdate: ago(5),
                    status: "Open", priority: "High", escalated: true, owner: "Tier 2 Support",
                    url: null }),
                m({ id: "T-4530", number: "4530", subject: "Intermittent connectivity on 12 units",
                    category: "Connectivity", opened: ago(33), lastUpdate: ago(26),
                    status: "Open", priority: "Medium", escalated: false, owner: "Tier 1 Support",
                    url: null }),
                m({ id: "T-4498", number: "4498", subject: "Connectivity drop at Dayton yard",
                    category: "Connectivity", opened: ago(47), lastUpdate: ago(40),
                    status: "Resolved", priority: "Medium", escalated: false, owner: "Tier 1 Support",
                    url: null }),
                m({ id: "T-4470", number: "4470", subject: "User cannot access compliance report",
                    category: "Access", opened: ago(58), lastUpdate: ago(56),
                    status: "Resolved", priority: "Low", escalated: false, owner: "Tier 1 Support",
                    url: null }),
                m({ id: "T-4402", number: "4402", subject: "Install scheduling conflict",
                    category: "Installation", opened: ago(80), lastUpdate: ago(76),
                    status: "Resolved", priority: "Low", escalated: false, owner: "Field Ops",
                    url: null })
            ],
            billingIssues: [
                m({ id: "B-3301", subject: "Disputed overage charge on July invoice",
                    date: ago(16), status: "Open", owner: "Billing Ops",
                    customerImpact: "Customer has withheld payment on invoice INV-77120 pending review.",
                    impactEvidence: "Stated by customer on the invoice dispute thread.",
                    lastActivity: ago(4), url: null })
            ],
            technicalIssues: [
                m({ id: "T-4567", subject: "Devices not reporting after firmware update",
                    date: ago(12), status: "Open", owner: "Tier 2 Support",
                    customerImpact: "Reported by customer as affecting 40+ vehicles.",
                    impactEvidence: "Customer statement on ticket T-4567.",
                    lastActivity: ago(2), url: null }),
                m({ id: "T-4551", subject: "Camera events missing from portal",
                    date: ago(19), status: "Open", owner: "Tier 2 Support",
                    customerImpact: null,
                    impactEvidence: null,
                    lastActivity: ago(5), url: null })
            ],
            reviews: [
                m({ id: "R-220", date: ago(34), type: "Quarterly Business Review",
                    attendees: ["Dana Whitfield (Acme)", "John Marsh (Acme)", "Priya Raman"],
                    topics: ["2026 fleet plan", "Safety programme rollout", "Support responsiveness"],
                    concerns: ["Repeat connectivity issues in the Ohio region",
                               "Slow turnaround on Tier 2 escalations"],
                    requests: ["Consolidated monthly safety reporting"],
                    opportunities: ["Customer indicated 60-80 additional vehicles planned for 2026"],
                    commitments: ["Support to provide a connectivity root-cause summary"],
                    followUps: ["Send safety camera proposal", "Schedule connectivity review"],
                    url: null }),
                m({ id: "R-198", date: ago(140), type: "Quarterly Business Review",
                    attendees: ["Dana Whitfield (Acme)", "Priya Raman"],
                    topics: ["Renewal", "Adoption"],
                    concerns: [], requests: [], opportunities: [], commitments: [],
                    followUps: [], url: null })
            ],
            website: m({
                fetchedAt: ago(1),
                url: "https://www.acmetransportation.example",
                summary: "Regional truckload and dedicated fleet carrier operating across the Midwest, "
                       + "offering dry van, refrigerated and dedicated contract transportation.",
                industry: "Transportation & Logistics",
                services: ["Dry van truckload", "Refrigerated transport", "Dedicated fleet services", "Regional LTL"],
                locations: ["Columbus, OH (HQ)", "Dayton, OH", "Indianapolis, IN", "Louisville, KY"],
                marketsServed: ["Retail distribution", "Food and beverage", "Manufacturing"],
                fleetStatement: "Company site states a fleet of \"more than 400 power units\".",
                growthSignals: [
                    m({ id: "W-1", date: ago(18), title: "New Louisville terminal announced",
                        detail: "Company news page announces a new terminal in Louisville, KY opening this quarter.",
                        url: "https://www.acmetransportation.example/news/louisville-terminal",
                        confidence: "High" }),
                    m({ id: "W-2", date: ago(25), title: "Hiring 40 regional drivers",
                        detail: "Careers page lists 40 open regional driver positions across Ohio and Indiana.",
                        url: "https://www.acmetransportation.example/careers",
                        confidence: "Medium" })
                ],
                leadership: [
                    m({ name: "Karen Doyle", title: "President & CEO",
                        url: "https://www.acmetransportation.example/leadership" }),
                    m({ name: "John Marsh", title: "Fleet Director",
                        url: "https://www.acmetransportation.example/leadership" }),
                    m({ name: "Dana Whitfield", title: "Director of Operations",
                        url: "https://www.acmetransportation.example/leadership" })
                ]
            }),
            external: [
                m({ id: "X-1", date: ago(3), category: "expansion",
                    title: "Acme Transportation to open Louisville distribution terminal",
                    summary: "Trade publication reports the carrier is opening a Louisville terminal to serve "
                           + "Midwest retail customers. The report does not state a vehicle count.",
                    publisher: "Midwest Freight Journal",
                    url: "https://midwestfreightjournal.example/acme-louisville",
                    confidence: "High" }),
                m({ id: "X-2", date: ago(29), category: "procurement",
                    title: "Acme adds tractors to regional fleet",
                    summary: "Industry newsletter notes an equipment order placed with a regional dealer. "
                           + "The number of units was not disclosed.",
                    publisher: "Fleet Equipment Weekly",
                    url: "https://fleetequipmentweekly.example/acme-order",
                    confidence: "Medium" }),
                m({ id: "X-3", date: ago(64), category: "contract",
                    title: "Acme named carrier of the year by regional shipper",
                    summary: "Award announcement from a retail shipper naming Acme as a preferred carrier.",
                    publisher: "Retail Supply Chain Today",
                    url: "https://retailsupplychaintoday.example/carrier-award",
                    confidence: "High" })
            ],
            contacts: [
                m({ id: "C-1", name: "John Marsh", title: "Fleet Director",
                    source: "Customer website", sourceUrl: "https://www.acmetransportation.example/leadership",
                    sourceType: "website", lastVerified: ago(1), confidence: "Confirmed",
                    email: null, phone: null,
                    note: "Listed on the company leadership page." }),
                m({ id: "C-2", name: "Dana Whitfield", title: "Director of Operations",
                    source: "Internal CRM", sourceUrl: null,
                    sourceType: "internal", lastVerified: ago(34), confidence: "Confirmed",
                    email: null, phone: null,
                    note: "Primary contact on the account record; attended the last review." }),
                m({ id: "C-3", name: "Karen Doyle", title: "President & CEO",
                    source: "Customer website", sourceUrl: "https://www.acmetransportation.example/leadership",
                    sourceType: "website", lastVerified: ago(1), confidence: "Confirmed",
                    email: null, phone: null, note: null }),
                m({ id: "C-4", name: "Not identified", title: "Director of Safety",
                    source: "Not found", sourceUrl: null,
                    sourceType: "none", lastVerified: null, confidence: "Unverified",
                    email: null, phone: null, placeholder: true,
                    note: "No safety leader found on the company website or in internal records." })
            ]
        },

        // --------------------------------------------------------------
        // acc-002 — the "contraction and churn risk" story
        // --------------------------------------------------------------
        "acc-002": {
            quotes: [
                m({ id: "Q-12712", number: "12712", date: ago(46), amount: 15400, currency: "USD",
                    status: "Sent", products: ["Telematics Core (20)"],
                    owner: "Marcus Bell", url: null, title: "Route optimisation add-on" })
            ],
            orders: [
                m({ id: "O-98402", number: "98402", date: ago(38), value: 21600, currency: "USD",
                    products: ["Telematics Core"], quantity: 26, status: "Fulfilled",
                    owner: "Marcus Bell", url: null }),
                m({ id: "O-97880", number: "97880", date: ago(190), value: 34500, currency: "USD",
                    products: ["Telematics Core"], quantity: 42, status: "Fulfilled",
                    owner: "Marcus Bell", url: null })
            ],
            tickets: [
                m({ id: "T-4588", number: "4588", subject: "Invoice line items do not match contract",
                    category: "Billing", opened: ago(9), lastUpdate: ago(3),
                    status: "Open", priority: "High", escalated: true, owner: "Billing Ops", url: null }),
                m({ id: "T-4507", number: "4507", subject: "Requesting deactivation of 14 units",
                    category: "Account change", opened: ago(27), lastUpdate: ago(20),
                    status: "Open", priority: "Medium", escalated: false, owner: "Account Ops", url: null }),
                m({ id: "T-4433", number: "4433", subject: "Report export failing",
                    category: "Data", opened: ago(70), lastUpdate: ago(66),
                    status: "Resolved", priority: "Low", escalated: false, owner: "Tier 1 Support", url: null })
            ],
            billingIssues: [
                m({ id: "B-3288", subject: "Contract pricing mismatch on renewal quote",
                    date: ago(9), status: "Open", owner: "Billing Ops",
                    customerImpact: "Customer states renewal cannot proceed until pricing is corrected.",
                    impactEvidence: "Customer email recorded on ticket T-4588.",
                    lastActivity: ago(3), url: null }),
                m({ id: "B-3240", subject: "Credit request for deactivated units",
                    date: ago(24), status: "At risk", owner: "Billing Ops",
                    customerImpact: null, impactEvidence: null,
                    lastActivity: ago(11), url: null })
            ],
            technicalIssues: [],
            reviews: [],
            website: m({
                fetchedAt: ago(2),
                url: "https://www.abcwaste.example",
                summary: "Municipal and commercial waste collection and recycling operator serving "
                       + "Northern California.",
                industry: "Waste & Environmental Services",
                services: ["Commercial waste collection", "Residential collection", "Recycling processing"],
                locations: ["Sacramento, CA (HQ)", "Stockton, CA"],
                marketsServed: ["Municipal contracts", "Commercial property"],
                fleetStatement: "No fleet size stated on the company website.",
                growthSignals: [],
                leadership: [
                    m({ name: "Ray Ortega", title: "General Manager",
                        url: "https://www.abcwaste.example/about" })
                ]
            }),
            external: [
                m({ id: "X-11", date: ago(13), category: "contraction",
                    title: "ABC Waste loses Stockton municipal collection contract",
                    summary: "Local reporting states the municipal contract was awarded to another operator "
                           + "effective next quarter. The report does not state how many routes are affected.",
                    publisher: "Sacramento Business Register",
                    url: "https://sacbusinessregister.example/abc-waste-contract",
                    confidence: "High" }),
                m({ id: "X-12", date: ago(41), category: "contraction",
                    title: "Operator consolidates two Central Valley depots",
                    summary: "Company notice referenced in local press describes consolidating two depots "
                           + "into one facility.",
                    publisher: "Central Valley Business Wire",
                    url: "https://cvbusinesswire.example/abc-depot",
                    confidence: "Medium" })
            ],
            contacts: [
                m({ id: "C-11", name: "Ray Ortega", title: "General Manager",
                    source: "Customer website", sourceUrl: "https://www.abcwaste.example/about",
                    sourceType: "website", lastVerified: ago(2), confidence: "Confirmed",
                    email: null, phone: null, note: null }),
                m({ id: "C-12", name: "Not identified", title: "Fleet Manager",
                    source: "Not found", sourceUrl: null, sourceType: "none",
                    lastVerified: null, confidence: "Unverified", placeholder: true,
                    email: null, phone: null,
                    note: "No fleet contact found on the website or in internal records." })
            ]
        },

        // --------------------------------------------------------------
        // acc-003 — the "sparse account" story: exercises every empty state
        // --------------------------------------------------------------
        "acc-003": {
            quotes: [],
            orders: [
                m({ id: "O-99010", number: "99010", date: ago(240), value: 12800, currency: "USD",
                    products: ["Telematics Core"], quantity: 34, status: "Fulfilled",
                    owner: "Priya Raman", url: null })
            ],
            tickets: [],
            billingIssues: [],
            technicalIssues: [],
            reviews: [],
            /** No website on the account record, so nothing can be fetched. */
            website: null,
            external: [],
            contacts: []
        },

        // --------------------------------------------------------------
        // acc-004 — the "healthy strategic account" story
        // --------------------------------------------------------------
        "acc-004": {
            quotes: [
                m({ id: "Q-12901", number: "12901", date: ago(11), amount: 96000, currency: "USD",
                    status: "Pending", products: ["Routing & Dispatch (renewal)", "Driver Safety Cameras (120)"],
                    owner: "Sofia Nkemdirim", url: null, title: "2027 renewal and safety expansion" })
            ],
            orders: [
                m({ id: "O-98990", number: "98990", date: ago(52), value: 128400, currency: "USD",
                    products: ["Driver Safety Cameras"], quantity: 160, status: "Fulfilled",
                    owner: "Sofia Nkemdirim", url: null }),
                m({ id: "O-98330", number: "98330", date: ago(205), value: 121000, currency: "USD",
                    products: ["Driver Safety Cameras"], quantity: 155, status: "Fulfilled",
                    owner: "Sofia Nkemdirim", url: null })
            ],
            tickets: [
                m({ id: "T-4602", number: "4602", subject: "API rate limit questions from integration team",
                    category: "Integration", opened: ago(5), lastUpdate: ago(1),
                    status: "Open", priority: "Low", escalated: false, owner: "Solutions Engineering",
                    url: null }),
                m({ id: "T-4520", number: "4520", subject: "Bulk driver import formatting",
                    category: "Data", opened: ago(44), lastUpdate: ago(41),
                    status: "Resolved", priority: "Low", escalated: false, owner: "Tier 1 Support", url: null })
            ],
            billingIssues: [],
            technicalIssues: [],
            reviews: [
                m({ id: "R-241", date: ago(21), type: "Executive Business Review",
                    attendees: ["Alain Tremblay (Northline)", "Marie Cote (Northline)", "Sofia Nkemdirim"],
                    topics: ["2027 renewal", "Safety programme results", "Acquisition integration"],
                    concerns: ["Integration timeline for the acquired carrier's vehicles"],
                    requests: ["Single-tenant reporting across both carriers"],
                    opportunities: ["Acquired carrier's vehicles are not yet on the platform"],
                    commitments: ["Provide an integration plan for the acquired fleet"],
                    followUps: ["Draft combined-fleet onboarding plan"],
                    url: null })
            ],
            website: m({
                fetchedAt: ago(1),
                url: "https://www.northlinefreight.example",
                summary: "Long-haul and cross-border trucking company operating throughout Canada and the "
                       + "northern United States.",
                industry: "Long-Haul Trucking",
                services: ["Cross-border truckload", "Temperature-controlled freight", "Intermodal drayage"],
                locations: ["Winnipeg, MB (HQ)", "Calgary, AB", "Toronto, ON", "Fargo, ND"],
                marketsServed: ["Agriculture", "Retail", "Industrial manufacturing"],
                fleetStatement: "Company site states \"over 1,200 tractors and 3,000 trailers\".",
                growthSignals: [
                    m({ id: "W-11", date: ago(9), title: "Acquisition of Prairie Star Carriers announced",
                        detail: "Newsroom post announces the acquisition of a regional carrier. The post does "
                              + "not state the size of the acquired fleet.",
                        url: "https://www.northlinefreight.example/news/prairie-star",
                        confidence: "High" })
                ],
                leadership: [
                    m({ name: "Alain Tremblay", title: "Chief Operating Officer",
                        url: "https://www.northlinefreight.example/leadership" }),
                    m({ name: "Marie Cote", title: "Director of Safety",
                        url: "https://www.northlinefreight.example/leadership" }),
                    m({ name: "Grant Wallace", title: "Vice President, Fleet",
                        url: "https://www.northlinefreight.example/leadership" })
                ]
            }),
            external: [
                m({ id: "X-21", date: ago(8), category: "acquisition",
                    title: "Northline Freight acquires Prairie Star Carriers",
                    summary: "Trade press confirms the acquisition. Terms were not disclosed and the "
                           + "acquired fleet size was not stated.",
                    publisher: "Canadian Trucking Review",
                    url: "https://cdntruckingreview.example/northline-prairie-star",
                    confidence: "High" }),
                m({ id: "X-22", date: ago(35), category: "leadership",
                    title: "Northline appoints new Director of Safety",
                    summary: "Company announcement naming Marie Cote as Director of Safety.",
                    publisher: "Canadian Trucking Review",
                    url: "https://cdntruckingreview.example/northline-safety-lead",
                    confidence: "High" })
            ],
            contacts: [
                m({ id: "C-21", name: "Alain Tremblay", title: "Chief Operating Officer",
                    source: "Internal CRM", sourceUrl: null, sourceType: "internal",
                    lastVerified: ago(21), confidence: "Confirmed",
                    email: null, phone: null, note: "Attended the last executive review." }),
                m({ id: "C-22", name: "Grant Wallace", title: "Vice President, Fleet",
                    source: "Customer website", sourceUrl: "https://www.northlinefreight.example/leadership",
                    sourceType: "website", lastVerified: ago(1), confidence: "Confirmed",
                    email: null, phone: null, note: null }),
                m({ id: "C-23", name: "Marie Cote", title: "Director of Safety",
                    source: "Customer website", sourceUrl: "https://www.northlinefreight.example/leadership",
                    sourceType: "website", lastVerified: ago(1), confidence: "Confirmed",
                    email: null, phone: null,
                    note: "Appointment also reported in trade press." })
            ]
        }
    };


    // =================================================================
    // SCORECARD SOURCES for the four original fixtures
    // =================================================================
    // The Command Center reads six sources the original fixture set predates.
    // They are added per account rather than globally, and DELIBERATELY LEFT
    // OUT in places, so the "Data unavailable" path is reachable from the demo
    // data instead of only from a unit test:
    //
    //   acc-001  everything present — the fully-instrumented account
    //   acc-002  no device feed, no outcomes — health re-normalises, confidence drops
    //   acc-003  almost nothing — too few categories to score health at all
    //   acc-004  device + outcomes present, commitments untracked (null)
    //
    // `commitments: null` means "not a tracked source in this deployment";
    // `commitments: []` means "tracked, none outstanding". Phase 3 treats those
    // differently, so both appear below.

    var scorecardSources = {

        "acc-001": {
            deviceHealth: m({ available: true, deviceCount: 412, notCommunicating: 34,
                cameraCount: 180, cameraAvailabilityPct: 86, asOf: ago(1) }),
            portalUsage: m({ available: true, activeUsers: 31, previousActiveUsers: 44,
                logins30d: 210, asOf: ago(1) }),
            contract: m({ id: "K-001", startDate: "2021-03-15", renewalDate: ahead(61),
                annualValue: 480000, currency: "USD", pastDueAmount: 12400,
                pastDueSince: ago(31) }),
            commitments: [
                m({ id: "CM-001", description: "Provide connectivity root-cause summary",
                    dueDate: ago(9), completedDate: null, owner: "Tier 2 Support" }),
                m({ id: "CM-002", description: "Send safety camera proposal",
                    dueDate: ahead(6), completedDate: null, owner: "Priya Raman" })
            ],
            communications: [
                m({ id: "MSG-001", date: ago(3), direction: "inbound",
                    subject: "Camera issues — where are we?",
                    body: "This is the third time this month we have had cameras drop out. "
                        + "I am frustrated. If it is not resolved I will have to take the "
                        + "question of whether we terminate to our board.",
                    author: "Dana Whitfield", channel: "email" }),
                m({ id: "MSG-002", date: ago(11), direction: "outbound",
                    subject: "Connectivity investigation update",
                    body: "Our Tier 2 team is still working the firmware regression.",
                    author: "Priya Raman", channel: "email" })
            ],
            outcomes: m({ available: true, trainingCompleted: true,
                trainingCompletedDate: ago(95), recommendationsImplemented: 3,
                improvements: [
                    m({ label: "Harsh-braking events reduced", change: "-18%", date: ago(60) })
                ] })
        },

        // Renewal in 90 days with negative signals, and no device feed at all —
        // health re-normalises across four categories and says so.
        "acc-002": {
            deviceHealth: null,
            portalUsage: m({ available: true, activeUsers: 9, previousActiveUsers: 22,
                logins30d: 41, asOf: ago(2) }),
            contract: m({ id: "K-002", startDate: "2019-08-02", renewalDate: ahead(74),
                annualValue: 168000, currency: "USD" }),
            commitments: [],
            communications: [
                m({ id: "MSG-010", date: ago(6), direction: "inbound",
                    subject: "Renewal and alternatives",
                    body: "Before we renew we are evaluating two other providers. "
                        + "Nothing personal — procurement is asking us to run an RFP.",
                    author: "Ray Ortega", channel: "email" })
            ],
            outcomes: null
        },

        // Brand new, tiny, and barely instrumented. Health is reported
        // UNAVAILABLE with a reason rather than as a bad number.
        "acc-003": {
            deviceHealth: null,
            portalUsage: null,
            contract: m({ id: "K-003", startDate: "2025-11-20", renewalDate: ahead(280),
                annualValue: 21000, currency: "USD" }),
            commitments: null,
            communications: [],
            outcomes: null
        },

        "acc-004": {
            deviceHealth: m({ available: true, deviceCount: 1240, notCommunicating: 11,
                cameraCount: 640, cameraAvailabilityPct: 97, asOf: ago(1) }),
            portalUsage: m({ available: true, activeUsers: 143, previousActiveUsers: 138,
                logins30d: 1890, asOf: ago(1) }),
            contract: m({ id: "K-004", startDate: "2018-01-11", renewalDate: ahead(210),
                annualValue: 1240000, currency: "CAD" }),
            commitments: null,
            communications: [
                m({ id: "MSG-020", date: ago(7), direction: "inbound",
                    subject: "Prairie Star integration",
                    body: "We closed the Prairie Star acquisition. We will need to talk "
                        + "about onboarding their tractors onto the platform.",
                    author: "Alain Tremblay", channel: "email" })
            ],
            outcomes: m({ available: true, trainingCompleted: true,
                trainingCompletedDate: ago(140), recommendationsImplemented: 5,
                improvements: [
                    m({ label: "Idling reduced", change: "-11%", date: ago(80) }),
                    m({ label: "Fuel per mile improved", change: "-4%", date: ago(80) })
                ] })
        }
    };

    Object.keys(scorecardSources).forEach(function (accountId) {
        if (!data[accountId]) { return; }
        var extra = scorecardSources[accountId];
        Object.keys(extra).forEach(function (key) {
            data[accountId][key] = extra[key];
        });
    });

    // =================================================================
    // MVP FIXTURE SET — 22 further accounts
    // =================================================================
    //
    // ##  STILL NOT REAL CUSTOMER DATA.  ##
    //
    // Phase 1 calls for 20-30 accounts deliberately sampled so that every MVP
    // category is represented and every scoring path is reachable from the demo
    // data. With the four originals that is 26.
    //
    // Each entry declares its CATEGORY and only the fields that make it that
    // category; `buildFixture` fills in the rest. Written as a spec rather than
    // 22 hand-copied blocks because the point of the set is category coverage,
    // and coverage is legible in a table and invisible in 1,300 lines of
    // near-identical object literals.
    //
    // Every generated record carries `mock: true` through `m()`, so the MOCK
    // badge and the banner behave exactly as they do for the originals.
    //
    // Company names are deliberately invented and use .example domains, which
    // are reserved by RFC 2606 and cannot resolve to a real business.

    var FIXTURES = [

        // ---- HEALTHY ------------------------------------------------
        { id: "acc-010", name: "Cedar Ridge Haulage", category: "healthy", coverage: "full",
          industry: "Regional Trucking", assets: 96, since: "2020-06-14",
          owner: "Marcus Bell", profile: "fleet-heavy", value: 96000,
          renewalIn: 240, devices: { down: 1, cameras: 99 }, portal: [38, 36],
          outcomes: { training: true, implemented: 2, label: "Speeding events reduced", change: "-9%" } },

        { id: "acc-011", name: "Blue Line Distribution", category: "healthy", coverage: "full",
          industry: "Food Distribution", assets: 214, since: "2017-02-02",
          owner: "Sofia Nkemdirim", profile: "fleet-heavy", value: 260000,
          renewalIn: 190, devices: { down: 3, cameras: 96 }, portal: [77, 74],
          outcomes: { training: true, implemented: 4, label: "On-time delivery improved", change: "+6%" } },

        { id: "acc-012", name: "Harbour Point Logistics", category: "healthy", coverage: "full",
          industry: "Port Drayage", assets: 58, since: "2021-09-30",
          owner: "Priya Raman", profile: "small-business", value: 54000,
          renewalIn: 150, devices: { down: 0, cameras: 100 }, portal: [19, 18] },

        // ---- AT RISK ------------------------------------------------
        { id: "acc-020", name: "Sable Creek Transport", category: "at-risk",
          industry: "Bulk Freight", assets: 132, since: "2018-11-05",
          owner: "Marcus Bell", profile: "fleet-heavy", value: 148000,
          renewalIn: 55, devices: { down: 14, cameras: 88 }, portal: [24, 41],
          reviewAgo: 210,
          tickets: [
              { subject: "Units dropping offline overnight", cat: "Connectivity", ago: 26, priority: "High", open: true, escalated: true },
              { subject: "Repeat connectivity fault", cat: "Connectivity", ago: 48, priority: "Medium", open: true },
              { subject: "Connectivity fault again", cat: "Connectivity", ago: 70, priority: "Medium", open: false }
          ],
          messages: [
              { ago: 5, subject: "Losing patience", inbound: true,
                body: "This is the third time we have raised this. Still not fixed. "
                    + "I am disappointed with where we have got to.", author: "Nora Vance" }
          ] },

        { id: "acc-021", name: "Ironwood Carriers", category: "at-risk",
          industry: "Flatbed Trucking", assets: 78, since: "2019-04-18",
          owner: "Priya Raman", profile: "fleet-heavy", value: 82000,
          renewalIn: 40, devices: { down: 9, cameras: 91 }, portal: [12, 20],
          reviewAgo: 240,
          messages: [
              { ago: 8, subject: "Contract question", inbound: true,
                body: "Our CFO has asked what is involved in moving to a competitor "
                    + "when the term ends.", author: "Hal Brennan" }
          ] },

        { id: "acc-022", name: "Copperfield Freightways", category: "at-risk",
          industry: "LTL Freight", assets: 305, since: "2016-07-21",
          owner: "Sofia Nkemdirim", profile: "enterprise", value: 340000,
          renewalIn: 88, devices: { down: 22, cameras: 79 }, portal: [51, 88],
          reviewAgo: 130,
          tickets: [
              { subject: "Camera footage missing for incident review", cat: "Data", ago: 18, priority: "Critical", open: true, escalated: true }
          ],
          commitmentsOverdue: [{ description: "Provide incident footage recovery plan", ago: 12 }] },

        // ---- HIGH VALUE ---------------------------------------------
        { id: "acc-030", name: "Meridian Continental Freight", category: "high-value", coverage: "full",
          industry: "Long-Haul Trucking", assets: 2100, since: "2014-03-09",
          owner: "Sofia Nkemdirim", profile: "enterprise", value: 2400000,
          renewalIn: 170, devices: { down: 18, cameras: 95 }, portal: [402, 388],
          outcomes: { training: true, implemented: 9, label: "Collision rate reduced", change: "-22%" } },

        { id: "acc-031", name: "Atlas Municipal Services", category: "high-value",
          industry: "Municipal Fleet", assets: 890, since: "2015-01-26",
          owner: "Marcus Bell", profile: "enterprise", value: 1050000,
          renewalIn: 100, devices: { down: 7, cameras: 97 }, portal: [188, 181],
          reviewAgo: 100 },

        { id: "acc-032", name: "Grand Valley Bus Lines", category: "high-value",
          industry: "Passenger Transport", assets: 640, since: "2016-11-11",
          owner: "Priya Raman", profile: "enterprise", value: 720000,
          renewalIn: 118, devices: { down: 31, cameras: 84 }, portal: [96, 104],
          tickets: [
              { subject: "HOS records incomplete ahead of DOT audit", cat: "Compliance", ago: 6, priority: "Critical", open: true, escalated: true }
          ] },

        // ---- RECENTLY CANCELLED -------------------------------------
        { id: "acc-040", name: "Pinehurst Delivery Group", category: "cancelled",
          industry: "Last-Mile Delivery", assets: 44, since: "2020-02-10",
          owner: "Marcus Bell", profile: "small-business", value: 41000,
          status: "Cancelled", cancelledAgo: 22, renewalIn: null,
          devices: { down: 44, cameras: 0 }, portal: [0, 14],
          reviewAgo: 260,
          messages: [
              { ago: 30, subject: "Ending our contract", inbound: true,
                body: "We have decided not to renew and will end our contract at term. "
                    + "Thank you for the work over the last few years.", author: "Iris Duval" }
          ] },

        { id: "acc-041", name: "Westgate Courier Co", category: "cancelled",
          industry: "Courier Services", assets: 27, since: "2022-05-03",
          owner: "Priya Raman", profile: "small-business", value: 26000,
          status: "Suspended", renewalIn: 30,
          devices: null, portal: null,
          reviewAgo: 300,
          messages: [
              { ago: 14, subject: "Account on hold", inbound: true,
                body: "We are pausing operations for the season and want to suspend "
                    + "rather than cancel.", author: "Tom Aldridge" }
          ] },

        // ---- EXPANSION ----------------------------------------------
        { id: "acc-050", name: "Summit Aggregates", category: "expansion", coverage: "full",
          industry: "Construction Materials", assets: 158, since: "2019-08-08",
          owner: "Priya Raman", profile: "fleet-heavy", value: 172000,
          renewalIn: 200, devices: { down: 2, cameras: 97 }, portal: [46, 43],
          orders: [{ qty: 60, ago: 24 }, { qty: 40, ago: 150 }],
          quotes: [{ title: "Additional 40 units", amount: 58000, ago: 9, status: "Sent" }],
          growth: [{ title: "New quarry site announced in Bend, OR", ago: 20 }] },

        { id: "acc-051", name: "Rockport Marine Logistics", category: "expansion", coverage: "full",
          industry: "Marine Freight", assets: 71, since: "2021-01-19",
          owner: "Sofia Nkemdirim", profile: "fleet-heavy", value: 88000,
          renewalIn: 230, devices: { down: 1, cameras: 99 }, portal: [26, 24],
          orders: [{ qty: 35, ago: 30 }, { qty: 22, ago: 180 }],
          external: [{ category: "expansion", title: "Rockport Marine wins regional port contract", ago: 12 }] },

        { id: "acc-052", name: "Fairhaven Agricultural Co-op", category: "expansion",
          industry: "Agriculture", assets: 122, since: "2018-03-27",
          owner: "Marcus Bell", profile: "fleet-heavy", value: 130000,
          renewalIn: 160, devices: { down: 4, cameras: 94 }, portal: [33, 31],
          growth: [{ title: "Second grain terminal opening this season", ago: 15 }],
          quotes: [{ title: "Asset tracking for trailers", amount: 34000, ago: 5, status: "Sent" }] },

        // ---- TECHNICAL PROBLEMS -------------------------------------
        { id: "acc-060", name: "Northfork Waste Solutions", category: "technical",
          industry: "Waste Collection", assets: 187, since: "2018-09-14",
          owner: "Marcus Bell", profile: "fleet-heavy", value: 195000,
          renewalIn: 220, devices: { down: 46, cameras: 68 }, portal: [29, 34],
          tickets: [
              { subject: "Fleet-wide telemetry gaps after update", cat: "Connectivity", ago: 21, priority: "Critical", open: true, escalated: true },
              { subject: "Camera uploads failing", cat: "Camera", ago: 30, priority: "High", open: true, escalated: true },
              { subject: "Camera uploads failing on second yard", cat: "Camera", ago: 40, priority: "High", open: true },
              { subject: "Camera uploads failing on third yard", cat: "Camera", ago: 52, priority: "Medium", open: false }
          ],
          technicalOpen: [{ subject: "Telemetry gaps after firmware 4.2", ago: 21,
                            impact: "Reported by customer as affecting 46 vehicles.",
                            impactSource: "Customer statement on the escalation thread." }] },

        { id: "acc-061", name: "Silver Birch Transit", category: "technical",
          industry: "Paratransit", assets: 64, since: "2020-10-06",
          owner: "Priya Raman", profile: "small-business", value: 60000,
          renewalIn: 145, devices: { down: 12, cameras: 74 }, portal: [14, 17],
          tickets: [
              { subject: "Safety alerts not triggering on two vehicles", cat: "Safety", ago: 11, priority: "Critical", open: true }
          ] },

        { id: "acc-062", name: "Halcyon Cold Chain", category: "technical",
          industry: "Refrigerated Transport", assets: 143, since: "2019-12-01",
          owner: "Sofia Nkemdirim", profile: "fleet-heavy", value: 165000,
          renewalIn: 175, devices: { down: 8, cameras: 90 }, portal: [40, 39],
          tickets: [
              { subject: "Reefer temperature alerts delayed", cat: "Data", ago: 16, priority: "High", open: true },
              { subject: "Reefer alerts delayed again", cat: "Data", ago: 34, priority: "High", open: true },
              { subject: "Reefer alerts delayed on trailer 22", cat: "Data", ago: 58, priority: "Medium", open: false }
          ] },

        // ---- BILLING PROBLEMS ---------------------------------------
        { id: "acc-070", name: "Kestrel Field Services", category: "billing",
          industry: "Utilities Field Service", assets: 109, since: "2019-06-23",
          owner: "Marcus Bell", profile: "fleet-heavy", value: 118000,
          renewalIn: 205, devices: { down: 3, cameras: 95 }, portal: [35, 34],
          pastDue: 28600, pastDueAgo: 46,
          billingOpen: [{ subject: "Disputed per-unit rate on annual invoice", ago: 40,
                          impact: "Customer has withheld payment pending review.",
                          impactSource: "Stated by customer on the dispute thread." }] },

        { id: "acc-071", name: "Amberline Coach Hire", category: "billing",
          industry: "Coach Hire", assets: 38, since: "2021-04-12",
          owner: "Priya Raman", profile: "small-business", value: 36000,
          renewalIn: 90, devices: { down: 2, cameras: 96 }, portal: [11, 12],
          pastDue: 7400, pastDueAgo: 62,
          billingOpen: [{ subject: "Duplicate charge on two consecutive months", ago: 55 }],
          messages: [
              { ago: 10, subject: "Invoice still wrong", inbound: true,
                body: "We have been charged twice again. This is unacceptable and we "
                    + "would like it corrected before the next cycle.", author: "Dee Okafor" }
          ] },

        // ---- INACTIVE -----------------------------------------------
        { id: "acc-080", name: "Torrance Equipment Rental", category: "inactive",
          industry: "Equipment Rental", assets: 52, since: "2017-05-16",
          owner: "Marcus Bell", profile: "small-business", value: 48000,
          renewalIn: 260, devices: { down: 6, cameras: 92 }, portal: [4, 15],
          reviewAgo: 400, lastActivityAgo: 190 },

        { id: "acc-081", name: "Greywater Marine Supply", category: "inactive",
          industry: "Marine Supply", assets: 31, since: "2018-08-29",
          owner: "Priya Raman", profile: "small-business", value: 30000,
          renewalIn: 240, devices: null, portal: null,
          reviewAgo: 430, lastActivityAgo: 240 },

        { id: "acc-082", name: "Thornbury Seasonal Freight", category: "inactive",
          industry: "Seasonal Haulage", assets: 47, since: "2019-02-14",
          owner: "Sofia Nkemdirim", profile: "small-business", value: 44000,
          segment: "seasonal", renewalIn: 210,
          devices: { down: 5, cameras: 93 }, portal: [3, 12],
          reviewAgo: 190, lastActivityAgo: 150 }
    ];

    /** Domain from a fixture name. `.example` is reserved and cannot resolve. */
    function fixtureDomain(name) {
        return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "") + ".example";
    }

    /**
     * Invented contact names, distinct per fixture.
     *
     * Distinctness is the point: with a shared placeholder name, searching for
     * a contact returned every fixture at once, which made the "matched
     * contact: X" result meaningless. The pools are deliberately ordinary
     * invented names, and every generated contact is stamped MOCK like the rest.
     */
    var FIXTURE_FIRST_NAMES = ["Alex", "Bree", "Cass", "Dev", "Elin", "Fern", "Gil", "Hana",
                               "Ira", "Jo", "Kit", "Lex", "Mira", "Noor", "Ode", "Pia",
                               "Quin", "Rae", "Sol", "Tam", "Uli", "Vik", "Wren", "Xan",
                               "Yara", "Zev"];

    var FIXTURE_LAST_NAMES = ["Ashford", "Bhatt", "Calder", "Duarte", "Ellery", "Fontaine",
                              "Girard", "Halloway", "Iversen", "Janssen", "Kowal", "Lindqvist",
                              "Mercado", "Novak", "Oyelaran", "Petrov", "Quintero", "Rasmussen",
                              "Solberg", "Tanaka", "Umeh", "Vasquez", "Whitlock", "Xiong",
                              "Yamada", "Zielinski"];

    function fixtureContactName(spec, index) {
        // Seeded from the account id so the same fixture always produces the
        // same people — a fixture whose contacts move between runs is not a
        // fixture.
        var seed = 0;
        String(spec.id).split("").forEach(function (character) {
            seed += character.charCodeAt(0);
        });
        var first = FIXTURE_FIRST_NAMES[(seed + index * 7) % FIXTURE_FIRST_NAMES.length];
        var last = FIXTURE_LAST_NAMES[(seed * 3 + index * 11) % FIXTURE_LAST_NAMES.length];
        return first + " " + last;
    }

    /**
     * Expand one fixture spec into an account record plus its bundle.
     *
     * Every default here is chosen so the account is BORING unless the spec says
     * otherwise — a healthy account with nothing outstanding must be reachable,
     * or the portfolio has no baseline and "21 accounts need no action today"
     * can never be demonstrated.
     */
    function buildFixture(spec) {
        var domain = fixtureDomain(spec.name);

        var account = m({
            id: spec.id,
            name: spec.name,
            industry: spec.industry,
            status: spec.status || "Active",
            customerSince: spec.since,
            accountOwner: spec.owner,
            website: "https://www." + domain,
            domain: domain,
            headquarters: spec.hq || "Not available",
            employeeRange: spec.employeeRange || null,
            contactProfile: spec.profile,
            segment: spec.segment || null,
            products: spec.products
                || ["Telematics Core", "Driver Safety Cameras", "Compliance / HOS"],
            assetCount: spec.assets,
            assetCountSource: "CRM record",
            primaryContact: null,
            geotabDatabase: null
        });

        // ---- tickets ------------------------------------------------
        var tickets = (spec.tickets || []).map(function (ticket, index) {
            return m({
                id: spec.id + "-T" + index,
                number: String(4000 + index),
                subject: ticket.subject,
                category: ticket.cat,
                opened: ago(ticket.ago),
                lastUpdate: ago(Math.max(0, ticket.ago - 3)),
                status: ticket.open ? "Open" : "Resolved",
                priority: ticket.priority,
                escalated: ticket.escalated === true,
                owner: "Tier 2 Support",
                url: null
            });
        });

        // ---- orders + quotes ----------------------------------------
        var orders = (spec.orders || [{ qty: 12, ago: 120 }]).map(function (order, index) {
            return m({
                id: spec.id + "-O" + index,
                number: String(90000 + index),
                date: ago(order.ago),
                value: order.qty * 820,
                currency: "USD",
                products: ["Telematics Core"],
                quantity: order.qty,
                status: "Fulfilled",
                owner: spec.owner,
                url: null
            });
        });

        var quotes = (spec.quotes || []).map(function (quote, index) {
            return m({
                id: spec.id + "-Q" + index,
                number: String(13000 + index),
                title: quote.title,
                date: ago(quote.ago),
                amount: quote.amount,
                currency: "USD",
                status: quote.status,
                products: ["Telematics Core"],
                owner: spec.owner,
                url: null
            });
        });

        // ---- reviews -------------------------------------------------
        var reviewAgo = spec.reviewAgo === undefined ? 45 : spec.reviewAgo;
        var reviews = reviewAgo === null ? [] : [m({
            id: spec.id + "-R0",
            date: ago(reviewAgo),
            type: "Quarterly Business Review",
            attendees: [spec.owner],
            topics: ["Adoption", "Fleet plan"],
            concerns: [], requests: [], opportunities: [], commitments: [], followUps: [],
            url: null
        })];

        // ---- escalations ---------------------------------------------
        function escalations(list) {
            return (list || []).map(function (item, index) {
                return m({
                    id: spec.id + "-E" + index,
                    subject: item.subject,
                    date: ago(item.ago),
                    status: "Open",
                    owner: "Support",
                    customerImpact: item.impact || null,
                    impactEvidence: item.impactSource || null,
                    lastActivity: ago(Math.max(0, item.ago - 4)),
                    url: null
                });
            });
        }

        // ---- contacts -------------------------------------------------
        // `coverage: "full"` fills the top four roles of the account's contact
        // profile, so stakeholderCoverageGap does NOT fire. Without at least a
        // few such accounts the ENGAGE queue catches the entire portfolio and
        // "N accounts need no action today" can never be demonstrated — which
        // is a claim Phase 6 explicitly makes.
        //
        // Names are drawn per fixture rather than shared, so a contact search
        // returns one account instead of twenty-two.
        var roleTitles = spec.coverage === "full"
            ? (spec.profile === "small-business"
                ? ["Owner", "Operations Manager", "Fleet Manager", "Controller"]
                : spec.profile === "enterprise"
                    ? ["VP Operations", "Director of Fleet", "CIO", "Procurement Manager"]
                    : ["Fleet Manager", "Director of Operations", "Director of Safety",
                       "Procurement Manager"])
            : ["Fleet Manager", "Director of Operations"];

        var contacts = (spec.contacts || roleTitles.map(function (title, index) {
            return { name: fixtureContactName(spec, index), title: title };
        })).map(function (contact, index) {
            return m({
                id: spec.id + "-C" + index,
                name: contact.name,
                title: contact.title,
                source: "Internal CRM",
                sourceUrl: null,
                sourceType: "internal",
                lastVerified: ago(30),
                confidence: "Confirmed",
                email: null,
                phone: null,
                note: null
            });
        });

        // ---- website + external ---------------------------------------
        var website = (spec.growth || []).length ? m({
            fetchedAt: ago(1),
            url: "https://www." + domain,
            summary: null,
            industry: spec.industry,
            services: [], locations: [], marketsServed: [],
            fleetStatement: null,
            growthSignals: spec.growth.map(function (signal, index) {
                return m({
                    id: spec.id + "-W" + index,
                    date: ago(signal.ago),
                    title: signal.title,
                    detail: signal.title
                        + ". The announcement does not state a fleet or asset figure.",
                    url: "https://www." + domain + "/news",
                    confidence: "High"
                });
            }),
            leadership: []
        }) : null;

        var external = (spec.external || []).map(function (item, index) {
            return m({
                id: spec.id + "-X" + index,
                date: ago(item.ago),
                category: item.category,
                title: item.title,
                summary: item.title + ". Terms were not disclosed.",
                publisher: "Trade Press Example",
                url: "https://tradepress.example/" + spec.id + "-" + index,
                confidence: "High"
            });
        });

        // ---- scorecard sources ----------------------------------------
        var deviceHealth = spec.devices === null ? null : m({
            available: true,
            deviceCount: spec.assets,
            notCommunicating: spec.devices.down,
            cameraCount: Math.round(spec.assets / 2),
            cameraAvailabilityPct: spec.devices.cameras,
            asOf: ago(1)
        });

        var portalUsage = spec.portal === null ? null : m({
            available: true,
            activeUsers: spec.portal[0],
            previousActiveUsers: spec.portal[1],
            logins30d: spec.portal[0] * 6,
            asOf: ago(1)
        });

        var contract = m({
            id: spec.id + "-K",
            startDate: spec.since,
            renewalDate: spec.renewalIn === null ? null : ahead(spec.renewalIn),
            // A declared segment travels on the contract record — see the note
            // in js/scorecard/segments.js declaredSegment().
            segment: spec.segment || null,
            cancelledDate: spec.cancelledAgo ? ago(spec.cancelledAgo) : null,
            cancellationRequested: spec.cancellationRequested === true,
            annualValue: spec.value,
            currency: "USD",
            pastDueAmount: spec.pastDue || null,
            pastDueSince: spec.pastDueAgo ? ago(spec.pastDueAgo) : null,
            autoRenew: false
        });

        var commitments = (spec.commitmentsOverdue || []).map(function (item, index) {
            return m({
                id: spec.id + "-CM" + index,
                description: item.description,
                dueDate: ago(item.ago),
                completedDate: null,
                owner: spec.owner
            });
        });

        var communications = (spec.messages || []).map(function (message, index) {
            return m({
                id: spec.id + "-MSG" + index,
                date: ago(message.ago),
                direction: message.inbound ? "inbound" : "outbound",
                subject: message.subject,
                body: message.body,
                author: message.author || spec.owner,
                channel: "email"
            });
        });

        var outcomes = spec.outcomes ? m({
            available: true,
            trainingCompleted: spec.outcomes.training === true,
            trainingCompletedDate: ago(120),
            recommendationsImplemented: spec.outcomes.implemented || null,
            improvements: spec.outcomes.label ? [m({
                label: spec.outcomes.label,
                change: spec.outcomes.change,
                date: ago(70)
            })] : []
        }) : null;

        return {
            account: account,
            bundle: {
                quotes: quotes,
                orders: orders,
                tickets: tickets,
                billingIssues: escalations(spec.billingOpen),
                technicalIssues: escalations(spec.technicalOpen),
                reviews: reviews,
                website: website,
                external: external,
                contacts: contacts,
                deviceHealth: deviceHealth,
                portalUsage: portalUsage,
                contract: contract,
                commitments: commitments,
                communications: communications,
                outcomes: outcomes
            },
            category: spec.category
        };
    }

    /** Which MVP category each fixture is meant to prove. */
    var fixtureCategories = {};

    FIXTURES.forEach(function (spec) {
        var built = buildFixture(spec);
        accounts.push(built.account);
        data[spec.id] = built.bundle;
        fixtureCategories[spec.id] = built.category;
    });

    /**
     * Empty shape returned for an account with no fixture entry.
     *
     * Note what the scorecard sources default to: `null` for every feed, and
     * `commitments: null` rather than `[]`. An account with no fixture has no
     * device data — it does not have PERFECT device data, and it does not have
     * zero devices. That distinction is the whole of global rule G3.
     */
    function emptyBundle() {
        return {
            quotes: [], orders: [], tickets: [], billingIssues: [], technicalIssues: [],
            reviews: [], website: null, external: [], contacts: [],
            deviceHealth: null, portalUsage: null, contract: null,
            commitments: null, communications: [], outcomes: null
        };
    }

    function forAccount(accountId) {
        return data[accountId] || emptyBundle();
    }

    return {
        accounts: accounts,
        forAccount: forAccount,
        /** Which MVP category each generated fixture is meant to prove. */
        fixtureCategories: fixtureCategories,
        fixtureSpecs: FIXTURES
    };
}());
