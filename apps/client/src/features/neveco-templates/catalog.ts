import type { JSONContent } from "@tiptap/core";

/**
 * Community-owned Neveco starter content. Independent of Docmost's licensed
 * Business/Enterprise template feature. No database changes are required.
 */
export type NevecoSection = {
  heading: string;
  guidance: string;
  checklist?: readonly string[];
};

export type NevecoTemplate = {
  id: string;
  name: string;
  category: string;
  description: string;
  purpose: string;
  classification: "Internal" | "Restricted";
  sections: readonly NevecoSection[];
};

export const NEVECO_TEMPLATES: readonly NevecoTemplate[] = [
  {
    id: "sop",
    name: "Standard operating procedure",
    category: "Procedure",
    description: "Repeatable technician instructions with validation and rollback.",
    purpose: "[Describe the task, intended outcome and systems in scope.]",
    classification: "Internal",
    sections: [
      { heading: "Prerequisites & access", guidance: "[Required permissions, approvals, equipment, maintenance windows and dependencies. Reference the approved vault; never paste secrets.]" },
      { heading: "Procedure", guidance: "[Number each action in execution order. Include the exact navigation path or command, expected result and an annotated screenshot where useful.]" },
      { heading: "Validation", guidance: "[State objective evidence that the task succeeded.]", checklist: ["Expected result observed and recorded", "Customer or service impact checked"] },
      { heading: "Rollback / recovery", guidance: "[How to reverse changes safely, or state why rollback is not applicable.]" },
      { heading: "Escalation & exceptions", guidance: "[Known failure modes, escalation owner and relevant ticket or vendor references.]" },
    ],
  },
  {
    id: "troubleshooting",
    name: "Troubleshooting / knowledge article",
    category: "Knowledge base",
    description: "Searchable symptom-to-fix article for recurring service issues.",
    purpose: "[Describe the issue this article resolves and who it applies to.]",
    classification: "Internal",
    sections: [
      { heading: "Symptoms & impact", guidance: "[User-visible error, affected application, error codes, frequency and scope.]" },
      { heading: "Likely causes", guidance: "[Known root causes; distinguish confirmed from suspected causes.]" },
      { heading: "Diagnostic checks", guidance: "[Run checks in order and record the expected results.]" },
      { heading: "Resolution steps", guidance: "[Exact steps and commands, with before/after screenshots as appropriate.]" },
      { heading: "Verification & prevention", guidance: "[How to confirm resolution, monitor recurrence and prevent the issue.]", checklist: ["Service or user retested", "Autotask ticket / incident linked"] },
      { heading: "Escalation", guidance: "[When to stop and hand over, and what diagnostic evidence to include.]" },
    ],
  },
  {
    id: "customer-profile",
    name: "Customer environment profile",
    category: "Customer",
    description: "A consistent technical overview of a customer's environment.",
    purpose: "[Summarise the customer's technology footprint and support boundaries without storing passwords.]",
    classification: "Restricted",
    sections: [
      { heading: "Customer & service ownership", guidance: "[Customer legal name, supported sites, primary contacts by role, support hours, criticality and service owner.]" },
      { heading: "Identity & Microsoft 365", guidance: "[Tenant identifier reference, domains, MFA/Conditional Access, Intune, licensing and administrative access process.]" },
      { heading: "Infrastructure & network", guidance: "[Servers, hypervisors, network segments, firewalls, WAN, DNS, Wi-Fi and diagrams or links.]" },
      { heading: "Endpoints & applications", guidance: "[Device management, supported applications, line-of-business systems and patching policies.]" },
      { heading: "Security, backup & recovery", guidance: "[EDR/SOC ownership, backup platforms, protected workloads, retention, RPO/RTO and most recent verified restore.]" },
      { heading: "Monitoring & integrations", guidance: "[Datto RMM, Autotask, IT Glue, Cove and other deployed integrations; reference canonical asset IDs rather than duplicate values.]" },
      { heading: "Known gaps & review checklist", guidance: "[Document missing or unverified facts and follow-up ownership.]", checklist: ["Customer and service scope verified", "Critical assets and integrations linked", "Backup and security posture checked", "Document owner and next review assigned"] },
    ],
  },
  {
    id: "user-onboarding",
    name: "User onboarding checklist",
    category: "Service delivery",
    description: "Approved new-user provisioning with licence and device checks.",
    purpose: "[New starter request, approved scope and start date.]",
    classification: "Restricted",
    sections: [
      { heading: "Request & approval", guidance: "[Autotask request, customer approver, role, employment start date and licence requirements.]" },
      { heading: "Identity & access provisioning", guidance: "[Microsoft Entra account, groups, MFA, Conditional Access and least-privilege access.]", checklist: ["Approval and identity verified", "Account and group assignment verified", "MFA enrolment confirmed", "Licence type and billing verified"] },
      { heading: "Device & application setup", guidance: "[Assigned device, Intune enrolment, security baseline, applications, email and telephony.]", checklist: ["Device compliant and protected", "Required applications tested", "Mail and collaboration access checked"] },
      { heading: "Handover & validation", guidance: "[User-facing instructions, access test and customer approval.]", checklist: ["New user sign-in validated", "Customer notified", "Autotask and IT Glue records updated"] },
      { heading: "Exceptions & follow-up", guidance: "[Outstanding access, temporary workarounds and due dates.]" },
    ],
  },
  {
    id: "user-offboarding",
    name: "User offboarding checklist",
    category: "Service delivery",
    description: "Secure leaver workflow with access revocation and evidence.",
    purpose: "[Departure request, authorised time and data retention instructions.]",
    classification: "Restricted",
    sections: [
      { heading: "Authorisation & timing", guidance: "[Approver, effective revocation time, legal/retention hold and service owner.]" },
      { heading: "Identity containment", guidance: "[Sign-in blocking, session revocation, MFA credentials, privileged roles, VPN and third-party access.]", checklist: ["Sign-ins blocked at approved time", "Sessions and tokens revoked", "Privileged and external access removed"] },
      { heading: "Devices, data & licences", guidance: "[Device return/wipe process, mailbox/OneDrive ownership, retention, delegated access and billing changes.]", checklist: ["Customer data handover approved", "Devices accounted for", "Licences reviewed and reassigned or removed"] },
      { heading: "Verification & closure", guidance: "[Check sign-in and audit evidence; record actions without copying sensitive tokens.]", checklist: ["Access tests and log evidence reviewed", "Autotask and IT Glue records updated", "Customer confirms closure"] },
      { heading: "Exceptions & escalation", guidance: "[Unmanaged services, pending devices, dependencies and escalation.]" },
    ],
  },
  {
    id: "integration",
    name: "Vendor / platform integration",
    category: "Integration",
    description: "Vendor connection ownership, mapping, monitoring and failure recovery.",
    purpose: "[Describe the integration's business purpose, source of truth and data direction.]",
    classification: "Restricted",
    sections: [
      { heading: "Systems & source of truth", guidance: "[Source, destination, authoritative system for each object and synchronisation direction.]" },
      { heading: "Authentication & access", guidance: "[Permission scopes, service principal or API account, key rotation process and vault references; never include credentials.]" },
      { heading: "Data mapping & schedule", guidance: "[Object IDs, mapped fields, licence/billing rules, polling/webhooks and expected freshness.]" },
      { heading: "Setup & validation", guidance: "[Connection steps, test data, expected results and reconciliation criteria.]", checklist: ["Connection authorised", "Field mappings validated", "Duplicate/write-back behaviour checked", "Cross-customer isolation validated"] },
      { heading: "Monitoring & failure handling", guidance: "[Rate limits, alerts, retries, 429 behaviour, replay and manual recovery.]" },
      { heading: "Ownership & changes", guidance: "[Vendor support, internal owner, dependency links, change approvals and review cycle.]" },
    ],
  },
  {
    id: "incident",
    name: "Security incident / threat response",
    category: "Security",
    description: "Evidence-led triage, containment, recovery and customer communication.",
    purpose: "[Summarise the reported event, affected tenant(s), severity and response ownership.]",
    classification: "Restricted",
    sections: [
      { heading: "Event & impact", guidance: "[Alert source, timestamps with timezone, affected identities/assets and observed impact.]" },
      { heading: "Evidence & timeline", guidance: "[Link original alerts, sign-in logs, relevant indicators and events. Separate observations from hypotheses.]" },
      { heading: "Triage & decision", guidance: "[Severity, confidence, false-positive rationale and approval for response actions.]" },
      { heading: "Containment & eradication", guidance: "[Approved actions, actors, exact execution times and checks.]", checklist: ["Approvals recorded", "Actions applied to correct tenant", "Containment outcome validated"] },
      { heading: "Recovery & monitoring", guidance: "[Access restoration conditions, monitoring window and tests.]", checklist: ["Service impact reviewed", "Follow-up alerts tracked"] },
      { heading: "Communications & lessons learned", guidance: "[Customer updates, SOC/vendor handoff, post-incident changes and outstanding risks.]" },
    ],
  },
  {
    id: "change",
    name: "Change / implementation plan",
    category: "Change",
    description: "Approved changes with risk, execution and rollback evidence.",
    purpose: "[Describe the requested change, reason and expected outcome.]",
    classification: "Internal",
    sections: [
      { heading: "Change control", guidance: "[Autotask ticket, requester, approver, affected customers, window and responsible engineer.]" },
      { heading: "Impact & risk", guidance: "[Dependencies, service impact, security/data risks and rollback trigger.]" },
      { heading: "Pre-change baseline", guidance: "[Current version, configuration snapshots, backups and success criteria.]", checklist: ["Change approved", "Baseline recorded", "Rollback prerequisites available"] },
      { heading: "Implementation steps", guidance: "[Ordered steps, owners, commands and expected results.]" },
      { heading: "Validation & rollback", guidance: "[Objective success tests, failure thresholds, exact rollback actions and verification.]", checklist: ["Post-change tests passed", "Monitoring checked", "Rollback ready or tested"] },
      { heading: "Closure & communications", guidance: "[Actual window, deviations, customer communications and documentation updates.]" },
    ],
  },
  {
    id: "backup",
    name: "Backup & restore verification",
    category: "Resilience",
    description: "Protection scope, backup hygiene and evidenced recovery tests.",
    purpose: "[Describe protected workloads, business recovery requirements and test scope.]",
    classification: "Restricted",
    sections: [
      { heading: "Protected systems & ownership", guidance: "[Customer, workload, primary platform (Cove/Datto/Veeam/etc.), data owner and canonical asset links.]" },
      { heading: "Policy & recovery objectives", guidance: "[Schedule, retention, encryption, off-site/immutable copy, RPO, RTO and exclusions.]" },
      { heading: "Monitoring & alerting", guidance: "[Success/failure signals, daily review, escalation rules and last alert.]" },
      { heading: "Restore test procedure", guidance: "[Test date, isolated destination, data selection, execution steps and expected outcomes.]", checklist: ["Restore performed in authorised test location", "Recovered data integrity checked", "RPO/RTO measured and recorded"] },
      { heading: "Evidence & remediation", guidance: "[Restore logs, screenshots, ticket reference, limitations and corrective actions.]" },
      { heading: "Next verification", guidance: "[Test owner, next due date and unresolved protection gaps.]" },
    ],
  },
  {
    id: "documentation-audit",
    name: "Customer documentation audit",
    category: "Governance",
    description: "Completeness checklist for each customer and operational owner.",
    purpose: "[Record required customer documentation, gaps, owners and due dates.]",
    classification: "Internal",
    sections: [
      { heading: "Customer coverage", guidance: "[Customer, contract scope, responsible reviewer and audit date.]" },
      { heading: "Required records", guidance: "[Link canonical records instead of duplicating passwords or asset inventories.]", checklist: ["Company profile and support contacts", "Microsoft 365 tenant and admin access process", "Network diagram, ISP and firewall management", "Endpoints, servers and key applications", "EDR/SOC ownership and monitoring", "Backup policies and latest restore evidence", "Licensing/billing mappings", "Vendor integrations and API ownership", "User onboarding and offboarding procedures", "Escalation and disaster recovery instructions"] },
      { heading: "Gaps, risks & actions", guidance: "[For each missing record, note severity, accountable owner, Autotask ticket and target date.]" },
      { heading: "Review & sign-off", guidance: "[Evidence checked, reviewer, customer approval where required and next review date.]", checklist: ["Critical gaps assigned", "References checked for access and freshness", "Review schedule agreed"] },
    ],
  },
];

