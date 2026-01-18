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

@Injectable()
export class CloudListService {
  private readonly MaxProcessMetadataObjects = 1000;
  private readonly MaxListObjects = 1000;
  private readonly PresignedUrlExpirySeconds = 3600;
  private readonly EmptyFolderPlaceholder = '.emptyFolderPlaceholder';
  private readonly IsSignedUrlProcessing =
    process.env.S3_PROTOCOL_SIGNED_URL_PROCESSING === 'true';
  private readonly IsDirectory = (key: string) =>
    key.includes(this.EmptyFolderPlaceholder);

  constructor(
    private readonly CloudS3Service: CloudS3Service,
    private readonly CloudMetadataService: CloudMetadataService,
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
      Delimiter,
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

    if (!Delimiter) {
      const command = await this.CloudS3Service.Send(
        new ListObjectsV2Command({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
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
        Delimiter: '/',
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
    );

    let totalCount = aggregated.length;
    while (continuationToken) {
      const countParams: ListObjectsV2CommandInput = {
        Bucket: this.CloudS3Service.GetBuckets().Storage,
        Delimiter: '/',
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
    const processedContents: CloudObjectModel[] = [];
    for (const content of Contents) {
      let metadata: Record<string, string> = {};
      let contentType: string | undefined = undefined;
      let width = 0;

      if (IsMetadataProcessing) {
        const head = await this.CloudS3Service.Send(
          new HeadObjectCommand({
            Bucket: this.CloudS3Service.GetBuckets().Storage,
            Key: content.Key,
          }),
        );
        metadata = this.CloudMetadataService.DecodeMetadataFromS3(
          head.Metadata,
        );
        contentType = head.ContentType;
        width = Number(head.Metadata?.width) || 0;
      }

      const ObjectCommand = new GetObjectCommand({
        Bucket: this.CloudS3Service.GetBuckets().Storage,
        Key: content.Key,
      });

      const ImageBuilder =
        IsImageFile(content.Key || '') && width
          ? `?w=${width / (width > 3000 ? 4 : width > 2500 ? 3 : width > 2000 ? 2.5 : width > 1000 ? 2 : 1)}`
          : '';

      const SignedUrl =
        (IsSignedUrlProcessing
          ? await getSignedUrl(this.CloudS3Service.GetClient(), ObjectCommand, {
              expiresIn: this.PresignedUrlExpirySeconds,
            })
          : this.CloudS3Service.GetPublicEndpoint() + '/' + content.Key) +
        ImageBuilder;

      const Name = content.Key?.split('/').pop();
      const Extension = Name?.includes('.') ? Name.split('.').pop() : '';

      processedContents.push({
        Name: Name,
        Extension: Extension,
        MimeType:
          (contentType ?? MimeTypeFromExtension(Extension)) ||
          'application/octet-stream',
        Path: {
          Host: this.CloudS3Service.GetPublicEndpoint(),
          Key: content.Key.replace('' + User.id + '/', ''),
          Url: SignedUrl,
        },
        Metadata: metadata,
        Size: content.Size,
        ETag: content.ETag,
        LastModified: content.LastModified
          ? content.LastModified.toISOString()
          : '',
      });
    }
    return processedContents;
  }

}
