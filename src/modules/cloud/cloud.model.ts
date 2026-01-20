import { CloudBreadcrumbLevelType } from '@common/enums';
import { CDNPathResolver, S3KeyConverter } from '@common/helpers/cast.helper';
import { PaginationRequestModel } from '@common/models/pagination.model';
import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsArray,
  IsNumber,
  ValidateNested,
  MinLength,
  ValidateIf,
  Matches,
} from 'class-validator';

export class CloudBreadCrumbModel {
  @Expose()
  @ApiProperty()
  Name: string;

  @Expose()
  @ApiProperty()
  Path: string;

  @Expose()
  @ApiProperty({ enum: CloudBreadcrumbLevelType })
  Type: string;
}

export class CloudPathModel {
  @Expose()
  @ApiProperty()
  Host: string;

  @Expose()
  @ApiProperty()
  Key: string;

  @Expose()
  @ApiProperty()
  @Transform(({ value }) => CDNPathResolver(value), {
    toClassOnly: true,
  })
  Url: string;
}

export class CloudMetadataDefaultModel {
  @Expose()
  @ApiProperty()
  Originalfilename?: string;

  @Expose()
  @ApiProperty()
  Width?: string;

  @Expose()
  @ApiProperty()
  Height?: string;
}

export class CloudObjectModel {
  @Expose()
  @ApiProperty()
  Name: string;

  @Expose()
  @ApiProperty()
  Extension: string;

  @Expose()
  @ApiProperty()
  MimeType: string = 'application/octet-stream';

  @Expose()
  @ApiProperty({ type: CloudPathModel })
  @Type(() => CloudPathModel)
  Path: CloudPathModel;

  @Expose()
  @ApiProperty({ required: false, type: CloudMetadataDefaultModel })
  @Type(() => CloudMetadataDefaultModel)
  Metadata: Record<string, unknown>;

  @Expose()
  @ApiProperty()
  LastModified: string;

  @Expose()
  @ApiProperty()
  ETag: string;

  @Expose()
  @ApiProperty()
  Size: number;
}

export class CloudDirectoryModel {
  @Expose()
  @ApiProperty()
  Name: string;

  @Expose()
  @ApiProperty()
  Prefix: string;

  @Expose()
  @ApiProperty({ default: false })
  IsEncrypted?: boolean = false;

  @Expose()
  @ApiProperty({
    default: true,
    description: 'True if encrypted folder is locked (no valid session)',
  })
  IsLocked?: boolean = true;

  @Expose()
  @ApiProperty({ required: false, type: CloudObjectModel, isArray: true })
  @Type(() => CloudObjectModel)
  Thumbnails?: Array<CloudObjectModel> = [];
}

export class CloudViewModel {
  @Expose()
  @ApiProperty({ type: CloudBreadCrumbModel, isArray: true })
  @Type(() => CloudBreadCrumbModel)
  Breadcrumb: Array<CloudBreadCrumbModel>;

  @Expose()
  @ApiProperty({ type: CloudDirectoryModel, isArray: true })
  @Type(() => CloudDirectoryModel)
  Directories: Array<CloudDirectoryModel>;

  @Expose()
  @ApiProperty({ type: CloudObjectModel, isArray: true })
  @Type(() => CloudObjectModel)
  Contents: Array<CloudObjectModel>;
}

export class CloudListResponseModel extends CloudViewModel {}

export class CloudListRequestModel extends PaginationRequestModel {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  Path: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @Transform(({ obj }) => {
    return obj.Delimiter === 'true' ? true : false;
  })
  @IsOptional()
  Delimiter: boolean;

  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @Transform(({ obj }) => {
    return obj.IsMetadataProcessing === 'true' ? true : false;
  })
  @IsOptional()
  IsMetadataProcessing: boolean = true;
}

export class CloudListBreadcrumbRequestModel extends OmitType(
  CloudListRequestModel,
  ['IsMetadataProcessing'] as const,
) {}

export class CloudListDirectoriesRequestModel extends OmitType(
  CloudListRequestModel,
  ['IsMetadataProcessing'] as const,
) {}

export class CloudListObjectsRequestModel extends CloudListRequestModel {}

export class CloudKeyRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;
}

export class CloudRenameDirectoryRequestModel extends CloudKeyRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[^/]+$/, {
    message: 'Directory name cannot contain slashes',
  })
  @Transform(({ value }) => S3KeyConverter(value))
  Name: string;
}

export class CloudEncryptedFolderRenameRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Path: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Matches(/^[^/]+$/, {
    message: 'Directory name cannot contain slashes',
  })
  @Transform(({ value }) => S3KeyConverter(value))
  Name: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  Passphrase: string;
}

export class CloudPreSignedUrlRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  @ApiProperty({ required: false })
  @IsNumber()
  @IsOptional()
  ExpiresInSeconds?: number;
}

