import {
  ConflictResolutionStrategy,
  DocumentLanguage,
  DocumentLockStatus,
  DocumentType,
} from '@common/enums';
import { S3KeyConverter } from '@common/helpers/cast.helper';
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsEnum,
} from 'class-validator';

// ============================================================================
// REQUEST MODELS
// ============================================================================

export class DocumentKeyRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;
}

export class DocumentCreateRequestModel {
  @ApiProperty({ description: 'Directory path (e.g., "documents/")' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Path: string;

  @ApiProperty({ description: 'Filename with extension (e.g., "readme.md")' })
  @IsString()
  @IsNotEmpty()
  Name: string;

  @ApiProperty({ required: false, description: 'Initial document content' })
  @IsString()
  @IsOptional()
  Content?: string;

  @ApiProperty({ required: false, enum: ConflictResolutionStrategy })
  @IsOptional()
  @IsEnum(ConflictResolutionStrategy)
  ConflictStrategy?: ConflictResolutionStrategy;
}

export class DocumentContentRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  @ApiProperty({
    required: false,
    description: 'If true and a draft exists, return draft content instead',
  })
  @IsBoolean()
  @IsOptional()
  @Transform(
    ({ obj }) => obj.IncludeDraft === 'true' || obj.IncludeDraft === true,
  )
  IncludeDraft?: boolean;
}

export class DocumentUpdateContentRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  @ApiProperty({ description: 'Full document content' })
  @IsString()
  Content: string;

  @ApiProperty({
    required: false,
    description:
      'SHA-256 hash of the content the client last read. If provided, the server will reject updates where the current content has changed (optimistic concurrency).',
  })
  @IsString()
  @IsOptional()
  ExpectedContentHash?: string;
}

export class DocumentDraftRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  @ApiProperty({ description: 'Draft document content' })
  @IsString()
  Content: string;
}

export class DocumentDiffRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  @ApiProperty({
    description:
      'Source version ID. Use "current" for the current live version.',
  })
  @IsString()
  @IsNotEmpty()
  SourceVersionId: string;

  @ApiProperty({ description: 'Target version ID to compare against' })
  @IsString()
  @IsNotEmpty()
  TargetVersionId: string;
}

export class DocumentRestoreVersionRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  @ApiProperty({ description: 'Version ID to restore' })
  @IsString()
  @IsNotEmpty()
  VersionId: string;
}

export class DocumentDeleteVersionRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  @ApiProperty({ description: 'Version ID to delete' })
  @IsString()
  @IsNotEmpty()
  VersionId: string;
}

// ============================================================================
// RESPONSE MODELS
// ============================================================================

export class DocumentResponseModel {
  @Expose()
  @ApiProperty()
  Key: string;

  @Expose()
  @ApiProperty()
  Name: string;

  @Expose()
  @ApiProperty()
  Extension: string;

  @Expose()
  @ApiProperty({ enum: DocumentType })
  Type: DocumentType;

  @Expose()
  @ApiProperty({ enum: DocumentLanguage })
  Language: DocumentLanguage;

  @Expose()
  @ApiProperty()
  MimeType: string;

  @Expose()
  @ApiProperty()
  @Transform(({ value }) => Number(value))
  SizeInBytes: number;

  @Expose()
  @ApiProperty()
  LineCount: number;

  @Expose()
  @ApiProperty()
  CharacterCount: number;

  @Expose()
  @ApiProperty()
  EditCount: number;

  @Expose()
  @ApiProperty()
  CreatedBy: string;

  @Expose()
  @ApiProperty()
  LastEditedBy: string;

  @Expose()
  @ApiProperty()
  HasDraft: boolean;

  @Expose()
  @ApiProperty()
  ContentHash: string;

  @Expose()
  @ApiProperty()
  LastModified: string;

  @Expose()
  @ApiProperty({ enum: DocumentLockStatus })
  LockStatus: DocumentLockStatus;

  @Expose()
  @ApiProperty({ required: false })
  LockedBy?: string;
}

export class DocumentContentResponseModel {
  @Expose()
  @ApiProperty()
  Content: string;

  @Expose()
  @ApiProperty()
  Key: string;

  @Expose()
  @ApiProperty()
  ContentHash: string;

  @Expose()
  @ApiProperty()
  @Transform(({ value }) => Number(value))
  SizeInBytes: number;

  @Expose()
  @ApiProperty()
  LineCount: number;

  @Expose()
  @ApiProperty()
  CharacterCount: number;

  @Expose()
  @ApiProperty()
  IsDraft: boolean;

  @Expose()
  @ApiProperty()
  LastModified: string;

  @Expose()
  @ApiProperty({ enum: DocumentLockStatus })
  LockStatus: DocumentLockStatus;

  @Expose()
  @ApiProperty({ required: false })
  LockedBy?: string;

  @Expose()
  @ApiProperty({ required: false })
  LockExpiresAt?: number;
}

export class DocumentLockResponseModel {
  @Expose()
  @ApiProperty()
  Key: string;

  @Expose()
  @ApiProperty({ enum: DocumentLockStatus })
  LockStatus: DocumentLockStatus;

  @Expose()
  @ApiProperty()
  LockedBy: string;

  @Expose()
  @ApiProperty()
  LockedByName: string;

  @Expose()
  @ApiProperty({ description: 'Unix epoch seconds when lock expires' })
  ExpiresAt: number;

  @Expose()
  @ApiProperty({ description: 'Seconds remaining until lock expires' })
  TTL: number;
}

export class DocumentDraftResponseModel {
  @Expose()
  @ApiProperty()
  Key: string;

  @Expose()
  @ApiProperty()
  SavedAt: string;

  @Expose()
  @ApiProperty()
  @Transform(({ value }) => Number(value))
  SizeInBytes: number;

  @Expose()
  @ApiProperty({ required: false })
  NextAllowedSaveAt?: string;
}

export class DocumentDiffHunkModel {
  @Expose()
  @ApiProperty()
  OldStart: number;

  @Expose()
  @ApiProperty()
  OldLines: number;

  @Expose()
  @ApiProperty()
  NewStart: number;

  @Expose()
  @ApiProperty()
  NewLines: number;

  @Expose()
  @ApiProperty({ type: [String] })
  Lines: string[];
}

export class DocumentDiffStatsModel {
  @Expose()
  @ApiProperty()
  Additions: number;

  @Expose()
  @ApiProperty()
  Deletions: number;

  @Expose()
  @ApiProperty()
  Changes: number;
}

export class DocumentDiffResponseModel {
  @Expose()
  @ApiProperty()
  Key: string;

  @Expose()
  @ApiProperty()
  SourceVersionId: string;

  @Expose()
  @ApiProperty()
  TargetVersionId: string;

  @Expose()
  @ApiProperty({ type: DocumentDiffHunkModel, isArray: true })
  @Type(() => DocumentDiffHunkModel)
  Hunks: DocumentDiffHunkModel[];

  @Expose()
  @ApiProperty({ type: DocumentDiffStatsModel })
  @Type(() => DocumentDiffStatsModel)
  Stats: DocumentDiffStatsModel;
}
