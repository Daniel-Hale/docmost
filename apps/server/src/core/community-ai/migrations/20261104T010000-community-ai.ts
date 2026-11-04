import { Kysely, sql } from 'kysely';

// Additive and separate from workspace.settings, which is returned to clients.
// Registered in an extension-specific migration history for image rollback.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('community_ai_settings')
    .addColumn('workspace_id', 'uuid', (col) =>
      col.primaryKey().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('model', 'varchar(100)', (col) => col.notNull())
    .addColumn('encrypted_key', 'text')
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('community_ai_settings').execute();
}
