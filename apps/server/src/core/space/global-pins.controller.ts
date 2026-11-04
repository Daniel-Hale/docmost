import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
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
import { GlobalPinsService } from './global-pins.service';
import { GlobalPinDto } from './global-pin.dto';

@Controller('spaces')
@RequireSessionAuth()
@UseGuards(JwtAuthGuard)
export class GlobalPinsController {
  constructor(
    private readonly pins: GlobalPinsService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @Post('global-pins')
  @HttpCode(200)
  list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.pins.list(user.id, workspace.id);
  }

  @Post('global-pin')
  @HttpCode(200)
  setPinned(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: GlobalPinDto,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
    return this.pins.setPinned(user, workspace.id, dto.spaceId, dto.pinned);
  }
}
