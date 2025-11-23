import { CloudBreadcrumbLevelType } from '@common/enums';
import { CDNPathResolver } from '@common/helpers/cast.helper';
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsArray,
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
  @Transform(({ value }) => CDNPathResolver(value), { toClassOnly: true })
  Url: string;
}

export class CloudDirectoryModel {
  @Expose()
  @ApiProperty()
  Prefix: string;
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
  @ApiProperty()
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

export class CloudListRequestModel {
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

export class CloudKeyRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  Key: string;
}

export class CloudDeleteRequestModel {
  @ApiProperty()
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  Key: Array<string>;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  IsDirectory: boolean = false;
}

export class CloudCreateMultipartUploadRequestModel {
  @Expose()
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
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
  Key: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  UploadId: string;

  @ApiProperty({ type: CloudMultipartPartModel, isArray: true })
  @IsNotEmpty()
  Parts: Array<CloudMultipartPartModel>;
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
  @ApiProperty({ required: false })
  Metadata?: Record<string, string>;
}

export class CloudAbortMultipartUploadRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  Key: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  UploadId: string;
}

export class CloudMoveRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  SourceKey: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  DestinationKey: string;
}
