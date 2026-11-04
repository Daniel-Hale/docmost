import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';
import {
  readCommunityAiConfig,
  CommunityAiConfig,
  CommunityIndexTables,
} from './community-ai.config';
import {
  readablePages,
  liveDocumentHash,
  CommunitySearchFilters,
} from './community-ai-access';
import { EmbeddingsClient, reciprocalRankFusion } from './community-embeddings';

type Match = {
  id: string;
  title: string | null;
  slugId: string;
  spaceSlug: string;
  excerpt: string;
  icon?: string | null;
  parentPageId?: string | null;
  creatorId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  spaceId?: string;
  spaceName?: string | null;
};
const MATCH_COLUMNS = [
  'pages.id',
  'pages.title',
  'pages.slugId',
  'pages.icon',
  'pages.parentPageId',
  'pages.creatorId',
  'pages.createdAt',
  'pages.updatedAt',
  'spaces.id as spaceId',
  'spaces.name as spaceName',
  'spaces.slug as spaceSlug',
] as const;
export type CommunitySearchItem = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  score: number;
  kind: 'keyword' | 'semantic' | 'hybrid';
  page?: {
    id: string;
    title: string;
    slugId: string;
    icon?: string | null;
    parentPageId?: string | null;
    creatorId?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    space: { id?: string; name?: string | null; slug: string };
  };
};
export type CommunitySearchResult = {
  items: CommunitySearchItem[];
  mode: 'hybrid' | 'keyword';
  notice?: string;
};

