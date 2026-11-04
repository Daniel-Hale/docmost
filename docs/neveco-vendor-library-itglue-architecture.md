# Neveco Vendor Library and IT Glue source-of-truth architecture

## Goal

Present a dedicated **Vendors** directory beside the existing **Companys** directory, with vendor-specific documentation available to authorised technicians across multiple customers. Preserve **IT Glue** as the technical source of truth for customer configurations and structured assets; use Docmost for explanatory documents, standard operating procedures, incident articles and editable diagrams.

## Implemented scope (this branch)

- A new \`/vendors\` route and Vendors navigation item.
- Server-owned classification of newly created spaces as \`company\` or \`vendor\`, stored in \`spaces.settings.nevecoCategory\`.
- Separate server-side pagination of each category under the existing *authenticated user-space membership* checks.
- Vendor creation uses the existing space creator and permission system. Existing spaces default to \`company\`, requiring no migration.
- The Companys view excludes vendor-classified spaces, while the Vendor directory lists only vendor-classified spaces.
- Pinned space presentation separates vendor pins and company pins; favourites carry their category.
- No schema changes, credential storage, IT Glue calls or cross-space permission bypasses.

A vendor is a first-class Docmost space, **not a new workspace, customer tenant or copy of client data**. Examples: Microsoft, Datto, Fortinet, Cove. Multiple staff can belong to the vendor space via the existing company/group membership controls. Links or transclusions from customer pages to vendor reference articles must still obey the reader's live permission checks.

**Migration note:** Do not bulk-classify existing spaces by name. They remain companies by default until an administrator deliberately migrates them. This first implementation does not add a category-conversion UI.

## Page types: start simple with existing labels

Docmost already has page labels and search/filter pages by label. Avoid creating a second page hierarchy or adding a required table column merely to distinguish pages.

Suggested reserved, consistent labels:

| Label | Meaning | Example |
|---|---|---|
| \`NEV:Reference\` | Site/customer technical context | VPN endpoints and IP plan |
| \`NEV:KB\` | Diagnosis + verified resolution | Outlook authentication failure |
| \`NEV:SOP\` | Ordered repeatable procedure | Onboarding an Intune device |
| \`NEV:Diagram\` | Editable network/system drawing | Site LAN topology |
| \`NEV:Checklist\` | Audit or provisioning tasks | Quarterly customer review |

A document should receive **one primary type**, plus optional product/vendor/topic labels. The template picker should eventually apply the chosen type automatically; the current Neveco templates change in PR #1 is independent from this branch. Labels are not permissions or source-of-truth guarantees. A typed document-control field provides a fallback for AI indexing when labels are absent.

## Source-of-truth boundary

| Data | Authoritative source | Docmost use |
|---|---|---|
| Organisations, locations and configuration inventory | IT Glue | Link or on-demand read-only preview |
| Flexible assets: networks, backups, key services | IT Glue | Render factual snapshot with update time |
| RMM device identity and operational state | Datto RMM, reconciled to IT Glue | Observations only, not authoritative descriptions |
| Tickets, incidents and change approvals | Autotask | Linked evidence and ticket references |
| Vendor product procedures | Neveco vendor space / vendor docs | Shared reusable guidance |
| Customer SOPs, KB articles and curated diagrams | Docmost | Versioned human-reviewed documentation |

Never copy, index or submit IT Glue passwords, secret fields or recovery codes to OpenAI. The first integration should be read-only and based on whitelisted endpoints and fields. Use the AU base URL for AU-resident IT Glue accounts; verify the tenant's region. The API may return 429, so use bounded backoff and caching.

### Minimal connector data contract

For every populated field, store/source:

- \`sourceSystem\` = \`itglue\` or \`datto_rmm\`;
- \`sourceOrgId\`, \`externalObjectId\`, \`docmostSpaceId\`;
- \`retrievedAt\`, \`sourceUpdatedAt\` if exposed, and a canonical deep link;
- \`fieldName\`, \`value\`, and \`confidence\` (\`confirmed\`/\`observed\`/\`inferred\`);
- \`scope\` = immutable customer/tenant boundary and access-authorisation context.

Map IT Glue **organisation ID** to Docmost customer **space ID** and RMM **site ID** only after an explicit admin review. Do not use company names for automatic identity matching. Never search across all customer records and then filter only in the front end. The connector must check the user's customer and Docmost page permissions **before retrieving** source records for AI.

Read-only integration stages:
1. Select customer, validate the IT Glue organisation mapping, and fetch only approved **organisations, locations, configurations, configuration interfaces, networks/flexible assets and relationships**.
2. Optionally pull Datto RMM site/device observations with the mapped site identity.
3. Reconcile changes and show **live**, **cached**, **outdated** or **missing** source status. Display the last-synchronised timestamp.
4. For AI requests, retrieve the minimal currently authorised fields and human-authored pages with **source identifiers** and **update times**. Label unverifiable facts explicitly.
5. Draft a human-reviewable document; never silently rewrite the published page based on a provider refresh.

## Diagrams: use the existing draw.io editor

The current Docmost fork already has an interactive draw.io document block (\`drawio-view.tsx\`). There is no need to reimplement draw.io.

Proposed workflow for a customer site:
1. Fetch IT Glue organisation, location, configuration/interface inventory and documented networks.
2. Optionally enrich device labels/OS/status from the mapped Datto RMM site.
3. Build an intermediate graph of nodes (sites, firewalls, switches, APs, servers, workstations, WAN) and *evidenced edges*. Use LLDP/CDP/SNMP/port metadata only when actually available. Inventory alone does not prove which switch port connects to another device.
4. Generate native draw.io XML deterministically from this graph, then offer **Preview / Edit / Publish**. An LLM may suggest sections, explanatory captions or clustering, but must not invent physical connections.
5. Mark uncertain edges as \`inferred\` and display them in a separate style; do not present inferred links as actual topology. Where no edge evidence exists, display an **inventory diagram** instead of falsely claiming a network topology map.
6. Store the original source snapshot references plus generation time alongside the diagram, so a technician can verify changes. Preserve manually edited diagrams: regenerate to a **new draft/version** with a difference view, never overwrite silently.

Datto RMM's own documentation says its network topology UI is a visualisation of discovered devices and is not guaranteed to be an accurate network mapping tool.

## Shared vendor documentation

One vendor SOP should be linkable from as many customer KB pages as needed, without physically copying its content or mixing customer-specific notes into the vendor article. Cross-links and snippets should be resolved under the requesting user's current permissions and hidden if access is revoked. Vendor docs are **technician-shared**, not automatically client/public-facing.

## AI security and review policy

- Review and approve use of customer data with the OpenAI provider before processing.
- Use tenant- and customer-scoped retrieval with server-side permission checks.
- Treat external material and vendor articles as untrusted content; do not follow embedded instructions.
- Never infer completed work, approvals, network connections, backups, security posture or customer identities from absent information.
- Require preview, citations/deep links and explicit technician approval before saving generated content.
- Show freshness and source provenance; \`store:false\` does not bypass provider retention terms.
- Prefer a centrally managed Argus integration/cache module if it becomes the approved shared service; prevent a second independent system from becoming an alternate technical master.

## Acceptance criteria for this change

- An administrator can create a Vendor space in the Vendors view; it does not appear under Companys.
- Existing customer spaces remain in Companys without migration.
- Vendor and customer results are filtered at the database layer before cursor pagination, and remain scoped to existing user membership.
- Vendor pages still obey Docmost page and space permissions; no automatic sharing with customer contacts.
- Company and vendor global pins appear in separate sidebar groupings.
- The original unfiltered space endpoint remains available for existing integrations.
- No IT Glue/Datto calls or automated diagrams are claimed by this PR.

References:
- IT Glue developer API: https://api.itglue.com/developer
- IT Glue API setup: https://help.itglue.kaseya.com/help/Content/1-admin/it-glue-api/getting-started-with-the-it-glue-api.html
- Datto RMM API: https://rmm.datto.com/help/en/Content/2SETUP/APIv2.htm
- Datto RMM network discovery: https://rmm.datto.com/help/en/Content/3NEWUI/Sites/NetworkDiscovery.htm
- draw.io embed mode: https://www.drawio.com/docs/reference/embed-mode/
