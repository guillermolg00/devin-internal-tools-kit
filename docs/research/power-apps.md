# Microsoft Power Apps: factual research brief

**Research cut-off: 7 November 2026.** Context supplied by the requester: a fintech with approximately 60 engineers, approximately $250,000 annual Power Apps spend, three internal apps, and ten more planned. These inputs are not independently verified. No tenant, invoice, contract, app inventory, or audit report was provided.

**Evidence convention.** Sections 1–3 and 5–7 describe documented product facts, with citations attached to each claim. Section 4 contains explicitly labeled calculations and inferences, not findings about this customer's deployment. Public US-dollar list prices are a comparison basis, not a reconstruction of negotiated charges. Microsoft's licensing guidance is informational and does not replace the customer's legal use-rights documents.[^guide] This brief contains no recommendations.

## 1. Licensing today

| License or entitlement | Documented charging basis and scope |
| --- | --- |
| **Power Apps Premium** | **$20 per assigned user/month, paid yearly**, for unlimited custom apps and Power Pages access for that licensed user. It is not a fee for each app or only for the developers who build it.[^pricing][^guide] |
| **Premium volume offer** | **$12 per user/month, paid yearly, with a 2,000-seat minimum**; Microsoft's guide describes the threshold as 2,000 or more new licenses.[^pricing][^guide] |
| **Power Apps per app subscription** | The guide lists **$5 per user/app/month**, billed annually: one app or one website in a specific environment. Licenses are stackable; accessing the same app in two environments requires two per-app entitlements. Purchased capacity is allocated to environments rather than assigned as a conventional Entra user license.[^guide][^perapp] **Availability is channel-dependent; see below.** |
| **Power Apps per-app pay-as-you-go meter** | **$10 per monthly active user/app**, billed through a linked Azure subscription. Opening the same app repeatedly in the month counts once; opening different apps counts separately. Users already covered by qualifying per-user Power Apps/Dynamics 365 rights are excluded from the app meter.[^meters] |
| **Microsoft 365 / Office 365 included rights** | Selected subscriptions include limited Power Apps rights for Microsoft 365/standard-connector scenarios, not the equivalent of Premium. The presence of a Dataverse service plan in the admin center does not itself authorize standalone custom Dataverse apps or premium flows.[^overview] |
| **Dynamics 365 included rights** | Qualifying licenses include Power Apps/Power Automate rights to extend the licensed Dynamics application, subject to its context and environment restrictions; these are not general-purpose rights for unrelated internal apps.[^overview][^guide] |
| **Developer Plan** | A free, individual development/test entitlement, not production licensing. It does not by itself grant Managed Environments rights when running assets; Microsoft has also announced a near-term unmanaged-developer-environment deprecation, detailed in section 7.[^developer][^managed-license] |

### Per-app subscription availability is not a blanket retirement

Microsoft's end-of-sale notice took effect **2 January 2026**. Existing Enterprise customers can continue using and renewing the SKU and adjust users during an Enterprise Agreement through annual true-up. Existing MPSA customers can use it until their agreement ends, followed by a 60-day migration window. The notice's March clarification says **existing and new CSP customers can continue purchasing, using, and renewing it**, with price-list availability returning starting in early April. Thus the notice does not mean that every per-app subscription has ceased to exist; the pay-as-you-go meter is a separate offer.[^perapp-sale][^meters]

### Already-announced price change, not today's price

On **1 January 2027**, Premium's list prices rise from **$20 to $22** and from **$12 to $14** for the 2,000-seat-minimum offer. Microsoft says existing subscriptions retain their current price through their subscription term; the new price applies to purchases, renewals, and co-terminations whose terms begin on or after that date. The announcement affects these two Premium offers, not all Power Platform SKUs, and removes no Premium capabilities or entitlements.[^price-change]

### Who needs licensing

Licensing is not confined to makers: users accessing premium apps require appropriate use rights. Microsoft's multiplexing rules also say that indirect access, connection pooling, or additional software tiers do not reduce required subscription licenses. A shared integration identity is therefore not, by itself, a replacement for end-user licensing.[^guide][^license-faq]

## 2. What comes with Premium—and what does not

