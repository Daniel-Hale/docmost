import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { CommunityAiService } from './community-ai.service';

describe('Community AI retrieval query boundary', () => {
  let service: CommunityAiService;
  let queries: { sql: string; parameters: any[] }[];
  let responses: any[][];
  let permissions: any;
  let commands: string[];
  beforeEach(() => {
    queries = [];
    responses = [];
    commands = [];
    const db = new Kysely<any>({
      dialect: new PostgresDialect({
        pool: {
          connect: async () => ({
            release: () => {},
            query: async (text: string, parameters: any[]) => {
              commands.push(text);
              if (!text.startsWith('select'))
                return { rows: [], rowCount: 0, command: 'TRANSACTION' };
              queries.push({ sql: text, parameters });
              return {
                rows: responses.shift() ?? [],
                rowCount: 0,
                command: 'SELECT',
              };
            },
          }),
          end: async () => {},
        } as any,
      }),
      plugins: [new CamelCasePlugin()],
    });
    permissions = { filterAccessiblePageIds: jest.fn() };
    service = new CommunityAiService(
      db as any,
      new SpaceMemberRepo(db as any, null, null, null),
      permissions,
      {} as any,
    );
  });

  it('loads no source text when inherited page permissions reject candidates', async () => {
    responses.push([{ id: 'restricted' }]);
    permissions.filterAccessiblePageIds.mockResolvedValue([]);
    expect(
      await (service as any).retrieve('workspace', 'user', 'vendor'),
    ).toEqual([]);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('select "pages"."id"');
    expect(queries[0].sql).not.toContain('text_content');
    expect(permissions.filterAccessiblePageIds).toHaveBeenCalledWith({
      pageIds: ['restricted'],
      userId: 'user',
      trx: expect.objectContaining({ isTransaction: true }),
    });
    expect(commands[0]).toBe(
      'start transaction isolation level repeatable read',
    );
    expect(commands[commands.length - 1]).toBe('commit');
  });

  it('keeps workspace, direct/group membership, live state and explicit company scope on BOTH queries', async () => {
    responses.push(
      [{ id: 'allowed' }, { id: 'denied' }],
      [
        {
          id: 'allowed',
          title: 'Vendor',
          slug_id: 'page-slug',
          space_slug: 'company',
          text: 'Evidence',
        },
      ],
    );
    permissions.filterAccessiblePageIds.mockResolvedValue([
      'allowed',
      'not-a-candidate',
    ]);
    const sources = await (service as any).retrieve(
      'workspace',
      'user',
      'vendor',
      'company-id',
    );
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(query.sql).toContain('"pages"."workspace_id" =');
      expect(query.sql).toContain('"spaces"."workspace_id" =');
      expect(query.sql).toContain('"pages"."deleted_at" is null');
      expect(query.sql).toContain('"spaces"."deleted_at" is null');
      expect(query.sql).toContain('"space_members"');
      expect(query.sql).toContain('union');
      expect(query.sql).toContain('"group_users"');
      expect(query.parameters).toEqual(
        expect.arrayContaining(['workspace', 'user', 'company-id']),
      );
    }
    expect(queries[1].parameters).toContain('allowed');
    expect(queries[1].parameters).not.toContain('denied');
    expect(queries[1].parameters).not.toContain('not-a-candidate');
    expect(sources).toEqual([
      {
        id: 'allowed',
        title: 'Vendor',
        url: '/s/company/p/page-slug',
        text: 'Evidence',
      },
    ]);
  });

  it('treats query syntax and SQL-like input as bounded data parameters', async () => {
    responses.push([]);
    await (service as any).retrieve(
      'workspace',
      'user',
      "vendor'); DROP TABLE pages; --",
    );
    expect(queries[0].sql).not.toContain('DROP TABLE');
    expect(queries[0].parameters).toContain('vendor OR drop OR table OR pages');
  });
});
