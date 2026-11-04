import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { CommunityAiSearchService } from './community-ai-search.service';

describe('Community AI semantic retrieval boundary', () => {
  let service: CommunityAiSearchService;
  let queries: { sql: string; parameters: any[] }[];
  let responses: any[][];
  const config = {
    enabled: true,
    model: 'gpt-5-mini',
    encryptedKey: 'ciphertext',
    semanticEnabled: true,
    embeddingModel: 'text-embedding-3-small',
    embeddingGeneration: '00000000-0000-4000-8000-000000000001',
    indexingUserId: 'owner',
  };

  beforeEach(() => {
    queries = [];
    responses = [];
    const db = new Kysely<any>({
      dialect: new PostgresDialect({
        pool: {
          connect: async () => ({
            release: () => {},
            query: async (text: string, parameters: any[]) => {
              if (!text.trimStart().toLowerCase().startsWith('select'))
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
    const members = new SpaceMemberRepo(db as any, null, null, null);
    const permissions = new PagePermissionRepo(db as any, null, null);
    service = new CommunityAiSearchService(
      db as any,
      members,
      permissions,
      { decrypt: () => 'synthetic-only-key' } as any,
      { embed: async () => [[1, ...Array(1535).fill(0)]] } as any,
    );
  });

  it('embeds semantic-only queries and returns a semantic result', async () => {
    responses.push(
      [config],
      [{ id: 'has-current-index' }],
      [config],
      [],
      [
        {
          id: 'semantic-page',
          title: 'Account recovery',
          slug_id: 'recovery',
          space_slug: 'handbook',
          excerpt: 'Resetting multi factor access',
          distance: 0.1,
        },
      ],
    );

    const result = await service.search(
      'workspace',
      'member',
      'restore my login',
    );

    expect(result.mode).toBe('hybrid');
    expect(result.items).toMatchObject([
      { id: 'semantic-page', kind: 'semantic', url: '/s/handbook/p/recovery' },
    ]);
    const semanticQuery = queries.find((query) => query.sql.includes('<=>'));
    expect(semanticQuery).toBeDefined();
    expect(semanticQuery!.sql).toContain('all_ancestors');
    expect(semanticQuery!.sql).toContain('group_users');
    expect(semanticQuery!.sql).toContain('space_members');
    expect(semanticQuery!.sql).toContain('"pages"."deleted_at" is null');
    expect(semanticQuery!.sql).toContain('"spaces"."deleted_at" is null');
    expect(semanticQuery!.sql).toContain('"chunk"."source_hash"');
    expect(semanticQuery!.sql).toContain('"chunk"."generation"');
    expect(semanticQuery!.sql).toContain('"chunk"."model"');
    expect(semanticQuery!.sql).toContain('limit $');
    expect(semanticQuery!.sql.indexOf('all_ancestors')).toBeLessThan(
      semanticQuery!.sql.indexOf('order by'),
    );
    expect(semanticQuery!.parameters).toEqual(
      expect.arrayContaining(['workspace', 'member']),
    );
  });

  it('does not perform semantic work when semantic search is disabled', async () => {
    const disabled = { ...config, semanticEnabled: false };
    responses.push([disabled], [disabled], []);

    const result = await service.search('workspace', 'member', 'printer model');

    expect(result).toEqual({ items: [], mode: 'keyword' });
    expect(queries.some(({ sql }) => sql.includes('community_ai_chunks'))).toBe(
      false,
    );
  });

  it('falls back to keyword search when the embedding provider fails without exposing provider details', async () => {
    responses.push([config], [{ id: 'has-current-index' }], [config], []);
    (service as any).embeddings.embed = async () => {
      throw new Error('synthetic-secret provider failure');
    };

    const result = await service.search('workspace', 'member', 'printer');

    expect(result.mode).toBe('keyword');
    expect(result.notice).toMatch(/temporarily unavailable/i);
    expect(JSON.stringify(result)).not.toContain('synthetic-secret');
  });

  it('rejects blank and overlong user queries before database access', async () => {
    await expect(service.search('workspace', 'member', '  ')).rejects.toThrow();
    await expect(
      service.search('workspace', 'member', 'x'.repeat(2001)),
    ).rejects.toThrow();
    expect(queries).toHaveLength(0);
  });
});
