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
const { GlobalPinsService } = require('../dist/core/space/global-pins.service');
const {
  GlobalPinsController,
} = require('../dist/core/space/global-pins.controller');
const SpaceAbilityFactory =
  require('../dist/core/casl/abilities/space-ability.factory').default;
const WorkspaceAbilityFactory =
  require('../dist/core/casl/abilities/workspace-ability.factory').default;
const { GlobalPinDto } = require('../dist/core/space/global-pin.dto');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

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
      name: 'Synthetic Global Pins A',
    });
    const workspaceB = await insert('workspaces', {
      name: 'Synthetic Global Pins B',
    });
    const admin = await insert('users', {
      email: 'pins-admin@example.invalid',
      workspaceId: workspaceA.id,
      role: 'admin',
    });
    const writerAdmin = await insert('users', {
      email: 'pins-writer-admin@example.invalid',
      workspaceId: workspaceA.id,
      role: 'admin',
    });
    const futureStaff = await insert('users', {
      email: 'pins-future-staff@example.invalid',
      workspaceId: workspaceA.id,
      role: 'member',
    });
    const outsider = await insert('users', {
      email: 'pins-outsider@example.invalid',
      workspaceId: workspaceA.id,
      role: 'member',
    });
    const foreignAdmin = await insert('users', {
      email: 'pins-foreign-admin@example.invalid',
      workspaceId: workspaceB.id,
      role: 'admin',
    });

    const everyoneA = await insert('groups', {
      name: 'Everyone',
      isDefault: true,
      workspaceId: workspaceA.id,
    });
    const everyoneB = await insert('groups', {
      name: 'Everyone',
      isDefault: true,
      workspaceId: workspaceB.id,
    });
    await insert('groupUsers', {
      groupId: everyoneA.id,
      userId: futureStaff.id,
    });

    const makeSpace = async (slug, workspaceId, settings, extra = {}) =>
      insert('spaces', {
        slug,
        workspaceId,
        name: `Synthetic ${slug}`,
        settings,
        ...extra,
      });
    const shared = await makeSpace('pins-shared', workspaceA.id, {
      globalPinned: false,
      theme: 'violet',
      nested: { retain: true },
    });
    const privateSpace = await makeSpace('pins-private', workspaceA.id, {
      globalPinned: true,
      note: 'private synthetic fixture',
    });
    const personal = await makeSpace(
      'pins-personal',
      workspaceA.id,
      {
        globalPinned: true,
        note: 'personal synthetic fixture',
      },
      { isPersonal: true, creatorId: admin.id },
    );
    const deleted = await makeSpace(
      'pins-deleted',
      workspaceA.id,
      {
        globalPinned: true,
        note: 'deleted synthetic fixture',
      },
      { deletedAt: new Date() },
    );
    const foreign = await makeSpace('pins-foreign', workspaceB.id, {
      globalPinned: true,
      note: 'foreign synthetic fixture',
    });

    const addSpaceMember = (
      spaceId,
      { userId = null, groupId = null, role = 'reader' } = {},
    ) => insert('spaceMembers', { spaceId, userId, groupId, role });
    await addSpaceMember(shared.id, { userId: admin.id, role: 'admin' });
    await addSpaceMember(shared.id, { userId: writerAdmin.id, role: 'writer' });
    await addSpaceMember(shared.id, { groupId: everyoneA.id, role: 'writer' });
    await addSpaceMember(privateSpace.id, { userId: admin.id, role: 'admin' });
    await addSpaceMember(personal.id, { userId: admin.id, role: 'admin' });
    await addSpaceMember(personal.id, {
      groupId: everyoneA.id,
      role: 'writer',
    });
    await addSpaceMember(deleted.id, { userId: admin.id, role: 'admin' });
    await addSpaceMember(deleted.id, { groupId: everyoneA.id, role: 'writer' });
    await addSpaceMember(foreign.id, {
      userId: foreignAdmin.id,
      role: 'admin',
    });
    await addSpaceMember(foreign.id, { groupId: everyoneB.id, role: 'writer' });

    const page = await insert('pages', {
      title: 'Synthetic pinned company page',
      textContent: 'Synthetic content to verify group-derived company access.',
      slugId: randomUUID(),
      spaceId: shared.id,
      workspaceId: workspaceA.id,
    });

    const cache = { get: async () => undefined, set: async () => {} };
    const members = new SpaceMemberRepo(db, null, null, cache);
    const spaceAbility = new SpaceAbilityFactory(members);
    const workspaceAbility = new WorkspaceAbilityFactory();
    const service = new GlobalPinsService(db, members, spaceAbility);
    const controller = new GlobalPinsController(service, workspaceAbility);

    const initialMemberships = await members.getUserSpaceIds(admin.id);
    const initialMembershipRows = (
      await sql`select count(*)::int as count from space_members where space_id = ${shared.id}::uuid`.execute(
        db,
      )
    ).rows[0].count;
    await controller.setPinned(admin, workspaceA, {
      spaceId: shared.id,
      pinned: true,
    });

    const stored = (
      await sql`select settings from spaces where id = ${shared.id}::uuid`.execute(
        db,
      )
    ).rows[0].settings;
    assert.deepEqual(stored, {
      globalPinned: true,
      theme: 'violet',
      nested: { retain: true },
    });
    assert.deepEqual(
      await members.getUserSpaceIds(admin.id),
      initialMemberships,
    );
    assert.equal(
      (
        await sql`select count(*)::int as count from space_members where space_id = ${shared.id}::uuid`.execute(
          db,
        )
      ).rows[0].count,
      initialMembershipRows,
      'Pinning must not change company membership or roles',
    );

    const adminPins = (await controller.list(admin, workspaceA)).items;
    const futurePins = (await controller.list(futureStaff, workspaceA)).items;
    const outsiderPins = (await controller.list(outsider, workspaceA)).items;
    const foreignAsA = (await service.list(foreignAdmin.id, workspaceA.id))
      .items;
    assert.deepEqual(
      adminPins.map((item) => item.id),
      [shared.id],
    );
    assert.deepEqual(
      futurePins.map((item) => item.id),
      [shared.id],
    );
    assert.deepEqual(outsiderPins, []);
    assert.deepEqual(foreignAsA, []);
    assert((await members.getUserSpaceIds(futureStaff.id)).includes(shared.id));
    assert(!(await members.getUserSpaceIds(outsider.id)).includes(shared.id));
    assert.equal(page.spaceId, shared.id);

    assert.throws(
      () =>
        controller.setPinned(outsider, workspaceA, {
          spaceId: shared.id,
          pinned: false,
        }),
      /forbidden/i,
    );
    await assert.rejects(
      controller.setPinned(writerAdmin, workspaceA, {
        spaceId: shared.id,
        pinned: false,
      }),
      /forbidden/i,
      'Workspace admin without Company settings permission cannot change its pin',
    );
    await assert.rejects(
      service.setPinned(admin, workspaceA.id, foreign.id, true),
      /Company not found/i,
      'A foreign workspace Company cannot be changed through this workspace scope',
    );

    await db
      .deleteFrom('spaceMembers')
      .where('spaceId', '=', shared.id)
      .where('groupId', '=', everyoneA.id)
      .execute();
    assert.deepEqual((await service.list(admin.id, workspaceA.id)).items, []);
    await assert.rejects(
      service.setPinned(admin, workspaceA.id, shared.id, true),
      /Share this Company with the Everyone group before pinning it for all staff\./,
    );

    // Removing Everyone hides the pin, but an authorized company admin can still unpin.
    await controller.setPinned(admin, workspaceA, {
      spaceId: shared.id,
      pinned: false,
    });
    const unpinned = (
      await sql`select settings from spaces where id = ${shared.id}::uuid`.execute(
        db,
      )
    ).rows[0].settings;
    assert.deepEqual(unpinned, {
      globalPinned: false,
      theme: 'violet',
      nested: { retain: true },
    });
    assert.deepEqual((await service.list(admin.id, workspaceA.id)).items, []);

    const invalidId = await validate(
      plainToInstance(GlobalPinDto, { spaceId: 'not-a-uuid', pinned: true }),
    );
    const invalidFlag = await validate(
      plainToInstance(GlobalPinDto, { spaceId: shared.id, pinned: 'true' }),
    );
    assert(invalidId.some((error) => error.property === 'spaceId'));
    assert(invalidFlag.some((error) => error.property === 'pinned'));

    console.log(
      'GLOBAL_PINS_INTEGRATION_PASS: JSON preservation, authorization and no access grant, Everyone/future-staff visibility, removal/hide/unpin flow, and workspace/live/personal exclusions',
    );
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
