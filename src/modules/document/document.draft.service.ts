import { Injectable, Logger } from '@nestjs/common';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { RedisService } from '@modules/redis/redis.service';
import { CloudS3Service } from '@modules/cloud/cloud.s3.service';
import { DocumentKeys } from '@modules/redis/redis.keys';
import {
  DOCUMENT_DRAFT_TTL,
  DOCUMENT_AUTOSAVE_THROTTLE_TTL,
  DOCUMENT_DRAFT_COUNTER_TTL,
} from '@modules/redis/redis.ttl';
import { KeyBuilder } from '@common/helpers/cast.helper';
import { DOCUMENT_DRAFT_S3_PERSIST_INTERVAL } from './document.constants';

@Injectable()
export class DocumentDraftService {
  private readonly Logger = new Logger(DocumentDraftService.name);

  constructor(
    private readonly RedisService: RedisService,
    private readonly CloudS3Service: CloudS3Service,
  ) {}

  /**
   * Save draft content to Redis.
   * Returns the current draft counter (for S3 persistence trigger).
   */
  async SaveDraft(
    ownerId: string,
    key: string,
    content: string,
  ): Promise<number> {
    const draftKey = DocumentKeys.Draft(ownerId, key);
    const counterKey = DocumentKeys.DraftCounter(ownerId, key);

    await this.RedisService.Set(draftKey, content, DOCUMENT_DRAFT_TTL);

    // Increment counter
    const current = (await this.RedisService.Get<number>(counterKey)) ?? 0;
    const newCount = current + 1;
    await this.RedisService.Set(
      counterKey,
      newCount,
      DOCUMENT_DRAFT_COUNTER_TTL,
    );

    // Persist to S3 every N saves
    if (newCount % DOCUMENT_DRAFT_S3_PERSIST_INTERVAL === 0) {
      await this.PersistDraftToS3(ownerId, key, content).catch((err) =>
        this.Logger.error(
          `Failed to persist draft to S3: ${err.message}`,
          err.stack,
        ),
      );
    }

    return newCount;
  }

  /**
   * Get draft content. First checks Redis, then falls back to S3.
   */
  async GetDraft(ownerId: string, key: string): Promise<string | null> {
    const draftKey = DocumentKeys.Draft(ownerId, key);
    const redisDraft = await this.RedisService.Get<string>(draftKey);
    if (redisDraft !== undefined && redisDraft !== null) {
      return redisDraft;
    }

    // Fallback to S3 draft
    return this.GetS3Draft(ownerId, key);
  }

  /**
   * Check if a draft exists in Redis.
   */
  async HasDraft(ownerId: string, key: string): Promise<boolean> {
    const draftKey = DocumentKeys.Draft(ownerId, key);
    const draft = await this.RedisService.Get<string>(draftKey);
    return draft !== undefined && draft !== null;
  }

  /**
   * Delete draft from both Redis and S3.
   */
  async DeleteDraft(ownerId: string, key: string): Promise<void> {
    const draftKey = DocumentKeys.Draft(ownerId, key);
    const counterKey = DocumentKeys.DraftCounter(ownerId, key);

    await Promise.all([
      this.RedisService.Delete(draftKey),
      this.RedisService.Delete(counterKey),
      this.DeleteS3Draft(ownerId, key).catch((err) =>
        this.Logger.warn(`Failed to delete S3 draft: ${err.message}`),
      ),
    ]);
  }

  /**
   * Check auto-save throttle. Returns whether save is allowed and when next save is permitted.
   */
  async CheckThrottle(
    ownerId: string,
    key: string,
  ): Promise<{ IsAllowed: boolean; NextAllowedAt: string | null }> {
    const throttleKey = DocumentKeys.AutoSaveThrottle(ownerId, key);
    const lastSave = await this.RedisService.Get<number>(throttleKey);

    if (lastSave) {
      const nextAllowed = lastSave + DOCUMENT_AUTOSAVE_THROTTLE_TTL * 1000;
      if (Date.now() < nextAllowed) {
        return {
          IsAllowed: false,
          NextAllowedAt: new Date(nextAllowed).toISOString(),
        };
      }
    }

    // Mark this save
    await this.RedisService.Set(
      throttleKey,
      Date.now(),
      DOCUMENT_AUTOSAVE_THROTTLE_TTL,
    );

    return { IsAllowed: true, NextAllowedAt: null };
  }

  /**
   * Persist draft to S3 under .drafts/ prefix for durability.
   */
  async PersistDraftToS3(
    ownerId: string,
    key: string,
    content: string,
  ): Promise<void> {
    const bucket = this.CloudS3Service.GetBuckets().Storage;
    const draftKey = KeyBuilder([ownerId, '.drafts', key]);

    await this.CloudS3Service.Send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: draftKey,
        Body: Buffer.from(content, 'utf-8'),
        ContentType: 'text/plain',
        Metadata: { isdraft: 'true' },
      }),
    );
  }

  /**
   * Read draft from S3.
   */
  private async GetS3Draft(
    ownerId: string,
    key: string,
  ): Promise<string | null> {
    const bucket = this.CloudS3Service.GetBuckets().Storage;
    const draftKey = KeyBuilder([ownerId, '.drafts', key]);

    try {
      const response = await this.CloudS3Service.Send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: draftKey,
        }),
      );
      return response.Body.transformToString('utf-8');
    } catch (err) {
      if (this.CloudS3Service.IsNotFoundError(err)) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Delete draft from S3.
   */
  private async DeleteS3Draft(ownerId: string, key: string): Promise<void> {
    const bucket = this.CloudS3Service.GetBuckets().Storage;
    const draftKey = KeyBuilder([ownerId, '.drafts', key]);

    try {
      await this.CloudS3Service.Send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: draftKey,
        }),
      );
    } catch (err) {
      if (!this.CloudS3Service.IsNotFoundError(err)) {
        throw err;
      }
    }
  }
}