| Component | Included scope | Boundary or separately licensed element |
| --- | --- | --- |
| **Dataverse** | Full Dataverse use rights, custom tables, and pooled storage entitlements. The Premium default tenant entitlement is **10 GB database, 20 GB file, 2 GB log**; each Premium seat adds **250 MB database and 2 GB file**, not additional log capacity.[^guide] | Default capacity is granted once per tenant, not once per app or environment. Storage is shared across relevant Power Platform/Dynamics workloads. Some restricted Dynamics tables require the corresponding Dynamics license.[^guide] |
| **Extra Dataverse storage** | The preceding base and accrued allowances are included with the subscription.[^guide] | Subscription add-ons list **$40/GB/month database**, **$2/GB/month file**, and **$10/GB/month log**, billed annually. Database Tier 2 is **$30/GB/month with a 1,000-GB minimum**. Database, file, and log are distinct capacity categories; unused file/log capacity does not simply cover a database deficit.[^guide][^storage] |
| **Power Automate** | Cloud workflows **in the context of the Power Apps application**: flows interacting with the app or its permitted data sources. For an automated in-context flow, association to the app and the owner's qualifying license matter; instant-flow users need appropriate rights.[^guide][^license-faq] | Not an unrestricted standalone automation/RPA license. Unrelated flows require separate Power Automate licensing; the Power Apps inclusion excludes RPA. The guide separately lists Power Automate Premium at **$15/user/month**, Process at **$150/bot/month**, and Hosted Process at **$215/bot/month**, billed annually.[^guide] |
| **Connectors** | Standard, premium, custom, and on-premises connectivity rights are included for licensed Power Apps use.[^pricing][^guide] | Connector permission depends on the connection credentials and the connected service's entitlements; the Power Apps license does not confer arbitrary access to the underlying service or override its permissions.[^security] |
| **Managed Environments** | Premium includes the entitlement to enable this governance suite; qualifying per-app capacity and pay-as-you-go options can also satisfy relevant app-use requirements.[^managed-license] | **All active usage** in a managed environment needs qualifying licenses/capacity/meters—even users of standard apps. It is not enough to license only the administrators or makers. The Power Apps pay-as-you-go meter covers app usage only: Power Automate usage in that managed environment needs standalone Power Automate licenses or per-flow plans.[^managed-license] |
| **Advanced security integrations** | Managed Environments exposes features including customer-managed keys (CMK), Customer Lockbox, IP firewall, virtual-network support, and app-level Conditional Access.[^managed] | Inclusion in the feature catalogue does **not** mean every prerequisite is bundled. CMK and Customer Lockbox each require Managed Environments **and additional qualifying Microsoft 365/Office 365 E5 or specified compliance/security subscriptions** for users in the affected environments. Entra Conditional Access generally requires Entra ID P1; risk-based policies require P2.[^cmk][^lockbox][^conditional] |

**Pay-as-you-go storage is different from subscription pooling.** The licensing guide gives each pay-as-you-go environment 1 GB database and 1 GB file allowance rather than consumption of the tenant subscription pool. Published metered rates above the applicable allowance are **$48/GB/month database, $2.40/GB/month file, and $12/GB/month log**; the meter documentation also describes allocated-capacity treatment. These are not the subscription add-on prices above.[^guide][^meters]

## 3. Security, governance, and ALM facts

### Identity, authorization, and data protection

- **Authentication and access layers:** Power Apps authenticates users through Microsoft Entra ID. License entitlement, app sharing, environment permissions, Dataverse roles, and connector credentials are separate access controls. Sharing a canvas app remains subject to Dataverse roles; model-driven apps are shared through Dataverse security roles.[^security]
- **Dataverse authorization:** Security roles, business units, record ownership/sharing, and teams control access. Role/team privileges are **cumulative**: a restrictive role does not subtract access granted by another role.[^roles]
- **Column-level security:** Security profiles can restrict reading, creating, and updating eligible columns, including masking options. It does **not** hide values from System Administrators; some column types, including lookup, formula, primary-name, and virtual-table columns, cannot be secured this way.[^columns]
- **Encryption:** Microsoft documents TLS **1.2 or higher** for service endpoints and encryption at rest for Dataverse, with Microsoft-managed keys by default. CMK adds customer control over encryption keys but has the additional licensing prerequisites described above.[^privacy][^cmk]
- **Microsoft support access:** Customer Lockbox provides approval/rejection of covered Microsoft engineer data-access requests and is enforced on managed environments; it is not an unconditional assertion that every support or administrative action requires customer approval.[^lockbox]

