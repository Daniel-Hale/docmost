import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>) {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);
  await db.schema
    .alterTable('community_ai_settings')
    .addColumn('semantic_enabled', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('embedding_model', 'varchar(100)', (col) =>
      col.notNull().defaultTo('text-embedding-3-small'),
    )
    .addColumn('embedding_generation', 'uuid', (col) =>
      col.notNull().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('indexing_user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .execute();
  await db.schema
    .createTable('community_ai_chunks')
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.notNull().references('pages.id').onDelete('cascade'),
    )
    .addColumn('position', 'integer', (col) => col.notNull())
    .addColumn('source_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('model', 'varchar(100)', (col) => col.notNull())
    .addColumn('generation', 'uuid', (col) => col.notNull())
    .addColumn('text', 'text', (col) => col.notNull())
    .addColumn('embedding', sql`vector(1536)`, (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint('community_ai_chunks_pk', [
      'workspace_id',
      'page_id',
      'position',
    ])
    .execute();
  await db.schema
    .createIndex('community_ai_chunks_generation')
    .on('community_ai_chunks')
    .columns(['workspace_id', 'generation', 'model'])
    .execute();
  await db.schema
    .createTable('community_ai_index_state')
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.notNull().references('pages.id').onDelete('cascade'),
    )
    .addColumn('source_hash', 'varchar(64)', (col) => col.notNull())
    .addColumn('model', 'varchar(100)', (col) => col.notNull())
    .addColumn('generation', 'uuid', (col) => col.notNull())
    .addColumn('status', 'varchar(20)', (col) => col.notNull())
    .addColumn('chunk_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('error_code', 'varchar(100)')
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addPrimaryKeyConstraint('community_ai_index_state_pk', [
      'workspace_id',
      'page_id',
    ])
    .execute();
}

export async function down(db: Kysely<any>) {
  await db.schema.dropTable('community_ai_chunks').execute();
  await db.schema.dropTable('community_ai_index_state').execute();
  await db.schema
    .alterTable('community_ai_settings')
    .dropColumn('semantic_enabled')
    .dropColumn('embedding_model')
    .dropColumn('embedding_generation')
    .dropColumn('indexing_user_id')
    .execute();
  // Keep the shared vector extension installed; routine rollback is image-only.
}
