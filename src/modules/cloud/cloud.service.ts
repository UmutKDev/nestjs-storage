import {
  _Object,
  AbortMultipartUploadCommand,
  CommonPrefix,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from 'crypto';
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
  CloudRenameDirectoryRequestModel,
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
  CloudPreSignedUrlRequestModel,
  // New Directories API models
  DirectoryCreateRequestModel,
  DirectoryRenameRequestModel,
  DirectoryDeleteRequestModel,
  DirectoryUnlockRequestModel,
  DirectoryUnlockResponseModel,
  DirectoryLockRequestModel,
  DirectoryConvertToEncryptedRequestModel,
  DirectoryDecryptRequestModel,
  DirectoryResponseModel,
} from './cloud.model';
import { RedisService } from '@modules/redis/redis.service';
import { ENCRYPTED_FOLDER_SESSION_TTL } from './cloud.constants';
import { EncryptedFolderSession } from './guards/encrypted-folder.guard';
import { plainToInstance } from 'class-transformer';
import {
  IsImageFile,
  KeyBuilder,
  PascalizeKeys,
  MimeTypeFromExtension,
  S3KeyConverter,
} from '@common/helpers/cast.helper';
import { CloudBreadcrumbLevelType } from '@common/enums';
import { UserSubscriptionEntity } from '@entities/user-subscription.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { asyncLocalStorage } from '@common/context/context.service';
import { Response } from 'express';

type EncryptedFolderRecord = {
  ciphertext: string;
  iv: string;
  authTag: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
};

type EncryptedFolderManifest = {
  folders: Record<string, EncryptedFolderRecord>;
};

@Injectable()
export class CloudService {
  private readonly logger = new Logger(CloudService.name);
  private readonly Buckets = {
    Storage: 'storage',
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
  private readonly EncryptedFoldersManifestKey =
    '.secure/encrypted-folders.json';
  private readonly EncryptedFolderKeyBytes = 32;
  private readonly EncryptedFolderIvLength = 12;
  private readonly EncryptedFolderKdfIterations = 120000;
  private readonly EncryptedFolderAlgorithm = 'aes-256-gcm';
  private readonly IsSignedUrlProcessing = true;
  private Prefix = null;
  @InjectRepository(UserSubscriptionEntity)
  private userSubscriptionRepository: Repository<UserSubscriptionEntity>;
  @InjectAws(S3Client) private readonly s3: S3Client;

  constructor(private readonly redisService: RedisService) {}

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
    sessionToken?: string,
  ): Promise<CloudListResponseModel> {
    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';

    // Check if we're trying to access an encrypted folder
    const accessCheck = await this.CheckEncryptedFolderAccess(
      cleanedPath,
      User.id,
      sessionToken,
    );

    if (accessCheck.isEncrypted && !accessCheck.hasAccess) {
      throw new HttpException(
        `Access denied. Folder "${accessCheck.encryptingFolder}" is encrypted. Unlock it first via POST /Cloud/Directories/Unlock`,
        HttpStatus.FORBIDDEN,
      );
    }

    let prefix = KeyBuilder([User.id, cleanedPath]);
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

    const encryptedFolders = await this.GetEncryptedFolderSet(User);

    const [Breadcrumb, Directories, Contents] = await Promise.all([
      this.ProcessBreadcrumb(Path || '', Delimiter),
      this.ProcessDirectories(
        command.CommonPrefixes ?? [],
        this.Prefix,
        User,
        encryptedFolders,
        sessionToken,
      ),
      this.ProcessObjects(
        command.Contents ?? [],
        IsMetadataProcessing,
        User,
        this.IsSignedUrlProcessing,
      ),
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
    { Path, Delimiter, search, skip, take }: CloudListDirectoriesRequestModel,
    User: UserContext,
    sessionToken?: string,
  ): Promise<CloudDirectoryModel[]> {
    const store = asyncLocalStorage.getStore();
    const request: Request = store?.get('request');

    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';

    // Check encrypted folder access
    const accessCheck = await this.CheckEncryptedFolderAccess(
      cleanedPath,
      User.id,
      sessionToken,
    );

    if (accessCheck.isEncrypted && !accessCheck.hasAccess) {
      throw new HttpException(
        `Access denied. Folder "${accessCheck.encryptingFolder}" is encrypted. Unlock it first via POST /Cloud/Directories/Unlock`,
        HttpStatus.FORBIDDEN,
      );
    }

    let prefix = KeyBuilder([User.id, cleanedPath]);
    if (!prefix.endsWith('/')) {
      prefix = prefix + '/';
    }
    this.Prefix = prefix;

    const encryptedFolders = await this.GetEncryptedFolderSet(User);

    // If no delimiter requested, CommonPrefixes will be empty; maintain previous behavior.
    if (!Delimiter) {
      const command = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.Buckets.Storage,
          Prefix: this.Prefix,
        }),
      );
      request.totalRowCount = command.CommonPrefixes?.length ?? 0;
      return this.ProcessDirectories(
        command.CommonPrefixes ?? [],
        this.Prefix,
        User,
        encryptedFolders,
        sessionToken,
      );
    }

    // Implement skip/take pagination for directories. We'll aggregate CommonPrefixes
    // from pages until we've gathered skip + take items (or no more pages), then
    // slice the array to return the requested window.
    const skipValue = typeof skip === 'number' && skip > 0 ? skip : 0;
    const takeValue =
      typeof take === 'number' && take > 0 ? take : this.MaxListObjects;

    const aggregated: CommonPrefix[] = [];
    let continuationToken: string | undefined = undefined;
    let isFirstRequest = true;

