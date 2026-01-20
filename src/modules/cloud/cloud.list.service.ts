import {
  CommonPrefix,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  _Object,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { plainToInstance } from 'class-transformer';
import {
  CloudBreadCrumbModel,
  CloudDirectoryModel,
  CloudListRequestModel,
  CloudListResponseModel,
  CloudObjectModel,
} from './cloud.model';
import { CloudBreadcrumbLevelType } from '@common/enums';
import {
  IsImageFile,
  KeyBuilder,
  MimeTypeFromExtension,
} from '@common/helpers/cast.helper';
import { CloudS3Service } from './cloud.s3.service';
import { CloudMetadataService } from './cloud.metadata.service';
import { NormalizeDirectoryPath } from './cloud.utils';
import { RedisService } from '@modules/redis/redis.service';

@Injectable()
export class CloudListService {
  private readonly MaxProcessMetadataObjects = Math.max(
    1,
    parseInt(process.env.CLOUD_LIST_METADATA_MAX ?? '1000', 10),
  );
  private readonly MaxListObjects = 1000;
  private readonly MetadataProcessingConcurrency = Math.max(
    1,
    parseInt(process.env.CLOUD_LIST_METADATA_CONCURRENCY ?? '5', 10),
  );
  private readonly PresignedUrlExpirySeconds = 3600;
  private readonly DirectoryThumbnailLimit = 4;
  private readonly DirectoryThumbnailMaxFolders = 4;
  private readonly DirectoryThumbnailCacheTTLSeconds = Math.max(
    1,
    parseInt(
      process.env.CLOUD_LIST_THUMBNAIL_CACHE_TTL_SECONDS ?? '86400',
      10,
    ),
  );
  private readonly EmptyFolderPlaceholder = '.emptyFolderPlaceholder';
  private readonly IsSignedUrlProcessing =
    process.env.S3_PROTOCOL_SIGNED_URL_PROCESSING === 'true';
  private readonly IsDirectory = (key: string) =>
    key.includes(this.EmptyFolderPlaceholder);

  constructor(
    private readonly CloudS3Service: CloudS3Service,
    private readonly CloudMetadataService: CloudMetadataService,
    private readonly RedisService: RedisService,
  ) {}

  async List(
    { Path, Delimiter, IsMetadataProcessing }: CloudListRequestModel,
    User: UserContext,
    EncryptedFolders?: Set<string>,
    SessionToken?: string,
    ValidateDirectorySession?: (
      userId: string,
      folderPath: string,
      sessionToken: string,
    ) => Promise<unknown>,
  ): Promise<CloudListResponseModel> {
    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';

    let prefix = KeyBuilder([User.id, cleanedPath]);
    if (!prefix.endsWith('/')) {
      prefix = prefix + '/';
    }

    const command = await this.CloudS3Service.Send(
      new ListObjectsV2Command({
        Bucket: this.CloudS3Service.GetBuckets().Storage,
        MaxKeys: this.MaxListObjects,
        Delimiter: Delimiter ? '/' : undefined,
        Prefix: prefix,
      }),
    );

    const [Breadcrumb, Directories, Contents] = await Promise.all([
      this.ProcessBreadcrumb(Path || '', Delimiter),
      this.ProcessDirectories(
        command.CommonPrefixes ?? [],
        prefix,
        User,
        EncryptedFolders,
        SessionToken,
        ValidateDirectorySession,
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
  ): Promise<{ Objects: CloudObjectModel[]; TotalCount: number }> {
    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';

    let prefix = KeyBuilder([User.id, cleanedPath]);
    if (!prefix.endsWith('/')) {
      prefix = prefix + '/';
    }

    const skipValue = typeof skip === 'number' && skip > 0 ? skip : 0;
    const takeValue =
      typeof take === 'number' && take > 0 ? take : this.MaxListObjects;

    if (!skipValue && takeValue === this.MaxListObjects) {
      const command = await this.CloudS3Service.Send(
        new ListObjectsV2Command({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          MaxKeys: this.MaxListObjects,
          Delimiter: Delimiter ? '/' : undefined,
          Prefix: prefix,
        }),
      );

      const objects = await this.ProcessObjects(
        command.Contents ?? [],
        IsMetadataProcessing,
        User,
        this.IsSignedUrlProcessing,
      );

      return { Objects: objects, TotalCount: objects.length };
    }

    const aggregated: _Object[] = [];
    let continuationToken: string | undefined = undefined;
    let isFirstRequest = true;

    while (true) {
      const maxKeys = Math.min(
        this.MaxListObjects,
        Math.max(1, skipValue + takeValue - aggregated.length),
      );
      const params: ListObjectsV2CommandInput = {
        Bucket: this.CloudS3Service.GetBuckets().Storage,
        Delimiter: Delimiter ? '/' : undefined,
        Prefix: prefix,
        MaxKeys: maxKeys,
      };

      if (isFirstRequest && search) {
        params.StartAfter = search;
      }
      if (continuationToken) {
        params.ContinuationToken = continuationToken;
      }

      const command = await this.CloudS3Service.Send(
        new ListObjectsV2Command(params),
      );

      const contents = command.Contents ?? [];
      aggregated.push(...contents);

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

    let totalCount = aggregated.length;
    while (continuationToken) {
      const countParams: ListObjectsV2CommandInput = {
        Bucket: this.CloudS3Service.GetBuckets().Storage,
        Delimiter: Delimiter ? '/' : undefined,
        Prefix: prefix,
        MaxKeys: this.MaxListObjects,
        ContinuationToken: continuationToken,
      };

      const countCommand = await this.CloudS3Service.Send(
        new ListObjectsV2Command(countParams),
      );
      totalCount += (countCommand.Contents ?? []).length;

      if (!countCommand.IsTruncated) {
        break;
      }
      continuationToken = countCommand.NextContinuationToken;
    }

    return { Objects: objects, TotalCount: totalCount };
  }

  async ListDirectories(
    {
      Path,
      search,
      skip,
      take,
    }: CloudListRequestModel & {
      search?: string;
      skip?: number;
      take?: number;
    },
    User: UserContext,
    EncryptedFolders?: Set<string>,
    SessionToken?: string,
    ValidateDirectorySession?: (
      userId: string,
      folderPath: string,
      sessionToken: string,
    ) => Promise<unknown>,
  ): Promise<{ Directories: CloudDirectoryModel[]; TotalCount: number }> {
    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';

    let prefix = KeyBuilder([User.id, cleanedPath]);
    if (!prefix.endsWith('/')) {
      prefix = prefix + '/';
    }

    const usePagination = typeof skip === 'number' || typeof take === 'number';
    const delimiterValue = '/';

    if (!usePagination) {
      const command = await this.CloudS3Service.Send(
        new ListObjectsV2Command({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Delimiter: delimiterValue,
          Prefix: prefix,
        }),
      );

      const directories = await this.ProcessDirectories(
        command.CommonPrefixes ?? [],
        prefix,
        User,
        EncryptedFolders,
        SessionToken,
        ValidateDirectorySession,
        true,
        this.IsSignedUrlProcessing,
      );

      return {
        Directories: directories,
        TotalCount: command.CommonPrefixes?.length ?? 0,
      };
    }

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
        Bucket: this.CloudS3Service.GetBuckets().Storage,
        Delimiter: delimiterValue,
        Prefix: prefix,
        MaxKeys: maxKeys,
      };

      if (isFirstRequest && search) {
        params.StartAfter = search;
      }
      if (continuationToken) {
        params.ContinuationToken = continuationToken;
      }

      const command = await this.CloudS3Service.Send(
        new ListObjectsV2Command(params),
      );

      const commonPrefixes = command.CommonPrefixes ?? [];
      aggregated.push(...commonPrefixes);

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

    const directories = await this.ProcessDirectories(
      sliced,
      prefix,
      User,
      EncryptedFolders,
      SessionToken,
      ValidateDirectorySession,
      true,
      this.IsSignedUrlProcessing,
    );

    let totalCount = aggregated.length;
    while (continuationToken) {
      const countParams: ListObjectsV2CommandInput = {
        Bucket: this.CloudS3Service.GetBuckets().Storage,
        Delimiter: delimiterValue,
        Prefix: prefix,
        MaxKeys: this.MaxListObjects,
        ContinuationToken: continuationToken,
      };

      const countCommand = await this.CloudS3Service.Send(
        new ListObjectsV2Command(countParams),
      );
      totalCount += (countCommand.CommonPrefixes ?? []).length;

      if (!countCommand.IsTruncated) {
        break;
      }
      continuationToken = countCommand.NextContinuationToken;
    }

    return { Directories: directories, TotalCount: totalCount };
  }

  async ProcessBreadcrumb(
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

  async ProcessDirectories(
    CommonPrefixes: CommonPrefix[],
    Prefix: string,
    User: UserContext,
    EncryptedFolders?: Set<string>,
    SessionToken?: string,
    ValidateDirectorySession?: (
      userId: string,
      folderPath: string,
      sessionToken: string,
    ) => Promise<unknown>,
    IncludeThumbnails = false,
    IsSignedUrlProcessing = false,
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
        const normalizedPrefix = NormalizeDirectoryPath(DirectoryPrefix);
        const isEncrypted = EncryptedFolders?.has(normalizedPrefix) ?? false;

        let isLocked = true;
        if (isEncrypted && SessionToken && ValidateDirectorySession) {
          const session = await ValidateDirectorySession(
            User.id,
            normalizedPrefix,
            SessionToken,
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

    if (IncludeThumbnails && directories.length > 0) {
      const concurrency = Math.min(
        this.MetadataProcessingConcurrency,
        directories.length,
      );
      let currentIndex = 0;
      const worker = async () => {
        while (true) {
          const index = currentIndex++;
          if (index >= directories.length) {
            break;
          }
          const directory = directories[index];
          if (directory.IsEncrypted && directory.IsLocked) {
            directory.Thumbnails = [];
            continue;
          }
          directory.Thumbnails = await this.ListDirectoryThumbnails(
            directory.Prefix,
            User,
            IsSignedUrlProcessing,
          );
        }
      };
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    }
    return directories;
  }

  async ProcessObjects(
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
    const processedContents = new Array<CloudObjectModel>(Contents.length);
    let index = 0;
    const worker = async () => {
      while (true) {
        const current = index++;
        if (current >= Contents.length) {
          break;
        }
        const content = Contents[current];
        processedContents[current] = await this.BuildObjectModel(
          content,
          User,
          IsMetadataProcessing,
          IsSignedUrlProcessing,
        );
      }
    };
    const concurrency = Math.min(
      this.MetadataProcessingConcurrency,
      Contents.length,
    );
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return processedContents.filter((item) => !!item);
  }

  private async BuildObjectModel(
    content: _Object,
    User: UserContext,
    IsMetadataProcessing: boolean,
    IsSignedUrlProcessing: boolean,
  ): Promise<CloudObjectModel> {
    let metadata: Record<string, string> = {};
    let contentType: string | undefined = undefined;

    if (IsMetadataProcessing) {
      const head = await this.CloudS3Service.Send(
        new HeadObjectCommand({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Key: content.Key,
        }),
      );
      metadata = this.CloudMetadataService.DecodeMetadataFromS3(head.Metadata);
      contentType = head.ContentType;
    }

    const ObjectCommand = new GetObjectCommand({
      Bucket: this.CloudS3Service.GetBuckets().Storage,
      Key: content.Key,
    });

    const SignedUrl = IsSignedUrlProcessing
      ? this.ReplaceSignedUrlHost(
          await getSignedUrl(this.CloudS3Service.GetClient(), ObjectCommand, {
            expiresIn: this.PresignedUrlExpirySeconds,
          }),
        )
      : this.CloudS3Service.GetPublicEndpoint() + '/' + content.Key;

    const Name = content.Key?.split('/').pop();
    const Extension = Name?.includes('.') ? Name.split('.').pop() : '';

    return {
      Name: Name,
      Extension: Extension,
      MimeType:
        (contentType ?? MimeTypeFromExtension(Extension)) ||
        'application/octet-stream',
      Path: {
        Host: this.CloudS3Service.GetPublicHostname(),
        Key: content.Key.replace('' + User.id + '/', ''),
        Url: SignedUrl,
      },
      Metadata: metadata,
      Size: content.Size,
      ETag: content.ETag,
      LastModified: content.LastModified
        ? content.LastModified.toISOString()
        : '',
    };
  }

  private async ListDirectoryThumbnails(
    directoryPrefix: string,
    User: UserContext,
    IsSignedUrlProcessing: boolean,
  ): Promise<CloudObjectModel[]> {
    const normalizedPrefix = NormalizeDirectoryPath(directoryPrefix);
    if (!normalizedPrefix) {
      return [];
    }

    const prefix = KeyBuilder([User.id, normalizedPrefix]);
    const cacheKey = this.BuildDirectoryThumbnailCacheKey(
      User.id,
      normalizedPrefix,
      IsSignedUrlProcessing,
    );
    const cached = await this.RedisService.get<CloudObjectModel[]>(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const thumbnails: CloudObjectModel[] = [];
    const foldersUsed = new Set<string>();
    const folderOrder: string[] = [];
    const folderBuckets = new Map<string, CloudObjectModel[]>();
    let continuationToken: string | undefined = undefined;

    const totalBucketItems = (): number =>
      Array.from(folderBuckets.values()).reduce(
        (total, bucket) => total + bucket.length,
        0,
      );

    while (true) {
      const command = await this.CloudS3Service.Send(
        new ListObjectsV2Command({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Prefix: prefix,
          MaxKeys: this.MaxListObjects,
          ContinuationToken: continuationToken,
        }),
      );

      for (const content of command.Contents ?? []) {
        const key = content.Key;
        if (!key) {
          continue;
        }
        if (this.IsDirectory(key)) {
          continue;
        }
        if (!IsImageFile(key)) {
          continue;
        }
        const groupKey = this.GetThumbnailGroupKey(prefix, key);
        if (
          groupKey &&
          !foldersUsed.has(groupKey) &&
          foldersUsed.size >= this.DirectoryThumbnailMaxFolders
        ) {
          continue;
        }
        if (groupKey) {
          if (!foldersUsed.has(groupKey)) {
            foldersUsed.add(groupKey);
            folderOrder.push(groupKey);
            folderBuckets.set(groupKey, []);
          }
          const bucket = folderBuckets.get(groupKey);
          if (bucket && bucket.length < this.DirectoryThumbnailLimit) {
            bucket.push(
              await this.BuildObjectModel(
                content,
                User,
                false,
                IsSignedUrlProcessing,
              ),
            );
          }
          continue;
        }

        if (!foldersUsed.has('root')) {
          foldersUsed.add('root');
          folderOrder.push('root');
          folderBuckets.set('root', []);
        }
        const rootBucket = folderBuckets.get('root');
        if (rootBucket && rootBucket.length < this.DirectoryThumbnailLimit) {
          rootBucket.push(
            await this.BuildObjectModel(
              content,
              User,
              false,
              IsSignedUrlProcessing,
            ),
          );
        }
      }

      if (
        totalBucketItems() >= this.DirectoryThumbnailLimit &&
        foldersUsed.size >= this.DirectoryThumbnailMaxFolders
      ) {
        break;
      }

      if (!command.IsTruncated) {
        break;
      }
      continuationToken = command.NextContinuationToken;
    }

    while (thumbnails.length < this.DirectoryThumbnailLimit) {
      let added = false;
      for (const folderKey of folderOrder) {
        const bucket = folderBuckets.get(folderKey);
        if (!bucket || bucket.length === 0) {
          continue;
        }
        const item = bucket.shift();
        if (item) {
          thumbnails.push(item);
          added = true;
          if (thumbnails.length >= this.DirectoryThumbnailLimit) {
            break;
          }
        }
      }
      if (!added) {
        break;
      }
    }

    const ttlSeconds = IsSignedUrlProcessing
      ? Math.min(
          this.DirectoryThumbnailCacheTTLSeconds,
          Math.max(1, this.PresignedUrlExpirySeconds - 60),
        )
      : this.DirectoryThumbnailCacheTTLSeconds;
    await this.RedisService.set(cacheKey, thumbnails, ttlSeconds);

    return thumbnails;
  }

  private BuildDirectoryThumbnailCacheKey(
    userId: string,
    directoryPrefix: string,
    isSigned: boolean,
  ): string {
    const mode = isSigned ? 'signed' : 'public';
    return `cloud:dir-thumbnails:${mode}:${userId}:${directoryPrefix}`;
  }

  async InvalidateDirectoryThumbnailCache(
    userId: string,
    directoryPath: string,
  ): Promise<void> {
    const normalized = NormalizeDirectoryPath(directoryPath);
    if (!normalized) {
      return;
    }
    const ancestors = this.GetDirectoryAncestors(normalized);
    for (const path of ancestors) {
      await this.RedisService.del(
        this.BuildDirectoryThumbnailCacheKey(userId, path, false),
      );
      await this.RedisService.del(
        this.BuildDirectoryThumbnailCacheKey(userId, path, true),
      );
    }
  }

  async InvalidateThumbnailCacheForObjectKey(
    userId: string,
    objectKey: string,
  ): Promise<void> {
    const parent = this.GetParentDirectoryPath(objectKey);
    if (!parent) {
      return;
    }
    await this.InvalidateDirectoryThumbnailCache(userId, parent);
  }

  private GetDirectoryAncestors(path: string): string[] {
    const normalized = NormalizeDirectoryPath(path);
    if (!normalized) {
      return [];
    }
    const parts = normalized.split('/').filter((part) => !!part);
    const ancestors: string[] = [];
    for (let i = parts.length; i >= 1; i -= 1) {
      ancestors.push(parts.slice(0, i).join('/'));
    }
    return ancestors;
  }

  private GetParentDirectoryPath(path: string): string {
    const normalized = NormalizeDirectoryPath(path);
    if (!normalized) {
      return '';
    }
    const parts = normalized.split('/').filter((part) => !!part);
    if (parts.length <= 1) {
      return '';
    }
    parts.pop();
    return parts.join('/');
  }

  private GetThumbnailGroupKey(
    prefix: string,
    objectKey: string,
  ): string | null {
    if (!objectKey.startsWith(prefix)) {
      return null;
    }
    const relative = objectKey.slice(prefix.length);
    const parts = relative.split('/').filter((part) => !!part);
    if (parts.length <= 1) {
      return 'root';
    }
    return parts[0];
  }

  private ReplaceSignedUrlHost(url: string): string {
    const publicEndpoint = process.env.STORAGE_S3_PUBLIC_ENDPOINT;
    if (!publicEndpoint) {
      return url;
    }

    try {
      const signedUrl = new URL(url);
      const endpointUrl = new URL(publicEndpoint);
      signedUrl.protocol = endpointUrl.protocol;
      signedUrl.host = endpointUrl.host;
      return signedUrl.toString();
    } catch {
      return url;
    }
  }
}