export class CloudDeleteModel {
  @ApiProperty()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  IsDirectory?: boolean;
}
export class CloudDeleteRequestModel {
  @ApiProperty({ type: CloudDeleteModel, isArray: true })
  @IsNotEmpty()
  @IsArray()
  @Type(() => CloudDeleteModel)
  @ValidateNested({ each: true })
  Items: Array<CloudDeleteModel>;
}

export class CloudCreateMultipartUploadRequestModel {
  @Expose()
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  @Expose()
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  ContentType?: string;

  @Expose()
  @ApiProperty({ required: false })
  @IsOptional()
  Metadata?: Record<string, string>;

  @Expose()
  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  TotalSize: number;
}

export class CloudCreateMultipartUploadResponseModel {
  @Expose()
  @ApiProperty()
  UploadId: string;

  @Expose()
  @ApiProperty()
  Key: string;
}

export class CloudGetMultipartPartUrlRequestModel {
  @Expose()
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  @Expose()
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  UploadId: string;

  @Expose()
  @ApiProperty()
  @IsNotEmpty()
  PartNumber: number;
}

export class CloudGetMultipartPartUrlResponseModel {
  @Expose()
  @ApiProperty()
  Url: string;

  @Expose()
  @ApiProperty()
  Expires: number;
}

export class CloudUploadPartRequestModel {
  @Expose()
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  @Expose()
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  UploadId: string;

  @Expose()
  @ApiProperty()
  @IsNotEmpty()
  PartNumber: number;

  @Expose()
  @ApiProperty({
    type: 'string',
    format: 'binary',
  })
  @IsOptional()
  File: Express.Multer.File;

  @Expose()
  @IsOptional()
  ContentMd5?: string;
}

export class CloudUploadPartResponseModel {
  @Expose()
  @ApiProperty()
  ETag: string;
}

export class CloudMultipartPartModel {
  @Expose()
  @ApiProperty()
  @IsNotEmpty()
  PartNumber: number;

  @Expose()
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  ETag: string;
}

export class CloudCompleteMultipartUploadRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  UploadId: string;

  @ApiProperty({ type: CloudMultipartPartModel, isArray: true })
  @IsNotEmpty()
  @IsArray()
  @Type(() => CloudMultipartPartModel)
  @ValidateNested({ each: true })
  Parts: Array<CloudMultipartPartModel>;
}

export class CloudExtractZipStartRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;
}

export class CloudExtractZipStartResponseModel {
  @Expose()
  @ApiProperty()
  JobId: string;
}

export class CloudExtractZipStatusRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  JobId: string;
}

export class CloudExtractZipStatusResponseModel {
  @Expose()
  @ApiProperty()
  JobId: string;

  @Expose()
  @ApiProperty()
  State: string;

  @Expose()
  @ApiProperty({ required: false, type: Object })
  Progress?: Record<string, unknown>;

  @Expose()
  @ApiProperty({ required: false })
  ExtractedPath?: string;

  @Expose()
  @ApiProperty({ required: false })
  FailedReason?: string;
}

export class CloudExtractZipCancelRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  JobId: string;
}

export class CloudExtractZipCancelResponseModel {
  @Expose()
  @ApiProperty()
  Cancelled: boolean;
}

export class CloudCompleteMultipartUploadResponseModel {
  @Expose()
  @ApiProperty()
  Location: string;

  @Expose()
  @ApiProperty()
  Key: string;

  @Expose()
  @ApiProperty()
  Bucket: string;

  @Expose()
  @ApiProperty()
  ETag: string;

  @Expose()
  @ApiProperty({ required: false, type: CloudMetadataDefaultModel })
  @IsOptional()
  @Type(() => CloudMetadataDefaultModel)
  Metadata?: Record<string, string>;
}

export class CloudUserStorageUsageResponseModel {
  @Expose()
  @ApiProperty()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  UsedStorageInBytes: number = 0;

  @Expose()
  @ApiProperty()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  MaxStorageInBytes: number = 0;

  @Expose()
  @ApiProperty()
  IsLimitExceeded: boolean = false;

  @Expose()
  @ApiProperty()
  UsagePercentage: number = 0;

  @Expose()
  @ApiProperty()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  MaxUploadSizeBytes: number = 0;
}

export class CloudScanStatusResponseModel {
  @Expose()
  @ApiProperty()
  Status: string;

  @Expose()
  @ApiProperty({ required: false })
  Reason?: string;

  @Expose()
  @ApiProperty({ required: false })
  Signature?: string;

  @Expose()
  @ApiProperty({ required: false })
  ScannedAt?: string;
}

export class CloudAbortMultipartUploadRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  UploadId: string;
}

export class CloudMoveRequestModel {
  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => value.map((v: string) => S3KeyConverter(v)))
  SourceKeys: Array<string>;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  DestinationKey: string;
}

export class CloudUpdateRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Key: string;

  // Only a filename (no slashes) is expected for Name. If provided, the object
  // will be renamed (within the same directory) to this name.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => S3KeyConverter(value))
  Name?: string;

  // Arbitrary metadata key/value pairs to replace for the object (optional)
  @ApiProperty({ required: false })
  @IsOptional()
  Metadata?: Record<string, string>;
}

