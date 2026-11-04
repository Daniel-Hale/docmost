import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { RequireSessionAuth } from '../../common/decorators/require-session-auth.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import { UserThrottlerGuard } from '../../integrations/throttle/user-throttler.guard';
import {
  AI_CHAT_THROTTLER,
  ALL_NAMED_THROTTLERS_SKIPPED,
} from '../../integrations/throttle/throttler-names';
import { CommunityAiService } from './community-ai.service';
import {
  CommunityAiGenerateDto,
  CommunityAiSettingsDto,
} from './community-ai.dto';

@Controller('community-ai')
@RequireSessionAuth()
@UseGuards(JwtAuthGuard)
export class CommunityAiController {
  constructor(
    private readonly ai: CommunityAiService,
    private readonly ability: WorkspaceAbilityFactory,
  ) {}

  @Post('status')
  @HttpCode(200)
  status(@AuthWorkspace() workspace: Workspace) {
    return this.ai.settings(workspace.id);
  }

  @Post('settings')
  @HttpCode(200)
  settings(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: CommunityAiSettingsDto,
  ) {
    if (
      this.ability
        .createForUser(user, workspace)
        .cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
    return this.ai.updateSettings(workspace.id, dto);
  }

  @Post('generate')
  @HttpCode(200)
  @UseGuards(UserThrottlerGuard)
  @SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AI_CHAT_THROTTLER]: false })
  @Throttle({ [AI_CHAT_THROTTLER]: { ttl: 60000, limit: 10 } })
  generate(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: CommunityAiGenerateDto,
  ) {
    return this.ai.generate(workspace.id, user.id, dto);
  }
}
