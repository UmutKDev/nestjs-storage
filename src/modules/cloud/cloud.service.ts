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
  CloudUpdateRequestModel,
  CloudDirectoryModel,
  CloudListDirectoriesRequestModel,
  CloudListBreadcrumbRequestModel,
  CloudUploadPartRequestModel,
  CloudUploadPartResponseModel,
  CloudUserStorageUsageResponseModel,
} from './cloud.model';
import { plainToInstance } from 'class-transformer';
import {
  IsImageFile,
  KeyCombiner,
  PascalizeKeys,
} from '@common/helpers/cast.helper';
import { CloudBreadcrumbLevelType } from '@common/enums';
import { UserSubscriptionEntity } from '@entities/user-subscription.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { asyncLocalStorage } from '@common/context/context.service';

@Injectable()
export class CloudService {
  private readonly logger = new Logger(CloudService.name);
  private readonly Buckets = {
    Storage: 'Storage',
    Photos: 'Photos',
  };
  private readonly PublicEndpoint =
    process.env.STORAGE_S3_PUBLIC_ENDPOINT + this.Buckets.Storage;
  private readonly NotFoundErrorCodes = ['NoSuchKey', 'NotFound'];
  private readonly MaxProcessMetadataObjects = 1000;
  private readonly MaxListObjects = 1000;
  private readonly MaxObjectSizeBytes = 50 * 1024 * 1024; // 50 MB
  private readonly PresignedUrlExpirySeconds = 3600; // 1 hour
  private readonly MinMultipartUploadSizeBytes = 5 * 1024 * 1024; // 5 MB
  public readonly MaxMultipartUploadSizeBytes = 50 * 1024 * 1024; // 50 MB
  private readonly EmptyFolderPlaceholder = '.emptyFolderPlaceholder';
  private readonly IsDirectory = (key: string) =>
    key.includes(this.EmptyFolderPlaceholder);
  private Prefix = null;
  @InjectRepository(UserSubscriptionEntity)
  private userSubscriptionRepository: Repository<UserSubscriptionEntity>;
  @InjectAws(S3Client) private readonly s3: S3Client;
  constructor() {}

  // Default download speeds (bytes per second) mapped by subscription slug
  private readonly DefaultDownloadSpeeds: Record<string, number> = {
    free: 50 * 1024, // 50 KB/s
    pro: 500 * 1024, // 500 KB/s
    enterprise: 5 * 1024 * 1024, // 5 MB/s
  };

  private readonly DefaultDownloadSpeedBytesPerSec = 50 * 1024; // 50 KB/s fallback

  //#region List

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
        Bucket: this.Buckets.Storage,
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

  //#endregion

  async GetDownloadSpeedBytesPerSec(User: UserContext): Promise<number> {
    const userSubscription = await this.userSubscriptionRepository.findOne({
      where: {
        user: {
          id: User.id,
        },
      },
      relations: ['subscription'],
    });

    if (!userSubscription || !userSubscription.subscription) {
      return this.DefaultDownloadSpeedBytesPerSec;
    }

    const sub = userSubscription.subscription;
    if (sub.features && typeof sub.features === 'object') {
      // features might have downloadSpeedBytesPerSec value
      const raw = (sub.features as Record<string, never>)[
        'downloadSpeedBytesPerSec'
      ];
      if (typeof raw === 'number' && raw > 0) {
        return raw;
      }
    }

    if (sub.slug && this.DefaultDownloadSpeeds[sub.slug]) {
      return this.DefaultDownloadSpeeds[sub.slug];
    }

    return this.DefaultDownloadSpeedBytesPerSec;
  }

  //#region Breadcrumb

  async ListBreadcrumb({
    Path,
    Delimiter,
  }: CloudListBreadcrumbRequestModel): Promise<CloudBreadCrumbModel[]> {
    const store = asyncLocalStorage.getStore();
    const request: Request = store?.get('request');

    const breadcrumb = await this.ProcessBreadcrumb(Path || '', Delimiter);

    request.totalRowCount = breadcrumb.length;

    return breadcrumb;
  }

  //#endregion

  //#region Directories

