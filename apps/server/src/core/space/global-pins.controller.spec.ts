import { ForbiddenException } from '@nestjs/common';
import { GlobalPinsController } from './global-pins.controller';

describe('GlobalPinsController', () => {
  const workspace = { id: 'workspace-1' } as any;
  const user = { id: 'user-1' } as any;
  let controller: GlobalPinsController;
  let service: { list: jest.Mock; setPinned: jest.Mock };
  let workspaceAbility: { createForUser: jest.Mock };

  beforeEach(() => {
    service = {
      list: jest.fn().mockResolvedValue({ items: [] }),
      setPinned: jest.fn().mockResolvedValue({ success: true }),
    };
    workspaceAbility = {
      createForUser: jest
        .fn()
        .mockReturnValue({ cannot: jest.fn(() => false) }),
    };
    controller = new GlobalPinsController(
      service as any,
      workspaceAbility as any,
    );
  });

  it('lists only through the authenticated workspace and user scope', async () => {
    await controller.list(user, workspace);

    expect(service.list).toHaveBeenCalledWith(user.id, workspace.id);
  });

  it('rejects users without workspace settings permission before changing a pin', async () => {
    workspaceAbility.createForUser.mockReturnValue({
      cannot: jest.fn(() => true),
    });

    expect(() =>
      controller.setPinned(user, workspace, {
        spaceId: 'space-1',
        pinned: true,
      }),
    ).toThrow(ForbiddenException);
    expect(service.setPinned).not.toHaveBeenCalled();
  });

  it('passes pin and unpin requests to the scoped service', async () => {
    const dto = { spaceId: 'space-1', pinned: false };
    await controller.setPinned(user, workspace, dto);

    expect(service.setPinned).toHaveBeenCalledWith(
      user,
      workspace.id,
      dto.spaceId,
      dto.pinned,
    );
  });
});
