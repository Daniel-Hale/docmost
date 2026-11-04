import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SearchController } from './search.controller';

describe('SearchController public-space-search gate', () => {
  function makeController(overrides: any = {}) {
    const searchService = { searchPage: jest.fn().mockResolvedValue([]) };
    const spaceAbility = {
      createForUser: jest.fn().mockResolvedValue({ cannot: () => false }),
    };
    const communitySearch = {
      isSemanticEnabled: jest.fn().mockResolvedValue(false),
      searchPages: jest.fn().mockResolvedValue([]),
    };
    const environmentService = {
      getSearchDriver: jest.fn().mockReturnValue('postgres'),
    };
    const publicSpaceService = {
      getPublicSpace: jest
        .fn()
        .mockRejectedValue(new NotFoundException('Space not found')),
      ...overrides.publicSpaceService,
    };
    const pageRepo = {
      getSpacePagesExcludingRestricted: jest
        .fn()
        .mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]),
    };
    const controller = new SearchController(
      searchService as any,
      {} as any,
      environmentService as any,
      publicSpaceService as any,
      pageRepo as any,
      {} as any,
      communitySearch as any,
    );
    return {
      controller,
      searchService,
      spaceAbility,
      publicSpaceService,
      pageRepo,
      communitySearch,
    };
  }

  const workspace = { id: 'ws1' } as any;

  it('does not read pages or search when the public space gate rejects', async () => {
    const { controller, searchService, pageRepo } = makeController();
    await expect(
      controller.searchPublicSpace(
        { query: 'roadmap', spaceSlug: 'handbook' } as any,
        workspace,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(pageRepo.getSpacePagesExcludingRestricted).not.toHaveBeenCalled();
    expect(searchService.searchPage).not.toHaveBeenCalled();
  });

  it('searches only the unrestricted pages of the gated space, ignoring client filters', async () => {
    const { controller, searchService, publicSpaceService, pageRepo } =
      makeController({
        publicSpaceService: {
          getPublicSpace: jest
            .fn()
            .mockResolvedValue({ space: { id: 's1' }, publicSpace: {} }),
        },
      });
    await controller.searchPublicSpace(
      {
        query: 'roadmap',
        spaceSlug: 'handbook',
        spaceId: 'attacker-space',
        shareId: 'share1',
        creatorId: 'u1',
        labelIds: ['l1'],
      } as any,
      workspace,
    );
    expect(publicSpaceService.getPublicSpace).toHaveBeenCalledWith(
      'handbook',
      workspace,
    );
    expect(pageRepo.getSpacePagesExcludingRestricted).toHaveBeenCalledWith(
      's1',
    );
    expect(searchService.searchPage).toHaveBeenCalledWith(
      { query: 'roadmap', spaceSlug: 'handbook' },
      { workspaceId: 'ws1', publicPageIds: ['p1', 'p2'] },
    );
  });

  it('keeps public-space search on the legacy path', async () => {
    const { controller, communitySearch, searchService } = makeController({
      publicSpaceService: {
        getPublicSpace: jest
          .fn()
          .mockResolvedValue({ space: { id: 's1' }, publicSpace: {} }),
      },
    });
    await controller.searchPublicSpace(
      { query: 'roadmap', spaceSlug: 'handbook' } as any,
      workspace,
    );
    expect(communitySearch.isSemanticEnabled).not.toHaveBeenCalled();
    expect(communitySearch.searchPages).not.toHaveBeenCalled();
    expect(searchService.searchPage).toHaveBeenCalled();
  });
});

describe('SearchController authenticated semantic search', () => {
  const user = { id: 'u1' } as any;
  const workspace = { id: 'ws1' } as any;

  function makeController({
    semanticEnabled = false,
    cannotRead = false,
  } = {}) {
    const searchService = {
      searchPage: jest.fn().mockResolvedValue(['legacy']),
    };
    const spaceAbility = {
      createForUser: jest.fn().mockResolvedValue({ cannot: () => cannotRead }),
    };
    const environmentService = {
      getSearchDriver: jest.fn().mockReturnValue('postgres'),
    };
    const communitySearch = {
      isSemanticEnabled: jest.fn().mockResolvedValue(semanticEnabled),
      searchPages: jest.fn().mockResolvedValue(['semantic']),
    };
    const controller = new SearchController(
      searchService as any,
      spaceAbility as any,
      environmentService as any,
      {} as any,
      {} as any,
      {} as any,
      communitySearch as any,
    );
    return { controller, searchService, spaceAbility, communitySearch };
  }

  it('uses semantic search with creator and label filters after access checks', async () => {
    const { controller, spaceAbility, communitySearch, searchService } =
      makeController({ semanticEnabled: true });
    const dto = {
      query: 'onboarding',
      spaceId: 's1',
      creatorId: 'u2',
      labelIds: ['l1', 'l2'],
    } as any;

    await expect(controller.pageSearch(dto, user, workspace)).resolves.toEqual([
      'semantic',
    ]);

    expect(spaceAbility.createForUser).toHaveBeenCalledWith(user, 's1');
    expect(communitySearch.isSemanticEnabled).toHaveBeenCalledWith('ws1');
    expect(communitySearch.searchPages).toHaveBeenCalledWith('ws1', 'u1', dto);
    expect(searchService.searchPage).not.toHaveBeenCalled();
  });

  it.each([
    ['semantic search is disabled', false, false],
    ['title-only search bypasses semantic search', true, true],
  ])(
    '%s and preserves the legacy search path',
    async (_name, enabled, titleOnly) => {
      const { controller, communitySearch, searchService } = makeController({
        semanticEnabled: enabled as boolean,
      });
      const dto = { query: 'welcome', titleOnly } as any;

      await expect(
        controller.pageSearch(dto, user, workspace),
      ).resolves.toEqual(['legacy']);

      expect(searchService.searchPage).toHaveBeenCalledWith(dto, {
        userId: 'u1',
        workspaceId: 'ws1',
      });
      if (titleOnly) {
        expect(communitySearch.isSemanticEnabled).not.toHaveBeenCalled();
      } else {
        expect(communitySearch.isSemanticEnabled).toHaveBeenCalledWith('ws1');
      }
      expect(communitySearch.searchPages).not.toHaveBeenCalled();
    },
  );

  it('never calls semantic search after a space CASL denial', async () => {
    const { controller, communitySearch, spaceAbility, searchService } =
      makeController({ semanticEnabled: true, cannotRead: true });

    await expect(
      controller.pageSearch(
        { query: 'secret', spaceId: 'private-space' } as any,
        user,
        workspace,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(spaceAbility.createForUser).toHaveBeenCalledWith(
      user,
      'private-space',
    );
    expect(communitySearch.isSemanticEnabled).not.toHaveBeenCalled();
    expect(communitySearch.searchPages).not.toHaveBeenCalled();
    expect(searchService.searchPage).not.toHaveBeenCalled();
  });

  it('never calls semantic search from anonymous share search', async () => {
    const { controller, communitySearch, searchService } = makeController({
      semanticEnabled: true,
    });

    await controller.searchShare(
      { query: 'release notes', shareId: 'sh1' } as any,
      workspace,
    );

    expect(communitySearch.isSemanticEnabled).not.toHaveBeenCalled();
    expect(communitySearch.searchPages).not.toHaveBeenCalled();
    expect(searchService.searchPage).toHaveBeenCalledWith(
      { query: 'release notes', shareId: 'sh1' },
      { workspaceId: 'ws1' },
    );
  });
});
