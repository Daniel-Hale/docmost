import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { sql } from 'kysely';
import {
  EncryptionPurpose,
  EncryptionService,
} from '../../integrations/encryption/encryption.service';
import {
  CommunityAiConfig,
  CommunityIndexTables,
  readCommunityAiConfig,
} from './community-ai.config';
import { readablePages, liveDocumentHash } from './community-ai-access';
import {
  chunkDocument,
  DEFAULT_EMBEDDING_MODEL,
  DocumentChunk,
  documentHash,
  EMBEDDING_DIMENSIONS,
  EmbeddingsClient,
  INDEX_QUEUE,
} from './community-embeddings';

export const COMMUNITY_INDEX_REFRESH_JOB = 'community-index-refresh';
const SCHEDULER_INTERVAL_MS = 60_000;
const MAX_PAGES_PER_RUN = 250;
const MAX_EMBEDDING_BATCHES_PER_RUN = 32;
const EMBEDDING_BATCH_SIZE = 16;
const SCHEDULER_PREFIX = 'community-search-';
const ERROR_DOCUMENT_TOO_LARGE = 'document_too_large';
const ERROR_EMBEDDING_FAILED = 'embedding_failed';

export type CommunityIndexJobData = {
  workspaceId: string;
  userId: string;
  generation: string;
  manual?: boolean;
};

type IndexerContext = {
  userIsAdmin: boolean;
  config?: CommunityAiConfig;
};

type IndexPage = {
  id: string;
  title: string;
  textContent: string;
  sourceHash: string;
};

type IndexedChunk = DocumentChunk & { vector: number[] };

@Injectable()
export class CommunityAiIndexService {
  private readonly logger = new Logger(CommunityAiIndexService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(INDEX_QUEUE) private readonly queue: Queue,
    private readonly members: SpaceMemberRepo,
    private readonly permissions: PagePermissionRepo,
    private readonly encryption: EncryptionService,
    private readonly embeddings: EmbeddingsClient,
  ) {}

  async configure(workspaceId: string, userId: string): Promise<void> {
    const context = await this.getIndexerContext(workspaceId, userId);
    if (!context?.userIsAdmin) throw new ForbiddenException();

    await this.queue.setGlobalConcurrency(1);
    if (!this.canIndex(context.config)) {
      await this.removeScheduler(workspaceId);
      return;
    }

    await this.upsertScheduler(workspaceId, userId, context.config);
  }

