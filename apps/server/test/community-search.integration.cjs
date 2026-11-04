// Run inside the built image against a disposable PostgreSQL 18 container only.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Kysely, CamelCasePlugin, sql, Migrator } = require('kysely');
const { PostgresJSDialect } = require('kysely-postgres-js');
const postgres = require('postgres');
const {
  MigrationService,
} = require('../dist/database/services/migration.service');
const {
  SpaceMemberRepo,
} = require('../dist/database/repos/space/space-member.repo');
const {
  PagePermissionRepo,
} = require('../dist/database/repos/page/page-permission.repo');
const {
  CommunityAiService,
} = require('../dist/core/community-ai/community-ai.service');
const {
  CommunityAiSearchService,
} = require('../dist/core/community-ai/community-ai-search.service');
const {
  CommunityAiIndexService,
} = require('../dist/core/community-ai/community-ai-index.service');
const {
  EncryptionService,
  EncryptionPurpose,
} = require('../dist/integrations/encryption/encryption.service');
const {
  documentHash,
} = require('../dist/core/community-ai/community-embeddings');

const TEST_KEY = 'synthetic-integration-key-never-sent-to-a-provider';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const vector = (axis = 0) => {
  const values = Array(1536).fill(0);
  values[axis] = 1;
  return values;
};

