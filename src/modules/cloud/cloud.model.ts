import { CDNPathResolver } from '@common/helpers/cast.helper';
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { IsString, IsNotEmpty } from 'class-validator';

export class CloudBreadCrumbModel {}

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

export class CloudFindRequestModel {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  Key: string;
}
