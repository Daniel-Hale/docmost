import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CommunityAiIndexService, CommunityIndexJobData, COMMUNITY_INDEX_REFRESH_JOB } from './community-ai-index.service';
import { INDEX_QUEUE } from './community-embeddings';

@Processor(INDEX_QUEUE, { concurrency: 1 })
export class CommunityAiIndexProcessor extends WorkerHost {
  constructor(private readonly index: CommunityAiIndexService) {
    super();
  }

  async process(job: Job<CommunityIndexJobData>): Promise<void> {
    if (job.name !== COMMUNITY_INDEX_REFRESH_JOB) return;

    try {
      await this.index.processRefresh(job.data, job);
    } catch {
      // Keep provider and database errors out of queue logs and job state.
      throw new Error('Community document indexing failed');
    }
  }
}
