# Semantic documentation search and Home prompt

The requested extension adds permission-scoped hybrid search and document
embeddings, and restores an independent AI question box above the Home company
carousel. Home navigation carries the question in router state and never sends
a billable AI request automatically.

The selected implementation uses pgvector in the existing PostgreSQL database.
Keep the existing PostgreSQL 18 image digest as the base and add only the vector
extension, checking that the PostgreSQL binary/version are unchanged. Plain
PostgreSQL array storage would avoid the extension but provides no native
nearest-neighbor index; an external vector service would add another datastore.
The user selected the pgvector design. Initial similarity queries use exact
cosine ranking per authorized page for predictable recall; add approximate
indexes only after measuring a dataset large enough to need them.

Semantic indexing is independently opt-in and initially off. Preserve existing
OpenAI key, generation model and enabled state. Admin settings explain that
indexing sends page text to OpenAI and is billed to that account. The indexer
only embeds documentation its initiating administrator can currently read.
Use the existing Redis/BullMQ connection, one worker and bounded batches; repeat
refreshes skip unchanged documents. Stop when disabled, credentials change,
the administrator loses access, or the document changes during a request.

Split Unicode text into overlapping bounded chunks and request 1,536-dimensional
embeddings. Store page identity, content hash, embedding model and generation
with every derived index. Reject incomplete or malformed provider vectors.
Old/deleted/restricted documents and mismatched hashes/model/generation cannot
enter search results. Embed queries only when semantic search is enabled with
usable indexed content. Combine lexical and semantic ranks using reciprocal
rank fusion, return source links, and reuse those sources for grounded answers.
Fall back explicitly to keyword results if the embedding provider is unavailable.

Authenticated normal search automatically uses this hybrid path when semantic
search is enabled, preserving company, creator and label filters. Title-only
and anonymous public/share searches retain their existing keyword behavior.
Queries sent for semantic matching are billed to the configured OpenAI account;
the settings disclosure covers both page text and query text. AI draft mode
turns pasted notes into structured Markdown for review and copying. It does not
create or modify a saved page automatically.

Keep membership, inherited page restrictions, live source state and content
loading within one database snapshot. Apply read permissions before ranking
limits. Reuse the maintained community ACL predicate rather than inventing
another permission model. Index generation checks prevent late writes from an
old model or a canceled configuration from being published.

Search migrations use separate history from both upstream and the first AI
extension, so the previous custom app image can start after rollback. Leave the
vector-enabled PostgreSQL image in place on app rollback so vector data remains
readable by backups. If the database image itself fails before migrations, the
unchanged PostgreSQL binary/data format permits restoring its previous image.

Validate provider protocol/chunking/rank fusion, semantic-only paraphrases,
keyword fallback, permission-before-limit, group/inherited restrictions,
tenant isolation, stale/deleted content, cancellation and generation changes.
Use synthetic provider responses and a disposable real PostgreSQL database.
No live provider call, key provisioning or customer-content experiment is part
of this deployment qualification. After a fresh verified backup, replace only
the Docmost app and its own database image; preserve Redis, volumes, edge routing,
existing credentials and unrelated services. Independently verify runtime state
and the browser Home/search/settings flow.