export class CloudEncryptedFolderSummaryModel {
  @Expose()
  @ApiProperty()
  Path: string;

  @Expose()
  @ApiProperty()
  CreatedAt: string;

  @Expose()
  @ApiProperty()
  UpdatedAt: string;
}

export class CloudEncryptedFolderListResponseModel {
  @Expose()
  @ApiProperty({ type: CloudEncryptedFolderSummaryModel, isArray: true })
  @Type(() => CloudEncryptedFolderSummaryModel)
  Folders: CloudEncryptedFolderSummaryModel[];
}

export class CloudEncryptedFolderCreateRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  Path: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  Passphrase: string;
}

export class CloudEncryptedFolderConvertRequestModel extends CloudEncryptedFolderCreateRequestModel {}

export class CloudEncryptedFolderUnlockRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  Path: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  Passphrase: string;
}

export class CloudEncryptedFolderUnlockResponseModel {
  @Expose()
  @ApiProperty()
  Path: string;

  @Expose()
  @ApiProperty({
    description: 'Base64 encoded symmetric key for the folder',
  })
  FolderKey: string;
}

export class CloudEncryptedFolderDeleteRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  Path: string;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  ShouldDeleteContents?: boolean = false;

  @ApiProperty({
    required: false,
    description: 'Required when ShouldDeleteContents is true',
    minLength: 8,
  })
  @ValidateIf((o) => o.ShouldDeleteContents === true)
  @IsString()
  @MinLength(8)
  Passphrase?: string;
}

// ============================================================================
// DIRECTORIES API - Unified Directory Management
// ============================================================================

/**
 * Request model for creating a directory.
 * If IsEncrypted is true, passphrase must be provided via X-Folder-Passphrase header.
 */
export class DirectoryCreateRequestModel {
  @ApiProperty({ description: 'Directory path to create' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Path: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Create as encrypted directory',
  })
  @IsBoolean()
  @IsOptional()
  IsEncrypted?: boolean = false;
}

/**
 * Request model for renaming a directory.
 * For encrypted directories, passphrase must be provided via X-Folder-Passphrase header.
 */
export class DirectoryRenameRequestModel {
  @ApiProperty({ description: 'Current directory path' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Path: string;

  @ApiProperty({ description: 'New directory name (not full path)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[^/]+$/, {
    message: 'Directory name cannot contain slashes',
  })
  Name: string;
}

/**
 * Request model for deleting a directory.
 * For encrypted directories, passphrase must be provided via X-Folder-Passphrase header.
 */
export class DirectoryDeleteRequestModel {
  @ApiProperty({ description: 'Directory path to delete' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Path: string;
}

/**
 * Request model for unlocking an encrypted directory.
 * Creates a session token for subsequent requests.
 */
export class DirectoryUnlockRequestModel {
  @ApiProperty({ description: 'Encrypted directory path' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Path: string;
}

/**
 * Response model for directory unlock operation.
 */
export class DirectoryUnlockResponseModel {
  @Expose()
  @ApiProperty({ description: 'Directory path that was requested for unlock' })
  Path: string;

  @Expose()
  @ApiProperty({
    description:
      'The root encrypted folder path (parent folder that is actually encrypted)',
  })
  EncryptedFolderPath: string;

  @Expose()
  @ApiProperty({
    description:
      'Session token for subsequent requests. Pass via X-Folder-Session header.',
  })
  SessionToken: string;

  @Expose()
  @ApiProperty({
    description: 'Session expiration timestamp (Unix epoch in seconds)',
  })
  ExpiresAt: number;

  @Expose()
  @ApiProperty({ description: 'Session TTL in seconds' })
  TTL: number;
}

/**
 * Request model for locking an encrypted directory (invalidate session).
 */
export class DirectoryLockRequestModel {
  @ApiProperty({ description: 'Encrypted directory path to lock' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Path: string;
}

/**
 * Request model for converting an existing directory to encrypted.
 * Passphrase must be provided via X-Folder-Passphrase header.
 */
export class DirectoryConvertToEncryptedRequestModel {
  @ApiProperty({ description: 'Directory path to convert' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Path: string;
}

/**
 * Request model for decrypting an encrypted directory (remove encryption).
 * Passphrase must be provided via X-Folder-Passphrase header.
 */
export class DirectoryDecryptRequestModel {
  @ApiProperty({ description: 'Encrypted directory path to decrypt' })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => S3KeyConverter(value))
  Path: string;
}

/**
 * Response model for directory operations.
 */
export class DirectoryResponseModel {
  @Expose()
  @ApiProperty()
  Path: string;

  @Expose()
  @ApiProperty()
  IsEncrypted: boolean;

  @Expose()
  @ApiProperty({ required: false })
  CreatedAt?: string;

  @Expose()
  @ApiProperty({ required: false })
  UpdatedAt?: string;
}
