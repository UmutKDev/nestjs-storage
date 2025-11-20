import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { HttpException, Injectable } from '@nestjs/common';
import { InjectAws } from 'aws-sdk-v3-nest';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { CloudFindRequestModel } from './cloud.model';

@Injectable()
export class CloudService {
  constructor(@InjectAws(S3Client) private readonly s3: S3Client) {}

  async List() {
    const command = await this.s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.STORAGE_S3_BUCKET,
      }),
    );

    return command;
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
      if (error.name === 'NoSuchKey') {
        throw new HttpException('File not found', 404);
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
      if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
        throw new HttpException('File not found', 404);
      }
      throw error;
    }
  }
}
