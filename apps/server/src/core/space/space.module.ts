import { Module } from '@nestjs/common';
import { SpaceService } from './services/space.service';
import { SpaceController } from './space.controller';
import { SpaceMemberService } from './services/space-member.service';
import { GlobalPinsController } from './global-pins.controller';
import { GlobalPinsService } from './global-pins.service';

@Module({
  imports: [],
  controllers: [SpaceController, GlobalPinsController],
  providers: [SpaceService, SpaceMemberService, GlobalPinsService],
  exports: [SpaceService, SpaceMemberService],
})
export class SpaceModule {}
