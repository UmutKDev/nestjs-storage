import {
  _Object,
  CommonPrefix,
  GetObjectCommand,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { HttpException, Injectable } from '@nestjs/common';
import { InjectAws } from 'aws-sdk-v3-nest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  CloudBreadCrumbModel,
  CloudFindRequestModel,
  CloudListRequestModel,
  CloudListResponseModel,
  CloudObjectModel,
} from './cloud.model';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class CloudService {
  private readonly NotFoundErrorCodes = ['NoSuchKey', 'NotFound'];
  private readonly MaxProcessMetadataObjects = 1000;
  private readonly MaxListObjects = 1000;
  private readonly MaxObjectSizeBytes = 50 * 1024 * 1024; // 50 MB
  private readonly PresignedUrlExpirySeconds = 3600; // 1 hour
  private readonly IsDirectory = (key: string) =>
    key.includes('.emptyFolderPlaceholder');
  private Prefix = null;
  private Delimiter = false;
  private IsMetadataProcessing = false;

  constructor(@InjectAws(S3Client) private readonly s3: S3Client) {}

  async List({
    Path,
    Delimiter,
    IsMetadataProcessing,
  }: CloudListRequestModel): Promise<CloudListResponseModel> {
    if (Path) {
      this.Prefix = Path.replace(/^\/+|\/+$/g, '') + '/';
    }

    if (this.Delimiter) {
      this.Delimiter = Delimiter;
    }

    if (this.IsMetadataProcessing) {
      this.IsMetadataProcessing = IsMetadataProcessing;
    }

    const command = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.STORAGE_S3_BUCKET,
        MaxKeys: this.MaxListObjects,
        Delimiter: this.Delimiter ? '/' : '',
        Prefix: this.Prefix,
      }),
    );

    const [Breadcrumb, Directories, Contents] = await Promise.all([
      this.ProcessBreadcrumb(Path || ''),
      this.ProcessDirectories(command.CommonPrefixes ?? [], this.Prefix),
      this.ProcessObjects(command.Contents ?? [], this.IsMetadataProcessing),
    ]);

    return plainToInstance(CloudListResponseModel, {
      Breadcrumb,
      Directories,
      Contents,
    });
  }

  async Find({ Key }: CloudFindRequestModel) {
    try {
      const command = await this.s3.send(
        new HeadObjectCommand({
          Bucket: process.env.STORAGE_S3_BUCKET,
          Key: Key,
        }),
      );

      return command;
    } catch (error) {
      if (this.NotFoundErrorCodes.includes(error.name)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }

  async GetPresignedUrl({ Key }: CloudFindRequestModel): Promise<string> {
    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: process.env.STORAGE_S3_BUCKET,
          Key: Key,
        }),
      );

      const command = new GetObjectCommand({
        Bucket: process.env.STORAGE_S3_BUCKET,
        Key: Key,
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

  async GetObjectStream({
    Key,
  }: CloudFindRequestModel): Promise<ReadableStream> {
    try {
      const command = await this.s3.send(
        new GetObjectCommand({
          Bucket: process.env.STORAGE_S3_BUCKET,
          Key: Key,
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
  ): Promise<CloudBreadCrumbModel[]> {
    const breadcrumb: CloudBreadCrumbModel[] = this.Delimiter
      ? [
          {
            Name: 'root',
            Path: '/',
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
      });
    }

    return breadcrumb;
  }

  private async ProcessDirectories(
    CommonPrefixes: CommonPrefix[],
    Prefix: string,
  ): Promise<string[]> {
    if (CommonPrefixes.length === 0) {
      return [];
    }

    const directories: string[] = [];
    for (const commonPrefix of CommonPrefixes) {
      if (commonPrefix.Prefix) {
        const dirName = commonPrefix.Prefix.replace(Prefix, '').replace(
          '/',
          '',
        );
        directories.push(dirName);
      }
    }
    return directories;
  }

  private async ProcessObjects(
    Contents: _Object[],
    IsMetadataProcessing = false,
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
        Name: content.Key?.split('/').pop() || '',
        Extension: content.Key?.includes('.')
          ? content.Key.split('.').pop() || ''
          : '',
        MimeType: metadata.ContentType || '',
        Path: {
          Host: process.env.STORAGE_S3_PUBLIC_ENDPOINT || '',
          Key: content.Key || '',
          Url: content.Key,
        },
        Metadata: metadata.Metadata || {},
        Size: content.Size || 0,
        ETag: content.ETag || '',
        LastModified: content.LastModified
          ? content.LastModified.toISOString()
          : '',
      });
    }
    return processedContents;
  }
}