### Auditing: two different evidence streams

**Dataverse change auditing** records supported record changes, sharing/role changes, and related events. It must be enabled at the appropriate environment/table/column levels and consumes **Dataverse log storage**. Ordinary Dataverse auditing does **not** cover retrieve/export operations or authentication, and does not audit table/column-definition changes. Separate Dataverse/model-driven-app activity logging covers retrieve/export operations.[^audit]

**Microsoft Purview activity logging** covers supported app, flow, connector, Dataverse, and administrative activities. Its documented prerequisites include appropriate Office/Purview licensing, roles, and environment settings; the overview specifies **production environments** for user activity logs. Power Platform admin activity collection is enabled by default across tenants. Purview has separate audit-retention policies and permissions.[^purview]

### Data policies / DLP

Classic data policies classify connectors as **Business, Non-Business, or Blocked**. Business and Non-Business connectors cannot be combined for data sharing in the same app/flow; connectors in the same group can share data. Tenant-level and environment-level policies can both apply, with the combined result imposing the applicable restrictions.[^dlp-class][^dlp-combined]

Classic policy blocking has exceptions for core Microsoft connectors, including Dataverse. The current documentation distinguishes **Advanced Connector Policies (ACP)**, whose allowlist model can restrict certified connectors that classic policies cannot block. Data policies are consequently not a single uniform control across every connector type and governance mechanism; the known-limitations page also says Power Apps expression-language tabular functions cannot be governed with data policies.[^dlp-class][^dlp-limitations]

### Environments, administration, and ALM

- **Isolation and geography:** An environment groups apps, data, connections, and flows under a tenant, with its own roles and geographic location; it can contain zero or one Dataverse database. Production and sandbox environment types support separate operational and development/test use.[^environments]
- **Residency boundary:** Microsoft describes geo-local storage and replication, with documented exceptions. User actions, configured integrations, and other services can expose data outside that geo; environment location is not an unconditional guarantee that every downstream data transfer remains there.[^privacy]
- **Managed governance:** The suite lists sharing limits, usage insights, environment groups, solution checker, pipelines, routing, data-policy visibility, and security/network controls. These are available capabilities, not evidence that this fintech has configured or uses them.[^managed]
- **ALM:** Solutions carry components across environments through export/import; Microsoft supports CI/CD with source control and tools such as Azure DevOps. Built-in pipelines deploy solutions, connection references, and environment-variable configuration—but **not the data inside Dataverse tables**.[^alm][^pipelines]
- **Git integration:** Current native integration supports **Azure DevOps and GitHub**, requires managed development/target environments and appropriate repository permissions, and has provider-specific prerequisites.[^git-faq]

## 4. What approximately $250,000/year could correspond to

**Calculations and inferences only.** The following illustrations use the list prices cited in section 1, twelve months, and no discounts, tax, services, or other SKUs. They do not establish actual license counts. “60 users” below is a hypothetical scenario, **not** an assertion that 60 engineers are the fintech's entire user population.

### 4.1 Seat and usage equivalents

| Hypothetical interpretation | Arithmetic | Interpretation, not an invoice finding |
| --- | --- | --- |
| Standard Premium seats | $250,000 ÷ ($20 × 12) ≈ **1,042 users**; 1,000 seats = **$240,000/year**.[^pricing] | A broad internal-user deployment of roughly a thousand Premium seats is the simplest **seat-only list-price fit**, if most of the spend really is recurring Power Apps subscriptions. |
| Public 2,000-seat volume offer | 2,000 × $12 × 12 = **$288,000/year**; $250,000 is approximately **13.2% below** that floor.[^pricing] | A negotiated volume agreement could fit, but $250,000 alone does not prove either the volume SKU or a discount. Dividing by $144/year and claiming approximately 1,736 public-volume seats would ignore the 2,000-seat minimum. |
| Per-app subscriptions | $250,000 ÷ ($5 × 12) ≈ **4,167 user-app-environment entitlements**; if everyone uses the same three apps in one environment, approximately **1,389 people**.[^guide] | This is not 4,167 distinct people. Actual feasibility also depends on purchasing channel and contract status.[^perapp-sale] |
| Per-app pay-as-you-go | $250,000 ÷ ($10 × 12) ≈ **2,083 monthly active user-app units**, assuming identical usage each month; approximately **694 people** if each opens all three apps monthly.[^meters] | Storage and other metered services would consume part of the same budget if included in the reported total. |

