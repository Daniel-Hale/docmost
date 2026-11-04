import { Kysely } from 'kysely';

export async function up(db: Kysely<any>) {
  await db.schema
    .alterTable('community_ai_settings')
    .addColumn('backend', 'varchar(20)', (col) =>
      col.notNull().defaultTo('direct'),
    )
    .addColumn('agent_id', 'varchar(100)')
    .execute();
}

export async function down(db: Kysely<any>) {
  await db.schema
    .alterTable('community_ai_settings')
    .dropColumn('backend')
    .dropColumn('agent_id')
    .execute();
}
