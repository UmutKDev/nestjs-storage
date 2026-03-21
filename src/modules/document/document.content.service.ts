import { Injectable, Logger } from '@nestjs/common';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { CloudS3Service } from '@modules/cloud/cloud.s3.service';
import { CloudMetadataService } from '@modules/cloud/cloud.metadata.service';
import { KeyBuilder } from '@common/helpers/cast.helper';
import { DocumentLanguage, DocumentType } from '@common/enums';
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  DocumentExtensionConfig,
  DOCUMENT_MAX_SIZE_BYTES,
} from './document.constants';

export interface DocumentS3Metadata {
  IsDocument: boolean;
  DocumentType: string;
  CreatedBy: string;
  LastEditedBy: string;
  EditCount: number;
  ContentHash: string;
  ContentType: string;
  SizeInBytes: number;
  LastModified: string;
}

@Injectable()
export class DocumentContentService {
  private readonly Logger = new Logger(DocumentContentService.name);

  constructor(
    private readonly CloudS3Service: CloudS3Service,
    private readonly CloudMetadataService: CloudMetadataService,
  ) {}

  /**
   * Write text content to S3 with document metadata.
   */
  async WriteContent(
    ownerId: string,
    key: string,
    content: string,
    mimeType: string,
    metadata?: Record<string, string>,
  ): Promise<number> {
    const bucket = this.CloudS3Service.GetBuckets().Storage;
    const fullKey = KeyBuilder([ownerId, key]);
    const body = Buffer.from(content, 'utf-8');

    const sanitizedMetadata =
      this.CloudMetadataService.SanitizeMetadataForS3(metadata);

    await this.CloudS3Service.Send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: fullKey,
        Body: body,
        ContentType: mimeType,
        Metadata: sanitizedMetadata,
      }),
    );

    return body.byteLength;
  }

  /**
   * Read text content from S3.
   */
  async ReadContent(ownerId: string, key: string): Promise<string> {
    const bucket = this.CloudS3Service.GetBuckets().Storage;
    const fullKey = KeyBuilder([ownerId, key]);

    const response = await this.CloudS3Service.Send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: fullKey,
      }),
    );

    return response.Body.transformToString('utf-8');
  }

  /**
   * Read content of a specific S3 version.
   */
  async ReadVersionContent(
    ownerId: string,
    key: string,
    versionId: string,
  ): Promise<string> {
    const bucket = this.CloudS3Service.GetBuckets().Storage;
    const fullKey = KeyBuilder([ownerId, key]);

    const response = await this.CloudS3Service.Send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: fullKey,
        VersionId: versionId,
      }),
    );

    return response.Body.transformToString('utf-8');
  }

  /**
   * Read document metadata from S3 via HeadObject.
   * Returns null if the object does not exist.
   */
  async ReadMetadata(
    ownerId: string,
    key: string,
  ): Promise<DocumentS3Metadata | null> {
    const bucket = this.CloudS3Service.GetBuckets().Storage;
    const fullKey = KeyBuilder([ownerId, key]);

    try {
      const head = await this.CloudS3Service.Send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: fullKey,
        }),
      );

      const raw = head.Metadata || {};

      return {
        IsDocument: raw.isdocument === 'true',
        DocumentType: raw.documenttype ?? 'PLAIN_TEXT',
        CreatedBy: raw.createdby ?? '',
        LastEditedBy: raw.lasteditedby ?? '',
        EditCount: parseInt(raw.editcount ?? '0', 10) || 0,
        ContentHash: raw.contenthash ?? '',
        ContentType: head.ContentType ?? 'text/plain',
        SizeInBytes: head.ContentLength ?? 0,
        LastModified: head.LastModified?.toISOString() ?? '',
      };
    } catch (error) {
      if (this.CloudS3Service.IsNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Compute SHA-256 hash of content.
   */
  ComputeContentHash(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  /**
   * Compute content statistics.
   */
  ComputeContentStats(content: string): {
    SizeInBytes: number;
    LineCount: number;
    CharacterCount: number;
  } {
    const sizeInBytes = Buffer.byteLength(content, 'utf-8');
    const lineCount = content === '' ? 0 : content.split('\n').length;
    const characterCount = content.length;
    return {
      SizeInBytes: sizeInBytes,
      LineCount: lineCount,
      CharacterCount: characterCount,
    };
  }

  /**
   * Validate that the extension is in the allowed list.
   */
  ValidateDocumentExtension(ext: string): boolean {
    return ext.toLowerCase() in ALLOWED_DOCUMENT_EXTENSIONS;
  }

  /**
   * Get extension configuration.
   */
  GetExtensionConfig(ext: string): DocumentExtensionConfig | null {
    return ALLOWED_DOCUMENT_EXTENSIONS[ext.toLowerCase()] ?? null;
  }

  /**
   * Get DocumentType from extension.
   */
  GetDocumentTypeForExtension(ext: string): DocumentType {
    return (
      ALLOWED_DOCUMENT_EXTENSIONS[ext.toLowerCase()]?.Type ??
      DocumentType.PLAIN_TEXT
    );
  }

  /**
   * Get DocumentLanguage from extension.
   */
  GetLanguageForExtension(ext: string): DocumentLanguage {
    return (
      ALLOWED_DOCUMENT_EXTENSIONS[ext.toLowerCase()]?.Language ??
      DocumentLanguage.PLAIN
    );
  }

  /**
   * Validate content size against maximum.
   */
  ValidateContentSize(content: string): boolean {
    return Buffer.byteLength(content, 'utf-8') <= DOCUMENT_MAX_SIZE_BYTES;
  }

  /**
   * Validate that content is valid UTF-8 text (not binary).
   */
  ValidateTextContent(content: string): boolean {
    return !content.includes('\0');
  }
}
