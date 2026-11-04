import 'reflect-metadata';
import { CommunityAiController } from './community-ai.controller';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import { UserRole } from '../../common/helpers/types/permission';
import { REQUIRE_SESSION_AUTH_KEY } from '../../common/decorators/require-session-auth.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('Community AI configuration authorization', () => {
  const workspace = { id: 'authenticated-workspace' } as any;
  let controller: CommunityAiController;
  let ai: any;
  beforeEach(() => {
    ai = {
      updateSettings: jest.fn(),
      generate: jest.fn(),
      settings: jest.fn(),
    };
    controller = new CommunityAiController(
      ai,
      new WorkspaceAbilityFactory(),
      { search: jest.fn() } as any,
      { configure: jest.fn(), status: jest.fn(), refresh: jest.fn() } as any,
    );
  });
  it('requires interactive JWT authentication on all routes', () => {
    expect(
      Reflect.getMetadata(REQUIRE_SESSION_AUTH_KEY, CommunityAiController),
    ).toBe(true);
    expect(Reflect.getMetadata('__guards__', CommunityAiController)).toContain(
      JwtAuthGuard,
    );
  });
  it('rejects ordinary members from changing provider settings', () => {
    expect(() =>
      controller.settings({ role: UserRole.MEMBER } as any, workspace, {
        enabled: false,
        model: 'test',
      }),
    ).toThrow();
    expect(ai.updateSettings).not.toHaveBeenCalled();
  });
  it.each([UserRole.ADMIN, UserRole.OWNER])(
    'allows %s settings for the authenticated workspace only',
    (role) => {
      controller.settings({ role, id: 'admin-user' } as any, workspace, {
        enabled: false,
        model: 'test',
        workspaceId: 'injected',
      } as any);
      expect(ai.updateSettings).toHaveBeenCalledWith(
        'authenticated-workspace',
        expect.objectContaining({ model: 'test' }),
        'admin-user',
      );
    },
  );
  it('rejects ordinary members from indexing and index-status metadata', () => {
    const member = { id: 'member', role: UserRole.MEMBER } as any;
    expect(() => controller.indexRefresh(member, workspace)).toThrow();
    expect(() => controller.indexStatus(member, workspace)).toThrow();
  });
  it('does not take the tenant or identity from the generation body', () => {
    const dto = {
      mode: 'ask',
      input: 'vendor',
      workspaceId: 'injected',
      userId: 'injected',
    } as any;
    controller.generate({ id: 'authenticated-user' } as any, workspace, dto);
    expect(ai.generate).toHaveBeenCalledWith(
      'authenticated-workspace',
      'authenticated-user',
      dto,
    );
  });
});