  async refresh(workspaceId: string, userId: string): Promise<{ queued: true }> {
    const context = await this.getIndexerContext(workspaceId, userId);
    if (!context?.userIsAdmin) throw new ForbiddenException();
    if (!this.canIndex(context.config)) {
      await this.removeScheduler(workspaceId);
      throw new BadRequestException('Semantic indexing is not enabled');
    }

    await this.queue.setGlobalConcurrency(1);
    await this.upsertScheduler(workspaceId, userId, context.config);
    await this.queue.add(
      COMMUNITY_INDEX_REFRESH_JOB,
      {
        workspaceId,
        userId,
        generation: context.config.embeddingGeneration,
        manual: true,
      } satisfies CommunityIndexJobData,
      {
        jobId: `community-index-manual-${workspaceId}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      },
    );
    return { queued: true };
  }

  async status(
    workspaceId: string,
    userId: string,
  ): Promise<{
    eligiblePages: number;
    indexedPages: number;
    failedPages: number;
    pendingPages: number;
    active: boolean;
    lastError?: string;
  }> {
    const context = await this.getIndexerContext(workspaceId, userId);
    if (!context?.userIsAdmin) throw new ForbiddenException();

    const rows = await this.getIndexRows(workspaceId, userId);
    const config = context.config;
    const active = this.canIndex(config);
    let indexedPages = 0;
    let failedPages = 0;
    let lastError: string | undefined;

    for (const row of rows) {
      if (
        !config ||
        row.sourceHash !== row.indexSourceHash ||
        row.indexModel !== config.embeddingModel ||
        row.indexGeneration !== config.embeddingGeneration
      ) {
        continue;
      }
      if (row.indexStatus === 'ready') indexedPages += 1;
      if (row.indexStatus === 'error') {
        failedPages += 1;
        if (!lastError && this.safeErrorCode(row.errorCode)) {
          lastError = row.errorCode;
        }
      }
    }

    const eligiblePages = rows.length;
    return {
      eligiblePages,
      indexedPages,
      failedPages,
      pendingPages: Math.max(0, eligiblePages - indexedPages - failedPages),
      active,
      ...(lastError ? { lastError } : {}),
    };
  }

  async processRefresh(
    data: CommunityIndexJobData,
    _job?: Job<CommunityIndexJobData>,
  ): Promise<void> {
    const context = await this.getIndexerContext(data.workspaceId, data.userId);
    if (!this.isCurrentIndexer(context, data.generation)) return;

    const retrying = (_job?.attemptsMade ?? 0) > 0;
    const pageIds = await this.findStalePageIds(
      data,
      context.config,
      Boolean(data.manual || retrying),
    );
    let batchCount = 0;

    for (const pageId of pageIds.slice(0, MAX_PAGES_PER_RUN)) {
      const page = await this.readReadablePage(data, pageId, data.generation);
      if (!page) continue;
      if (documentHash(page.title, page.textContent) !== page.sourceHash) continue;

      let chunks: DocumentChunk[];
      try {
        chunks = chunkDocument(page.title, page.textContent);
      } catch (error) {
        if ((error as Error)?.message !== ERROR_DOCUMENT_TOO_LARGE) throw error;
        await this.recordPageError(
          data,
          page,
          context.config,
          ERROR_DOCUMENT_TOO_LARGE,
        );
        continue;
      }

      const pageBatchCount = Math.ceil(chunks.length / EMBEDDING_BATCH_SIZE);
      if (
        batchCount > 0 &&
        batchCount + pageBatchCount > MAX_EMBEDDING_BATCHES_PER_RUN
      ) {
        break;
      }

      const indexedChunks: IndexedChunk[] = [];
      for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) {
        const currentContext = await this.getIndexerContext(
          data.workspaceId,
          data.userId,
        );
        if (!this.isCurrentIndexer(currentContext, data.generation)) {
          return;
        }

        const currentPage = await this.readReadablePage(
          data,
          pageId,
          data.generation,
        );
        if (!currentPage || currentPage.sourceHash !== page.sourceHash) break;

        const chunkBatch = chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE);
        try {
          const key = this.encryption.decrypt(
            currentContext.config.encryptedKey,
            EncryptionPurpose.COMMUNITY_AI,
          );
          const vectors = await this.embeddings.embed(
            key,
            currentContext.config.embeddingModel,
            chunkBatch.map((chunk) => chunk.input),
          );
          if (
            vectors.length !== chunkBatch.length ||
            vectors.some((vector) => !this.isValidVector(vector))
          ) {
            throw new Error('Invalid embedding result');
          }
          indexedChunks.push(
            ...chunkBatch.map((chunk, index) => ({
              ...chunk,
              vector: vectors[index],
            })),
          );
          batchCount += 1;
        } catch {
          await this.recordPageError(
            data,
            page,
            currentContext.config,
            ERROR_EMBEDDING_FAILED,
          );
          throw new Error('Community document indexing failed');
        }
      }

      if (indexedChunks.length !== chunks.length) continue;

      const published = await this.publishPage(
        data,
        page,
        indexedChunks,
        context.config,
      );
      if (!published) continue;
    }
  }

  private async getIndexerContext(
    workspaceId: string,
    userId: string,
    db: KyselyDB | KyselyTransaction = this.db,
  ): Promise<IndexerContext> {
    const actor = await sql<{ id: string }>`
      select users.id
      from users
      inner join workspaces on workspaces.id = users.workspace_id
      where users.id = ${userId}::uuid
        and users.workspace_id = ${workspaceId}::uuid
        and users.role in ('admin', 'owner')
        and users.deleted_at is null
        and users.deactivated_at is null
        and workspaces.deleted_at is null
    `.execute(db);
    const config = await readCommunityAiConfig(db, workspaceId);
    return { userIsAdmin: actor.rows.length > 0, config };
  }

  private canIndex(config?: CommunityAiConfig): config is CommunityAiConfig {
    return Boolean(
      config?.enabled &&
        config.semanticEnabled &&
        config.encryptedKey &&
        config.embeddingModel,
    );
  }

  private isCurrentIndexer(
    context: IndexerContext | undefined,
    generation: string,
  ): context is IndexerContext & { config: CommunityAiConfig } {
    return Boolean(
      context?.userIsAdmin &&
        this.canIndex(context.config) &&
        context.config.embeddingGeneration === generation,
    );
  }

  private async upsertScheduler(
    workspaceId: string,
    userId: string,
    config: CommunityAiConfig,
  ): Promise<void> {
    await this.queue.upsertJobScheduler(
      `${SCHEDULER_PREFIX}${workspaceId}`,
      { every: SCHEDULER_INTERVAL_MS },
      {
        name: COMMUNITY_INDEX_REFRESH_JOB,
        data: {
          workspaceId,
          userId,
          generation: config.embeddingGeneration,
        } satisfies CommunityIndexJobData,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
    );
  }

  private async removeScheduler(workspaceId: string): Promise<void> {
    await this.queue.removeJobScheduler(`${SCHEDULER_PREFIX}${workspaceId}`);
  }

  private async findStalePageIds(
    data: CommunityIndexJobData,
    config: CommunityAiConfig,
    includeErrors = false,
  ): Promise<string[]> {
    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (trx) => {
        const readable = readablePages(
          trx,
          this.members,
          this.permissions,
          data.workspaceId,
          data.userId,
        )
          .select(['pages.id as page_id', liveDocumentHash.as('source_hash')])
          .as('readable');
        const queryDb = trx as any;
        const rows = await queryDb
          .selectFrom(readable)
          .leftJoin('communityAiIndexState as state', (join: any) =>
            join
              .onRef('state.pageId', '=', 'readable.page_id')
              .on('state.workspaceId', '=', data.workspaceId),
          )
          .select('readable.page_id as pageId')
          .where((eb: any) =>
            eb.or([
              eb('state.pageId', 'is', null),
              eb(eb.ref('state.sourceHash'), '!=', eb.ref('readable.source_hash')),
              eb('state.model', '!=', config.embeddingModel),
              eb('state.generation', '!=', config.embeddingGeneration),
              eb('state.status', 'not in', ['ready', 'error']),
              ...(includeErrors ? [eb('state.status', '=', 'error')] : []),
            ]),
          )
          .orderBy('readable.page_id')
          .limit(MAX_PAGES_PER_RUN)
          .execute();
        return rows.map((row: { pageId: string }) => row.pageId);
      });
  }

  private async readReadablePage(
    data: CommunityIndexJobData,
    pageId: string,
    generation: string,
  ): Promise<IndexPage | undefined> {
    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (trx) => {
        const context = await this.getIndexerContext(
          data.workspaceId,
          data.userId,
          trx,
        );
        if (!this.isCurrentIndexer(context, generation)) return undefined;
        const page = await readablePages(
          trx,
          this.members,
          this.permissions,
          data.workspaceId,
          data.userId,
        )
          .select([
            'pages.id',
            'pages.title',
            'pages.textContent',
            liveDocumentHash.as('sourceHash'),
          ])
          .where('pages.id', '=', pageId)
          .executeTakeFirst();
        return page
          ? {
              id: page.id,
              title: page.title ?? '',
              textContent: page.textContent ?? '',
              sourceHash: page.sourceHash,
            }
          : undefined;
      });
  }

  private async publishPage(
    data: CommunityIndexJobData,
    page: IndexPage,
    chunks: IndexedChunk[],
    originalConfig: CommunityAiConfig,
  ): Promise<boolean> {
    if (chunks.some((chunk) => !this.isValidVector(chunk.vector))) {
      throw new Error('Invalid embedding result');
    }
    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (trx) => {
        const context = await this.getIndexerContext(
          data.workspaceId,
          data.userId,
          trx,
        );
        if (
          !this.isCurrentIndexer(context, data.generation) ||
          context.config.embeddingModel !== originalConfig.embeddingModel
        ) {
          return false;
        }
        const currentPage = await readablePages(
          trx,
          this.members,
          this.permissions,
          data.workspaceId,
          data.userId,
        )
          .select(['pages.id', liveDocumentHash.as('sourceHash')])
          .where('pages.id', '=', page.id)
          .executeTakeFirst();
        if (!currentPage || currentPage.sourceHash !== page.sourceHash) {
          return false;
        }

        await sql`
          delete from community_ai_chunks
          where workspace_id = ${data.workspaceId}::uuid
            and page_id = ${page.id}::uuid
        `.execute(trx);
        if (chunks.length > 0) {
          const values = chunks.map(
            (chunk, index) => sql`(
              ${data.workspaceId}::uuid,
              ${page.id}::uuid,
              ${chunk.position},
              ${page.sourceHash},
              ${context.config.embeddingModel},
              ${data.generation}::uuid,
              ${chunk.text},
              ${JSON.stringify(chunk.vector)}::vector
            )`,
          );
          await sql`
            insert into community_ai_chunks
              (workspace_id, page_id, position, source_hash, model, generation, text, embedding)
            values ${sql.join(values)}
          `.execute(trx);
        }
        await sql`
          insert into community_ai_index_state
            (workspace_id, page_id, source_hash, model, generation, status, chunk_count, error_code, updated_at)
          values
            (${data.workspaceId}::uuid, ${page.id}::uuid, ${page.sourceHash},
             ${context.config.embeddingModel}, ${data.generation}::uuid, 'ready', ${chunks.length}, null, now())
          on conflict (workspace_id, page_id) do update set
            source_hash = excluded.source_hash,
            model = excluded.model,
            generation = excluded.generation,
            status = 'ready',
            chunk_count = excluded.chunk_count,
            error_code = null,
            updated_at = now()
        `.execute(trx);
        return true;
      });
  }

  private async recordPageError(
    data: CommunityIndexJobData,
    page: IndexPage,
    originalConfig: CommunityAiConfig,
    errorCode: string,
  ): Promise<boolean> {
    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (trx) => {
        const context = await this.getIndexerContext(
          data.workspaceId,
          data.userId,
          trx,
        );
        if (
          !this.isCurrentIndexer(context, data.generation) ||
          context.config.embeddingModel !== originalConfig.embeddingModel
        ) {
          return false;
        }
        const currentPage = await readablePages(
          trx,
          this.members,
          this.permissions,
          data.workspaceId,
          data.userId,
        )
          .select(['pages.id', liveDocumentHash.as('sourceHash')])
          .where('pages.id', '=', page.id)
          .executeTakeFirst();
        if (!currentPage || currentPage.sourceHash !== page.sourceHash) {
          return false;
        }
        await sql`
          delete from community_ai_chunks
          where workspace_id = ${data.workspaceId}::uuid
            and page_id = ${page.id}::uuid
        `.execute(trx);
        await sql`
          insert into community_ai_index_state
            (workspace_id, page_id, source_hash, model, generation, status, chunk_count, error_code, updated_at)
          values
            (${data.workspaceId}::uuid, ${page.id}::uuid, ${page.sourceHash},
             ${context.config.embeddingModel}, ${data.generation}::uuid, 'error', 0, ${errorCode}, now())
          on conflict (workspace_id, page_id) do update set
            source_hash = excluded.source_hash,
            model = excluded.model,
            generation = excluded.generation,
            status = 'error',
            chunk_count = 0,
            error_code = excluded.error_code,
            updated_at = now()
        `.execute(trx);
        return true;
      });
  }

  private async getIndexRows(
    workspaceId: string,
    userId: string,
  ): Promise<
    Array<{
      sourceHash: string;
      indexSourceHash: string | null;
      indexModel: string | null;
      indexGeneration: string | null;
      indexStatus: string | null;
      errorCode: string | null;
    }>
  > {
    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (trx) => {
        const readable = readablePages(
          trx,
          this.members,
          this.permissions,
          workspaceId,
          userId,
        )
          .select(['pages.id as page_id', liveDocumentHash.as('source_hash')])
          .as('readable');
        return (trx as any)
          .selectFrom(readable)
          .leftJoin('communityAiIndexState as state', (join: any) =>
            join
              .onRef('state.pageId', '=', 'readable.page_id')
              .on('state.workspaceId', '=', workspaceId),
          )
          .select([
            'readable.source_hash as sourceHash',
            'state.sourceHash as indexSourceHash',
            'state.model as indexModel',
            'state.generation as indexGeneration',
            'state.status as indexStatus',
            'state.errorCode as errorCode',
          ])
          .execute();
      });
  }

  private safeErrorCode(errorCode: string | null): boolean {
    return errorCode === ERROR_DOCUMENT_TOO_LARGE || errorCode === ERROR_EMBEDDING_FAILED;
  }

  private isValidVector(vector: number[]): boolean {
    return (
      Array.isArray(vector) &&
      vector.length === EMBEDDING_DIMENSIONS &&
      vector.every(
        (value) =>
          typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1,
      ) &&
      vector.some((value) => value !== 0)
    );
  }
}