    while (true) {
      const maxKeys = Math.min(
        this.MaxListObjects,
        Math.max(1, skipValue + takeValue - aggregated.length),
      );
      const params: ListObjectsV2CommandInput = {
        Bucket: this.Buckets.Storage,
        Delimiter: '/',
        Prefix: this.Prefix,
        MaxKeys: maxKeys,
      };

      if (isFirstRequest && search) {
        params.StartAfter = search;
      }
      if (continuationToken) {
        params.ContinuationToken = continuationToken;
      }

      const command = await this.s3.send(new ListObjectsV2Command(params));

      const commonPrefixes = command.CommonPrefixes ?? [];
      aggregated.push(...commonPrefixes);

      // Always capture the continuation token before breaking
      const isTruncated = command.IsTruncated;
      continuationToken = isTruncated
        ? command.NextContinuationToken
        : undefined;

      if (aggregated.length >= skipValue + takeValue) {
        break;
      }

      if (!isTruncated) {
        break;
      }

      isFirstRequest = false;
    }

    const sliced = aggregated.slice(skipValue, skipValue + takeValue);

    // Continue fetching to get accurate total count
    let totalCount = aggregated.length;
    while (continuationToken) {
      const countParams: ListObjectsV2CommandInput = {
        Bucket: this.Buckets.Storage,
        Delimiter: '/',
        Prefix: this.Prefix,
        MaxKeys: this.MaxListObjects,
        ContinuationToken: continuationToken,
      };

      const countCommand = await this.s3.send(
        new ListObjectsV2Command(countParams),
      );
      totalCount += (countCommand.CommonPrefixes ?? []).length;

      if (!countCommand.IsTruncated) {
        break;
      }
      continuationToken = countCommand.NextContinuationToken;
    }

    if (request) {
      request.totalRowCount = totalCount;
    }