@Injectable()
export class CommunityAiSearchService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly members: SpaceMemberRepo,
    private readonly permissions: PagePermissionRepo,
    private readonly encryption: EncryptionService,
    private readonly embeddings: EmbeddingsClient,
  ) {}

  async isSemanticEnabled(workspaceId: string) {
    const config = await readCommunityAiConfig(this.db, workspaceId);
    return Boolean(
      config?.enabled && config.semanticEnabled && config.encryptedKey,
    );
  }

  async searchPages(
    workspaceId: string,
    userId: string,
    dto: {
      query?: string;
      spaceId?: string;
      creatorId?: string;
      labelIds?: string[];
      limit?: number;
      offset?: number;
    },
  ) {
    const result = await this.search(
      workspaceId,
      userId,
      dto.query ?? '',
      dto.spaceId,
      {
        creatorId: dto.creatorId,
        labelIds: dto.labelIds,
      },
    );
    const escape = (text: string) =>
      text.replace(
        /[&<>"']/g,
        (char) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[char]!,
      );
    const offset = Math.max(0, Math.trunc(dto.offset ?? 0));
    const limit = Math.min(20, Math.max(1, Math.trunc(dto.limit ?? 20)));
    return {
      ...result,
      items: result.items.slice(offset, offset + limit).map((item) => ({
        ...item.page,
        rank: String(item.score),
        highlight: escape(item.excerpt),
        matchedText: [],
        wholeWord: false,
      })),
    };
  }

  private readable(
    db: KyselyDB | KyselyTransaction,
    workspaceId: string,
    userId: string,
    spaceId?: string,
    filters: CommunitySearchFilters = {},
  ) {
    return readablePages(
      db,
      this.members,
      this.permissions,
      workspaceId,
      userId,
      spaceId,
      filters,
    );
  }

  private async hasIndex(
    workspaceId: string,
    userId: string,
    config: CommunityAiConfig,
    spaceId?: string,
    filters: CommunitySearchFilters = {},
  ) {
    return Boolean(
      await this.readable(this.db, workspaceId, userId, spaceId, filters)
        .select('pages.id')
        .where(
          sql<boolean>`exists(select 1 from community_ai_chunks c where c.page_id=pages.id
        and c.workspace_id=${workspaceId}::uuid and c.source_hash=${liveDocumentHash}
        and c.generation=${config.embeddingGeneration}::uuid and c.model=${config.embeddingModel})`,
        )
        .limit(1)
        .executeTakeFirst(),
    );
  }

  async search(
    workspaceId: string,
    userId: string,
    query: string,
    spaceId?: string,
    filters: CommunitySearchFilters = {},
  ): Promise<CommunitySearchResult> {
    query = query.trim();
    if (!query || query.length > 2000)
      throw new BadRequestException(
        'Enter a question of 1 to 2,000 characters',
      );
    const config = await readCommunityAiConfig(this.db, workspaceId);
    let vector: number[] | undefined;
    let notice: string | undefined;
    if (config?.enabled && config.semanticEnabled && config.encryptedKey) {
      if (await this.hasIndex(workspaceId, userId, config, spaceId, filters)) {
        try {
          const key = this.encryption.decrypt(
            config.encryptedKey,
            EncryptionPurpose.COMMUNITY_AI,
          );
          [vector] = await this.embeddings.embed(key, config.embeddingModel, [
            query,
          ]);
        } catch {
          notice =
            'Semantic search is temporarily unavailable. Showing keyword results.';
        }
      } else
        notice =
          'The semantic index is not ready for these documents. Showing keyword results.';
    }
    // Query embedding makes no source-document disclosure. Final authorization
    // and all document reads happen against one fresh, consistent DB snapshot.
    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (trx) => {
        const current = await readCommunityAiConfig(trx, workspaceId);
        if (
          vector &&
          (!current?.enabled ||
            !current.semanticEnabled ||
            !current.encryptedKey ||
            current.embeddingGeneration !== config?.embeddingGeneration ||
            current.embeddingModel !== config?.embeddingModel)
        ) {
          vector = undefined;
          notice = 'Search settings changed. Showing keyword results.';
        }
        return this.searchSnapshot(
          trx,
          workspaceId,
          userId,
          query,
          current,
          vector,
          notice,
          spaceId,
          filters,
        );
      });
  }

  private async searchSnapshot(
    trx: KyselyTransaction,
    workspaceId: string,
    userId: string,
    query: string,
    config: CommunityAiConfig | undefined,
    vector?: number[],
    notice?: string,
    spaceId?: string,
    filters: CommunitySearchFilters = {},
  ): Promise<CommunitySearchResult> {
    const terms = [
      ...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []),
    ].slice(0, 32);
    const tsquery = sql<string>`to_tsquery('english',f_unaccent(${terms.map((term) => term + ':*').join(' | ')}))`;
    let lexical: Match[] = [];
    if (terms.length)
      lexical = await this.readable(trx, workspaceId, userId, spaceId, filters)
        .select(MATCH_COLUMNS)
        .select(
          sql<string>`ts_headline('english',left(coalesce(pages.text_content,''),100000),${tsquery},
        'StartSel=, StopSel=, MaxWords=160, MinWords=30, MaxFragments=2')`.as(
            'excerpt',
          ),
        )
        .where('pages.tsv', '@@', tsquery)
        .orderBy(sql`ts_rank(pages.tsv,${tsquery})`, 'desc')
        .orderBy('pages.id')
        .limit(30)
        .execute();
    let semantic: Match[] = [];
    if (vector && config) {
      const ext = trx.withTables<CommunityIndexTables>();
      const ids = this.readable(
        trx,
        workspaceId,
        userId,
        spaceId,
        filters,
      ).select('pages.id');
      const distance = sql<number>`(chunk.embedding <=> ${JSON.stringify(vector)}::vector)`;
      // Exact cosine + best chunk per authorized page preserves recall after
      // restrictive ACL filters and prevents long pages receiving extra votes.
      const best = ext
        .selectFrom('communityAiChunks as chunk')
        .innerJoin('pages', 'pages.id', 'chunk.pageId')
        .innerJoin('spaces', 'spaces.id', 'pages.spaceId')
        .select(MATCH_COLUMNS)
        .select('chunk.text as excerpt')
        .select(distance.as('distance'))
        .distinctOn('chunk.pageId')
        .where('pages.id', 'in', ids)
        .where('chunk.workspaceId', '=', workspaceId)
        .where('chunk.sourceHash', '=', liveDocumentHash)
        .where('chunk.generation', '=', config.embeddingGeneration)
        .where('chunk.model', '=', config.embeddingModel)
        .orderBy('chunk.pageId')
        .orderBy(distance, 'asc');
      semantic = await ext
        .selectFrom(best.as('best'))
        .selectAll()
        .where('distance', '<=', 0.65)
        .orderBy('distance', 'asc')
        .orderBy('id')
        .limit(30)
        .execute();
    }
    const ranks = reciprocalRankFusion(
      lexical.map((p) => p.id),
      semantic.map((p) => p.id),
    ).slice(0, 20);
    const items: CommunitySearchItem[] = ranks.map(({ id, score }) => {
      const keyword = lexical.find((p) => p.id === id),
        meaning = semantic.find((p) => p.id === id);
      const page = (meaning ?? keyword)!;
      const excerpt = [meaning?.excerpt, keyword?.excerpt]
        .filter((text, index, array) => text && array.indexOf(text) === index)
        .join('\n')
        .slice(0, 4000);
      return {
        id,
        title: page.title ?? 'Untitled',
        url: `/s/${encodeURIComponent(page.spaceSlug)}/p/${encodeURIComponent(page.slugId)}`,
        excerpt,
        score,
        kind: keyword && meaning ? 'hybrid' : meaning ? 'semantic' : 'keyword',
        page: {
          id,
          title: page.title ?? 'Untitled',
          slugId: page.slugId,
          icon: page.icon,
          parentPageId: page.parentPageId,
          creatorId: page.creatorId,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
          space: {
            id: page.spaceId,
            name: page.spaceName,
            slug: page.spaceSlug,
          },
        },
      };
    });
    return {
      items,
      mode: vector ? 'hybrid' : 'keyword',
      ...(notice ? { notice } : {}),
    };
  }

  async retrieveSources(
    workspaceId: string,
    userId: string,
    query: string,
    spaceId?: string,
  ) {
    const result = await this.search(workspaceId, userId, query, spaceId);
    return result.items.slice(0, 8).map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      text: item.excerpt,
    }));
  }
}
