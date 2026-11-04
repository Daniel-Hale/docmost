// Run inside the built image against a fresh disposable PostgreSQL container only.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Kysely, CamelCasePlugin, sql } = require('kysely');
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
  EncryptionPurpose,
  EncryptionService,
} = require('../dist/integrations/encryption/encryption.service');

const TEST_KEY = 'synthetic-agent-integration-key-never-sent';

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

  let fetchCalls = 0;
  global.fetch = () => {
    fetchCalls += 1;
    throw new Error(
      'External network calls are forbidden in this integration test',
    );
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
    const workspace = await insert('workspaces', {
      name: 'Synthetic agent workspace',
    });
    const admin = await insert('users', {
      email: 'synthetic-agent-admin@example.invalid',
      workspaceId: workspace.id,
      role: 'admin',
    });
    const member = await insert('users', {
      email: 'synthetic-agent-member@example.invalid',
      workspaceId: workspace.id,
      role: 'member',
    });
    const space = await insert('spaces', {
      name: 'Synthetic agent company',
      slug: 'synthetic-agent',
      workspaceId: workspace.id,
    });
    for (const userId of [admin.id, member.id]) {
      await insert('spaceMembers', {
        spaceId: space.id,
        userId,
        groupId: null,
        role: 'reader',
      });
    }
    const page = async (title, text) =>
      insert('pages', {
        title,
        textContent: text,
        slugId: randomUUID(),
        spaceId: space.id,
        workspaceId: workspace.id,
      });
    const readablePage = await page(
      'Synthetic recovery procedure',
      'A synthetic recovery request uses the service desk verification checklist.',
    );
    const restrictedPage = await page(
      'Synthetic private recovery notes',
      'INACCESSIBLE_SYNTHETIC_CANARY must never reach the agent request.',
    );
    await insert('pageAccess', {
      pageId: restrictedPage.id,
      spaceId: space.id,
      workspaceId: workspace.id,
      accessLevel: 'restricted',
    });

    const encryption = new EncryptionService({
      getAppSecret: () => 'synthetic-agent-app-secret-only',
    });
    const members = new SpaceMemberRepo(db, null, null, {
      get: async () => undefined,
      set: async () => {},
    });
    const permissions = new PagePermissionRepo(db, null, null);
    const search = new CommunityAiSearchService(
      db,
      members,
      permissions,
      encryption,
      {
        embed: async () => {
          throw new Error(
            'Semantic embeddings must be disabled in this fixture',
          );
        },
      },
    );
    const calls = [];
    const agentClient = {
      inspect: async () => ({
        id: 'agent_synthetic123',
        name: 'Synthetic agent',
      }),
      run: async (key, agentId, input, options) => {
        calls.push({ key, agentId, input, options });
        if (calls.length === 1) {
          return {
            answer: 'Synthetic public recovery reference.',
            externalSources: [
              {
                title: 'Synthetic public reference',
                url: 'https://public.example.invalid/docs',
              },
            ],
          };
        }
        if (calls.length === 2) {
          return {
            answer: 'Synthetic recovery summary [D1].',
            externalSources: [
              {
                title: 'Composer-invented reference must be ignored',
                url: 'https://invented.example.invalid/docs',
              },
            ],
          };
        }
        return {
          answer: 'Synthetic public documentation answer.',
          externalSources: [
            {
              title: 'Synthetic external manual',
              url: 'https://manual.example.invalid/start',
            },
          ],
        };
      },
    };
    const ai = new CommunityAiService(db, encryption, search, agentClient);

    assert.deepEqual(await ai.settings(workspace.id), {
      backend: 'direct',
      agentId: null,
      enabled: false,
      model: 'gpt-5-mini',
      configured: false,
      semanticEnabled: false,
      embeddingModel: 'text-embedding-3-small',
    });
    await ai.updateSettings(
      workspace.id,
      {
        enabled: true,
        model: 'synthetic-model',
        apiKey: TEST_KEY,
        semanticEnabled: true,
        embeddingModel: 'text-embedding-3-small',
      },
      admin.id,
    );
    const directConfig =
      await require('../dist/core/community-ai/community-ai.config').readCommunityAiConfig(
        db,
        workspace.id,
      );
    const generationBeforeBackendChange = directConfig.embeddingGeneration;
    const ciphertextBeforeBackendChange = directConfig.encryptedKey;

    await ai.updateSettings(
      workspace.id,
      {
        enabled: true,
        model: 'synthetic-model',
        backend: 'agent',
        agentId: 'agent_synthetic123',
      },
      admin.id,
    );
    const agentConfig =
      await require('../dist/core/community-ai/community-ai.config').readCommunityAiConfig(
        db,
        workspace.id,
      );
    assert.equal(agentConfig.backend, 'agent');
    assert.equal(agentConfig.agentId, 'agent_synthetic123');
    assert.equal(
      agentConfig.embeddingGeneration,
      generationBeforeBackendChange,
    );
    assert.equal(agentConfig.encryptedKey, ciphertextBeforeBackendChange);
    assert.equal(agentConfig.semanticEnabled, true);
    assert.equal(agentConfig.embeddingModel, 'text-embedding-3-small');
    const metadata = await ai.settings(workspace.id);
    assert.deepEqual(metadata, {
      backend: 'agent',
      agentId: 'agent_synthetic123',
      enabled: true,
      model: 'synthetic-model',
      configured: true,
      semanticEnabled: true,
      embeddingModel: 'text-embedding-3-small',
    });
    assert(!JSON.stringify(metadata).includes(TEST_KEY));

    await assert.rejects(
      ai.updateSettings(
        workspace.id,
        {
          enabled: true,
          model: 'synthetic-model',
          backend: 'agent',
          agentId: null,
        },
        admin.id,
      ),
      /Add an Agent ID before enabling agent mode/,
    );
    assert.equal(
      (await ai.settings(workspace.id)).agentId,
      'agent_synthetic123',
    );

    // Direct mode keeps its no-evidence behavior and does not call the agent.
    await ai.updateSettings(
      workspace.id,
      {
        enabled: true,
        model: 'synthetic-model',
        backend: 'direct',
        agentId: null,
      },
      admin.id,
    );
    const directNoEvidence = await ai.generate(workspace.id, member.id, {
      mode: 'ask',
      input: 'What does ZKQ-991 signify?',
    });
    assert.equal(directNoEvidence.sources.length, 0);
    assert.match(
      directNoEvidence.answer,
      /could not find accessible documentation/i,
    );
    assert.equal(calls.length, 0);

    await ai.updateSettings(
      workspace.id,
      {
        enabled: true,
        model: 'synthetic-model',
        backend: 'agent',
        agentId: 'agent_synthetic123',
      },
      admin.id,
    );
    const grounded = await ai.generate(workspace.id, member.id, {
      mode: 'ask',
      input: 'Synthetic recovery procedure',
    });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].key, TEST_KEY);
    assert.equal(calls[0].agentId, 'agent_synthetic123');
    const researchRequest = JSON.parse(calls[0].input);
    assert.equal(researchRequest.request, 'Synthetic recovery procedure');
    assert.equal(researchRequest.docmostSources, undefined);
    assert(!calls[0].input.includes('INACCESSIBLE_SYNTHETIC_CANARY'));
    assert(!calls[0].input.includes('service desk verification checklist'));
    assert.equal(calls[0].options, undefined);

    const composeRequest = JSON.parse(calls[1].input);
    assert.equal(composeRequest.docmostSources.length, 1);
    assert.equal(composeRequest.docmostSources[0].reference, 'D1');
    assert.equal(
      composeRequest.docmostSources[0].title,
      'Synthetic recovery procedure',
    );
    assert.match(composeRequest.docmostSources[0].text, /synthetic.*recovery/i);
    assert.match(
      composeRequest.docmostSources[0].text,
      /service desk verification checklist/i,
    );
    assert(!calls[1].input.includes('INACCESSIBLE_SYNTHETIC_CANARY'));
    assert.match(
      composeRequest.guidance,
      /never send private internal excerpts/i,
    );
    assert.equal(composeRequest.request, 'Synthetic recovery procedure');
    assert.equal(
      composeRequest.researchAnswer,
      'Synthetic public recovery reference.',
    );
    assert.deepEqual(composeRequest.researchSources, [
      {
        title: 'Synthetic public reference',
        url: 'https://public.example.invalid/docs',
      },
    ]);
    assert.deepEqual(calls[1].options, { disableTools: true });
    assert.deepEqual(grounded.sources, [
      {
        id: readablePage.id,
        title: 'Synthetic recovery procedure',
        url: `/s/${space.slug}/p/${readablePage.slugId}`,
      },
      {
        id: 'external-1',
        title: 'Synthetic public reference',
        url: 'https://public.example.invalid/docs',
      },
    ]);

    // Agent asks may proceed with no internal matches for its approved public MCP docs.
    const publicOnly = await ai.generate(workspace.id, member.id, {
      mode: 'ask',
      input: 'Where is ZKQ-991 documented externally?',
    });
    assert.equal(calls.length, 3);
    assert.equal(JSON.parse(calls[2].input).docmostSources, undefined);
    assert.equal(calls[2].options, undefined);
    assert.equal(publicOnly.sources.length, 1);
    assert.equal(publicOnly.sources[0].id, 'external-1');
    assert.equal(fetchCalls, 0);

    // The persisted settings retain only encrypted test credentials and no search-generation churn.
    const stored = (
      await sql`select encrypted_key, backend, agent_id, embedding_generation from community_ai_settings where workspace_id = ${workspace.id}::uuid`.execute(
        db,
      )
    ).rows[0];
    assert(stored.encryptedKey && !stored.encryptedKey.includes(TEST_KEY));
    assert.equal(
      encryption.decrypt(stored.encryptedKey, EncryptionPurpose.COMMUNITY_AI),
      TEST_KEY,
    );
    assert.equal(stored.backend, 'agent');
    assert.equal(stored.agentId, 'agent_synthetic123');
    assert.equal(stored.embeddingGeneration, generationBeforeBackendChange);

    console.log(
      'COMMUNITY_AGENT_INTEGRATION_PASS: defaults and metadata, encrypted settings and generation preservation, agent-ID validation, direct no-evidence behavior, actual ACL-scoped agent input, external citations, and no provider network calls',
    );
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
