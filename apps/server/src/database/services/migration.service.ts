import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';
import { Migrator, FileMigrationProvider } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import * as communityAiInitial from '../../core/community-ai/migrations/20261104T010000-community-ai';
import * as communitySearchInitial from '../../core/community-ai/migrations/20261104T050000-community-search';

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(`Database${MigrationService.name}`);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async migrateToLatest(): Promise<void> {
    const migrator = new Migrator({
      db: this.db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, '..', 'migrations'),
      }),
    });

    const { error, results } = await migrator.migrateToLatest();

    if (results && results.length === 0) {
      this.logger.log('No pending database migrations');
    }

    results?.forEach((it) => {
      if (it.status === 'Success') {
        this.logger.log(
          `Migration "${it.migrationName}" executed successfully`,
        );
      } else if (it.status === 'Error') {
        this.logger.error(`Failed to execute migration "${it.migrationName}"`);
      }
    });

    if (error) {
      this.logger.error('Failed to run database migration. Exiting program.');
      this.logger.error(error);
      process.exit(1);
    }

    // Keep extension migrations out of the upstream history. Older community
    // images can then start after rollback without a missing-migration error.
    const extension = await new Migrator({
      db: this.db,
      migrationTableName: 'community_ai_migration',
      migrationLockTableName: 'community_ai_migration_lock',
      provider: {
        getMigrations: async () => ({
          '20261104T010000-community-ai': communityAiInitial,
        }),
      },
    }).migrateToLatest();
    if (extension.error) {
      this.logger.error('Community AI migration failed. Exiting program.');
      this.logger.error(extension.error);
      process.exit(1);
    }
    // A separate history lets the previous custom AI image ignore this feature
    // on app rollback, retaining its existing credentials and settings.
    const search = await new Migrator({
      db: this.db,
      migrationTableName: 'community_ai_search_migration',
      migrationLockTableName: 'community_ai_search_migration_lock',
      provider: {
        getMigrations: async () => ({
          '20261104T050000-community-search': communitySearchInitial,
        }),
      },
    }).migrateToLatest();
    if (search.error) {
      this.logger.error('Community search migration failed. Exiting program.');
      this.logger.error(search.error);
      process.exit(1);
    }
  }
}