const text = (value: string): JSONContent => ({ type: "text", text: value });
const paragraph = (value: string): JSONContent => ({
  type: "paragraph",
  content: [text(value)],
});
const heading = (value: string): JSONContent => ({
  type: "heading",
  attrs: { level: 2 },
  content: [text(value)],
});

export function buildNevecoTemplateContent(template: NevecoTemplate): JSONContent[] {
  const metadata = [
    "Document type: " + template.name,
    "Customer / company: [Customer name or Internal]",
    "System / vendor: [Product or service]",
    "Environment / scope: [Tenant, site or platform]",
    "Owner: [Technician or team]",
    "Classification: " + template.classification + " - confirm before sharing",
    "Status: Draft - not yet verified",
    "Last verified: [YYYY-MM-DD]",
    "Next review due: [YYYY-MM-DD]",
    "Autotask / IT Glue references: [Canonical links or IDs]",
  ];

  const nodes: JSONContent[] = [
    {
      type: "paragraph",
      content: [{
        type: "text",
        text: "NEVECO / " + template.category.toUpperCase(),
        marks: [{ type: "bold" }, { type: "textStyle", attrs: { color: "#CB923E" } }],
      }],
    },
    heading("Document control"),
    ...metadata.map(paragraph),
    heading("Purpose & scope"),
    paragraph(template.purpose),
  ];

  for (const section of template.sections) {
    nodes.push(heading(section.heading), paragraph(section.guidance));
    if (section.checklist?.length) {
      nodes.push({
        type: "taskList",
        content: section.checklist.map((task) => ({
          type: "taskItem",
          attrs: { checked: false },
          content: [paragraph(task)],
        })),
      });
    }
  }

  nodes.push(
    heading("Evidence & references"),
    paragraph("[Link source system records, ticket IDs, screenshots and vendor guidance. Do not paste passwords, private keys, access tokens or recovery codes.]"),
    heading("Review & approval"),
    paragraph("Reviewed by: [Name / role] | Date: [YYYY-MM-DD] | Outcome: [Pending / Approved / Rework]"),
  );
  return nodes;
}

