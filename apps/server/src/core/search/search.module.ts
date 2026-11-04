import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { PublicSpaceModule } from '../public-space/public-space.module';
import { CommunityAiModule } from '../community-ai/community-ai.module';

@Module({
  imports: [PublicSpaceModule, CommunityAiModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
