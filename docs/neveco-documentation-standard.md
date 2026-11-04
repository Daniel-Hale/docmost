# Neveco documentation standard

This standard applies to Neveco technician-authored customer, vendor and internal documentation in the community Docmost fork, including optional OpenAI drafts.

The template picker is independently implemented in apps/client/src/features/neveco-templates. It does not unlock, copy or depend on Docmost's separately licensed Business/Enterprise template implementation.

## Visual standard

- Brand: neutral/dark UI with restrained Neveco amber (#CB923E) accents.
- Page title: searchable and specific, for example [Customer] — [Platform] — [Task or issue].
- Opening line: NEVECO / [CATEGORY]. The actual page title remains the H1.
- Body: H2 sections, numbered technical steps and genuine unchecked task lists.
- Wording: concise Australian English; one action per step; expected result after each meaningful action.
- Evidence: link ticket, canonical asset record, screenshots and tested results rather than asserting success without proof.
- Secrets: never embed passwords, API keys, token values, recovery codes or private keys. Refer to the approved credential vault.
- Segregation: always create in the correct company, vendor or internal space; review classification and sharing permissions.

## Document control fields

| Field | Purpose |
|---|---|
| Document type | Identifies the Neveco template category |
| Customer / company | Exact customer name or Internal |
| System / vendor | Product or service scope |
| Environment / scope | Tenant, site, platform or technical boundary |
| Owner | Accountable technician or team |
| Classification | Internal or Restricted, confirmed by a reviewer |
| Status | Draft until facts and procedures are verified |
| Last verified | Actual verification date in YYYY-MM-DD format |
| Next review due | Date in YYYY-MM-DD format |
| Autotask / IT Glue references | Links or canonical IDs rather than duplicated inventories |

All templates include Purpose & scope, Evidence & references, and Review & approval.

## Available templates

| Template | Core sections |
|---|---|
| Standard operating procedure | Prerequisites, Procedure, Validation, Rollback, Escalation |
| Troubleshooting / knowledge article | Symptoms, Causes, Diagnostics, Resolution, Verification |
| Customer environment profile | Identity, Network, Endpoints, Security, Backups, Integrations |
| User onboarding | Approval, Access, Device, Handover |
| User offboarding | Authorisation, Revocation, Devices/data, Verification |
| Vendor / platform integration | Source of truth, Authentication, Mapping, Monitoring, Failure |
| Security incident response | Evidence, Triage, Containment, Recovery, Communications |
| Change management | Impact, Baseline, Implementation, Rollback, Closure |
| Backup & restore verification | Protection, Policy, Monitoring, Restore test, Evidence |
| Customer documentation audit | Required records, Gaps, Owner, Sign-off |

These are starter structures, not completed customer records.

## Create a Neveco document

1. Create a page in the correct company, vendor or internal space.
2. On a blank editable page, after collaboration synchronisation, select Start with a Neveco template.
3. Choose a template, then select Insert template. This works without AI.
4. Edit placeholders, link authoritative records, and add real screenshots and verification evidence.
5. Complete checkboxes only after work has been verified, then update the status and review date.

## Optional OpenAI-assisted drafting

1. Choose a template and enter verified technician notes into the optional AI field.
2. Remove credentials and sensitive data not approved for processing before submitting.
3. Select Generate draft with OpenAI. The existing community AI endpoint receives the selected template guidance and these notes, not unrelated customer documents.
4. Inspect and edit the generated Markdown in the preview.
5. Select Insert reviewed draft; Markdown is sanitised before being parsed by the collaborative editor.
6. Verify references, security actions, tenant boundaries and completion claims before publishing.

The assistant cannot check live customer state, validate work or complete checklist items. Missing facts must remain labelled To verify. OpenAI provider retention and data handling requirements still apply.

## Example article

Page title: Synectics — Microsoft 365 — Chrome device sign-in troubleshooting

NEVECO / KNOWLEDGE BASE

Document control
- Customer / company: Synectics
- System / vendor: Microsoft 365 / Chrome
- Owner: [Technician]
- Status: Draft - not yet verified
- Last verified: [YYYY-MM-DD]

Purpose & scope

Symptoms & impact

Likely causes

Diagnostic checks

Resolution steps

Verification & prevention

Escalation

Evidence & references

Review & approval

This title and outline are illustrative, not a claim about the customer's current configuration.

## Argus retrieval readiness

Use stable document types, exact customer and vendor identifiers, a specific technical scope, review dates and canonical record references. Always enforce the requesting identity's page and company permissions when retrieving material for Argus. A page label or space name is not permission to read across customers.

## Validation and deployment

This feature uses the existing community AI endpoint; it adds no database tables or secrets. It must be applied to the customised community AI branch, not upstream main.

Run the client template unit test and client build in the fork's locked environment. Verify blank-page insertion, permission gating, collaborative synchronisation, AI-disabled behaviour, and explicit review before inserting AI output. Do not claim a deployment or model call has succeeded unless it has actually been tested.
