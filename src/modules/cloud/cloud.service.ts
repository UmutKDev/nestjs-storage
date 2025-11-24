import {
  _Object,
  AbortMultipartUploadCommand,
  CommonPrefix,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectAws } from 'aws-sdk-v3-nest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { Readable } from 'stream';
import {
  CloudAbortMultipartUploadRequestModel,
  CloudBreadCrumbModel,
  CloudCompleteMultipartUploadRequestModel,
  CloudCompleteMultipartUploadResponseModel,
  CloudCreateMultipartUploadRequestModel,
  CloudCreateMultipartUploadResponseModel,
  CloudKeyRequestModel,
  CloudGetMultipartPartUrlRequestModel,
  CloudGetMultipartPartUrlResponseModel,
  CloudListRequestModel,
  CloudListResponseModel,
  CloudObjectModel,
  CloudDeleteRequestModel,
  CloudMoveRequestModel,
  CloudDirectoryModel,
  CloudListDirectoriesRequestModel,
  CloudListBreadcrumbRequestModel,
  CloudUploadPartRequestModel,
  CloudUploadPartResponseModel,
} from './cloud.model';
import { plainToInstance } from 'class-transformer';
import { IsImageFile, KeyCombiner } from '@common/helpers/cast.helper';
import { CloudBreadcrumbLevelType } from '@common/enums';

@Injectable()
export class CloudService {
  private readonly logger = new Logger(CloudService.name);
  private readonly NotFoundErrorCodes = ['NoSuchKey', 'NotFound'];
  private readonly MaxProcessMetadataObjects = 1000;
  private readonly MaxListObjects = 1000;
  private readonly MaxObjectSizeBytes = 50 * 1024 * 1024; // 50 MB
  private readonly PresignedUrlExpirySeconds = 3600; // 1 hour
  private readonly MinMultipartUploadSizeBytes = 5 * 1024 * 1024; // 5 MB
  private readonly MaxMultipartUploadSizeBytes = 5 * 1024 * 1024 * 1024; // 5 GB
  private readonly EmptyFolderPlaceholder = '.emptyFolderPlaceholder';
  private readonly IsDirectory = (key: string) =>
    key.includes(this.EmptyFolderPlaceholder);
  private Prefix = null;

  constructor(@InjectAws(S3Client) private readonly s3: S3Client) {}

