# Community documentation assistant

This fork adds an independently implemented assistant under `core/community-ai`
and `features/community-ai`. It does not enable or copy the Enterprise AI modules.
The visible English UI uses “Companys” for spaces; existing space IDs, URLs and
database relationships retain their original names.

The production client build rejects emitted Enterprise modules, including the
separately licensed base-formula package. The runtime image excludes the server
Enterprise module and base-formula implementation. Inert Enterprise source and
types remain in the fork for development compatibility; no Enterprise feature
is unlocked. Existing database blocks show a preserved-data notice.

## Behavior

- `/ai`: questions over current accessible documentation, with source links;
  summarize, improve, or draft text with an explicit user request.
- `/settings/ai`: workspace administrators configure a model and a write-only
  OpenAI key, enable/disable AI, replace a key, or remove it.
- Editor writing assistance previews suggestions. Applying a suggestion requires
  an explicit click and refuses if the document has changed since selection.

Questions use the existing PostgreSQL full-text index and, when enabled, local
pgvector embeddings through the hybrid retrieval described in
[semantic search](semantic-search-design.md).
Retrieval is limited to the authenticated workspace, direct/group company
memberships, live pages and live companies. Candidate IDs pass the maintained
inherited page-permission filter before any source text is loaded. Only up to
eight authorized excerpts are sent, each capped at 4,000 characters. Semantic
search is separately opt-in, sends page and query text to OpenAI, and falls back
to keyword results when unavailable. Persistent conversations are not included.

The assistant is read-only. It cannot operate tools, access arbitrary databases,
change permissions or save documents. The writing UI applies text only after
review. Model suggestions and numbered references still require human checking.
Prompt instructions treat documents as untrusted evidence; this is not a promise
that a model will always resist malicious document content.

## Credentials and operation

AI is disabled by default and does not contact OpenAI without a configured key
and an explicit enabled setting. The key is encrypted with a purpose-separated
key derived from `APP_SECRET`, stored in a dedicated table, and never returned by
status/settings APIs. Preserve `APP_SECRET` with database backups. Do not put
credentials into ordinary workspace settings or commit them to the repository.

Requests use the OpenAI Responses API at a fixed HTTPS origin with `store:false`,
a 60-second timeout, bounded output, and a per-user rate limit. Enabling AI means
the requesting user's question/selected text and relevant documentation excerpts
are sent to OpenAI and billed to the configured account. `store:false` does not
replace the provider's applicable retention or data-use terms.

The migration adds `community_ai_settings` and its own Kysely migration/lock
tables. Its history is separate from upstream migrations, so the previous image
can start after an application-only rollback. It does not alter or remove
existing content or Enterprise data. Leave these unused tables in place during
rollback; do not run migration-down as a routine rollback.

Production startup applies the upstream, community AI and community search
migration histories. For a development database with pgvector available,
configure `DATABASE_URL` securely and run
`pnpm --filter server migration:community:latest` before starting the dev server.
The original upstream migration commands continue to manage upstream history
only; they do not apply the AI extension.

## Validation

Use synthetic provider responses for automated permission/credential/error tests.
Do not use customer content or a live paid API for routine builds. Test workspace
and company isolation, group access, restricted ancestors, no-evidence behavior,
unconfigured AI, write-only credentials, unauthorized configuration, malformed
provider responses, and stale editor selections. Live answer quality and model
access need a separate check after an administrator supplies a key.

API implementation reference: [OpenAI text generation](https://developers.openai.com/api/docs/guides/text).

Baseline check limitations: the locked client ESLint query plugin package lacks
its exported build entrypoint, so client lint cannot start. The original
SearchController scaffold was replaced with focused authenticated and public
search behavior tests. Client lint is not represented as passing; use the
production build, targeted permission/crypto/writing tests, bundle audit and
disposable PostgreSQL integration test for this change.