  async ListDirectories(
    { Path, Delimiter }: CloudListDirectoriesRequestModel,
    User: UserContext,
  ): Promise<CloudDirectoryModel[]> {
    const store = asyncLocalStorage.getStore();
    const request: Request = store?.get('request');

    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';
    let prefix = KeyCombiner([User.id, cleanedPath]);
    if (!prefix.endsWith('/')) {
      prefix = prefix + '/';
    }
    this.Prefix = prefix;

    const command = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: this.Buckets.Storage,
        MaxKeys: this.MaxListObjects,
        Delimiter: Delimiter ? '/' : undefined,
        Prefix: this.Prefix,
      }),
    );

    request.totalRowCount = command.CommonPrefixes?.length ?? 0;

    return this.ProcessDirectories(command.CommonPrefixes ?? [], this.Prefix);
  }

  //#endregion

  //#region Objects

  async ListObjects(
    { Path, Delimiter, IsMetadataProcessing }: CloudListRequestModel,
    User: UserContext,
  ): Promise<CloudObjectModel[]> {
    const store = asyncLocalStorage.getStore();
    const request: Request = store?.get('request');

    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';
    let prefix = KeyCombiner([User.id, cleanedPath]);
    if (!prefix.endsWith('/')) {
      prefix = prefix + '/';
    }
    this.Prefix = prefix;

    const command = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: this.Buckets.Storage,
        MaxKeys: this.MaxListObjects,
        Delimiter: Delimiter ? '/' : undefined,
        Prefix: this.Prefix,
      }),
    );

    const objects = await this.ProcessObjects(
      command.Contents ?? [],
      IsMetadataProcessing,
      User,
    );

    request.totalRowCount = objects.length;

    return objects;
  }

  //#endregion

  //#region User Storage Usage

  async UserStorageUsage(
    User: UserContext,
  ): Promise<CloudUserStorageUsageResponseModel> {
    let continuationToken: string | undefined = undefined;
    let totalSize = 0;

    const userSubscription = await this.userSubscriptionRepository.findOne({
      where: {
        user: {
          id: User.id,
        },
      },
    });

    do {
      const command = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.Buckets.Storage,
          Prefix: KeyCombiner([User.id, '']),
          ContinuationToken: continuationToken,
        }),
      );

      const contents = command.Contents || [];
      for (const content of contents) {
        if (content.Size) {
          totalSize += content.Size;
        }
      }

      continuationToken = command.IsTruncated
        ? command.NextContinuationToken
        : undefined;
    } while (continuationToken);

    if (!userSubscription || !userSubscription?.subscription) {
      throw new HttpException(Codes.Error.Subscription.NOT_FOUND, 404);
    }

    return plainToInstance(CloudUserStorageUsageResponseModel, {
      UsedStorageInBytes: totalSize,
      MaxStorageInBytes: userSubscription
        ? userSubscription.subscription.storageLimitBytes
        : null,
      IsLimitExceeded: userSubscription
        ? userSubscription.subscription.storageLimitBytes !== null &&
          totalSize > userSubscription.subscription.storageLimitBytes
        : false,
      UsagePercentage:
        userSubscription && userSubscription.subscription.storageLimitBytes
          ? (totalSize / userSubscription.subscription.storageLimitBytes) * 100
          : null,
      MaxUploadSizeBytes:
        userSubscription.subscription.maxUploadSizeBytes ||
        this.MaxObjectSizeBytes,
    });
  }

  //#endregion

  //#region Find

  async Find(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<CloudObjectModel> {
    try {
      const command = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.Buckets.Storage,
          Key: KeyCombiner([User.id, Key]),
        }),
      );

      return plainToInstance(CloudObjectModel, {
        Name: Key?.split('/').pop(),
        Extension: Key?.includes('.') ? Key.split('.').pop() : undefined,
        MimeType: command.ContentType,
        Path: {
          Host: this.PublicEndpoint,
          Key: Key.replace('' + User.id + '/', ''),
          Url: Key,
        },
        Metadata: this.DecodeMetadataFromS3(command.Metadata),
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

  //#endregion

  //#region PresignedURL

  async GetPresignedUrl(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<string> {
    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.Buckets.Storage,
          Key: KeyCombiner([User.id, Key]),
        }),
      );

      const command = new GetObjectCommand({
        Bucket: this.Buckets.Storage,
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

  //#region Get Object Stream

  async GetObjectStream(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<ReadableStream> {
    try {
      const command = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.Buckets.Storage,
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

  // Return a Node Readable stream for the requested object (useful for piping)
  async GetObjectReadable(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<Readable> {
    try {
      const command = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.Buckets.Storage,
          Key: KeyCombiner([User.id, Key]),
        }),
      );

      // AWS SDK v3 can return a node Readable in Body for Node environments
      // we assert here that it is the Node Readable stream
      const body = command.Body as unknown as Readable;
      return body;
    } catch (error) {
      if (this.NotFoundErrorCodes.includes(error.name)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }

  //#endregion

  //#region Breadcrumb

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

  //#endregion

  //#region Directories

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

  //#endregion

  //#region Objects

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
            Bucket: this.Buckets.Storage,
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
          Host: this.PublicEndpoint,
          Key: content.Key.replace('' + User.id + '/', ''),
          Url: this.PublicEndpoint + '/' + content.Key,
        },
        Metadata: this.DecodeMetadataFromS3(metadata.Metadata),
        Size: content.Size,
        ETag: content.ETag,
        LastModified: content.LastModified
          ? content.LastModified.toISOString()
          : '',
      });
    }
    return processedContents;
  }

  //#endregion

  //#region Move

  async Move(
    { SourceKey, DestinationKey }: CloudMoveRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    try {
      const copySource = `${this.Buckets.Storage}/${SourceKey}`;

      await this.s3.send(
        new CopyObjectCommand({
          Bucket: this.Buckets.Storage,
          CopySource: copySource,
          Key: KeyCombiner([User.id, DestinationKey]),
        }),
      );

      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.Buckets.Storage,
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

  //#endregion

  //#region Delete

  async Delete(
    { Key, IsDirectory }: CloudDeleteRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    try {
      for await (const key of Key) {
        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: this.Buckets.Storage,
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

  //#endregion

  //#region Create Directory

  async CreateDirectory(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    const directoryKey =
      Key.replace(/^\/+|\/+$/g, '') + '/' + this.EmptyFolderPlaceholder;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.Buckets.Storage,
        Key: KeyCombiner([User.id, directoryKey]),
        Body: '',
      }),
    );
    return true;
  }

  //#endregion

  //#region Multipart Upload

  async UploadCreateMultipartUpload(
    { Key, ContentType, Metadata }: CloudCreateMultipartUploadRequestModel,
    User: UserContext,
  ): Promise<CloudCreateMultipartUploadResponseModel> {
    const command = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: this.Buckets.Storage,
        Key: KeyCombiner([User.id, Key]),
        ContentType: ContentType,
        Metadata: this.SanitizeMetadataForS3(Metadata),
      }),
    );

    return plainToInstance(CloudCreateMultipartUploadResponseModel, {
      UploadId: command.UploadId,
      Key: command.Key.replace('' + User.id + '/', ''),
    });
  }

  //#endregion

  //#region Multipart Upload

  async UploadGetMultipartPartUrl(
    { Key, UploadId, PartNumber }: CloudGetMultipartPartUrlRequestModel,
    User: UserContext,
  ): Promise<CloudGetMultipartPartUrlResponseModel> {
    const command = new UploadPartCommand({
      Bucket: this.Buckets.Storage,
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

  //#endregion

  //#region Multipart Upload

  async UploadPart(
    { Key, UploadId, PartNumber }: CloudUploadPartRequestModel,
    file: Express.Multer.File,
    User: UserContext,
  ): Promise<CloudUploadPartResponseModel> {
    const command = new UploadPartCommand({
      Bucket: this.Buckets.Storage,
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

  //#endregion

  //#region Complete Multipart Upload

  async UploadCompleteMultipartUpload(
    { Key, UploadId, Parts }: CloudCompleteMultipartUploadRequestModel,
    User: UserContext,
  ): Promise<CloudCompleteMultipartUploadResponseModel> {
    const command = await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.Buckets.Storage,
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

  //#endregion

  //#region Image Metadata Processing

  private async ProcessFileMetadata(
    key: string,
  ): Promise<Record<string, string>> {
    try {
      const getObjectCommand = new GetObjectCommand({
        Bucket: this.Buckets.Storage,
        Key: key,
      });
      const object = await this.s3.send(getObjectCommand);

      const existingMetadata = object.Metadata || {};

      const stream = object.Body as Readable;
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      // const buffer = Buffer.concat(chunks);

      return this.DecodeMetadataFromS3(existingMetadata);
    } catch (error) {
      this.logger.error(
        `Failed to process file metadata for key ${key}:`,
        error,
      );
      return {};
    }
  }

  private async ProcessImageMetadata(
    key: string,
  ): Promise<Record<string, string>> {
    try {
      const getObjectCommand = new GetObjectCommand({
        Bucket: this.Buckets.Storage,
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
        const newMetadataRaw = {
          ...existingMetadata,
          width: metadata.width.toString(),
          height: metadata.height.toString(),
        };

        // sanitize/encode values before writing back to S3
        const newMetadata = this.SanitizeMetadataForS3(newMetadataRaw);

        const copySource = `${this.Buckets.Storage}/${key}`;

        await this.s3.send(
          new PutObjectCommand({
            Bucket: this.Buckets.Storage,
            Key: key,
            Body: buffer,
            ContentType: object.ContentType,
            Metadata: newMetadata,
          }),
        );

        await this.s3.send(
          new CopyObjectCommand({
            Bucket: this.Buckets.Storage,
            CopySource: copySource,
            Key: key,
            Metadata: newMetadata,
            MetadataDirective: 'REPLACE',
            ContentType: object.ContentType,
          }),
        );

        // return decoded metadata for downstream callers
        return this.DecodeMetadataFromS3(newMetadata);
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

  private SanitizeMetadataForS3(
    metadata?: Record<string, string>,
  ): Record<string, string> {
    if (!metadata) return {};
    const sanitized: Record<string, string> = {};
    for (const [rawKey, rawVal] of Object.entries(metadata)) {
      const key = String(rawKey)
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-');
      let value = rawVal == null ? '' : String(rawVal);
      value = value.replace(/(\r\n|\r|\n)/g, ' ').trim();
      if (/[^\x20-\x7e]/.test(value)) {
        value = 'b64:' + Buffer.from(value, 'utf8').toString('base64');
      }
      sanitized[key] = value;
    }
    return sanitized;
  }

  // Decode metadata values previously encoded with sanitizeMetadataForS3
  private DecodeMetadataFromS3(
    metadata?: Record<string, string>,
  ): Record<string, string> {
    if (!metadata) return {};
    const decoded: Record<string, string> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string' && value.startsWith('b64:')) {
        const b64 = value.slice(4);
        try {
          decoded[key] = Buffer.from(b64, 'base64').toString('utf8');
        } catch (err) {
          this.logger.warn(
            `Failed to decode metadata value for key ${key}:`,
            err,
          );
          decoded[key] = value;
        }
      } else {
        decoded[key] = value as string;
      }
    }
    return PascalizeKeys(decoded);
  }

  //#endregion

  //#region Abort Multipart Upload

  async UploadAbortMultipartUpload(
    { Key, UploadId }: CloudAbortMultipartUploadRequestModel,
    User: UserContext,
  ): Promise<void> {
    await this.s3.send(
      new AbortMultipartUploadCommand({
        Bucket: this.Buckets.Storage,
        Key: KeyCombiner([User.id, Key]),
        UploadId: UploadId,
      }),
    );
  }

  //#region Update (rename/metadata)

  async Update(
    { Key, Name, Metadata }: CloudUpdateRequestModel,
    User: UserContext,
  ): Promise<CloudObjectModel> {
    try {
      const bucket = this.Buckets.Storage;

      const sourceKey = KeyCombiner([User.id, Key]);

      // determine target key (if Name provided, replace file's base name)
      let targetRelative = Key;
      let targetKey = sourceKey;

      if (Name) {
        const parts = Key.split('/');
        parts[parts.length - 1] = Name;
        targetRelative = parts.join('/');
        targetKey = KeyCombiner([User.id, targetRelative]);
      }

      // prepare metadata replacement only when provided
      const sanitizedProvidedMetadata = this.SanitizeMetadataForS3(Metadata);

      // If caller provided metadata, merge it with existing metadata instead of
      // replacing the whole map so we don't lose previously stored keys.
      let finalMetadataForS3: Record<string, string> = {};
      // keep track of content type to preserve it when we replace metadata
      let sourceContentType: string | undefined = undefined;
      if (Object.keys(sanitizedProvidedMetadata).length) {
        const head = await this.s3.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: sourceKey,
          }),
        );
        const existingMetadata = head.Metadata || {};
        sourceContentType = head.ContentType as string | undefined;
        finalMetadataForS3 = {
          ...existingMetadata,
          ...sanitizedProvidedMetadata,
        };
        // DEBUG: log keys we will send to S3 when replacing metadata
        this.logger.debug(
          `CloudService.Update finalMetadata keys: ${Object.keys(
            finalMetadataForS3,
          ).join(',')}`,
        );
      }

      if (targetKey !== sourceKey) {
        await this.s3.send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: `${bucket}/${sourceKey}`,
            Key: targetKey,
            Metadata: Object.keys(finalMetadataForS3).length
              ? finalMetadataForS3
              : undefined,
            MetadataDirective: Object.keys(finalMetadataForS3).length
              ? 'REPLACE'
              : 'COPY',
            ContentType:
              Object.keys(finalMetadataForS3).length && sourceContentType
                ? sourceContentType
                : undefined,
          }),
        );

        // verify the copy actually contains the metadata we asked for
        if (Object.keys(sanitizedProvidedMetadata).length) {
          const headAfterCopy = await this.s3.send(
            new HeadObjectCommand({
              Bucket: bucket,
              Key: targetKey,
            }),
          );

          const missingKeys = Object.keys(sanitizedProvidedMetadata).filter(
            (k) => !headAfterCopy.Metadata || !(k in headAfterCopy.Metadata),
          );

          if (missingKeys.length) {
            this.logger.warn(
              `CloudService.Update: metadata keys not persisted after copy: ${missingKeys.join(',')}. Falling back to GetObject+PutObject for ${targetKey}`,
            );

            const getResp = await this.s3.send(
              new GetObjectCommand({
                Bucket: bucket,
                Key: targetKey,
              }),
            );

            const stream = getResp.Body as Readable;
            const chunks: Buffer[] = [];
            for await (const chunk of stream) {
              chunks.push(Buffer.from(chunk));
            }
            const buffer = Buffer.concat(chunks);

            await this.s3.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: targetKey,
                Body: buffer,
                ContentType: sourceContentType,
                Metadata: finalMetadataForS3,
              }),
            );
          }
        }

        // delete original
        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: sourceKey,
          }),
        );
      } else if (Object.keys(finalMetadataForS3).length) {
        // no rename, but metadata replacement requested on same key
        await this.s3.send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: `${bucket}/${sourceKey}`,
            Key: sourceKey,
            Metadata: finalMetadataForS3,
            MetadataDirective: 'REPLACE',
            ContentType: sourceContentType ? sourceContentType : undefined,
          }),
        );

        // verify metadata persisted; if provider ignored copy metadata, fallback to Get+Put
        const headAfterReplace = await this.s3.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: sourceKey,
          }),
        );

        const missingKeys2 = Object.keys(sanitizedProvidedMetadata).filter(
          (k) =>
            !headAfterReplace.Metadata || !(k in headAfterReplace.Metadata),
        );

        if (missingKeys2.length) {
          this.logger.warn(
            `CloudService.Update: metadata keys not persisted after REPLACE for ${sourceKey}, missing: ${missingKeys2.join(',')}. Falling back to GetObject+PutObject`,
          );

          const getResp = await this.s3.send(
            new GetObjectCommand({
              Bucket: bucket,
              Key: sourceKey,
            }),
          );
          const stream = getResp.Body as Readable;
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(Buffer.from(chunk));
          }
          const buffer = Buffer.concat(chunks);

          await this.s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: sourceKey,
              Body: buffer,
              ContentType: sourceContentType,
              Metadata: finalMetadataForS3,
            }),
          );
        }
      }

      // return the updated object info (note: Key for Find should be relative to user)
      return this.Find({ Key: targetRelative }, User);
    } catch (error) {
      if (this.NotFoundErrorCodes.includes(error.name)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }

  //#endregion
}