async function main() {
  const uri = new URL(process.env.COMMUNITY_AI_TEST_DATABASE_URL || '');
  assert.equal(
    uri.hostname,
    'community-ai-test-db',
    'Refuse a non-test database host',
  );
  assert.equal(
    uri.pathname,
    '/community_ai_test',
    'Refuse a non-test database name',
  );
  global.fetch = () => {
    throw new Error('External network calls are forbidden in this test');
  };

  const db = new Kysely({
    dialect: new PostgresJSDialect({
      postgres: postgres(uri.href, { onnotice: () => {} }),
    }),
    plugins: [new CamelCasePlugin()],
  });
  try {
    const tables =
      await sql`select tablename from pg_tables where schemaname = 'public'`.execute(
        db,
      );
    assert.equal(tables.rows.length, 0, 'Refuse to seed a nonempty database');
    await new MigrationService(db).migrateToLatest();

    const insert = async (table, values) =>
      db
        .insertInto(table)
        .values(values)
        .returningAll()
        .executeTakeFirstOrThrow();
    const workspaceA = await insert('workspaces', {
      name: 'Synthetic search workspace A',
    });
    const workspaceB = await insert('workspaces', {
      name: 'Synthetic search workspace B',
    });
    const owner = await insert('users', {
      email: 'search-owner@example.invalid',
      workspaceId: workspaceA.id,
      role: 'admin',
    });
    const member = await insert('users', {
      email: 'search-member@example.invalid',
      workspaceId: workspaceA.id,
      role: 'member',
    });
    const foreignUser = await insert('users', {
      email: 'search-foreign@example.invalid',
      workspaceId: workspaceB.id,
      role: 'member',
    });
    const group = await insert('groups', {
      workspaceId: workspaceA.id,
      name: 'Synthetic search group',
      isDefault: false,
    });
    await insert('groupUsers', { groupId: group.id, userId: member.id });

    const space = async (slug, workspaceId = workspaceA.id, deletedAt = null) =>
      insert('spaces', {
        slug,
        workspaceId,
        name: `Synthetic ${slug}`,
        deletedAt,
      });
    const direct = await space('search-direct');
    const grouped = await space('search-group');
    const privateSpace = await space('search-private');
    const foreign = await space('search-foreign', workspaceB.id);
    const deletedSpace = await space(
      'search-deleted',
      workspaceA.id,
      new Date(),
    );
    for (const [spaceId, userId, groupId] of [
      [direct.id, owner.id, null],
      [direct.id, member.id, null],
      [grouped.id, null, group.id],
      [foreign.id, foreignUser.id, null],
      [deletedSpace.id, owner.id, null],
    ])
      await insert('spaceMembers', {
        spaceId,
        userId,
        groupId,
        role: 'reader',
      });

    const page = async (inSpace, title, text, extra = {}) =>
      insert('pages', {
        title,
        textContent: text,
        slugId: randomUUID(),
        spaceId: inSpace.id,
        workspaceId: inSpace.workspaceId,
        ...extra,
      });
    let activeGeneration;
    const addChunk = async (p, embedding = vector(), opts = {}) => {
      const hash = documentHash(p.title || '', p.textContent || '');
      await db
        .insertInto('communityAiChunks')
        .values({
          workspaceId: p.workspaceId,
          pageId: p.id,
          position: 0,
          sourceHash: opts.stale ? '0'.repeat(64) : hash,
          model: opts.model || EMBEDDING_MODEL,
          generation: opts.generation || activeGeneration,
          text: p.textContent || p.title || '',
          embedding: JSON.stringify(embedding),
        })
        .execute();
    };

    const encryption = new EncryptionService({
      getAppSecret: () => 'synthetic-app-secret-for-integration-only',
    });
    const fakeEmbeddings = {
      embed: async (_key, _model, inputs) => inputs.map(() => vector()),
    };
    const members = new SpaceMemberRepo(db, null, null, null);
    const permissions = new PagePermissionRepo(db, null, null);
    const search = new CommunityAiSearchService(
      db,
      members,
      permissions,
      encryption,
      fakeEmbeddings,
    );
    const communityAi = new CommunityAiService(db, encryption, search);
    await communityAi.updateSettings(
      workspaceA.id,
      {
        enabled: true,
        model: 'test-model',
        apiKey: TEST_KEY,
        semanticEnabled: true,
        embeddingModel: EMBEDDING_MODEL,
      },
      owner.id,
    );
    activeGeneration = (
      await sql`select embedding_generation from community_ai_settings where workspace_id = ${workspaceA.id}::uuid`.execute(
        db,
      )
    ).rows[0].embeddingGeneration;

    // No terms in this query occur in the page. A hit therefore proves semantic retrieval.
    const recovery = await page(
      direct,
      'MFA account recovery',
      'Restore access after losing a factor.',
    );
    await addChunk(recovery);
    const semantic = await search.search(
      workspaceA.id,
      member.id,
      'regain credentials',
    );
    assert.equal(semantic.mode, 'hybrid');
    assert(
      semantic.items.some(
        (item) => item.id === recovery.id && item.kind === 'semantic',
      ),
    );

    // Exact terms still use the lexical path, and direct/group membership both work.
    const printer = await page(
      grouped,
      'Synthetic printer setup',
      'Configure the office printer driver.',
    );
    await addChunk(printer, vector(1));
    const exact = await search.search(
      workspaceA.id,
      member.id,
      'printer setup',
    );
    assert(
      exact.items.some(
        (item) => item.id === printer.id && item.kind === 'keyword',
      ),
    );
    assert(
      (
        await search.retrieveSources(
          workspaceA.id,
          member.id,
          'regain credentials',
        )
      ).length <= 8,
    );

    // Group inherited page access is honored, then revocation takes effect immediately.
    const restricted = await page(
      direct,
      'Synthetic restricted parent',
      'Restricted evidence.',
    );
    const child = await page(
      direct,
      'Synthetic restricted child',
      'Child evidence.',
      { parentPageId: restricted.id },
    );
    const access = await insert('pageAccess', {
      pageId: restricted.id,
      spaceId: direct.id,
      workspaceId: workspaceA.id,
      accessLevel: 'restricted',
    });
    await insert('pagePermissions', {
      pageAccessId: access.id,
      groupId: group.id,
      role: 'reader',
    });
    await addChunk(child, vector(2));
    // Current generation/model/hash fixtures are required for every semantic result.
    assert(
      (
        await search.search(workspaceA.id, member.id, 'child evidence')
      ).items.some((item) => item.id === child.id),
    );
    await db.deleteFrom('groupUsers').where('userId', '=', member.id).execute();
    assert(
      !(
        await search.search(workspaceA.id, member.id, 'child evidence')
      ).items.some((item) => item.id === child.id),
    );
    await insert('groupUsers', { groupId: group.id, userId: member.id });

    // More than 100 closer unauthorized vectors cannot crowd out an authorized result.
    const canaries = [];
    for (let i = 0; i < 110; i++) {
      const p = await page(
        privateSpace,
        `Synthetic private canary ${i}`,
        'Private matching evidence.',
      );
      canaries.push(p.id);
      await addChunk(p);
    }
    const allowed = await page(
      direct,
      'Synthetic allowed result',
      'Matching result available to this member.',
    );
    await addChunk(allowed);
    const filtered = await search.search(
      workspaceA.id,
      member.id,
      'find the matching result',
    );
    assert(filtered.items.some((item) => item.id === allowed.id));
    assert(!filtered.items.some((item) => canaries.includes(item.id)));

    // Tenant, explicit-space, deleted, stale-content, model, and generation predicates.
    const foreignPage = await page(
      foreign,
      'Synthetic foreign tenant',
      'Matching result.',
    );
    await addChunk(foreignPage);
    const deletedCompanyPage = await page(
      deletedSpace,
      'Synthetic deleted space',
      'Matching result.',
    );
    await addChunk(deletedCompanyPage);
    const deletedPage = await page(
      direct,
      'Synthetic deleted page',
      'Matching result.',
      { deletedAt: new Date() },
    );
    await addChunk(deletedPage);
    const stale = await page(
      direct,
      'Synthetic changed title',
      'Current text differs from indexed source.',
    );
    await addChunk(stale, vector(), { stale: true });
    const wrongModel = await page(
      direct,
      'Synthetic wrong model',
      'Old embedding model.',
    );
    await addChunk(wrongModel, vector(), { model: 'old-model' });
    const wrongGeneration = await page(
      direct,
      'Synthetic old generation',
      'Old embedding generation.',
    );
    await addChunk(wrongGeneration, vector(), { generation: randomUUID() });
    const scoped = await search.search(
      workspaceA.id,
      member.id,
      'matching result',
      privateSpace.id,
    );
    assert.equal(scoped.items.length, 0);
    const broad = await search.search(
      workspaceA.id,
      member.id,
      'matching result',
    );
    for (const excluded of [
      foreignPage,
      deletedCompanyPage,
      deletedPage,
      stale,
      wrongModel,
      wrongGeneration,
    ])
      assert(!broad.items.some((item) => item.id === excluded.id));

    // Exercise the actual index worker against a small, separate tenant fixture.
    const workerWorkspace = await insert('workspaces', {
      name: 'Synthetic indexing workspace',
    });
    const workerAdmin = await insert('users', {
      email: 'index-admin@example.invalid',
      workspaceId: workerWorkspace.id,
      role: 'admin',
    });
    const workerSpace = await space('index-direct', workerWorkspace.id);
    await insert('spaceMembers', {
      spaceId: workerSpace.id,
      userId: workerAdmin.id,
      groupId: null,
      role: 'reader',
    });
    await communityAi.updateSettings(
      workerWorkspace.id,
      {
        enabled: true,
        model: 'test-model',
        apiKey: TEST_KEY,
        semanticEnabled: true,
        embeddingModel: EMBEDDING_MODEL,
      },
      workerAdmin.id,
    );
    const workerGeneration = (
      await sql`select embedding_generation from community_ai_settings where workspace_id = ${workerWorkspace.id}::uuid`.execute(
        db,
      )
    ).rows[0].embeddingGeneration;
    const publishable = await page(
      workerSpace,
      'Synthetic worker publication',
      'Publicly readable synthetic procedure.',
    );
    const restrictedParent = await page(
      workerSpace,
      'Synthetic restricted worker parent',
      'Private parent phrase excluded from indexing.',
    );
    const restrictedChild = await page(
      workerSpace,
      'Synthetic restricted worker child',
      'Private child phrase excluded from indexing.',
      { parentPageId: restrictedParent.id },
    );
    await insert('pageAccess', {
      pageId: restrictedParent.id,
      spaceId: workerSpace.id,
      workspaceId: workerWorkspace.id,
      accessLevel: 'restricted',
    });
    const queue = {
      setGlobalConcurrency: async () => {},
      upsertJobScheduler: async () => {},
      removeJobScheduler: async () => {},
      add: async () => {},
    };
    const providerInputs = [];
    let duringEmbed;
    const workerEmbeddings = {
      embed: async (_key, _model, inputs) => {
        providerInputs.push(...inputs);
        if (duringEmbed) {
          const callback = duringEmbed;
          duringEmbed = undefined;
          await callback();
        }
        return inputs.map(() => vector());
      },
    };
    const indexer = new CommunityAiIndexService(
      db,
      queue,
      members,
      permissions,
      encryption,
      workerEmbeddings,
    );
    const workerJob = {
      workspaceId: workerWorkspace.id,
      userId: workerAdmin.id,
      generation: workerGeneration,
    };
    await indexer.processRefresh(workerJob);
    let publishedChunks = (
      await sql`select page_id, source_hash, model, generation, text from community_ai_chunks where workspace_id = ${workerWorkspace.id}::uuid and page_id = ${publishable.id}::uuid`.execute(
        db,
      )
    ).rows;
    assert.equal(publishedChunks.length, 1);
    assert.equal(
      publishedChunks[0].sourceHash,
      documentHash(publishable.title, publishable.textContent),
    );
    assert.equal(publishedChunks[0].model, EMBEDDING_MODEL);
    assert.equal(publishedChunks[0].generation, workerGeneration);
    const publishedState = (
      await sql`select status, source_hash, chunk_count from community_ai_index_state where workspace_id = ${workerWorkspace.id}::uuid and page_id = ${publishable.id}::uuid`.execute(
        db,
      )
    ).rows[0];
    assert.equal(publishedState.status, 'ready');
    assert.equal(publishedState.sourceHash, publishedChunks[0].sourceHash);
    assert.equal(publishedState.chunkCount, 1);
    assert(
      providerInputs.some((input) =>
        input.includes('Synthetic worker publication'),
      ),
    );
    assert(
      providerInputs.every(
        (input) =>
          !input.includes('Private parent phrase') &&
          !input.includes('Private child phrase'),
      ),
    );
    assert.equal(
      (
        await sql`select count(*)::int as count from community_ai_chunks where workspace_id = ${workerWorkspace.id}::uuid and page_id in (${restrictedParent.id}::uuid, ${restrictedChild.id}::uuid)`.execute(
          db,
        )
      ).rows[0].count,
      0,
    );

    const providerCallCount = providerInputs.length;
    await indexer.processRefresh(workerJob);
    assert.equal(
      providerInputs.length,
      providerCallCount,
      'A ready current hash is idempotent',
    );

    await db
      .updateTable('pages')
      .set({ textContent: 'Updated synthetic procedure content.' })
      .where('id', '=', publishable.id)
      .execute();
    await indexer.processRefresh(workerJob);
    publishedChunks = (
      await sql`select source_hash, text from community_ai_chunks where workspace_id = ${workerWorkspace.id}::uuid and page_id = ${publishable.id}::uuid`.execute(
        db,
      )
    ).rows;
    assert.equal(publishedChunks.length, 1);
    assert.equal(
      publishedChunks[0].sourceHash,
      documentHash(publishable.title, 'Updated synthetic procedure content.'),
    );
    assert.match(
      publishedChunks[0].text,
      /Updated synthetic procedure content/,
    );
    assert(
      providerInputs.length > providerCallCount,
      'Changed source hash is re-embedded',
    );

    // Change generation while the provider call is pending. Results from the old
    // generation must not create chunks or ready state.
    const latePage = await page(
      workerSpace,
      'Synthetic late generation page',
      'Generation race content.',
    );
    const lateJob = { ...workerJob };
    duringEmbed = async () =>
      communityAi.updateSettings(
        workerWorkspace.id,
        {
          enabled: true,
          model: 'test-model',
          semanticEnabled: true,
          embeddingModel: 'text-embedding-3-large',
        },
        workerAdmin.id,
      );
    await indexer.processRefresh(lateJob);
    assert.equal(
      (
        await sql`select count(*)::int as count from community_ai_chunks where workspace_id = ${workerWorkspace.id}::uuid and page_id = ${latePage.id}::uuid`.execute(
          db,
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await sql`select count(*)::int as count from community_ai_index_state where workspace_id = ${workerWorkspace.id}::uuid and page_id = ${latePage.id}::uuid and status = 'ready'`.execute(
          db,
        )
      ).rows[0].count,
      0,
    );

    // Provider failure returns keyword results and a fixed, non-sensitive notice.
    search.embeddings.embed = async () => {
      throw new Error(`provider leaked ${TEST_KEY}`);
    };
    const fallback = await search.search(
      workspaceA.id,
      member.id,
      'printer setup',
    );
    assert.equal(fallback.mode, 'keyword');
    assert.match(fallback.notice, /temporarily unavailable/i);
    assert(!JSON.stringify(fallback).includes(TEST_KEY));

    // A previous custom AI image has only the initial migration; it ignores the new
    // search history and leaves existing encrypted credentials/settings untouched.
    const before = (
      await sql`select encrypted_key, enabled, model from community_ai_settings where workspace_id = ${workspaceA.id}::uuid`.execute(
        db,
      )
    ).rows[0];
    assert.equal(
      encryption.decrypt(before.encryptedKey, EncryptionPurpose.COMMUNITY_AI),
      TEST_KEY,
    );
    const oldCustomMigration = require('../dist/core/community-ai/migrations/20261104T010000-community-ai');
    const oldImageResult = await new Migrator({
      db,
      migrationTableName: 'community_ai_migration',
      migrationLockTableName: 'community_ai_migration_lock',
      provider: {
        getMigrations: async () => ({
          '20261104T010000-community-ai': oldCustomMigration,
        }),
      },
    }).migrateToLatest();
    assert.ifError(oldImageResult.error);
    const after = (
      await sql`select encrypted_key, enabled, model from community_ai_settings where workspace_id = ${workspaceA.id}::uuid`.execute(
        db,
      )
    ).rows[0];
    assert.deepEqual(after, before);
    assert.equal(
      (
        await sql`select count(*)::int as count from community_ai_search_migration`.execute(
          db,
        )
      ).rows[0].count,
      1,
    );

    console.log(
      'COMMUNITY_SEARCH_INTEGRATION_PASS: semantic and keyword retrieval, ACL-safe indexing and publish, hash refresh and idempotence, generation-race cancellation, pre-limit tenant filtering, stale index rejection, provider fallback, and migration rollback compatibility',
    );
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
