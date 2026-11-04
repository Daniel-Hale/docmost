import { Module } from '@nestjs/common';
import { CommunityAiController } from './community-ai.controller';
import { CommunityAiService } from './community-ai.service';
import { BullModule } from '@nestjs/bullmq';
import { INDEX_QUEUE, EmbeddingsClient } from './community-embeddings';
import { CommunityAiSearchService } from './community-ai-search.service';
import { CommunityAiIndexService } from './community-ai-index.service';
import { CommunityAiIndexProcessor } from './community-ai-index.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: INDEX_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 5 },
      },
    }),
  ],
  controllers: [CommunityAiController],
  providers: [
    CommunityAiService,
    CommunityAiSearchService,
    CommunityAiIndexService,
    CommunityAiIndexProcessor,
    EmbeddingsClient,
  ],
  exports: [CommunityAiSearchService],
})
export class CommunityAiModule {}
