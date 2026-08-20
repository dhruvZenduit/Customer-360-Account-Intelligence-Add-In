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

    /** Empty shape returned for an account with no fixture entry. */
    function emptyBundle() {
        return {
            quotes: [], orders: [], tickets: [], billingIssues: [], technicalIssues: [],
            reviews: [], website: null, external: [], contacts: []
        };
    }

    function forAccount(accountId) {
        return data[accountId] || emptyBundle();
    }

    return {
        accounts: accounts,
        forAccount: forAccount
    };
}());
