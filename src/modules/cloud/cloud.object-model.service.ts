import {
  HeadObjectCommand,
  HeadObjectCommandOutput,
  _Object,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { CloudObjectModel } from './cloud.model';
import { CloudS3Service } from './cloud.s3.service';
import { CloudMetadataService } from './cloud.metadata.service';
import { MimeTypeFromExtension } from '@common/helpers/cast.helper';
import { GetStorageOwnerId } from './cloud.context';
import { GetFileName, GetExtension } from './cloud.utils';

export interface BuildObjectModelOptions {
  // Fetch a HEAD to populate Metadata + ContentType (skipped when false).
  IsMetadataProcessing?: boolean;
  // Build a presigned URL (otherwise a public URL) for Path.Url.
  IsSignedUrlProcessing?: boolean;
  // Pre-fetched HEAD result; when provided it is reused instead of issuing
  // another HeadObjectCommand (callers that already did a HEAD pass it here).
  Head?: HeadObjectCommandOutput;
}

/**
 * Builds the canonical CloudObjectModel from an S3 `_Object`. Shared by
 * CloudListService (listing/search/thumbnails) and CloudObjectService (single
 * object lookup) so the response shape and URL/metadata resolution stay in one
 * place. Depends only on CloudS3Service + CloudMetadataService.
 */
@Injectable()
export class CloudObjectModelService {
  constructor(
    private readonly CloudS3Service: CloudS3Service,
    private readonly CloudMetadataService: CloudMetadataService,
  ) {}

  async BuildObjectModel(
    content: _Object,
    User: UserContext,
    options: BuildObjectModelOptions = {},
  ): Promise<CloudObjectModel> {
    const {
      IsMetadataProcessing = false,
      IsSignedUrlProcessing = false,
      Head,
    } = options;

    let metadata: Record<string, string> = {};
    let contentType: string | undefined = undefined;

    const head =
      Head ??
      (IsMetadataProcessing
        ? await this.CloudS3Service.Send(
            new HeadObjectCommand({
              Bucket: this.CloudS3Service.GetBuckets().Storage,
              Key: content.Key,
            }),
          )
        : undefined);

    if (head) {
      metadata = this.CloudMetadataService.DecodeMetadataFromS3(head.Metadata);
      contentType = head.ContentType;
    }

    const SignedUrl = await this.CloudS3Service.SignedUrlBuilder(
      content,
      IsSignedUrlProcessing,
      this.CloudS3Service,
      this.CloudS3Service.PresignedUrlExpirySeconds,
    );

    const Name = GetFileName(content.Key!);
    const Extension = GetExtension(Name);

    return {
      Name: Name,
      Extension: Extension,
      MimeType:
        (contentType ?? MimeTypeFromExtension(Extension)) ||
        'application/octet-stream',
      Path: {
        Host: this.CloudS3Service.GetPublicHostname(),
        Key: this.CloudS3Service.GetKey(content.Key!, GetStorageOwnerId(User)),
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
}
