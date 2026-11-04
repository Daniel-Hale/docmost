import { IsIn, IsOptional } from 'class-validator';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

/**
 * Neveco category is a server-side, membership-scoped search filter.
 * Missing category retains the existing unfiltered Docmost API behaviour.
 */
export class NevecoSpaceListDto extends PaginationOptions {
  @IsOptional()
  @IsIn(['company', 'vendor'])
  category?: 'company' | 'vendor';
}