**Most likely interpretation, conditional on the spend description:** if this is primarily a recurring Power Apps license bill, it points to **end-user access across a much larger population than the engineering team**, with roughly 1,000 standard Premium seats a straightforward numerical explanation. If there are only approximately 60 actual licensed users, the total instead implies substantial capacity/automation/other charges or non-license services. The evidence does not allow a probability ranking between those cases, identify the purchased SKU, or establish that the three apps themselves caused the spend.[^pricing][^guide]

### 4.2 Separating engineer count from user count and app count

| Hypothetical: the same 60 people use every app | Three apps | Thirteen apps | Increment for ten more apps |
| --- | ---: | ---: | ---: |
| Standard Premium | 60 × $20 × 12 = **$14,400/year** | **$14,400/year** | **$0 in seat-license fees**, if the same licensed people remain covered.[^pricing] |
| Per-app subscription | 60 × 3 × $5 × 12 = **$10,800/year** | 60 × 13 × $5 × 12 = **$46,800/year** | **$36,000/year**, assuming one environment and eligible purchasing terms.[^guide][^perapp-sale] |
| Per-app pay-as-you-go | 60 × 3 × $10 × 12 = **$21,600/year** | 60 × 13 × $10 × 12 = **$93,600/year** | **$72,000/year**, assuming every person opens every app every month.[^meters] |

**Inference:** the proposed app expansion does not imply a 13/3 multiplier on the actual bill. Premium app rights do not multiply by app count, whereas per-app access can; more storage, requests, users, or separately licensed workflows can still change cost under either model.[^guide][^meters][^requests]

**Illustrative capacity calculation:** 60 Premium seats contribute 60 × 250 MB database and 60 × 2 GB file to the tenant pool, in addition to the applicable once-per-tenant default. That allowance is not replicated for each of the three or thirteen apps. An additional 100 GB of database subscription capacity alone is 100 × $40 × 12 = **$48,000/year** at the published non-Tier-2 rate.[^guide]

**Unresolved customer-specific facts:** total app users; overlap between app audiences; purchased versus assigned licenses; channel, currency, discount, and subscription term; Dataverse usage; standalone automation; and whether the quoted spend includes partner delivery/support or other products. None of these are established by the engineering headcount, app count, or approximate annual total supplied here.

## 5. Compliance evidence relevant to a fintech

**Scope qualification:** Microsoft publishes service compliance offerings, certificates, and attestations. Different audits cover different services; the exact report, service scope, geography, and audit period are material. The public pages below are not this fintech's own certification, and no authenticated Service Trust Portal report or customer control implementation was examined. Microsoft describes compliance as a shared responsibility.[^audit-scope][^shared-compliance]

| Offering | Verified public evidence and boundary |
| --- | --- |
| **SOC 1 Type 2** | Microsoft's in-scope list includes Power Apps and Power Automate. SOC 1 concerns service-organization controls relevant to customers' internal control over financial reporting; Type 2 reports address operation over a period. This is an attestation, not a blanket financial-regulator approval.[^soc1] |
| **SOC 2 Type 2** | Microsoft's public scope includes Power Apps and Power Automate. The report concerns the applicable Trust Services Criteria and control effectiveness over a period; the specific report determines the covered system and criteria.[^soc2] |
| **ISO/IEC 27001, 27018, and 27701** | Microsoft's GDPR accountability material states Azure, Dynamics 365, and Power Platform services are certified to these standards. They concern information-security management, public-cloud personal-data protection, and privacy-information management respectively. Microsoft's 27701 page explicitly describes its certificate covering Power Platform.[^gdpr][^iso27018][^iso27701] |
| **ISO/IEC 27017** | Microsoft's cloud-security-control offering explicitly lists Power Apps and Power Automate in scope. This is distinct from asserting that the customer's application has been independently certified.[^iso27017][^shared-compliance] |
| **PCI DSS** | Microsoft's PCI DSS page explicitly lists **Power Apps and Power Automate** as in-scope cloud services. It describes annual QSA assessment and AoC/RoC evidence, including PCI DSS **4.0.1** and Service Provider Level 1 for its named assessed platforms. Microsoft also explicitly states that provider compliance does **not automatically certify customer-built services**. The current AoC's scope and responsibilities are not reconstructed from the product name alone.[^pci] |
| **GDPR** | Microsoft provides data-protection controls and accountability materials for Power Platform; GDPR is a legal compliance obligation, not a product certification automatically acquired by purchasing Premium. Provider controls do not displace customer responsibilities.[^gdpr][^shared-compliance] |
| **US financial-services / FFIEC context** | Microsoft supplies SOC evidence to support institutions' FFIEC obligations. Its FFIEC page says customers must determine applicability to their own laws/regulations and cites FFIEC guidance against relying solely on audit reports.[^ffiec] |
| **EU DORA context** | Microsoft publishes a contract-stack mapping to DORA Article 30 and other contractual requirements, including a **DORA Addendum and Financial Services Agreement for eligible customers**. That is contractual support, not a claim that a Power Apps subscription makes the customer “DORA-certified” or automatically includes those signed agreements.[^dora] |

