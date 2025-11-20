import {
  _Object,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { HttpException, Injectable } from '@nestjs/common';
import { InjectAws } from 'aws-sdk-v3-nest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  CloudFindRequestModel,
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

  constructor(@InjectAws(S3Client) private readonly s3: S3Client) {}

  async List(): Promise<CloudListResponseModel> {
    const command = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.STORAGE_S3_BUCKET,
      }),
    );

    const [Directories, Contents] = await Promise.all([
      this.ProcessDirectories(command.Contents || []),
      this.ProcessObjects(command.Contents || []),
    ]);

    return plainToInstance(CloudListResponseModel, {
      Breadcrumb: [],
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

  async GetPresignedUrl({ Key }: CloudFindRequestModel) {
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

      const url = await getSignedUrl(this.s3, command, { expiresIn: 3600 });

      return url;
    } catch (error) {
      if (this.NotFoundErrorCodes.includes(error.name)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }

  async GetObjectStream({ Key }: CloudFindRequestModel) {
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

  private async ProcessDirectories(contents: _Object[]) {
    const directoriesSet: Set<string> = new Set();

    contents.forEach((content) => {
      if (content.Key) {
        const parts = content.Key.split('/');
        if (parts.length > 1) {
          directoriesSet.add(parts.slice(0, -1).join('/') + '/');
        }
      }
    });

    return Array.from(directoriesSet);
  }

  private async ProcessObjects(contents: _Object[]) {
    if (contents.length === 0) {
      return [];
    }

    if (contents.length > this.MaxProcessMetadataObjects) {
      contents = contents.slice(0, this.MaxProcessMetadataObjects);
    }

    contents = contents.filter((c) => c.Key !== undefined);
    contents = contents.filter((c) => !this.IsDirectory(c.Key || ''));

    const processedContents: CloudObjectModel[] = [];
    for (const content of contents) {
      const metadata = await this.s3.send(
        new HeadObjectCommand({
          Bucket: process.env.STORAGE_S3_BUCKET,
          Key: content.Key,
        }),
      );
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
