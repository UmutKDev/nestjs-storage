import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Readable } from 'stream';
import {
  CloudKeyRequestModel,
  CloudMoveRequestModel,
  CloudDeleteRequestModel,
  CloudUpdateRequestModel,
  CloudObjectModel,
  CloudPreSignedUrlRequestModel,
} from './cloud.model';
import { CloudS3Service } from './cloud.s3.service';
import { CloudMetadataService } from './cloud.metadata.service';
import { KeyBuilder } from '@common/helpers/cast.helper';

@Injectable()
export class CloudObjectService {
  private readonly Logger = new Logger(CloudObjectService.name);
  private readonly PresignedUrlExpirySeconds = 3600; // 1 hour

  constructor(
    private readonly CloudS3Service: CloudS3Service,
    private readonly CloudMetadataService: CloudMetadataService,
  ) {}

  async Find(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<CloudObjectModel> {
    try {
      const command = await this.CloudS3Service.Send(
        new HeadObjectCommand({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Key: KeyBuilder([User.id, Key]),
        }),
      );

      return plainToInstance(CloudObjectModel, {
        Name: Key?.split('/').pop(),
        Extension: Key?.includes('.') ? Key.split('.').pop() : undefined,
        MimeType: command.ContentType,
        Path: {
          Host: this.CloudS3Service.GetPublicHostname(),
          Key: Key.replace('' + User.id + '/', ''),
          Url: Key,
        },
        Metadata: this.CloudMetadataService.DecodeMetadataFromS3(
          command.Metadata,
        ),
        Size: command.ContentLength,
        ETag: command.ETag,
        LastModified: command.LastModified
          ? command.LastModified.toISOString()
          : '',
      });
    } catch (error) {
      if (this.CloudS3Service.IsNotFoundError(error)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }

  async GetPresignedUrl(
    { Key, ExpiresInSeconds }: CloudPreSignedUrlRequestModel,
    User: UserContext,
  ): Promise<string> {
    try {
      await this.CloudS3Service.Send(
        new HeadObjectCommand({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Key: KeyBuilder([User.id, Key]),
        }),
      );

      const command = new GetObjectCommand({
        Bucket: this.CloudS3Service.GetBuckets().Storage,
        Key: KeyBuilder([User.id, Key]),
      });

      const url = await getSignedUrl(this.CloudS3Service.GetClient(), command, {
        expiresIn: ExpiresInSeconds || this.PresignedUrlExpirySeconds,
      });

      return url;
    } catch (error) {
      if (this.CloudS3Service.IsNotFoundError(error)) {
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
      const command = await this.CloudS3Service.Send(
        new GetObjectCommand({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Key: KeyBuilder([User.id, Key]),
        }),
      );
      return command.Body.transformToWebStream();
    } catch (error) {
      if (this.CloudS3Service.IsNotFoundError(error)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }

  async GetObjectReadable(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<Readable> {
    try {
      const command = await this.CloudS3Service.Send(
        new GetObjectCommand({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Key: KeyBuilder([User.id, Key]),
        }),
      );

      const body = command.Body as unknown as Readable;
      return body;
    } catch (error) {
      if (this.CloudS3Service.IsNotFoundError(error)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }

  async Move(
    { SourceKeys, DestinationKey }: CloudMoveRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    try {
      for await (const sourceKey of SourceKeys) {
        const sourceFullKey = KeyBuilder([User.id, sourceKey]);

        const targetFullKey = KeyBuilder([
          User.id,
          DestinationKey,
          sourceKey.split('/').pop() || '',
        ]);
        const copySource = `${this.CloudS3Service.GetBuckets().Storage}/${sourceFullKey}`;

        await this.CloudS3Service.Send(
          new CopyObjectCommand({
            Bucket: this.CloudS3Service.GetBuckets().Storage,
            CopySource: copySource,
            Key: targetFullKey,
          }),
        );

        await this.CloudS3Service.Send(
          new DeleteObjectCommand({
            Bucket: this.CloudS3Service.GetBuckets().Storage,
            Key: sourceFullKey,
          }),
        );
      }
    } catch (error) {
      if (this.CloudS3Service.IsNotFoundError(error)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
    return true;
  }

  async Delete(
    { Items }: CloudDeleteRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    try {
      for await (const item of Items) {
        if (item.IsDirectory) {
          continue;
        }
        await this.CloudS3Service.Send(
          new DeleteObjectCommand({
            Bucket: this.CloudS3Service.GetBuckets().Storage,
            Key: KeyBuilder([User.id, item.Key]),
          }),
        );
      }
    } catch (error) {
      if (this.CloudS3Service.IsNotFoundError(error)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
    return true;
  }

  async Update(
    { Key, Name, Metadata }: CloudUpdateRequestModel,
    User: UserContext,
  ): Promise<CloudObjectModel> {
    try {
      const bucket = this.CloudS3Service.GetBuckets().Storage;

      const sourceKey = KeyBuilder([User.id, Key]);

      let targetRelative = Key;
      let targetKey = sourceKey;

      if (Name) {
        const parts = Key.split('/');
        parts[parts.length - 1] = Name;
        targetRelative = parts.join('/');
        targetKey = KeyBuilder([User.id, targetRelative]);
      }

      const sanitizedProvidedMetadata =
        this.CloudMetadataService.SanitizeMetadataForS3(Metadata);

      let finalMetadataForS3: Record<string, string> = {};
      let sourceContentType: string | undefined = undefined;
      if (Object.keys(sanitizedProvidedMetadata).length) {
        const head = await this.CloudS3Service.Send(
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
        this.Logger.debug(
          `CloudObjectService.Update finalMetadata keys: ${Object.keys(
            finalMetadataForS3,
          ).join(',')}`,
        );
      }

      if (targetKey !== sourceKey) {
        await this.CloudS3Service.Send(
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

        if (Object.keys(sanitizedProvidedMetadata).length) {
          const headAfterCopy = await this.CloudS3Service.Send(
            new HeadObjectCommand({
              Bucket: bucket,
              Key: targetKey,
            }),
          );

          const missingKeys = Object.keys(sanitizedProvidedMetadata).filter(
            (k) => !headAfterCopy.Metadata || !(k in headAfterCopy.Metadata),
          );

          if (missingKeys.length) {
            this.Logger.warn(
              `CloudObjectService.Update: metadata keys not persisted after copy: ${missingKeys.join(',')}. Falling back to GetObject+PutObject for ${targetKey}`,
            );

            const getResp = await this.CloudS3Service.Send(
              new GetObjectCommand({
                Bucket: bucket,
                Key: targetKey,
              }),
            );

            const stream = getResp.Body as Readable;

            await this.CloudS3Service.Send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: targetKey,
                Body: stream,
                ContentType: sourceContentType,
                Metadata: finalMetadataForS3,
              }),
            );
          }
        }

        await this.CloudS3Service.Send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: sourceKey,
          }),
        );
      } else if (Object.keys(finalMetadataForS3).length) {
        await this.CloudS3Service.Send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: `${bucket}/${sourceKey}`,
            Key: sourceKey,
            Metadata: finalMetadataForS3,
            MetadataDirective: 'REPLACE',
            ContentType: sourceContentType ? sourceContentType : undefined,
          }),
        );

        const headAfterReplace = await this.CloudS3Service.Send(
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
          this.Logger.warn(
            `CloudObjectService.Update: metadata keys not persisted after REPLACE for ${sourceKey}, missing: ${missingKeys2.join(',')}. Falling back to GetObject+PutObject`,
          );

          const getResp = await this.CloudS3Service.Send(
            new GetObjectCommand({
              Bucket: bucket,
              Key: sourceKey,
            }),
          );
          const stream = getResp.Body as Readable;

          await this.CloudS3Service.Send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: sourceKey,
              Body: stream,
              ContentType: sourceContentType,
              Metadata: finalMetadataForS3,
            }),
          );
        }
      }

      return this.Find({ Key: targetRelative }, User);
    } catch (error) {
      if (this.CloudS3Service.IsNotFoundError(error)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }
}