## 6. Documented limitations affecting engineering work

These are documented product constraints, **not measured failure rates or evidence that this fintech has experienced them**.

| Area | Documented constraint |
| --- | --- |
| **Query delegation and correctness** | Nondelegable canvas-app queries process a limited local subset: **500 rows by default**. The current delegation documentation lists a configurable maximum of **10,000**. Queries over larger sources can return incomplete/incorrect results; supported delegation depends on the connector and operation. This is not a limit on the total number of rows Dataverse can store.[^delegation] |
| **Request entitlements versus enforcement** | Published Power Apps Premium entitlement is **40,000 Power Platform requests per user per 24 hours**; per-app/pay-as-you-go is **6,000**. The documentation separately describes a transition period in which cloud-flow enforcement uses more generous flow-level limits, including **200,000 per cloud flow** for Power Apps Premium. Entitlement, transitional enforcement, and short-window service protection are not interchangeable.[^requests] |
| **Dataverse service protection** | Independently of daily request entitlements, Dataverse enforces API protection per authenticated user. Published defaults include **6,000 requests per five-minute sliding window**, **1,200 seconds combined execution time** within that window, and **52 or more concurrent requests**, with values subject to environment variation/change. Exceeding applicable thresholds can return HTTP **429** and retry guidance.[^protection] |
| **Automation duration and timeouts** | A cloud-flow run has a **30-day** duration limit, including pending approvals. Documented inbound and outbound synchronous request limits are **120 seconds**; a response timeout is not necessarily the termination of all subsequent/background work. Connector-specific throttling is an additional, separate constraint.[^flow-limits] |
| **Source-control round-tripping** | Canvas source is available as `.pa.yaml`; native Git integration commits app changes after publishing. Microsoft permits minor repository edits in that workflow but documents that direct edits are unsupported for apps containing code components and can prevent the app running. Source availability is therefore not an unrestricted text-first editing guarantee.[^canvas-git] |
| **Deployment scope** | Solution pipelines do not migrate Dataverse table data, and dependencies/connections/configuration have their own deployment handling. Built-in pipelines have Managed Environments/license prerequisites for applicable target environments.[^pipelines] |
| **Browser/offline boundary** | Canvas apps in web browsers cannot run offline. Native Power Apps Mobile provides offline capabilities, but offline-first canvas apps do not support non-Dataverse connectors or Power Automate flows in offline mode.[^offline][^offline-limits] |
| **Governance is not universal data control** | Classic DLP has nonblockable connector exceptions, advanced policies have a different coverage model, and tabular expressions are a documented policy gap. Dataverse column security also has type and administrator exceptions; normal change auditing does not cover every read/export.[^dlp-class][^dlp-limitations][^columns][^audit] |

## 7. Announced operational changes relevant to the planning horizon

- **Unmanaged developer environments:** creation ends **15 November 2026**; suspension starts **15 December 2026**; deletion starts **15 January 2027**. Managed developer environments are excluded from this deprecation. Microsoft's documentation states that Managed Environments use rights are not included in the Developer Plan.[^deprecations][^developer]
- **Built-in deployment pipelines:** Microsoft's current FAQ says notifications for unmanaged targets begin in **October 2026**, with 30 days to approve enabling Managed Environments before further deployments to the target are blocked, and one additional 30-day extension available per environment.[^pipelines]
- **Premium pricing:** **1 January 2027** changes are described in section 1; existing-term protection means that date is not automatically every customer's invoice-change date.[^price-change]
- **Licensing enforcement:** Microsoft announces stricter app-open checks beginning **February 2027**, including Managed Environments, model-driven apps, and certain out-of-context Dynamics scenarios. Microsoft describes this as enforcement of existing requirements, not a new grant of previously free premium use rights.[^license-faq][^managed-license]

