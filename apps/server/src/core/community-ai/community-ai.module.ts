import { Module } from '@nestjs/common';
import { CommunityAiController } from './community-ai.controller';
import { CommunityAiService } from './community-ai.service';

@Module({
  controllers: [CommunityAiController],
  providers: [CommunityAiService],
})
export class CommunityAiModule {}
