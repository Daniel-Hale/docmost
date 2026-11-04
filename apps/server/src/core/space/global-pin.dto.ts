import { IsBoolean, IsUUID } from 'class-validator';

export class GlobalPinDto {
  @IsUUID()
  spaceId: string;

  @IsBoolean()
  pinned: boolean;
}
