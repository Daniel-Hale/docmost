import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {Transform, TransformFnParams} from "class-transformer";

export class CreateSpaceDto {
  // Classification is set when the space is created, not inferred from its name.
  @IsOptional()
  @IsIn(['company', 'vendor'])
  category?: 'company' | 'vendor';

  @MinLength(2)
  @MaxLength(100)
  @IsString()
  @Transform(({ value }: TransformFnParams) => value?.trim())
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, {
    message:
      'Space slug must start with a letter or number and may contain hyphens and underscores',
  })
  slug: string;
}
