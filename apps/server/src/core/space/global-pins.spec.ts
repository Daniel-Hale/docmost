import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GlobalPinsService } from './global-pins.service';

describe('GlobalPinsService', () => {
  const user = { id: 'user-1' } as any;
  let db: any;
  let members: any;
  let ability: any;
  let service: GlobalPinsService;

  const query = (result: unknown) => {
    const builder: any = {};
    for (const method of [
      'select',
      'selectAll',
      'innerJoin',
      'where',
      'whereRef',
      'orderBy',
      'set',
      'returning',
    ]) {
      builder[method] = jest.fn(() => builder);
    }
    builder.executeTakeFirst = jest.fn().mockResolvedValue(result);
    builder.execute = jest.fn().mockResolvedValue(result);
    return builder;
  };

  beforeEach(() => {
    db = { selectFrom: jest.fn(), updateTable: jest.fn() };
    members = {
      getUserSpaceIdsQuery: jest.fn().mockReturnValue({ membership: true }),
    };
    ability = {
      createForUser: jest
        .fn()
        .mockResolvedValue({ cannot: jest.fn(() => false) }),
    };
    service = new GlobalPinsService(db, members, ability);
  });

  it('requires a live workspace space before changing its pin', async () => {
    db.selectFrom.mockReturnValueOnce(query(undefined));

    await expect(
      service.setPinned(user, 'workspace-1', 'space-1', false),
    ).rejects.toThrow('Company not found');
    expect(ability.createForUser).not.toHaveBeenCalled();
  });

  it('requires space settings permission as well as workspace settings permission', async () => {
    db.selectFrom.mockReturnValueOnce(query({ id: 'space-1' }));
    ability.createForUser.mockResolvedValue({ cannot: jest.fn(() => true) });

    await expect(
      service.setPinned(user, 'workspace-1', 'space-1', false),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not pin a Company unless it is already shared with Everyone', async () => {
    db.selectFrom
      .mockReturnValueOnce(query({ id: 'space-1' }))
      .mockReturnValueOnce(query(undefined));

    await expect(
      service.setPinned(user, 'workspace-1', 'space-1', true),
    ).rejects.toThrow(
      new BadRequestException(
        'Share this Company with the Everyone group before pinning it for all staff.',
      ),
    );
  });

  it('allows an existing space admin to unpin after Everyone membership is removed', async () => {
    db.selectFrom.mockReturnValueOnce(query({ id: 'space-1' }));
    db.updateTable.mockReturnValue(query({ id: 'space-1' }));

    await expect(
      service.setPinned(user, 'workspace-1', 'space-1', false),
    ).resolves.toEqual({ success: true });

    expect(db.selectFrom).toHaveBeenCalledTimes(1);
  });

  it('scopes the listing by workspace and membership query', async () => {
    const spacesQuery = query([]);
    db.selectFrom.mockReturnValue(spacesQuery);

    await service.list(user.id, 'workspace-1');

    expect(members.getUserSpaceIdsQuery).toHaveBeenCalledWith(user.id);
    expect(spacesQuery.where).toHaveBeenCalledWith('spaces.id', 'in', {
      membership: true,
    });
  });
});
