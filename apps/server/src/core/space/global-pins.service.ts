import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { SpaceRole } from '../../common/helpers/types/permission';
import { User } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { DefaultGroup } from '../group/dto/create-group.dto';

const EVERYONE_LINK_REQUIRED =
  'Share this Company with the Everyone group before pinning it for all staff.';
const EVERYONE_ROLES = [SpaceRole.ADMIN, SpaceRole.WRITER, SpaceRole.READER];

@Injectable()
export class GlobalPinsService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly members: SpaceMemberRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  async list(
    userId: string,
    workspaceId: string,
  ): Promise<{
    items: Array<{
      id: string;
      name: string;
      slug: string;
      logo: string | null;
    }>;
  }> {
    const items = await this.db
      .selectFrom('spaces')
      .innerJoin('spaceMembers', 'spaceMembers.spaceId', 'spaces.id')
      .innerJoin('groups', 'groups.id', 'spaceMembers.groupId')
      .select(['spaces.id', 'spaces.name', 'spaces.slug', 'spaces.logo'])
      .where('spaces.id', 'in', this.members.getUserSpaceIdsQuery(userId))
      .where('spaces.workspaceId', '=', workspaceId)
      .where('spaces.deletedAt', 'is', null)
      .where('spaces.isPersonal', '=', false)
      .where(
        sql<boolean>`spaces.settings @> '{"globalPinned": true}'::jsonb`,
        '=',
        true,
      )
      .where('groups.workspaceId', '=', workspaceId)
      .where('groups.isDefault', '=', true)
      .where('groups.name', '=', DefaultGroup.EVERYONE)
      .where('groups.deletedAt', 'is', null)
      .where('spaceMembers.role', 'in', EVERYONE_ROLES)
      .orderBy('spaces.name', 'asc')
      .orderBy('spaces.id', 'asc')
      .execute();

    return { items };
  }

  async setPinned(
    user: User,
    workspaceId: string,
    spaceId: string,
    pinned: boolean,
  ): Promise<{ success: true }> {
    const space = await this.db
      .selectFrom('spaces')
      .select('spaces.id')
      .where('spaces.id', '=', spaceId)
      .where('spaces.workspaceId', '=', workspaceId)
      .where('spaces.deletedAt', 'is', null)
      .where('spaces.isPersonal', '=', false)
      .executeTakeFirst();
    if (!space) throw new NotFoundException('Company not found');

    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }

    if (pinned && !(await this.hasEveryoneMembership(workspaceId, spaceId))) {
      throw new BadRequestException(EVERYONE_LINK_REQUIRED);
    }

    let update = this.db
      .updateTable('spaces')
      .set({
        settings: sql`jsonb_set(
          case when jsonb_typeof(settings) = 'object' then settings else '{}'::jsonb end,
          '{globalPinned}', to_jsonb(${pinned}::boolean), true
        )` as any,
      })
      .where('spaces.id', '=', spaceId)
      .where('spaces.workspaceId', '=', workspaceId)
      .where('spaces.deletedAt', 'is', null)
      .where('spaces.isPersonal', '=', false);

    if (pinned) {
      update = update.where((eb) =>
        eb.exists(this.everyoneMembershipQuery(workspaceId, spaceId)),
      );
    }

    const updated = await update.returning('spaces.id').executeTakeFirst();
    if (!updated) {
      const stillLive = await this.db
        .selectFrom('spaces')
        .select('spaces.id')
        .where('spaces.id', '=', spaceId)
        .where('spaces.workspaceId', '=', workspaceId)
        .where('spaces.deletedAt', 'is', null)
        .where('spaces.isPersonal', '=', false)
        .executeTakeFirst();
      if (!stillLive) throw new NotFoundException('Company not found');
      if (pinned) throw new BadRequestException(EVERYONE_LINK_REQUIRED);
      throw new NotFoundException('Company not found');
    }
    return { success: true };
  }

  private async hasEveryoneMembership(
    workspaceId: string,
    spaceId: string,
  ): Promise<boolean> {
    return Boolean(
      await this.everyoneMembershipQuery(
        workspaceId,
        spaceId,
      ).executeTakeFirst(),
    );
  }

  private everyoneMembershipQuery(workspaceId: string, spaceId: string) {
    return this.db
      .selectFrom('spaceMembers')
      .innerJoin('groups', 'groups.id', 'spaceMembers.groupId')
      .select('spaceMembers.id')
      .where('spaceMembers.spaceId', '=', spaceId)
      .where('groups.workspaceId', '=', workspaceId)
      .where('groups.name', '=', DefaultGroup.EVERYONE)
      .where('groups.isDefault', '=', true)
      .where('groups.deletedAt', 'is', null)
      .where('spaceMembers.role', 'in', EVERYONE_ROLES);
  }
}
