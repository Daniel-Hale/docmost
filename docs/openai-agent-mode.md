# Saved OpenAI agent integration

AI settings can select Direct model or OpenAI Agent. Agent mode stores a saved
agent ID alongside the existing encrypted project key. The saved agent owns its
model, instructions and supported documentation tools. Checking access retrieves
agent metadata; it does not claim that every MCP server has initialized.

Agent calls create fresh managed sessions for each authenticated request, with
no execution environment. No agent configuration update is sent. Existing
Docmost retrieval first selects excerpts through the current workspace,
membership and inherited page restrictions. The agent receives only those
authorized excerpts in a private composition session with tools disabled. A
separate public-research session receives the user's question, never the private
excerpts, and can use the Microsoft Learn/CIPP documentation MCPs and web search.
The interface discloses that questions may be sent to those services. Writing
requests use a tool-free session. The agent has no direct database access or
application write tools. Public documentation queries
can proceed when no internal match exists; direct mode keeps its original
no-evidence response.

Internal source links come from the application's selected pages, and internal
reference numbers are validated. External documentation source links must match
successful tool-result provenance and be valid HTTPS links. CIPP's Markdown
Sources section is accepted only from its successful configured MCP call and
only for links on docs.cipp.app. Section anchors are normalized at document
scope; origin, path and query must still match. Tool output and
provider errors are not treated as commands, and credentials are never exposed
through settings, agent metadata or request errors. Agent mode does not silently
fall back to a direct model after a failure.

The integration checks the actual root turn's outcome rather than treating an
idle session as success. Input, polling, output and request durations are bounded.
Each owned session is deleted after use; interrupted requests attempt bounded
cancellation and cleanup. Managed sessions differ from Responses requests using
store:false: cleanup can fail during provider outages, so this does not promise
zero provider retention. Cleanup failures must remain visible for reconciliation.

Changing agent mode or ID preserves the encrypted key, direct model, embedding
model, indexing opt-in and current embedding generation. A separate agent
migration history allows application rollback without dropping feature tables
or resetting documentation. Existing deployments default to Direct model until
an administrator selects Agent mode.

Validation includes saved-configuration inheritance, completed-turn output,
timeouts, required actions, cancellation/deletion failure, no duplicate session
creation, credential redaction, permission-scoped excerpts, settings preservation
and migration compatibility. Live checks use a small generic documentation
question without production document content, verifying actual MCP activity.

References: [saved agents](https://developers.openai.com/api/docs/guides/agents-api/configuration),
[session lifecycle](https://developers.openai.com/api/docs/guides/agents-api/sessions),
[MCP connections](https://developers.openai.com/api/docs/guides/agents-api/tools/mcp).
