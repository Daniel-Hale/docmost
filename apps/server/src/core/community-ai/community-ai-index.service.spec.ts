import { CommunityAiIndexService } from './community-ai-index.service';
import { chunkDocument, documentHash } from './community-embeddings';

describe('CommunityAiIndexService', () => {
  let service: CommunityAiIndexService;
  let queue: any;
  let embeddings: any;
  let encryption: any;
  let permissions: any;
  let members: any;

  const activeConfig = {
    enabled: true,
    model: 'gpt-5-mini',
    encryptedKey: 'ciphertext',
    semanticEnabled: true,
    embeddingModel: 'text-embedding-3-small',
    embeddingGeneration: 'generation-a',
    indexingUserId: 'admin-1',
  };

  beforeEach(() => {
    queue = {
      setGlobalConcurrency: jest.fn().mockResolvedValue(undefined),
      upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
      removeJobScheduler: jest.fn().mockResolvedValue(1),
      add: jest.fn().mockResolvedValue(undefined),
    };
    embeddings = { embed: jest.fn() };
    encryption = { decrypt: jest.fn().mockReturnValue('synthetic-key') };
    permissions = {};
    members = {};
    service = new CommunityAiIndexService(
      {} as any,
      queue,
      members,
      permissions,
      encryption,
      embeddings,
    );
  });

  it('does not queue a manual refresh when semantic indexing is disabled', async () => {
    jest
      .spyOn(service as any, 'getIndexerContext')
      .mockResolvedValue({ userIsAdmin: true, config: { ...activeConfig, semanticEnabled: false } });

    await expect(service.refresh('workspace-1', 'admin-1')).rejects.toThrow();

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('queues a manual refresh with only workspace, actor, generation, and manual flag', async () => {
    jest.spyOn(service as any, 'getIndexerContext').mockResolvedValue({
      userIsAdmin: true,
      config: activeConfig,
    });

    await expect(service.refresh('workspace-1', 'admin-1')).resolves.toEqual({
      queued: true,
    });

    expect(queue.add).toHaveBeenCalledWith(
      'community-index-refresh',
      {
        workspaceId: 'workspace-1',
        userId: 'admin-1',
        generation: 'generation-a',
        manual: true,
      },
      expect.objectContaining({ removeOnComplete: true, removeOnFail: true }),
    );
  });

  it('stops before provider access when the scheduled actor is no longer authorized', async () => {
    jest.spyOn(service as any, 'getIndexerContext').mockResolvedValue(undefined);

    await service.processRefresh({
      workspaceId: 'workspace-1',
      userId: 'admin-1',
      generation: 'generation-a',
    });

    expect(embeddings.embed).not.toHaveBeenCalled();
  });

  it('does not remove a replacement scheduler when an old generation job runs', async () => {
    jest.spyOn(service as any, 'getIndexerContext').mockResolvedValue({
      userIsAdmin: true,
      config: { ...activeConfig, embeddingGeneration: 'generation-b' },
    });

    await service.processRefresh({
      workspaceId: 'workspace-1',
      userId: 'admin-1',
      generation: 'generation-a',
    });

    expect(queue.removeJobScheduler).not.toHaveBeenCalled();
    expect(embeddings.embed).not.toHaveBeenCalled();
  });

  it('includes recorded errors on a transient retry so the page is retried', async () => {
    const page = {
      id: 'page-1',
      title: 'Guide',
      textContent: 'authorized text',
      sourceHash: documentHash('Guide', 'authorized text'),
    };
    jest.spyOn(service as any, 'getIndexerContext').mockResolvedValue({
      userIsAdmin: true,
      config: activeConfig,
    });
    const findStale = jest
      .spyOn(service as any, 'findStalePageIds')
      .mockResolvedValue(['page-1']);
    jest.spyOn(service as any, 'readReadablePage').mockResolvedValue(page);
    jest.spyOn(service as any, 'recordPageError').mockResolvedValue(true);
    embeddings.embed.mockRejectedValue(new Error('provider detail must not escape'));

    await expect(
      service.processRefresh(
        {
          workspaceId: 'workspace-1',
          userId: 'admin-1',
          generation: 'generation-a',
        },
        { attemptsMade: 1 } as any,
      ),
    ).rejects.toThrow('Community document indexing failed');

    expect(findStale).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        userId: 'admin-1',
        generation: 'generation-a',
      }),
      activeConfig,
      true,
    );
    expect(service['recordPageError']).toHaveBeenCalledWith(
      expect.anything(),
      page,
      activeConfig,
      'embedding_failed',
    );
  });

  it('stops later batches when the workspace generation changes during indexing', async () => {
    const page = {
      id: 'page-1',
      title: 'Guide',
      textContent: 'x'.repeat(24_000),
      sourceHash: documentHash('Guide', 'x'.repeat(24_000)),
    };
    const pageChunks = chunkDocument(page.title, page.textContent);
    expect(pageChunks.length).toBeGreaterThan(16);

    jest.spyOn(service as any, 'getIndexerContext')
      .mockResolvedValueOnce({ userIsAdmin: true, config: activeConfig })
      .mockResolvedValueOnce({ userIsAdmin: true, config: activeConfig })
      .mockResolvedValueOnce({
        userIsAdmin: true,
        config: { ...activeConfig, embeddingGeneration: 'generation-b' },
      });
    jest.spyOn(service as any, 'findStalePageIds').mockResolvedValue(['page-1']);
    jest.spyOn(service as any, 'readReadablePage').mockResolvedValue(page);
    jest.spyOn(service as any, 'publishPage').mockResolvedValue(true);
    embeddings.embed.mockImplementation(async (_key: string, _model: string, inputs: string[]) =>
      inputs.map(() => Array(1536).fill(0.1)),
    );

    await service.processRefresh({
      workspaceId: 'workspace-1',
      userId: 'admin-1',
      generation: 'generation-a',
    });

    expect(embeddings.embed).toHaveBeenCalledTimes(1);
    expect((service as any).publishPage).not.toHaveBeenCalled();
  });

  it('discards provider results if the page is no longer readable at publish time', async () => {
    const page = {
      id: 'page-1',
      title: 'Guide',
      textContent: 'authorized text',
      sourceHash: documentHash('Guide', 'authorized text'),
    };
    jest.spyOn(service as any, 'getIndexerContext').mockResolvedValue({
      userIsAdmin: true,
      config: activeConfig,
    });
    jest.spyOn(service as any, 'findStalePageIds').mockResolvedValue(['page-1']);
    jest.spyOn(service as any, 'readReadablePage').mockResolvedValue(page);
    jest.spyOn(service as any, 'publishPage').mockResolvedValue(false);
    embeddings.embed.mockResolvedValue([Array(1536).fill(0.1)]);

    await service.processRefresh({
      workspaceId: 'workspace-1',
      userId: 'admin-1',
      generation: 'generation-a',
    });

    expect(embeddings.embed).toHaveBeenCalledTimes(1);
    expect((service as any).publishPage).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'workspace-1', userId: 'admin-1' }),
      expect.objectContaining({
        id: 'page-1',
        sourceHash: documentHash('Guide', 'authorized text'),
      }),
      expect.any(Array),
      activeConfig,
    );
  });
});