## Sources

All links below are Microsoft primary sources, accessed **7 November 2026**. Unless a dated announcement is identified, they are living documentation; cited figures reflect the pages at the research cut-off. Public documentation establishes the described offering, not the customer's negotiated contract or actual configuration.

[^pricing]: [Power Apps pricing — US commercial list prices and plan comparison](https://www.microsoft.com/en-us/power-platform/products/power-apps/pricing).
[^guide]: [Power Platform Licensing Guidance — Power Apps, Power Automate, Dataverse, Managed Environments, multiplexing, and support sections](https://www.microsoft.com/licensing/guidance/Power-Platform).
[^perapp]: [About Power Apps per app plans — allocation and environment scope](https://learn.microsoft.com/en-us/power-platform/admin/about-powerapps-perapp).
[^meters]: [Pay-as-you-go meters — app-active-user accounting and Dataverse meters](https://learn.microsoft.com/en-us/power-platform/admin/pay-as-you-go-meters).
[^overview]: [Licensing overview for Microsoft Power Platform](https://learn.microsoft.com/en-us/power-platform/admin/pricing-billing-skus).
[^developer]: [Power Apps Developer Plan — features, limitations, and deprecation FAQ](https://learn.microsoft.com/en-us/power-platform/developer/plan).
[^managed-license]: [Licensing requirements for managed environments](https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-licensing).
[^perapp-sale]: [Power Apps per app license sales end — 14 January 2026, CSP clarification added 6 March 2026](https://www.microsoft.com/en-us/licensing/news/power-app-per-app-end-of-sale).
[^price-change]: [New pricing for Power Apps Premium — 9 September 2026 announcement, effective 1 January 2027](https://www.microsoft.com/en-us/licensing/news/power-apps-premium-price-update).
[^license-faq]: [Power Apps licensing FAQs — premium access, flow context, and February 2027 enforcement](https://learn.microsoft.com/en-us/power-platform/admin/powerapps-licensing-faq).
[^storage]: [Dataverse capacity-based storage details — capacity categories and deficit treatment](https://learn.microsoft.com/en-us/power-platform/admin/capacity-storage).
[^security]: [Security concepts in Microsoft Dataverse — identity, sharing, roles, and connectors](https://learn.microsoft.com/en-us/power-platform/admin/wp-security).
[^managed]: [Managed environments overview — capability catalogue](https://learn.microsoft.com/en-us/power-platform/admin/managed-environment-overview).
[^cmk]: [Manage your customer-managed encryption key — default encryption and additional licensing](https://learn.microsoft.com/en-us/power-platform/admin/customer-managed-key).
[^lockbox]: [Customer Lockbox in Power Platform and Dynamics 365 — scope, exclusions, and licensing](https://learn.microsoft.com/en-us/power-platform/admin/about-lockbox).
[^conditional]: [Microsoft Entra Conditional Access overview — licensing requirements](https://learn.microsoft.com/en-us/entra/identity/conditional-access/overview).
[^roles]: [Security in Microsoft Dataverse — business units, teams, and cumulative privileges](https://learn.microsoft.com/en-us/power-platform/admin/wp-security-cds).
[^columns]: [Column-level security — permissions and exceptions](https://learn.microsoft.com/en-us/power-platform/admin/field-level-security).
[^privacy]: [Compliance and data privacy — encryption and geographic data handling](https://learn.microsoft.com/en-us/power-platform/admin/wp-compliance-data-privacy).
[^audit]: [Manage Dataverse auditing — configuration, coverage, and storage](https://learn.microsoft.com/en-us/power-platform/admin/manage-dataverse-auditing).
[^purview]: [Power Platform activity logs and auditing in Microsoft Purview — prerequisites and environment scope](https://learn.microsoft.com/en-us/power-platform/admin/activity-logging-auditing/activity-logs-overview).
[^dlp-class]: [Connector classification — data groups, classic-policy exceptions, and Advanced Connector Policies](https://learn.microsoft.com/en-us/power-platform/admin/dlp-connector-classification).
[^dlp-combined]: [Combined effect of multiple data policies](https://learn.microsoft.com/en-us/power-platform/admin/dlp-combined-effect-multiple-policies).
[^dlp-limitations]: [Known limitations for data policies](https://learn.microsoft.com/en-us/power-platform/admin/dlp-known-issues).
[^environments]: [Power Platform environments overview](https://learn.microsoft.com/en-us/power-platform/admin/environments-overview).
[^alm]: [Overview of application lifecycle management with Microsoft Power Platform](https://learn.microsoft.com/en-us/power-platform/alm/overview-alm).
[^pipelines]: [Pipelines in Power Platform — deployment scope, prerequisites, and enforcement FAQ](https://learn.microsoft.com/en-us/power-platform/alm/pipelines).
[^git-faq]: [FAQs about source code integration — providers and licensing](https://learn.microsoft.com/en-us/power-platform/alm/git-integration/faqs).
[^requests]: [Requests limits and allocations — entitlements and transition-period cloud-flow enforcement](https://learn.microsoft.com/en-us/power-platform/admin/api-request-limits-allocations).
[^audit-scope]: [Cloud services in compliance audit scope](https://learn.microsoft.com/en-us/azure/compliance/offerings/cloud-services-in-audit-scope).
[^shared-compliance]: [Meet compliance requirements — shared responsibility and evidence resources](https://learn.microsoft.com/en-us/power-platform/guidance/adoption/compliance).
[^soc1]: [System and Organization Controls (SOC) 1 Type 2 — meaning and service scope](https://learn.microsoft.com/en-us/compliance/regulatory/offering-soc-1).
[^soc2]: [System and Organization Controls (SOC) 2 Type 2 — meaning and service scope](https://learn.microsoft.com/en-us/compliance/regulatory/offering-soc-2).
[^gdpr]: [Azure, Dynamics 365, and Power Platform GDPR accountability readiness checklist — ISO certifications and privacy controls](https://learn.microsoft.com/en-us/compliance/regulatory/gdpr-arc-azure-dynamics).
[^iso27018]: [ISO/IEC 27018 — public-cloud PII protection](https://learn.microsoft.com/en-us/compliance/regulatory/offering-iso-27018).
[^iso27701]: [ISO/IEC 27701 — privacy management and Power Platform certificate scope](https://learn.microsoft.com/en-us/azure/compliance/offerings/offering-iso-27701).
[^iso27017]: [ISO/IEC 27017 — cloud-security controls and service scope](https://learn.microsoft.com/en-us/compliance/regulatory/offering-iso-27017).
[^pci]: [PCI DSS — assessment, service scope, and customer-responsibility boundary](https://learn.microsoft.com/en-us/compliance/regulatory/offering-pci-dss).
[^ffiec]: [FFIEC — SOC evidence and institution-specific compliance obligations](https://learn.microsoft.com/en-us/compliance/regulatory/offering-ffiec-us).
[^dora]: [Microsoft Contract Stack Mapping Document for DORA](https://learn.microsoft.com/en-us/compliance/dora/dora-contract-mapping).
[^delegation]: [Understand delegation in a canvas app — current local-query row limits](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/delegation-overview).
[^protection]: [Dataverse service protection API limits — default thresholds and throttling](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/api-limits).
[^flow-limits]: [Limits of automated, scheduled, and instant flows — duration, timeouts, and throughput](https://learn.microsoft.com/en-us/power-automate/limits-and-config).
[^canvas-git]: [Source control for canvas apps — publishing, source files, and editing limitations](https://learn.microsoft.com/en-us/power-platform/alm/git-integration/canvas-apps-git-integration).
[^offline]: [Develop offline-capable canvas apps — browser versus native mobile](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/offline-apps).
[^offline-limits]: [Mobile offline limitations for canvas apps — connector and flow exclusions](https://learn.microsoft.com/en-us/power-apps/mobile/limitations-canvas-apps).
[^deprecations]: [Important changes coming in Power Platform — unmanaged developer environments timeline](https://learn.microsoft.com/en-us/power-platform/important-changes-coming#deprecation-of-unmanaged-developer-environments-and-the-power-apps-developer-plan).
