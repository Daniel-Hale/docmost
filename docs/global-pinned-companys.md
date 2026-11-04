# Globally pinned Companys

Workspace administrators can pin shared Companys in every staff member's
sidebar. Pins are separate from personal favourites. Company pages, membership,
editing and inherited document restrictions keep their existing behavior.

Persist a `globalPinned` boolean in the existing Company settings JSON. A
dedicated authenticated list endpoint returns live, non-personal Companys in
the current workspace that both the requesting user and the workspace's
Everyone group can access. If the group is removed later, hide the pin.
Never expose an inaccessible Company name through the pin list.

Changing a global pin requires workspace settings administration and Company
settings administration. Pinning requires an existing Everyone membership;
the operation itself does not grant access or change roles. Unpinning remains
available when the Everyone membership has subsequently been removed.
The Company settings UI explains the requirement and reports errors.

The requested Procedures Company uses the existing Everyone group with writer
access, so current and future staff can contribute internal documentation.
Its creator retains Company administration. It is not anonymously published.
Creating this instance-specific Company is an operations action, not a seed
migration or a hard-coded name in the application.

## Implementation and acceptance

- Add the small pin service/controller/DTO in the existing space module.
  Exercise workspace isolation, current membership, Everyone membership,
  deleted/personal Company exclusions, administrator checks and JSON
  preservation. No new table or dependency is required.
- Add the sidebar section and an administrator pin switch in Company settings.
  Refresh on focus and periodically; keep personal favourites independent.
- Build and test the integrated image, including native PostgreSQL fixtures
  for current and future staff access. Take a fresh verified backup, deploy
  only the application image, then create Procedures under the host writer
  lock and verify it through the normal sidebar and Company page.
- Evaluate retrieval separately. Existing synthetic-vector tests establish
  access safety and indexing mechanics; real embedding relevance and grounded
  answer quality require a separately authorized small synthetic provider run.
