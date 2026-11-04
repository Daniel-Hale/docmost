import * as dotenv from 'dotenv';
import { Kysely } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import postgres from 'postgres';
import { envPath, normalizePostgresUrl } from '../common/helpers';
import { MigrationService } from './services/migration.service';

dotenv.config({ path: envPath });
const db = new Kysely<any>({
  dialect: new PostgresJSDialect({
    postgres: postgres(normalizePostgresUrl(process.env.DATABASE_URL)),
  }),
});

async function main() {
  try {
    // Apply upstream migrations first, then the independent extension history.
    await new MigrationService(db).migrateToLatest();
  } finally {
    await db.destroy();
  }
}
main().catch(() => {
  console.error('Community migration failed');
  process.exitCode = 1;
});