  async List(
    { Path, Delimiter, IsMetadataProcessing }: CloudListRequestModel,
    User: UserContext,
  ): Promise<CloudListResponseModel> {
    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';
    let prefix = KeyCombiner([User.id, cleanedPath]);
    if (!prefix.endsWith('/')) {
      prefix = prefix + '/';
    }
    this.Prefix = prefix;

    const command = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.STORAGE_S3_BUCKET,
        MaxKeys: this.MaxListObjects,
        Delimiter: Delimiter ? '/' : undefined,
        Prefix: this.Prefix,
      }),
    );

    const [Breadcrumb, Directories, Contents] = await Promise.all([
      this.ProcessBreadcrumb(Path || '', Delimiter),
      this.ProcessDirectories(command.CommonPrefixes ?? [], this.Prefix),
      this.ProcessObjects(command.Contents ?? [], IsMetadataProcessing, User),
    ]);

    return plainToInstance(CloudListResponseModel, {
      Breadcrumb,
      Directories,
      Contents,
    });
  }

  async ListBreadcrumb({
    Path,
    Delimiter,
  }: CloudListBreadcrumbRequestModel): Promise<CloudBreadCrumbModel[]> {
    return this.ProcessBreadcrumb(Path || '', Delimiter);
  }

  async ListDirectories(
    { Path, Delimiter }: CloudListDirectoriesRequestModel,
    User: UserContext,
  ): Promise<CloudDirectoryModel[]> {
    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';
    let prefix = KeyCombiner([User.id, cleanedPath]);
    if (!prefix.endsWith('/')) {
      prefix = prefix + '/';
    }
    this.Prefix = prefix;

    const command = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.STORAGE_S3_BUCKET,
        MaxKeys: this.MaxListObjects,
        Delimiter: Delimiter ? '/' : undefined,
        Prefix: this.Prefix,
      }),
    );

    return this.ProcessDirectories(command.CommonPrefixes ?? [], this.Prefix);
  }

  async ListObjects(
    { Path, Delimiter, IsMetadataProcessing }: CloudListRequestModel,
    User: UserContext,
  ): Promise<CloudObjectModel[]> {
    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';
    let prefix = KeyCombiner([User.id, cleanedPath]);
    if (!prefix.endsWith('/')) {
      prefix = prefix + '/';
    }
    this.Prefix = prefix;

    const command = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.STORAGE_S3_BUCKET,
        MaxKeys: this.MaxListObjects,
        Delimiter: Delimiter ? '/' : undefined,
        Prefix: this.Prefix,
      }),
    );

    return this.ProcessObjects(
      command.Contents ?? [],
      IsMetadataProcessing,
      User,
    );
  }

  async Find(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<CloudObjectModel> {
    try {
      const command = await this.s3.send(
        new HeadObjectCommand({
          Bucket: process.env.STORAGE_S3_BUCKET,
          Key: KeyCombiner([User.id, Key]),
        }),
      );

      return plainToInstance(CloudObjectModel, {
        Name: Key?.split('/').pop(),
        Extension: Key?.includes('.') ? Key.split('.').pop() : undefined,
        MimeType: command.ContentType,
        Path: {
          Host: process.env.STORAGE_S3_PUBLIC_ENDPOINT,
          Key: Key.replace('' + User.id + '/', ''),
          Url: Key,
        },
        Metadata: command.Metadata,
        Size: command.ContentLength,
        ETag: command.ETag,
        LastModified: command.LastModified
          ? command.LastModified.toISOString()
          : '',
      });
    } catch (error) {
      if (this.NotFoundErrorCodes.includes(error.name)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }

  async GetPresignedUrl(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<string> {
    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: process.env.STORAGE_S3_BUCKET,
          Key: KeyCombiner([User.id, Key]),
        }),
      );

      const command = new GetObjectCommand({
        Bucket: process.env.STORAGE_S3_BUCKET,
        Key: KeyCombiner([User.id, Key]),
      });

      const url = await getSignedUrl(this.s3, command, {
        expiresIn: this.PresignedUrlExpirySeconds,
      });

      return url;
    } catch (error) {
      if (this.NotFoundErrorCodes.includes(error.name)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }

  async GetObjectStream(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<ReadableStream> {
    try {
      const command = await this.s3.send(
        new GetObjectCommand({
          Bucket: process.env.STORAGE_S3_BUCKET,
          Key: KeyCombiner([User.id, Key]),
        }),
      );
      return command.Body.transformToWebStream();
    } catch (error) {
      if (this.NotFoundErrorCodes.includes(error.name)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }

  private async ProcessBreadcrumb(
    Path: string,
    Delimiter: boolean = false,
  ): Promise<CloudBreadCrumbModel[]> {
    const breadcrumb: CloudBreadCrumbModel[] = Delimiter
      ? [
          {
            Name: 'root',
            Path: '/',
            Type: CloudBreadcrumbLevelType.ROOT,
          },
        ]
      : [];

    const cleanPath = (Path || '').replace(/^\/+|\/+$/g, '');

    if (!cleanPath) {
      return breadcrumb;
    }

    const parts = cleanPath.split('/');
    let accumulatedPath = '';

    for (const part of parts) {
      accumulatedPath += `/${part}`;
      breadcrumb.push({
        Name: part,
        Path: accumulatedPath,
        Type: CloudBreadcrumbLevelType.SUBFOLDER,
      });
    }

    return breadcrumb;
  }

  private async ProcessDirectories(
    CommonPrefixes: CommonPrefix[],
    Prefix: string,
  ): Promise<CloudDirectoryModel[]> {
    if (CommonPrefixes.length === 0) {
      return [];
    }

    const directories: CloudDirectoryModel[] = [];
    for (const commonPrefix of CommonPrefixes) {
      if (commonPrefix.Prefix) {
        const dirName = commonPrefix.Prefix.replace(Prefix, '').replace(
          '/',
          '',
        );
        directories.push({
          Prefix: dirName,
        });
      }
    }
    return directories;
  }

  private async ProcessObjects(
    Contents: _Object[],
    IsMetadataProcessing = false,
    User: UserContext,
  ): Promise<CloudObjectModel[]> {
    if (Contents.length === 0) {
      return [];
    }

    if (Contents.length > this.MaxProcessMetadataObjects) {
      Contents = Contents.slice(0, this.MaxProcessMetadataObjects);
    }

    Contents = Contents.filter((c) => c.Key !== undefined);
    Contents = Contents.filter((c) => !this.IsDirectory(c.Key || ''));
    const processedContents: CloudObjectModel[] = [];
    for (const content of Contents) {
      let metadata: Partial<HeadObjectCommandOutput> = {};

      if (IsMetadataProcessing) {
        metadata = await this.s3.send(
          new HeadObjectCommand({
            Bucket: process.env.STORAGE_S3_BUCKET,
            Key: content.Key,
          }),
        );
      }

      processedContents.push({
        Name: content.Key?.split('/').pop(),
        Extension: content.Key?.includes('.')
          ? content.Key.split('.').pop()
          : undefined,
        MimeType: metadata.ContentType,
        Path: {
          Host: process.env.STORAGE_S3_PUBLIC_ENDPOINT,
          Key: content.Key.replace('' + User.id + '/', ''),
          Url: content.Key,
        },
        Metadata: metadata.Metadata,
        Size: content.Size,
        ETag: content.ETag,
        LastModified: content.LastModified
          ? content.LastModified.toISOString()
          : '',
      });
    }
    return processedContents;
  }

  async Move(
    { SourceKey, DestinationKey }: CloudMoveRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    try {
      const copySource = `${process.env.STORAGE_S3_BUCKET}/${SourceKey}`;

      await this.s3.send(
        new CopyObjectCommand({
          Bucket: process.env.STORAGE_S3_BUCKET,
          CopySource: copySource,
          Key: KeyCombiner([User.id, DestinationKey]),
        }),
      );

      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.STORAGE_S3_BUCKET,
          Key: KeyCombiner([User.id, SourceKey]),
        }),
      );
    } catch (error) {
      if (this.NotFoundErrorCodes.includes(error.name)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
    return true;
  }

  async Delete(
    { Key, IsDirectory }: CloudDeleteRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    try {
      for await (const key of Key) {
        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.STORAGE_S3_BUCKET,
            Key: KeyCombiner([
              User.id,
              key + (IsDirectory ? '/' + this.EmptyFolderPlaceholder : ''),
            ]),
          }),
        );
      }
    } catch (error) {
      if (this.NotFoundErrorCodes.includes(error.name)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
    return true;
  }

  async CreateDirectory(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    const directoryKey =
      Key.replace(/^\/+|\/+$/g, '') + '/' + this.EmptyFolderPlaceholder;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: process.env.STORAGE_S3_BUCKET,
        Key: KeyCombiner([User.id, directoryKey]),
        Body: '',
      }),
    );
    return true;
  }

  async UploadCreateMultipartUpload(
    { Key, ContentType, Metadata }: CloudCreateMultipartUploadRequestModel,
    User: UserContext,
  ): Promise<CloudCreateMultipartUploadResponseModel> {
    const command = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: process.env.STORAGE_S3_BUCKET,
        Key: KeyCombiner([User.id, Key]),
        ContentType: ContentType,
        Metadata: Metadata,
      }),
    );

    return plainToInstance(CloudCreateMultipartUploadResponseModel, {
      UploadId: command.UploadId,
      Key: command.Key.replace('' + User.id + '/', ''),
    });
  }

  async UploadGetMultipartPartUrl(
    { Key, UploadId, PartNumber }: CloudGetMultipartPartUrlRequestModel,
    User: UserContext,
  ): Promise<CloudGetMultipartPartUrlResponseModel> {
    const command = new UploadPartCommand({
      Bucket: process.env.STORAGE_S3_BUCKET,
      Key: KeyCombiner([User.id, Key]),
      UploadId: UploadId,
      PartNumber: PartNumber,
    });

    const url = await getSignedUrl(this.s3, command, {
      expiresIn: this.PresignedUrlExpirySeconds,
    });

    return plainToInstance(CloudGetMultipartPartUrlResponseModel, {
      Url: url,
      Expires: this.PresignedUrlExpirySeconds,
    });
  }

  async UploadPart(
    { Key, UploadId, PartNumber }: CloudUploadPartRequestModel,
    file: Express.Multer.File,
    User: UserContext,
  ): Promise<CloudUploadPartResponseModel> {
    const command = new UploadPartCommand({
      Bucket: process.env.STORAGE_S3_BUCKET,
      Key: KeyCombiner([User.id, Key]),
      UploadId: UploadId,
      PartNumber: PartNumber,
      Body: file.buffer,
    });

    const result = await this.s3.send(command);

    return plainToInstance(CloudUploadPartResponseModel, {
      ETag: result.ETag,
    });
  }

  async UploadCompleteMultipartUpload(
    { Key, UploadId, Parts }: CloudCompleteMultipartUploadRequestModel,
    User: UserContext,
  ): Promise<CloudCompleteMultipartUploadResponseModel> {
    const command = await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: process.env.STORAGE_S3_BUCKET,
        Key: KeyCombiner([User.id, Key]),
        UploadId: UploadId,
        MultipartUpload: {
          Parts: Parts,
        },
      }),
    );

    let metadata = {};
    if (IsImageFile(Key)) {
      metadata = await this.ProcessImageMetadata(KeyCombiner([User.id, Key]));
    }

    return plainToInstance(CloudCompleteMultipartUploadResponseModel, {
      Location: command.Location,
      Key: command.Key.replace('' + User.id + '/', ''),
      Bucket: command.Bucket,
      ETag: command.ETag,
      Metadata: metadata,
    });
  }

  private async ProcessImageMetadata(
    key: string,
  ): Promise<Record<string, string>> {
    try {
      const getObjectCommand = new GetObjectCommand({
        Bucket: process.env.STORAGE_S3_BUCKET,
        Key: key,
      });
      const object = await this.s3.send(getObjectCommand);

      const existingMetadata = object.Metadata || {};

      const stream = object.Body as Readable;
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      const metadata = await sharp(buffer).metadata();

      if (metadata.width && metadata.height) {
        const newMetadata = {
          ...existingMetadata,
          width: metadata.width.toString(),
          height: metadata.height.toString(),
        };

        const copySource = `${process.env.STORAGE_S3_BUCKET}/${key}`;

        await this.s3.send(
          new PutObjectCommand({
            Bucket: process.env.STORAGE_S3_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: object.ContentType,
            Metadata: newMetadata,
          }),
        );

        await this.s3.send(
          new CopyObjectCommand({
            Bucket: process.env.STORAGE_S3_BUCKET,
            CopySource: copySource,
            Key: key,
            Metadata: newMetadata,
            MetadataDirective: 'REPLACE',
            ContentType: object.ContentType,
          }),
        );

        return newMetadata;
      } else {
        this.logger.warn('Sharp did not return width/height', metadata);
      }
      return existingMetadata;
    } catch (error) {
      this.logger.error(
        `Failed to process image metadata for key ${key}:`,
        error,
      );
      return {};
    }
  }

  async UploadAbortMultipartUpload(
    { Key, UploadId }: CloudAbortMultipartUploadRequestModel,
    User: UserContext,
  ): Promise<void> {
    await this.s3.send(
      new AbortMultipartUploadCommand({
        Bucket: process.env.STORAGE_S3_BUCKET,
        Key: KeyCombiner([User.id, Key]),
        UploadId: UploadId,
      }),
    );
  }
}
