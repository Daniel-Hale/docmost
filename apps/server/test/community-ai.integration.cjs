// Run inside the built image against a disposable PostgreSQL 18 container only.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  Kysely,
  CamelCasePlugin,
  sql,
  Migrator,
  FileMigrationProvider,
} = require('kysely');
const fs = require('node:fs/promises');
const path = require('node:path');
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
const { CommunityAiSearchService }=require('../dist/core/community-ai/community-ai-search.service');
const {
  EncryptionService,
} = require('../dist/integrations/encryption/encryption.service');

async function main() {
  const uri = new URL(process.env.COMMUNITY_AI_TEST_DATABASE_URL);
  assert.equal(uri.hostname, 'community-ai-test-db');
  assert.equal(uri.pathname, '/community_ai_test');
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
    const wa = await insert('workspaces', { name: 'Synthetic workspace A' });
    const wb = await insert('workspaces', { name: 'Synthetic workspace B' });
    const user = await insert('users', {
      email: 'synthetic-a@example.invalid',
      workspaceId: wa.id,
      role: 'member',
    });
    const other = await insert('users', {
      email: 'synthetic-b@example.invalid',
      workspaceId: wa.id,
      role: 'member',
    });
    const nobody = randomUUID();
    const group = await insert('groups', {
      workspaceId: wa.id,
      name: 'Synthetic group',
      isDefault: false,
    });
    await insert('groupUsers', { groupId: group.id, userId: user.id });
    const company = async (slug, workspaceId = wa.id, deletedAt = null) =>
      insert('spaces', { slug, workspaceId, name: slug, deletedAt });
    const direct = await company('direct');
    const grouped = await company('grouped');
    const privateSpace = await company('private');
    const foreign = await company('foreign', wb.id);
    const deletedCompany = await company('deleted', wa.id, new Date());
    for (const [spaceId, userId, groupId] of [
      [direct.id, user.id, null],
      [direct.id, other.id, null],
      [grouped.id, null, group.id],
      [foreign.id, user.id, null],
      [deletedCompany.id, user.id, null],
    ]) {
      await insert('spaceMembers', {
        spaceId,
        userId,
        groupId,
        role: 'reader',
      });
    }
    const page = async (space, title, extra = {}) =>
      insert('pages', {
        title: `SyntheticVendor ${title}`,
        textContent: `SyntheticVendor evidence ${title}`,
        slugId: randomUUID(),
        spaceId: space.id,
        workspaceId: space.workspaceId,
        ...extra,
      });
    const p1 = await page(direct, 'direct');
    const p2 = await page(grouped, 'group');
    await page(privateSpace, 'no membership');
    await page(foreign, 'foreign workspace');
    await page(deletedCompany, 'deleted company');
    await page(direct, 'deleted page', { deletedAt: new Date() });
    const restricted = await page(direct, 'restricted');
    const restrictedChild = await page(direct, 'restricted descendant', {
      parentPageId: restricted.id,
    });
    const permitted = await page(direct, 'permitted group restriction');
    await insert('pageAccess', {
      pageId: restricted.id,
      spaceId: direct.id,
      workspaceId: wa.id,
      accessLevel: 'restricted',
    });
    const access = await insert('pageAccess', {
      pageId: permitted.id,
      spaceId: direct.id,
      workspaceId: wa.id,
      accessLevel: 'restricted',
    });
    await insert('pagePermissions', {
      pageAccessId: access.id,
      groupId: group.id,
      role: 'reader',
    });
    const cache = { get: async () => undefined, set: async () => {} };
    const members = new SpaceMemberRepo(db, null, null, cache);
    const permissions = new PagePermissionRepo(db, null, cache);
    const encryption = new EncryptionService({
      getAppSecret: () => 'synthetic-test-secret-only-not-a-real-credential',
    });
    const search = new CommunityAiSearchService(db,members,permissions,encryption,{embed:()=>{throw new Error('No provider calls')}});
    const noAgentProvider = {
      run: async () => { throw new Error('Agent provider is not used by this fixture'); },
      inspect: async () => { throw new Error('Agent provider is not used by this fixture'); },
    };
    const ai = new CommunityAiService(db, encryption, search, noAgentProvider);
    const sources = await ai.retrieve(wa.id, user.id, 'SyntheticVendor');
    assert.deepEqual(
      sources.map((s) => s.id).sort(),
      [p1.id, p2.id, permitted.id].sort(),
    );
    assert(sources.every((s) => s.text.includes('SyntheticVendor')));
    assert(!sources.some((s) => s.id === restrictedChild.id));
    assert.deepEqual(await ai.retrieve(wa.id, nobody, 'SyntheticVendor'), []);
    assert.deepEqual(
      (await ai.retrieve(wa.id, other.id, 'SyntheticVendor')).map((s) => s.id),
      [p1.id],
    );
    assert.deepEqual(
      await ai.retrieve(wa.id, user.id, 'SyntheticVendor', privateSpace.id),
      [],
    );
    assert.deepEqual(
      await ai.retrieve(wa.id, user.id, 'SyntheticVendor', foreign.id),
      [],
    );
    await db.deleteFrom('groupUsers').where('userId', '=', user.id).execute();
    assert.deepEqual(
      (await ai.retrieve(wa.id, user.id, 'SyntheticVendor')).map((s) => s.id),
      [p1.id],
    );
    assert.deepEqual(await ai.settings(wa.id), {
      backend: 'direct',
      agentId: null,
      enabled: false,
      configured: false,
      model: 'gpt-5-mini',
      semanticEnabled:false,
      embeddingModel:'text-embedding-3-small',
    });
    const testKey = 'synthetic-test-key-never-sent-to-any-provider';
    await ai.updateSettings(wa.id, {
      enabled: false,
      model: 'test-model',
      apiKey: testKey,
    });
    assert.deepEqual(await ai.settings(wa.id), {
      backend: 'direct',
      agentId: null,
      enabled: false,
      configured: true,
      model: 'test-model',
      semanticEnabled:false,
      embeddingModel:'text-embedding-3-small',
    });
    const stored = (
      await sql`select encrypted_key from community_ai_settings where workspace_id = ${wa.id}::uuid`.execute(
        db,
      )
    ).rows[0];
    assert(stored.encryptedKey && !stored.encryptedKey.includes(testKey));
    global.fetch = () => {
      throw new Error('No external requests permitted in integration test');
    };
    await assert.rejects(
      ai.generate(wa.id, user.id, { mode: 'ask', input: 'SyntheticVendor' }),
      /not configured/,
    );
    await ai.updateSettings(wa.id, {
      enabled: false,
      model: 'test-model',
      removeKey: true,
    });
    assert.equal((await ai.settings(wa.id)).configured, false);
    // The previous image knows only upstream migrations. Extension history
    // must not cause a missing-migration error during an image-only rollback.
    const oldImageMigration = await new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, '../dist/database/migrations'),
      }),
    }).migrateToLatest();
    assert.ifError(oldImageMigration.error);
    assert.equal(
      (
        await sql`select count(*)::int as count from kysely_migration where name = '20261104T010000-community-ai'`.execute(
          db,
        )
      ).rows[0].count,
      0,
    );
    await new MigrationService(db).migrateToLatest();
    assert.equal((await ai.settings(wa.id)).configured, false);
    console.log(
      'COMMUNITY_AI_INTEGRATION_PASS: real PostgreSQL migrations, tenant/direct/group/ancestor/deleted isolation, revocation, encrypted write-only settings and keyless behavior',
    );
  } finally {
    await db.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
