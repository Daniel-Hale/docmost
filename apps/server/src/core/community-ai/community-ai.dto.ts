import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { EMBEDDING_MODELS } from './community-embeddings';

export class CommunityAiSettingsDto {
  @IsBoolean()
  enabled: boolean;

  @IsString()
  @Matches(/^[a-zA-Z0-9._:-]{1,100}$/)
  model: string;

  @IsOptional()
  @IsString()
  @Length(20, 512)
  @Matches(/^\S+$/)
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  removeKey?: boolean;

  @IsOptional()
  @IsBoolean()
  semanticEnabled?: boolean;

  @IsOptional()
  @IsIn(EMBEDDING_MODELS)
  embeddingModel?: string;
}

export class CommunitySearchDto {
  @IsString()
  @Length(1, 2000)
  query: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;
}

export class CommunityAiGenerateDto {
  @IsIn(['ask', 'summarize', 'improve', 'draft'])
  mode: 'ask' | 'summarize' | 'improve' | 'draft';

  @IsString()
  @Length(1, 12000)
  input: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;
}