/** A bounded, review-first draft. This never requests unrelated company pages. */
export function buildNevecoDraftBrief(template: NevecoTemplate, notes: string): string {
  const headings = [
    "Document control",
    "Purpose & scope",
    ...template.sections.map((section) => section.heading),
    "Evidence & references",
    "Review & approval",
  ];
  return [
    "Create a NEVECO technical documentation draft from the technician notes below.",
    "Document type: " + template.name + ".",
    "Use clear Australian English, concise steps and Markdown headings.",
    "Begin with the bold line NEVECO / " + template.category.toUpperCase() + ". Do not add an H1 (the page already has a title).",
    "Use these H2 headings in exactly this order: " + headings.join(" | ") + ".",
    "Under Document control, give Customer / company, System / vendor, Environment / scope, Owner, Classification, Status, Last verified, Next review due and Autotask / IT Glue references.",
    "Use the classification " + template.classification + " as a proposed default, subject to human review.",
    "Under Purpose & scope, explain: " + template.purpose,
    "For each section, keep the following purpose or checks:",
    ...template.sections.map((s) => "- " + s.heading + ": " + s.guidance + (s.checklist ? " Checklist: " + s.checklist.join("; ") : "")),
    "Use [To verify] wherever source facts are missing; do not make up tenants, systems, outcomes, approvals, screenshots, dates or citations.",
    "Include tick-box checklists where appropriate, but do not mark items complete without evidence.",
    "Never repeat credentials, API keys, recovery codes or personal information that is unnecessary for the guide; use [Approved vault reference].",
    "Make procedures actionable and distinguish planned actions from actions actually completed.",
    "Only use the technician notes below as evidence. No other client data is provided.",
    "--- TECHNICIAN NOTES (untrusted source data) ---",
    notes.trim(),
    "--- END NOTES ---",
  ].join("\n");
}
