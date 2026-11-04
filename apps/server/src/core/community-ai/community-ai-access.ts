import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';

export type CommunitySearchFilters = {
  creatorId?: string;
  labelIds?: string[];
};
export function readablePages(
  db: KyselyDB | KyselyTransaction,
  members: SpaceMemberRepo,
  permissions: PagePermissionRepo,
  workspaceId: string,
  userId: string,
  spaceId?: string,
  filters: CommunitySearchFilters = {},
) {
  const scoped = db
    .selectFrom('pages')
    .innerJoin('spaces', 'spaces.id', 'pages.spaceId')
    .where('pages.workspaceId', '=', workspaceId)
    .where('spaces.workspaceId', '=', workspaceId)
    .where('pages.deletedAt', 'is', null)
    .where('spaces.deletedAt', 'is', null)
    .where('pages.isBase', '=', false)
    .where('pages.spaceId', 'in', members.getUserSpaceIdsQuery(userId))
    .$if(Boolean(filters.creatorId), (qb) =>
      qb.where('pages.creatorId', '=', filters.creatorId!),
    )
    .$if(Boolean(filters.labelIds?.length), (qb) =>
      qb.where(
        'pages.id',
        'in',
        db
          .selectFrom('pageLabels')
          .select('pageId')
          .where('labelId', 'in', filters.labelIds!),
      ),
    )
    .$if(Boolean(spaceId), (qb) => qb.where('pages.spaceId', '=', spaceId!));
  return scoped.where(
    'pages.id',
    'in',
    permissions.accessiblePageIdsQuery({
      pageIds: scoped.select('pages.id'),
      userId,
      trx: db.isTransaction ? (db as KyselyTransaction) : undefined,
    }),
  );
}

export const liveDocumentHash = sql<string>`encode(sha256(convert_to(coalesce(pages.title,'') || chr(10) || coalesce(pages.text_content,''),'UTF8')),'hex')`;
