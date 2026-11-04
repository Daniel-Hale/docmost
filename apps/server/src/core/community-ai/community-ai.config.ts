import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';

export type CommunityAiConfig = {
  backend: 'direct' | 'agent';
  agentId: string | null;
  enabled: boolean;
  model: string;
  encryptedKey: string | null;
  semanticEnabled: boolean;
  embeddingModel: string;
  embeddingGeneration: string;
  indexingUserId: string | null;
};
export async function readCommunityAiConfig(
  db: KyselyDB | KyselyTransaction,
  workspaceId: string,
) {
  return (
    await sql<CommunityAiConfig>`select backend, agent_id as "agentId", enabled, model, encrypted_key as "encryptedKey",
    semantic_enabled as "semanticEnabled", embedding_model as "embeddingModel",
    embedding_generation as "embeddingGeneration", indexing_user_id as "indexingUserId"
    from community_ai_settings where workspace_id=${workspaceId}::uuid`.execute(
      db,
    )
  ).rows[0];
}

export type CommunityIndexTables = {
  communityAiChunks: {
    workspaceId: string;
    pageId: string;
    position: number;
    sourceHash: string;
    model: string;
    generation: string;
    text: string;
    embedding: string;
    createdAt: Date;
  };
  communityAiIndexState: {
    workspaceId: string;
    pageId: string;
    sourceHash: string;
    model: string;
    generation: string;
    status: string;
    chunkCount: number;
    errorCode: string | null;
    updatedAt: Date;
  };
};