    return this.ProcessDirectories(
      sliced,
      this.Prefix,
      User,
      encryptedFolders,
      sessionToken,
    );
  }

  //#endregion

  private readonly ListObjectsCacheTTL = 60; // 1 minute cache

  private BuildListObjectsCacheKey(
    userId: string,
    path: string,
    delimiter: boolean,
    isMetadataProcessing: boolean,
    search: string | undefined,
    skip: number,
    take: number,
  ): string {
    const parts = [
      'cloud:list-objects',
      userId,
      path || 'root',
      delimiter ? 'd1' : 'd0',
      isMetadataProcessing ? 'm1' : 'm0',
      search || '',
      `s${skip}`,
      `t${take}`,
    ];
    return parts.join(':');
  }

  /**
   * Invalidate list objects cache for a user's path.
   * Call this when objects are added, deleted, moved, or renamed.
   */
  async InvalidateListObjectsCache(
    userId: string,
    path?: string,
  ): Promise<void> {
    const pattern = path
      ? `cloud:list-objects:${userId}:${path.replace(/^\/+|\/+$/g, '') || 'root'}:*`
      : `cloud:list-objects:${userId}:*`;
    await this.redisService.delByPattern(pattern);
  }

  /**
   * Extract parent folder path from a key.
   * e.g., "folder1/folder2/file.txt" -> "folder1/folder2"
   * e.g., "file.txt" -> "" (root)
   */
  private GetParentFolderPath(key: string): string {
    const normalized = (key || '').replace(/^\/+|\/+$/g, '');
    const parts = normalized.split('/');
    if (parts.length <= 1) {
      return ''; // root folder
    }
    return parts.slice(0, -1).join('/');
  }

  //#region Objects

  async ListObjects(
    {
      Path,
      Delimiter,
      IsMetadataProcessing,
      search,
      skip,
      take,
    }: CloudListRequestModel,
    User: UserContext,
    sessionToken?: string,
  ): Promise<CloudObjectModel[]> {
    const store = asyncLocalStorage.getStore();
    const request: Request = store?.get('request');

    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';

    // Check encrypted folder access
    const accessCheck = await this.CheckEncryptedFolderAccess(
      cleanedPath,
      User.id,
      sessionToken,
    );

    if (accessCheck.isEncrypted && !accessCheck.hasAccess) {
      throw new HttpException(
        `Access denied. Folder "${accessCheck.encryptingFolder}" is encrypted. Unlock it first via POST /Cloud/Directories/Unlock`,
        HttpStatus.FORBIDDEN,
      );
    }

    let prefix = KeyBuilder([User.id, cleanedPath]);
    if (!prefix.endsWith('/')) {
      prefix = prefix + '/';
    }
    this.Prefix = prefix;

    // If skip/take not supplied, default to MaxListObjects and single request behavior (legacy)
    const skipValue = typeof skip === 'number' && skip > 0 ? skip : 0;
    const takeValue =
      typeof take === 'number' && take > 0 ? take : this.MaxListObjects;

    // Build cache key
    // const cacheKey = this.BuildListObjectsCacheKey(
    //   User.id,
    //   cleanedPath,
    //   !!Delimiter,
    //   !!IsMetadataProcessing,
    //   search,
    //   skipValue,
    //   takeValue,
    // );

    // Try to get from cache
    // const cached = await this.redisService.get<{
    //   objects: CloudObjectModel[];
    //   totalCount: number;
    // }>(cacheKey);

    // if (cached) {
    //   if (request) {
    //     request.totalRowCount = cached.totalCount;
    //   }
    //   return cached.objects;
    // }

    // If both skip and take are defaults (0), preserve previous behavior for a single page
    if (!skipValue && takeValue === this.MaxListObjects) {
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
        this.IsSignedUrlProcessing,
      );

      // Cache the result
      // await this.redisService.set(
      //   cacheKey,
      //   { objects, totalCount: objects.length },
      //   this.ListObjectsCacheTTL,
      // );

      if (request) {
        request.totalRowCount = objects.length;
      }
      return objects;
    }

    // Aggregate and page through S3 objects until we have skip + take
    const aggregated: _Object[] = [];
    let continuationToken: string | undefined = undefined;
    let isFirstRequest = true;

    while (true) {
      const maxKeys = Math.min(
        this.MaxListObjects,
        Math.max(1, skipValue + takeValue - aggregated.length),
      );
      const params: ListObjectsV2CommandInput = {
        Bucket: this.Buckets.Storage,
        Delimiter: Delimiter ? '/' : undefined,
        Prefix: this.Prefix,
        MaxKeys: maxKeys,
      };

      if (isFirstRequest && search) {
        params.StartAfter = search;
      }
      if (continuationToken) {
        params.ContinuationToken = continuationToken;
      }

      const command = await this.s3.send(new ListObjectsV2Command(params));

      const contents = command.Contents ?? [];
      aggregated.push(...contents);

      // Always capture the continuation token before breaking
      const isTruncated = command.IsTruncated;
      continuationToken = isTruncated
        ? command.NextContinuationToken
        : undefined;

      if (aggregated.length >= skipValue + takeValue) {
        break;
      }

      if (!isTruncated) {
        break;
      }

      isFirstRequest = false;
    }

    const sliced = aggregated.slice(skipValue, skipValue + takeValue);

    const objects = await this.ProcessObjects(
      sliced,
      IsMetadataProcessing,
      User,
      this.IsSignedUrlProcessing,
    );

    // Continue fetching to get accurate total count
    let totalCount = aggregated.length;
    while (continuationToken) {
      const countParams: ListObjectsV2CommandInput = {
        Bucket: this.Buckets.Storage,
        Delimiter: Delimiter ? '/' : undefined,
        Prefix: this.Prefix,
        MaxKeys: this.MaxListObjects,
        ContinuationToken: continuationToken,
      };

      const countCommand = await this.s3.send(
        new ListObjectsV2Command(countParams),
      );
      totalCount += (countCommand.Contents ?? []).length;

      if (!countCommand.IsTruncated) {
        break;
      }
      continuationToken = countCommand.NextContinuationToken;
    }

    // Cache the result
    // await this.redisService.set(
    //   cacheKey,
    //   { objects, totalCount },
    //   this.ListObjectsCacheTTL,
    // );

    if (request) {
      request.totalRowCount = totalCount;
    }

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
          Prefix: KeyBuilder([User.id, '']),
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
          Key: KeyBuilder([User.id, Key]),
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
    { Key, ExpiresInSeconds }: CloudPreSignedUrlRequestModel,
    User: UserContext,
  ): Promise<string> {
    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.Buckets.Storage,
          Key: KeyBuilder([User.id, Key]),
        }),
      );

      const command = new GetObjectCommand({
        Bucket: this.Buckets.Storage,
        Key: KeyBuilder([User.id, Key]),
      });

      const url = await getSignedUrl(this.s3, command, {
        expiresIn: ExpiresInSeconds || this.PresignedUrlExpirySeconds,
      });

      return url;
    } catch (error) {
      if (this.NotFoundErrorCodes.includes(error.name)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }

  async GetPublicPresignedUrl({
    key,
    res,
  }: {
    key: string;
    res: Response;
  }): Promise<null> {
    try {
      console.log(key);
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.Buckets.Storage,
          Key: S3KeyConverter(key.replace(this.Buckets.Storage + '/', '')),
        }),
      );

      const command = new GetObjectCommand({
        Bucket: this.Buckets.Storage,
        Key: S3KeyConverter(key.replace(this.Buckets.Storage + '/', '')),
      });

      const url = await getSignedUrl(this.s3, command, {
        expiresIn: this.PresignedUrlExpirySeconds,
      });

      console.log(url);

      res.setHeader('x-signed-url', url);

      return null;
    } catch (error) {
      console.log(error);
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
          Key: KeyBuilder([User.id, Key]),
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
          Key: KeyBuilder([User.id, Key]),
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
    User: UserContext,
    encryptedFolders?: Set<string>,
    sessionToken?: string,
  ): Promise<CloudDirectoryModel[]> {
    const CommonPrefixesFiltered = CommonPrefixes.filter(
      (cp) => !cp.Prefix.includes('.secure/'),
    );

    if (CommonPrefixes.length === 0) {
      return [];
    }

    const directories: CloudDirectoryModel[] = [];
    for (const commonPrefix of CommonPrefixesFiltered) {
      if (commonPrefix.Prefix) {
        const DirectoryName = commonPrefix.Prefix.replace(Prefix, '').replace(
          '/',
          '',
        );
        const DirectoryPrefix: string = commonPrefix.Prefix.replace(
          User.id + '/',
          '',
        );
        const normalizedPrefix = this.NormalizeDirectoryPath(DirectoryPrefix);
        const isEncrypted = encryptedFolders?.has(normalizedPrefix) ?? false;

        // Check if user has active session for this encrypted folder
        let isLocked = true;
        if (isEncrypted && sessionToken) {
          const session = await this.ValidateDirectorySession(
            User.id,
            normalizedPrefix,
            sessionToken,
          );
          isLocked = !session;
        }

        directories.push({
          Name: DirectoryName,
          Prefix: DirectoryPrefix,
          IsEncrypted: isEncrypted,
          IsLocked: isEncrypted ? isLocked : false,
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
    IsSignedUrlProcessing = false,
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
      let metadata: Partial<GetObjectCommandOutput> = {};

      if (IsMetadataProcessing) {
        metadata = await this.s3.send(
          new HeadObjectCommand({
            Bucket: this.Buckets.Storage,
            Key: content.Key,
          }),
        );
      }

      const ObjectCommand = new GetObjectCommand({
        Bucket: this.Buckets.Storage,
        Key: content.Key,
      });

      const SignedUrl = IsSignedUrlProcessing
        ? await getSignedUrl(this.s3, ObjectCommand, {
            expiresIn: this.PresignedUrlExpirySeconds,
          })
        : undefined;

      const Name = content.Key?.split('/').pop();
      const Extension = Name?.includes('.') ? Name.split('.').pop() : '';

      processedContents.push({
        Name: Name,
        Extension: Extension,
        MimeType:
          (metadata.ContentType ?? MimeTypeFromExtension(Extension)) ||
          'application/octet-stream',
        Path: {
          Host: this.PublicEndpoint,
          Key: content.Key.replace('' + User.id + '/', ''),
          Url: SignedUrl,
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
    { SourceKeys, DestinationKey }: CloudMoveRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    const foldersToInvalidate = new Set<string>();

    try {
      for await (const sourceKey of SourceKeys) {
        const sourceFullKey = KeyBuilder([User.id, sourceKey]);

        const targetFullKey = KeyBuilder([
          User.id,
          DestinationKey,
          sourceKey.split('/').pop() || '',
        ]);
        const copySource = `${this.Buckets.Storage}/${sourceFullKey}`;

        await this.s3.send(
          new CopyObjectCommand({
            Bucket: this.Buckets.Storage,
            CopySource: copySource,
            Key: targetFullKey,
          }),
        );

        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: this.Buckets.Storage,
            Key: sourceFullKey,
          }),
        );

        // Collect folders to invalidate
        foldersToInvalidate.add(this.GetParentFolderPath(sourceKey));
      }

      // Add destination folder and its parent (in case destination folder is newly created)
      const normalizedDestination = (DestinationKey || '').replace(
        /^\/+|\/+$/g,
        '',
      );
      foldersToInvalidate.add(normalizedDestination);
      const destinationParent = this.GetParentFolderPath(normalizedDestination);
      if (destinationParent !== normalizedDestination) {
        foldersToInvalidate.add(destinationParent);
      }

      // Invalidate cache for all affected folders
      for (const folder of foldersToInvalidate) {
        await this.InvalidateListObjectsCache(User.id, folder || undefined);
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

  //#region Delete

  async Delete(
    { Items }: CloudDeleteRequestModel,
    User: UserContext,
    _options?: { allowEncryptedDirectories?: boolean },
  ): Promise<boolean> {
    // mark _options as used to avoid unused-parameter errors
    void _options;
    const foldersToInvalidate = new Set<string>();

    try {
      for await (const item of Items) {
        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: this.Buckets.Storage,
            Key: KeyBuilder([User.id, item.Key]),
          }),
        );

        // Collect parent folder to invalidate
        foldersToInvalidate.add(this.GetParentFolderPath(item.Key));
      }

      // Invalidate cache for all affected folders
      for (const folder of foldersToInvalidate) {
        await this.InvalidateListObjectsCache(User.id, folder || undefined);
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

  //#region Directory Management

  async CreateDirectory(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    const directoryKey =
      Key.replace(/^\/+|\/+$/g, '') + '/' + this.EmptyFolderPlaceholder;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.Buckets.Storage,
        Key: KeyBuilder([User.id, directoryKey]),
        Body: '',
      }),
    );

    // Invalidate parent folder cache
    const parentFolder = this.GetParentFolderPath(Key);
    await this.InvalidateListObjectsCache(User.id, parentFolder || undefined);

    return true;
  }

  async RenameDirectory(
    { Key, Name }: CloudRenameDirectoryRequestModel,
    User: UserContext,
    options?: { allowEncryptedDirectories?: boolean },
  ): Promise<boolean> {
    const sourcePath = this.NormalizeDirectoryPath(Key);
    if (!sourcePath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!options?.allowEncryptedDirectories) {
      const encryptedFolders = await this.GetEncryptedFolderSet(User);
      if (encryptedFolders.has(sourcePath)) {
        throw new HttpException(
          'Encrypted folders must be renamed via the encrypted-folder endpoint.',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    const trimmedName = (Name || '').trim();
    if (!trimmedName) {
      throw new HttpException(
        'Directory name is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const sanitizedName = trimmedName.replace(/^\/+|\/+$/g, '');
    if (!sanitizedName) {
      throw new HttpException(
        'Directory name is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const segments = sourcePath.split('/').filter((segment) => !!segment);
    if (!segments.length) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const parentSegments = segments.slice(0, -1);
    const targetPath = parentSegments.length
      ? `${parentSegments.join('/')}/${sanitizedName}`
      : sanitizedName;
    const normalizedTargetPath = this.NormalizeDirectoryPath(targetPath);

    if (!normalizedTargetPath) {
      throw new HttpException(
        'Target directory path is invalid',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (normalizedTargetPath === sourcePath) {
      return true;
    }

    const ensureTrailingSlash = (value: string): string =>
      value.endsWith('/') ? value : value + '/';

    const bucket = this.Buckets.Storage;
    const sourcePrefixFull = ensureTrailingSlash(
      KeyBuilder([User.id, sourcePath]),
    );
    const targetPrefixFull = ensureTrailingSlash(
      KeyBuilder([User.id, normalizedTargetPath]),
    );

    try {
      const targetCheck = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: targetPrefixFull,
          MaxKeys: 1,
        }),
      );

      const targetExists =
        (targetCheck.KeyCount ?? targetCheck.Contents?.length ?? 0) > 0;

      if (targetExists) {
        throw new HttpException(
          'Target directory already exists',
          HttpStatus.CONFLICT,
        );
      }

      let continuationToken: string | undefined = undefined;
      let movedObjects = 0;

      do {
        const listResp = await this.s3.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: sourcePrefixFull,
            ContinuationToken: continuationToken,
            MaxKeys: this.MaxListObjects,
          }),
        );

        const contents = listResp.Contents || [];
        if (!contents.length && !listResp.IsTruncated && movedObjects === 0) {
          throw new HttpException(
            Codes.Error.Cloud.FILE_NOT_FOUND,
            HttpStatus.NOT_FOUND,
          );
        }

        for (const content of contents) {
          if (!content.Key) {
            continue;
          }

          const suffix = content.Key.startsWith(sourcePrefixFull)
            ? content.Key.slice(sourcePrefixFull.length)
            : '';
          const destinationKey = suffix
            ? targetPrefixFull + suffix
            : targetPrefixFull.slice(0, -1);

          await this.s3.send(
            new CopyObjectCommand({
              Bucket: bucket,
              CopySource: `${bucket}/${content.Key}`,
              Key: destinationKey,
            }),
          );

          await this.s3.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: content.Key,
            }),
          );

          movedObjects++;
        }

        continuationToken = listResp.IsTruncated
          ? listResp.NextContinuationToken
          : undefined;
      } while (continuationToken);

      await this.UpdateEncryptedFoldersAfterRename(
        sourcePath,
        normalizedTargetPath,
        User,
      );

      // Invalidate cache for parent folder (both source and target are in same parent)
      const parentFolder = this.GetParentFolderPath(sourcePath);
      await this.InvalidateListObjectsCache(User.id, parentFolder || undefined);

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (this.NotFoundErrorCodes.includes(error.name)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }

  private async UpdateEncryptedFoldersAfterRename(
    sourcePath: string,
    targetPath: string,
    User: UserContext,
  ): Promise<void> {
    const manifest = await this.GetEncryptedFolderManifest(User);
    const folders = manifest.folders || {};
    const updatedFolders: Record<string, EncryptedFolderRecord> = {};
    const sourcePrefix = sourcePath + '/';
    let hasChanges = false;
    const now = new Date().toISOString();

    for (const [path, record] of Object.entries(folders)) {
      if (path === sourcePath || path.startsWith(sourcePrefix)) {
        const suffix = path.slice(sourcePath.length);
        const normalizedSuffix = suffix.startsWith('/')
          ? suffix.slice(1)
          : suffix;
        const updatedPath = normalizedSuffix
          ? `${targetPath}/${normalizedSuffix}`
          : targetPath;
        const normalizedUpdatedPath = this.NormalizeDirectoryPath(updatedPath);
        updatedFolders[normalizedUpdatedPath] = {
          ...record,
          updatedAt: now,
        };
        hasChanges = true;
      } else {
        updatedFolders[path] = record;
      }
    }

    if (hasChanges) {
      manifest.folders = updatedFolders;
      await this.SaveEncryptedFolderManifest(User, manifest);
    }
  }

  private async GetEncryptedFolderSet(User: UserContext): Promise<Set<string>> {
    const manifest = await this.GetEncryptedFolderManifest(User);
    return this.BuildEncryptedFolderSet(manifest);
  }

  private BuildEncryptedFolderSet(
    manifest: EncryptedFolderManifest,
  ): Set<string> {
    const folders = manifest.folders || {};
    const set = new Set<string>();
    for (const path of Object.keys(folders)) {
      const normalized = this.NormalizeDirectoryPath(path);
      if (normalized) {
        set.add(normalized);
      }
    }
    return set;
  }

  private NormalizeDirectoryPath(path: string): string {
    return (path || '').replace(/^\/+|\/+$/g, '');
  }

  private async GetEncryptedFolderManifest(
    User: UserContext,
  ): Promise<EncryptedFolderManifest> {
    const manifestKey = KeyBuilder([User.id, this.EncryptedFoldersManifestKey]);

    try {
      const command = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.Buckets.Storage,
          Key: manifestKey,
        }),
      );

      const body = command.Body as Readable;
      if (!body) {
        return { folders: {} };
      }

      const json = await this.ReadStreamToString(body);
      if (!json) {
        return { folders: {} };
      }

      let raw: Record<string, unknown> = {};
      try {
        raw = JSON.parse(json) as Record<string, unknown>;
      } catch (parseError) {
        this.logger.warn(
          'Failed to parse encrypted folder manifest, returning empty manifest',
          parseError,
        );
        return { folders: {} };
      }
      const normalized: Record<string, EncryptedFolderRecord> = {};
      if (raw && typeof raw === 'object' && raw.folders) {
        for (const [path, entry] of Object.entries(
          raw.folders as Record<string, EncryptedFolderRecord>,
        )) {
          const normalizedPath = this.NormalizeDirectoryPath(path);
          if (
            normalizedPath &&
            entry &&
            typeof entry === 'object' &&
            entry.ciphertext &&
            entry.iv &&
            entry.authTag &&
            entry.salt
          ) {
            normalized[normalizedPath] = entry;
          }
        }
      }
      return { folders: normalized };
    } catch (error) {
      if (this.NotFoundErrorCodes.includes(error.name)) {
        return { folders: {} };
      }
      this.logger.error('Failed to load encrypted folder manifest', error);
      throw error;
    }
  }

  private async SaveEncryptedFolderManifest(
    User: UserContext,
    manifest: EncryptedFolderManifest,
  ): Promise<void> {
    const manifestKey = KeyBuilder([User.id, this.EncryptedFoldersManifestKey]);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.Buckets.Storage,
        Key: manifestKey,
        Body: JSON.stringify({ folders: manifest.folders || {} }),
        ContentType: 'application/json',
      }),
    );
  }

  private EncryptFolderKey(
    passphrase: string,
    folderKey: string,
  ): Omit<EncryptedFolderRecord, 'createdAt' | 'updatedAt'> {
    const salt = randomBytes(16);
    const key = pbkdf2Sync(
      passphrase,
      salt,
      this.EncryptedFolderKdfIterations,
      32,
      'sha512',
    );
    const iv = randomBytes(this.EncryptedFolderIvLength);
    const cipher = createCipheriv(this.EncryptedFolderAlgorithm, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(folderKey, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      salt: salt.toString('base64'),
    };
  }

  private DecryptFolderKey(
    passphrase: string,
    record: EncryptedFolderRecord,
  ): string {
    const salt = Buffer.from(record.salt, 'base64');
    const key = pbkdf2Sync(
      passphrase,
      salt,
      this.EncryptedFolderKdfIterations,
      32,
      'sha512',
    );
    const iv = Buffer.from(record.iv, 'base64');
    const decipher = createDecipheriv(this.EncryptedFolderAlgorithm, key, iv);
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private async ReadStreamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      const bufferChunk = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk instanceof Uint8Array ? chunk : String(chunk));
      chunks.push(bufferChunk);
    }
    return Buffer.concat(chunks).toString('utf8');
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
        Key: KeyBuilder([User.id, Key]),
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
      Key: KeyBuilder([User.id, Key]),
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
      Key: KeyBuilder([User.id, Key]),
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
        Key: KeyBuilder([User.id, Key]),
        UploadId: UploadId,
        MultipartUpload: {
          Parts: Parts,
        },
      }),
    );

    let metadata = {};
    if (IsImageFile(Key)) {
      metadata = await this.ProcessImageMetadata(KeyBuilder([User.id, Key]));
    }

    // Invalidate cache for the folder where the file was uploaded
    const parentFolder = this.GetParentFolderPath(Key);
    await this.InvalidateListObjectsCache(User.id, parentFolder || undefined);

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
        Key: KeyBuilder([User.id, Key]),
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

      const sourceKey = KeyBuilder([User.id, Key]);

      // determine target key (if Name provided, replace file's base name)
      let targetRelative = Key;
      let targetKey = sourceKey;

      if (Name) {
        const parts = Key.split('/');
        parts[parts.length - 1] = Name;
        targetRelative = parts.join('/');
        targetKey = KeyBuilder([User.id, targetRelative]);
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

      // Invalidate cache for the folder(s) affected
      const sourceFolder = this.GetParentFolderPath(Key);
      await this.InvalidateListObjectsCache(User.id, sourceFolder || undefined);

      // If renamed (different target), also invalidate target folder
      if (targetRelative !== Key) {
        const targetFolder = this.GetParentFolderPath(targetRelative);
        if (targetFolder !== sourceFolder) {
          await this.InvalidateListObjectsCache(
            User.id,
            targetFolder || undefined,
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

  // ============================================================================
  // DIRECTORIES API - Unified Directory Management
  // ============================================================================

  //#region Directories API

  /**
   * Create a directory. If IsEncrypted is true, creates an encrypted directory.
   * For encrypted directories, passphrase is required via X-Folder-Passphrase header.
   */
  async DirectoryCreate(
    { Path, IsEncrypted }: DirectoryCreateRequestModel,
    passphrase: string | undefined,
    User: UserContext,
  ): Promise<DirectoryResponseModel> {
    const normalizedPath = this.NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (IsEncrypted) {
      if (!passphrase || passphrase.length < 8) {
        throw new HttpException(
          'Passphrase is required (min 8 characters) for encrypted directories. Provide via X-Folder-Passphrase header.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const manifest = await this.GetEncryptedFolderManifest(User);
      if (manifest.folders[normalizedPath]) {
        throw new HttpException(
          'Encrypted folder already exists',
          HttpStatus.CONFLICT,
        );
      }

      // Create the directory
      await this.CreateDirectory(
        { Key: normalizedPath } as CloudKeyRequestModel,
        User,
      );

      // Generate and encrypt the folder key
      const folderKey = randomBytes(this.EncryptedFolderKeyBytes).toString(
        'base64',
      );
      const encrypted = this.EncryptFolderKey(passphrase, folderKey);

      const now = new Date().toISOString();
      manifest.folders[normalizedPath] = {
        ...encrypted,
        createdAt: now,
        updatedAt: now,
      };

      await this.SaveEncryptedFolderManifest(User, manifest);

      return plainToInstance(DirectoryResponseModel, {
        Path: normalizedPath,
        IsEncrypted: true,
        CreatedAt: now,
        UpdatedAt: now,
      });
    }

    // Regular directory creation
    await this.CreateDirectory(
      { Key: normalizedPath } as CloudKeyRequestModel,
      User,
    );

    return plainToInstance(DirectoryResponseModel, {
      Path: normalizedPath,
      IsEncrypted: false,
    });
  }

  /**
   * Rename a directory. For encrypted directories, validates passphrase.
   */
  async DirectoryRename(
    { Path, Name }: DirectoryRenameRequestModel,
    passphrase: string | undefined,
    User: UserContext,
  ): Promise<DirectoryResponseModel> {
    const normalizedPath = this.NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const manifest = await this.GetEncryptedFolderManifest(User);
    const isEncrypted = !!manifest.folders[normalizedPath];

    if (isEncrypted) {
      if (!passphrase) {
        throw new HttpException(
          'Passphrase required for encrypted directories. Provide via X-Folder-Passphrase header.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const entry = manifest.folders[normalizedPath];
      try {
        this.DecryptFolderKey(passphrase, entry);
      } catch {
        throw new HttpException('Invalid passphrase', HttpStatus.BAD_REQUEST);
      }
    }

    await this.RenameDirectory({ Key: normalizedPath, Name }, User, {
      allowEncryptedDirectories: isEncrypted,
    });

    // Calculate new path
    const segments = normalizedPath.split('/').filter((s) => !!s);
    const parentSegments = segments.slice(0, -1);
    const newPath = parentSegments.length
      ? `${parentSegments.join('/')}/${Name}`
      : Name;

    return plainToInstance(DirectoryResponseModel, {
      Path: this.NormalizeDirectoryPath(newPath),
      IsEncrypted: isEncrypted,
    });
  }

  /**
   * Delete a directory. For encrypted directories, validates passphrase.
   */
  async DirectoryDelete(
    { Path }: DirectoryDeleteRequestModel,
    passphrase: string | undefined,
    User: UserContext,
  ): Promise<boolean> {
    const normalizedPath = this.NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const manifest = await this.GetEncryptedFolderManifest(User);
    const isEncrypted = !!manifest.folders[normalizedPath];

    if (isEncrypted) {
      if (!passphrase) {
        throw new HttpException(
          'Passphrase required for encrypted directories. Provide via X-Folder-Passphrase header.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const entry = manifest.folders[normalizedPath];
      try {
        this.DecryptFolderKey(passphrase, entry);
      } catch {
        throw new HttpException('Invalid passphrase', HttpStatus.BAD_REQUEST);
      }

      // Delete the directory contents
      await this.Delete(
        {
          Items: [{ Key: normalizedPath, IsDirectory: true }],
        } as CloudDeleteRequestModel,
        User,
        { allowEncryptedDirectories: true },
      );

      // Remove from manifest
      delete manifest.folders[normalizedPath];
      await this.SaveEncryptedFolderManifest(User, manifest);
    } else {
      // Regular directory deletion
      await this.Delete(
        {
          Items: [{ Key: normalizedPath, IsDirectory: true }],
        } as CloudDeleteRequestModel,
        User,
      );
    }

    // Invalidate any active sessions for this path
    await this.InvalidateDirectorySession(User.id, normalizedPath);

    return true;
  }

  /**
   * Unlock an encrypted directory and create a session token.
   * The session token allows access to folder contents without providing passphrase.
   */
  async DirectoryUnlock(
    { Path }: DirectoryUnlockRequestModel,
    passphrase: string | undefined,
    User: UserContext,
  ): Promise<DirectoryUnlockResponseModel> {
    const normalizedPath = this.NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!passphrase || passphrase.length < 8) {
      throw new HttpException(
        'Passphrase is required (min 8 characters). Provide via X-Folder-Passphrase header.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const manifest = await this.GetEncryptedFolderManifest(User);

    // First try to find exact match
    let entry = manifest.folders[normalizedPath];
    let encryptedFolderPath = normalizedPath;

    // If not found, search for parent encrypted folder
    if (!entry) {
      const pathSegments = normalizedPath.split('/');

      // Try each parent folder from most specific to root
      for (let i = pathSegments.length - 1; i > 0; i--) {
        const parentPath = pathSegments.slice(0, i).join('/');
        if (manifest.folders[parentPath]) {
          entry = manifest.folders[parentPath];
          encryptedFolderPath = parentPath;
          break;
        }
      }

      // If still not found, throw error
      if (!entry) {
        throw new HttpException(
          'Encrypted folder not found',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    let folderKey: string;
    try {
      folderKey = this.DecryptFolderKey(passphrase, entry);
    } catch {
      this.logger.warn(
        `Failed to unlock encrypted folder ${normalizedPath} for user ${User.id}`,
      );
      throw new HttpException('Invalid passphrase', HttpStatus.BAD_REQUEST);
    }

    // Generate session token
    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt =
      Math.floor(Date.now() / 1000) + ENCRYPTED_FOLDER_SESSION_TTL;

    const session: EncryptedFolderSession = {
      token: sessionToken,
      folderPath: encryptedFolderPath,
      folderKey,
      expiresAt,
    };

    // Store session in Redis for the encrypted folder
    const cacheKey = this.BuildSessionKey(User.id, encryptedFolderPath);
    await this.redisService.set(
      cacheKey,
      session,
      ENCRYPTED_FOLDER_SESSION_TTL,
    );

    // If unlocking a child folder, also store session for the requested path
    if (normalizedPath !== encryptedFolderPath) {
      const childCacheKey = this.BuildSessionKey(User.id, normalizedPath);
      await this.redisService.set(
        childCacheKey,
        session,
        ENCRYPTED_FOLDER_SESSION_TTL,
      );
    }

    return plainToInstance(DirectoryUnlockResponseModel, {
      Path: normalizedPath,
      EncryptedFolderPath: encryptedFolderPath,
      SessionToken: sessionToken,
      ExpiresAt: expiresAt,
      TTL: ENCRYPTED_FOLDER_SESSION_TTL,
    });
  }

  /**
   * Lock an encrypted directory (invalidate session).
   */
  async DirectoryLock(
    { Path }: DirectoryLockRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    const normalizedPath = this.NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.InvalidateDirectorySession(User.id, normalizedPath);
    return true;
  }

  /**
   * Convert an existing directory to encrypted.
   */
  async DirectoryConvertToEncrypted(
    { Path }: DirectoryConvertToEncryptedRequestModel,
    passphrase: string | undefined,
    User: UserContext,
  ): Promise<DirectoryResponseModel> {
    const normalizedPath = this.NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!passphrase || passphrase.length < 8) {
      throw new HttpException(
        'Passphrase is required (min 8 characters). Provide via X-Folder-Passphrase header.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const manifest = await this.GetEncryptedFolderManifest(User);
    if (manifest.folders[normalizedPath]) {
      throw new HttpException(
        'Directory is already encrypted',
        HttpStatus.CONFLICT,
      );
    }

    // Verify directory exists
    const ensureTrailingSlash = (value: string): string =>
      value.endsWith('/') ? value : value + '/';
    const directoryPrefix = ensureTrailingSlash(
      KeyBuilder([User.id, normalizedPath]),
    );

    const listResponse = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: this.Buckets.Storage,
        Prefix: directoryPrefix,
        MaxKeys: 1,
      }),
    );

    const hasObjects = (listResponse.Contents?.length ?? 0) > 0;
    if (!hasObjects) {
      throw new HttpException(
        'Directory not found or is empty',
        HttpStatus.NOT_FOUND,
      );
    }

    // Generate and encrypt folder key
    const folderKey = randomBytes(this.EncryptedFolderKeyBytes).toString(
      'base64',
    );
    const encrypted = this.EncryptFolderKey(passphrase, folderKey);
    const now = new Date().toISOString();

    manifest.folders[normalizedPath] = {
      ...encrypted,
      createdAt: now,
      updatedAt: now,
    };

    await this.SaveEncryptedFolderManifest(User, manifest);

    return plainToInstance(DirectoryResponseModel, {
      Path: normalizedPath,
      IsEncrypted: true,
      CreatedAt: now,
      UpdatedAt: now,
    });
  }

  /**
   * Remove encryption from a directory (decrypt).
   */
  async DirectoryDecrypt(
    { Path }: DirectoryDecryptRequestModel,
    passphrase: string | undefined,
    User: UserContext,
  ): Promise<DirectoryResponseModel> {
    const normalizedPath = this.NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!passphrase) {
      throw new HttpException(
        'Passphrase is required. Provide via X-Folder-Passphrase header.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const manifest = await this.GetEncryptedFolderManifest(User);
    const entry = manifest.folders[normalizedPath];

    if (!entry) {
      throw new HttpException(
        'Directory is not encrypted',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate passphrase
    try {
      this.DecryptFolderKey(passphrase, entry);
    } catch {
      throw new HttpException('Invalid passphrase', HttpStatus.BAD_REQUEST);
    }

    // Remove encryption metadata
    delete manifest.folders[normalizedPath];
    await this.SaveEncryptedFolderManifest(User, manifest);

    // Invalidate any active sessions
    await this.InvalidateDirectorySession(User.id, normalizedPath);

    return plainToInstance(DirectoryResponseModel, {
      Path: normalizedPath,
      IsEncrypted: false,
    });
  }

  /**
   * Validate session token for an encrypted folder.
   * Returns the session if valid, null otherwise.
   */
  async ValidateDirectorySession(
    userId: string,
    folderPath: string,
    sessionToken: string,
  ): Promise<EncryptedFolderSession | null> {
    const normalizedPath = this.NormalizeDirectoryPath(folderPath);

    // First, try to find session for the exact folder path
    const cacheKey = this.BuildSessionKey(userId, normalizedPath);
    let session = await this.redisService.get<EncryptedFolderSession>(cacheKey);

    // If not found, check if there's a session for any child folder of this path
    // This handles the case where user unlocks a child folder and then navigates to parent
    if (!session) {
      const basePattern = `encrypted-folder:session:${userId}:`;
      const pattern = normalizedPath
        ? `${basePattern}${normalizedPath}/*`
        : `${basePattern}*`;
      const keys = await this.redisService.keys(pattern);

      for (const key of keys) {
        const childSession =
          await this.redisService.get<EncryptedFolderSession>(key);
        if (childSession && childSession.token === sessionToken) {
          session = childSession;
          break;
        }
      }
    }

    if (!session || session.token !== sessionToken) {
      return null;
    }

    if (session.expiresAt < Math.floor(Date.now() / 1000)) {
      await this.redisService.del(cacheKey);
      return null;
    }

    return session;
  }

  /**
   * Check if a path is inside an encrypted folder and whether the user has a valid session.
   * Returns { isEncrypted, hasAccess, encryptingFolder } tuple.
   */
  async CheckEncryptedFolderAccess(
    path: string,
    userId: string,
    sessionToken?: string,
  ): Promise<{
    isEncrypted: boolean;
    hasAccess: boolean;
    encryptingFolder?: string;
  }> {
    const normalizedPath = this.NormalizeDirectoryPath(path);
    const manifest = await this.GetEncryptedFolderManifestByUserId(userId);

    // Check if path is inside any encrypted folder
    let encryptingFolder: string | undefined;
    for (const encPath of Object.keys(manifest.folders)) {
      if (
        normalizedPath === encPath ||
        normalizedPath.startsWith(encPath + '/')
      ) {
        encryptingFolder = encPath;
        break;
      }
    }

    if (!encryptingFolder) {
      return { isEncrypted: false, hasAccess: true };
    }

    if (!sessionToken) {
      return { isEncrypted: true, hasAccess: false, encryptingFolder };
    }

    const session = await this.ValidateDirectorySession(
      userId,
      encryptingFolder,
      sessionToken,
    );

    return {
      isEncrypted: true,
      hasAccess: !!session,
      encryptingFolder,
    };
  }

  private BuildSessionKey(userId: string, folderPath: string): string {
    const normalizedPath = this.NormalizeDirectoryPath(folderPath);
    return `encrypted-folder:session:${userId}:${normalizedPath}`;
  }

  private async InvalidateDirectorySession(
    userId: string,
    folderPath: string,
  ): Promise<void> {
    const cacheKey = this.BuildSessionKey(userId, folderPath);
    await this.redisService.del(cacheKey);
  }

  private async GetEncryptedFolderManifestByUserId(
    userId: string,
  ): Promise<EncryptedFolderManifest> {
    // Create a minimal user context for internal use
    return this.GetEncryptedFolderManifest({ id: userId } as UserContext);
  }

  /**
   * Get active session for encrypted folder access.
   * Used by ProcessDirectories to determine lock status.
   */
  async GetActiveSession(
    userId: string,
    folderPath: string,
  ): Promise<EncryptedFolderSession | null> {
    const cacheKey = this.BuildSessionKey(userId, folderPath);
    const session =
      await this.redisService.get<EncryptedFolderSession>(cacheKey);

    if (!session || session.expiresAt < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return session;
  }

  //#endregion
}
