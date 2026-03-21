import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { CloudS3Service } from '@modules/cloud/cloud.s3.service';
import { CloudUsageService } from '@modules/cloud/cloud.usage.service';
import { CloudConflictService } from '@modules/cloud/cloud.conflict.service';
import { CloudVersionService } from '@modules/cloud/cloud.version.service';
import { CloudListService } from '@modules/cloud/cloud.list.service';
import { RedisService } from '@modules/redis/redis.service';
import { DocumentKeys } from '@modules/redis/redis.keys';
import { DOCUMENT_SAVE_THROTTLE_TTL } from '@modules/redis/redis.ttl';
import { NotificationService } from '@modules/notification/notification.service';
import {
  ConflictResolutionStrategy,
  DocumentLockStatus,
  NotificationType,
} from '@common/enums';
import { KeyBuilder } from '@common/helpers/cast.helper';
import {
  GetCacheOwnerId,
  GetStorageOwnerId,
} from '@modules/cloud/cloud.context';
import { DocumentContentService } from './document.content.service';
import { DocumentLockService, LockData } from './document.lock.service';
import { DocumentDraftService } from './document.draft.service';
import { DocumentDiffService } from './document.diff.service';
import { DOCUMENT_MAX_SIZE_BYTES } from './document.constants';
import {
  DocumentCreateRequestModel,
  DocumentContentRequestModel,
  DocumentUpdateContentRequestModel,
  DocumentKeyRequestModel,
  DocumentDraftRequestModel,
  DocumentDiffRequestModel,
  DocumentRestoreVersionRequestModel,
  DocumentDeleteVersionRequestModel,
  DocumentResponseModel,
  DocumentContentResponseModel,
  DocumentLockResponseModel,
  DocumentDraftResponseModel,
  DocumentDiffResponseModel,
} from './document.model';

@Injectable()
export class DocumentService {
  private readonly Logger = new Logger(DocumentService.name);

  constructor(
    private readonly DocumentContentService: DocumentContentService,
    private readonly DocumentLockService: DocumentLockService,
    private readonly DocumentDraftService: DocumentDraftService,
    private readonly DocumentDiffService: DocumentDiffService,
    private readonly CloudS3Service: CloudS3Service,
    private readonly CloudUsageService: CloudUsageService,
    private readonly CloudConflictService: CloudConflictService,
    private readonly CloudVersionService: CloudVersionService,
    private readonly CloudListService: CloudListService,
    private readonly RedisService: RedisService,
    private readonly NotificationService: NotificationService,
  ) {}

  // =========================================================================
  // CREATE
  // =========================================================================

  async Create(
    model: DocumentCreateRequestModel,
    user: UserContext,
  ): Promise<DocumentResponseModel> {
    const ext = this.ExtractExtension(model.Name);
    if (!this.DocumentContentService.ValidateDocumentExtension(ext)) {
      throw new HttpException(
        'Unsupported file extension. Allowed: ' +
          Object.keys(
            (await import('./document.constants')).ALLOWED_DOCUMENT_EXTENSIONS,
          ).join(', '),
        HttpStatus.BAD_REQUEST,
      );
    }

    const content = model.Content ?? '';

    if (!this.DocumentContentService.ValidateContentSize(content)) {
      throw new HttpException(
        `Content exceeds maximum size of ${DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024)} MB`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.DocumentContentService.ValidateTextContent(content)) {
      throw new HttpException(
        'Content contains binary data. Only text content is allowed.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const config = this.DocumentContentService.GetExtensionConfig(ext);
    const key = this.BuildKey(model.Path, model.Name);
    const ownerId = GetStorageOwnerId(user);
    const cacheOwnerId = GetCacheOwnerId(user);
    const fullKey = KeyBuilder([ownerId, key]);

    // Conflict check
    const exists = await this.CloudConflictService.CheckFileExists(fullKey);
    if (exists) {
      const strategy =
        model.ConflictStrategy ?? ConflictResolutionStrategy.FAIL;
      if (strategy === ConflictResolutionStrategy.FAIL) {
        throw new HttpException(
          'A file with this name already exists at the specified path',
          HttpStatus.CONFLICT,
        );
      }
      if (strategy === ConflictResolutionStrategy.SKIP) {
        return this.BuildResponseFromS3(ownerId, cacheOwnerId, key, user.Id);
      }
      if (strategy === ConflictResolutionStrategy.KEEP_BOTH) {
        const newKey = await this.CloudConflictService.GenerateKeepBothKey(
          fullKey,
          false,
        );
        const newName = newKey.split('/').pop();
        model.Name = newName;
        return this.Create({ ...model, ConflictStrategy: undefined }, user);
      }
    }

    // Storage quota check
    const contentSize = Buffer.byteLength(content, 'utf-8');
    await this.CheckStorageQuota(user, contentSize);

    // Compute stats & hash
    const stats = this.DocumentContentService.ComputeContentStats(content);
    const hash = this.DocumentContentService.ComputeContentHash(content);

    // Write to S3 with document metadata
    const metadata: Record<string, string> = {
      isdocument: 'true',
      documenttype: config.Type,
      createdby: user.Id,
      lasteditedby: user.Id,
      editcount: '0',
      contenthash: hash,
    };

    await this.DocumentContentService.WriteContent(
      ownerId,
      key,
      content,
      config.MimeType,
      metadata,
    );

    // Track usage
    await this.CloudUsageService.IncrementUsage(ownerId, stats.SizeInBytes);

    // Invalidate list cache
    await this.CloudListService.InvalidateListCache(cacheOwnerId);

    // Notify
    this.NotificationService.EmitToUser(
      user.Id,
      NotificationType.DOCUMENT_CREATED,
      'Document Created',
      `${model.Name} has been created`,
      { Key: key, Name: model.Name },
    );

    return plainToInstance(
      DocumentResponseModel,
      {
        Key: key,
        Name: model.Name,
        Extension: ext,
        Type: config.Type,
        Language: config.Language,
        MimeType: config.MimeType,
        SizeInBytes: stats.SizeInBytes,
        LineCount: stats.LineCount,
        CharacterCount: stats.CharacterCount,
        EditCount: 0,
        CreatedBy: user.Id,
        LastEditedBy: user.Id,
        HasDraft: false,
        ContentHash: hash,
        LastModified: new Date().toISOString(),
        LockStatus: DocumentLockStatus.UNLOCKED,
      },
      { excludeExtraneousValues: true },
    );
  }

  // =========================================================================
  // READ CONTENT
  // =========================================================================

  async ReadContent(
    model: DocumentContentRequestModel,
    user: UserContext,
  ): Promise<DocumentContentResponseModel> {
    const ownerId = GetStorageOwnerId(user);
    const cacheOwnerId = GetCacheOwnerId(user);

    // Check for draft
    if (model.IncludeDraft) {
      const draft = await this.DocumentDraftService.GetDraft(
        cacheOwnerId,
        model.Key,
      );
      if (draft !== null) {
        const stats = this.DocumentContentService.ComputeContentStats(draft);
        const hash = this.DocumentContentService.ComputeContentHash(draft);
        const lockInfo = await this.DocumentLockService.GetLockInfo(
          cacheOwnerId,
          model.Key,
        );
        const lockStatus = this.ResolveLockStatus(lockInfo, user.Id);

        return plainToInstance(
          DocumentContentResponseModel,
          {
            Content: draft,
            Key: model.Key,
            ContentHash: hash,
            SizeInBytes: stats.SizeInBytes,
            LineCount: stats.LineCount,
            CharacterCount: stats.CharacterCount,
            IsDraft: true,
            LastModified: new Date().toISOString(),
            LockStatus: lockStatus,
            LockedBy: lockInfo?.UserId,
            LockExpiresAt: lockInfo?.ExpiresAt,
          },
          { excludeExtraneousValues: true },
        );
      }
    }

    // Read from S3
    const content = await this.DocumentContentService.ReadContent(
      ownerId,
      model.Key,
    );
    const stats = this.DocumentContentService.ComputeContentStats(content);
    const hash = this.DocumentContentService.ComputeContentHash(content);
    const lockInfo = await this.DocumentLockService.GetLockInfo(
      cacheOwnerId,
      model.Key,
    );
    const lockStatus = this.ResolveLockStatus(lockInfo, user.Id);

    const s3Meta = await this.DocumentContentService.ReadMetadata(
      ownerId,
      model.Key,
    );

    return plainToInstance(
      DocumentContentResponseModel,
      {
        Content: content,
        Key: model.Key,
        ContentHash: hash,
        SizeInBytes: stats.SizeInBytes,
        LineCount: stats.LineCount,
        CharacterCount: stats.CharacterCount,
        IsDraft: false,
        LastModified: s3Meta?.LastModified ?? new Date().toISOString(),
        LockStatus: lockStatus,
        LockedBy: lockInfo?.UserId,
        LockExpiresAt: lockInfo?.ExpiresAt,
      },
      { excludeExtraneousValues: true },
    );
  }

  // =========================================================================
  // UPDATE CONTENT
  // =========================================================================

  async UpdateContent(
    model: DocumentUpdateContentRequestModel,
    user: UserContext,
  ): Promise<DocumentContentResponseModel> {
    const ownerId = GetStorageOwnerId(user);
    const cacheOwnerId = GetCacheOwnerId(user);

    // Validate size
    if (!this.DocumentContentService.ValidateContentSize(model.Content)) {
      throw new HttpException(
        `Content exceeds maximum size of ${DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024)} MB`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!this.DocumentContentService.ValidateTextContent(model.Content)) {
      throw new HttpException(
        'Content contains binary data. Only text content is allowed.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Lock check
    if (
      await this.DocumentLockService.IsLockedByOther(
        cacheOwnerId,
        model.Key,
        user.Id,
      )
    ) {
      const lock = await this.DocumentLockService.GetLockInfo(
        cacheOwnerId,
        model.Key,
      );
      throw new HttpException(
        {
          Message: `Document is locked by ${lock.FullName}`,
          LockedBy: lock.UserId,
          LockedByName: lock.FullName,
          ExpiresAt: lock.ExpiresAt,
        },
        HttpStatus.LOCKED,
      );
    }

    // Save throttle check
    const throttleKey = DocumentKeys.SaveThrottle(cacheOwnerId, model.Key);
    const lastSave = await this.RedisService.Get<number>(throttleKey);
    if (lastSave) {
      const nextAllowed = lastSave + DOCUMENT_SAVE_THROTTLE_TTL * 1000;
      if (Date.now() < nextAllowed) {
        throw new HttpException(
          {
            Message: 'Save throttled. Please wait before saving again.',
            NextAllowedSaveAt: new Date(nextAllowed).toISOString(),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Read existing S3 metadata for optimistic concurrency and metadata preservation
    const existingMeta = await this.DocumentContentService.ReadMetadata(
      ownerId,
      model.Key,
    );

    if (!existingMeta) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }

    // Optimistic concurrency check
    if (
      model.ExpectedContentHash &&
      existingMeta.ContentHash &&
      model.ExpectedContentHash !== existingMeta.ContentHash
    ) {
      throw new HttpException(
        {
          Message:
            'Content has been modified since you last read it. Please refresh and try again.',
          CurrentContentHash: existingMeta.ContentHash,
          ExpectedContentHash: model.ExpectedContentHash,
        },
        HttpStatus.CONFLICT,
      );
    }

    // Compute new stats & hash
    const stats = this.DocumentContentService.ComputeContentStats(
      model.Content,
    );
    const hash = this.DocumentContentService.ComputeContentHash(model.Content);

    // Build updated S3 metadata
    const ext = this.ExtractExtension(model.Key.split('/').pop() ?? '');
    const config = this.DocumentContentService.GetExtensionConfig(ext);
    const mimeType =
      config?.MimeType ?? existingMeta.ContentType ?? 'text/plain';
    const newEditCount = existingMeta.EditCount + 1;

    const metadata: Record<string, string> = {
      isdocument: 'true',
      documenttype: existingMeta.DocumentType ?? config?.Type ?? 'PLAIN_TEXT',
      createdby: existingMeta.CreatedBy || user.Id,
      lasteditedby: user.Id,
      editcount: String(newEditCount),
      contenthash: hash,
    };

    const oldSize = existingMeta.SizeInBytes;

    await this.DocumentContentService.WriteContent(
      ownerId,
      model.Key,
      model.Content,
      mimeType,
      metadata,
    );

    // Cleanup old versions
    const bucket = this.CloudS3Service.GetBuckets().Storage;
    const fullKey = KeyBuilder([ownerId, model.Key]);
    await this.CloudVersionService.CleanupOldVersions(bucket, fullKey).catch(
      (err) =>
        this.Logger.warn(`Failed to cleanup old versions: ${err.message}`),
    );

    // Clear draft
    await this.DocumentDraftService.DeleteDraft(cacheOwnerId, model.Key);

    // Update usage tracking (delta)
    const sizeDelta = stats.SizeInBytes - oldSize;
    if (sizeDelta > 0) {
      await this.CloudUsageService.IncrementUsage(ownerId, sizeDelta);
    } else if (sizeDelta < 0) {
      await this.CloudUsageService.DecrementUsage(ownerId, Math.abs(sizeDelta));
    }

    // Set save throttle
    await this.RedisService.Set(
      throttleKey,
      Date.now(),
      DOCUMENT_SAVE_THROTTLE_TTL,
    );

    // Invalidate list cache
    await this.CloudListService.InvalidateListCache(cacheOwnerId);

    // Notify
    this.NotificationService.EmitToUser(
      user.Id,
      NotificationType.DOCUMENT_UPDATED,
      'Document Updated',
      `${model.Key.split('/').pop()} has been saved`,
      { Key: model.Key },
    );

    const lockInfo = await this.DocumentLockService.GetLockInfo(
      cacheOwnerId,
      model.Key,
    );
    const lockStatus = this.ResolveLockStatus(lockInfo, user.Id);

    return plainToInstance(
      DocumentContentResponseModel,
      {
        Content: model.Content,
        Key: model.Key,
        ContentHash: hash,
        SizeInBytes: stats.SizeInBytes,
        LineCount: stats.LineCount,
        CharacterCount: stats.CharacterCount,
        IsDraft: false,
        LastModified: new Date().toISOString(),
        LockStatus: lockStatus,
        LockedBy: lockInfo?.UserId,
        LockExpiresAt: lockInfo?.ExpiresAt,
      },
      { excludeExtraneousValues: true },
    );
  }

  // =========================================================================
  // FIND / METADATA
  // =========================================================================

  async Find(
    model: DocumentKeyRequestModel,
    user: UserContext,
  ): Promise<DocumentResponseModel> {
    const ownerId = GetStorageOwnerId(user);
    const cacheOwnerId = GetCacheOwnerId(user);

    return this.BuildResponseFromS3(ownerId, cacheOwnerId, model.Key, user.Id);
  }

  // =========================================================================
  // LOCK
  // =========================================================================

  async AcquireLock(
    model: DocumentKeyRequestModel,
    user: UserContext,
  ): Promise<DocumentLockResponseModel> {
    const cacheOwnerId = GetCacheOwnerId(user);
    const lockData = await this.DocumentLockService.AcquireLock(
      cacheOwnerId,
      model.Key,
      user,
    );

    return this.ToLockResponseModel(
      model.Key,
      lockData,
      DocumentLockStatus.LOCKED_BY_ME,
    );
  }

  async ReleaseLock(
    model: DocumentKeyRequestModel,
    user: UserContext,
  ): Promise<boolean> {
    const cacheOwnerId = GetCacheOwnerId(user);
    const result = await this.DocumentLockService.ReleaseLock(
      cacheOwnerId,
      model.Key,
      user.Id,
    );

    return result;
  }

  async ExtendLock(
    model: DocumentKeyRequestModel,
    user: UserContext,
  ): Promise<DocumentLockResponseModel> {
    const cacheOwnerId = GetCacheOwnerId(user);
    const lockData = await this.DocumentLockService.ExtendLock(
      cacheOwnerId,
      model.Key,
      user.Id,
    );

    return this.ToLockResponseModel(
      model.Key,
      lockData,
      DocumentLockStatus.LOCKED_BY_ME,
    );
  }

  // =========================================================================
  // DRAFT
  // =========================================================================

  async SaveDraft(
    model: DocumentDraftRequestModel,
    user: UserContext,
  ): Promise<DocumentDraftResponseModel> {
    const cacheOwnerId = GetCacheOwnerId(user);

    // Validate size
    if (!this.DocumentContentService.ValidateContentSize(model.Content)) {
      throw new HttpException(
        `Content exceeds maximum size of ${DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024)} MB`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Lock check
    if (
      await this.DocumentLockService.IsLockedByOther(
        cacheOwnerId,
        model.Key,
        user.Id,
      )
    ) {
      const lock = await this.DocumentLockService.GetLockInfo(
        cacheOwnerId,
        model.Key,
      );
      throw new HttpException(
        {
          Message: `Document is locked by ${lock.FullName}`,
          LockedBy: lock.UserId,
        },
        HttpStatus.LOCKED,
      );
    }

    // Throttle check
    const throttle = await this.DocumentDraftService.CheckThrottle(
      cacheOwnerId,
      model.Key,
    );
    if (!throttle.IsAllowed) {
      throw new HttpException(
        {
          Message: 'Auto-save throttled. Please wait before saving again.',
          NextAllowedSaveAt: throttle.NextAllowedAt,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Save draft
    await this.DocumentDraftService.SaveDraft(
      cacheOwnerId,
      model.Key,
      model.Content,
    );

    const stats = this.DocumentContentService.ComputeContentStats(
      model.Content,
    );

    return plainToInstance(
      DocumentDraftResponseModel,
      {
        Key: model.Key,
        SavedAt: new Date().toISOString(),
        SizeInBytes: stats.SizeInBytes,
        NextAllowedSaveAt: null,
      },
      { excludeExtraneousValues: true },
    );
  }

  async DiscardDraft(
    model: DocumentKeyRequestModel,
    user: UserContext,
  ): Promise<boolean> {
    const cacheOwnerId = GetCacheOwnerId(user);
    await this.DocumentDraftService.DeleteDraft(cacheOwnerId, model.Key);
    return true;
  }

  // =========================================================================
  // VERSIONS
  // =========================================================================

  async ListVersions(model: DocumentKeyRequestModel, user: UserContext) {
    const ownerId = GetStorageOwnerId(user);
    const bucket = this.CloudS3Service.GetBuckets().Storage;
    const fullKey = KeyBuilder([ownerId, model.Key]);

    return this.CloudVersionService.ListVersions(bucket, fullKey);
  }

  async DiffVersions(
    model: DocumentDiffRequestModel,
    user: UserContext,
  ): Promise<DocumentDiffResponseModel> {
    const ownerId = GetStorageOwnerId(user);

    const result = await this.DocumentDiffService.DiffVersions(
      ownerId,
      model.Key,
      model.SourceVersionId,
      model.TargetVersionId,
    );

    return plainToInstance(
      DocumentDiffResponseModel,
      {
        Key: model.Key,
        SourceVersionId: model.SourceVersionId,
        TargetVersionId: model.TargetVersionId,
        Hunks: result.Hunks,
        Stats: result.Stats,
      },
      { excludeExtraneousValues: true },
    );
  }

  async RestoreVersion(
    model: DocumentRestoreVersionRequestModel,
    user: UserContext,
  ): Promise<void> {
    const ownerId = GetStorageOwnerId(user);
    const cacheOwnerId = GetCacheOwnerId(user);
    const bucket = this.CloudS3Service.GetBuckets().Storage;
    const fullKey = KeyBuilder([ownerId, model.Key]);

    await this.CloudVersionService.RestoreVersion(
      bucket,
      fullKey,
      model.VersionId,
    );

    // Re-read content to update S3 metadata with new hash/stats
    const content = await this.DocumentContentService.ReadContent(
      ownerId,
      model.Key,
    );
    const hash = this.DocumentContentService.ComputeContentHash(content);

    const existingMeta = await this.DocumentContentService.ReadMetadata(
      ownerId,
      model.Key,
    );

    const ext = this.ExtractExtension(model.Key.split('/').pop() ?? '');
    const config = this.DocumentContentService.GetExtensionConfig(ext);
    const mimeType =
      config?.MimeType ?? existingMeta?.ContentType ?? 'text/plain';

    const metadata: Record<string, string> = {
      isdocument: 'true',
      documenttype: existingMeta?.DocumentType ?? config?.Type ?? 'PLAIN_TEXT',
      createdby: existingMeta?.CreatedBy || user.Id,
      lasteditedby: user.Id,
      editcount: String((existingMeta?.EditCount ?? 0) + 1),
      contenthash: hash,
    };

    await this.DocumentContentService.WriteContent(
      ownerId,
      model.Key,
      content,
      mimeType,
      metadata,
    );

    await this.CloudListService.InvalidateListCache(cacheOwnerId);
  }

  async DeleteVersion(
    model: DocumentDeleteVersionRequestModel,
    user: UserContext,
  ): Promise<void> {
    const ownerId = GetStorageOwnerId(user);
    const bucket = this.CloudS3Service.GetBuckets().Storage;
    const fullKey = KeyBuilder([ownerId, model.Key]);

    await this.CloudVersionService.DeleteVersion(
      bucket,
      fullKey,
      model.VersionId,
    );
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  private async BuildResponseFromS3(
    ownerId: string,
    cacheOwnerId: string,
    key: string,
    userId: string,
  ): Promise<DocumentResponseModel> {
    const s3Meta = await this.DocumentContentService.ReadMetadata(ownerId, key);

    if (!s3Meta) {
      throw new HttpException('Document not found', HttpStatus.NOT_FOUND);
    }

    const fileName = key.split('/').pop() ?? '';
    const ext = this.ExtractExtension(fileName);
    const config = this.DocumentContentService.GetExtensionConfig(ext);
    const language = this.DocumentContentService.GetLanguageForExtension(ext);

    const lockStatus = await this.DocumentLockService.GetLockStatus(
      cacheOwnerId,
      key,
      userId,
    );
    const lockInfo = await this.DocumentLockService.GetLockInfo(
      cacheOwnerId,
      key,
    );

    const hasDraft = await this.DocumentDraftService.HasDraft(
      cacheOwnerId,
      key,
    );

    // Read content to compute live stats
    const content = await this.DocumentContentService.ReadContent(ownerId, key);
    const stats = this.DocumentContentService.ComputeContentStats(content);

    return plainToInstance(
      DocumentResponseModel,
      {
        Key: key,
        Name: fileName,
        Extension: ext,
        Type: config?.Type ?? s3Meta.DocumentType,
        Language: language,
        MimeType: s3Meta.ContentType,
        SizeInBytes: stats.SizeInBytes,
        LineCount: stats.LineCount,
        CharacterCount: stats.CharacterCount,
        EditCount: s3Meta.EditCount,
        CreatedBy: s3Meta.CreatedBy,
        LastEditedBy: s3Meta.LastEditedBy,
        HasDraft: hasDraft,
        ContentHash: s3Meta.ContentHash,
        LastModified: s3Meta.LastModified,
        LockStatus: lockStatus,
        LockedBy: lockInfo?.UserId,
      },
      { excludeExtraneousValues: true },
    );
  }

  private ExtractExtension(filename: string): string {
    const parts = filename.split('.');
    if (parts.length < 2) return '';
    return parts.pop().toLowerCase();
  }

  private BuildKey(path: string, name: string): string {
    const normalizedPath = path ? (path.endsWith('/') ? path : path + '/') : '';
    return normalizedPath + name;
  }

  private ResolveLockStatus(
    lockInfo: LockData | null,
    userId: string,
  ): DocumentLockStatus {
    if (!lockInfo) return DocumentLockStatus.UNLOCKED;
    if (lockInfo.UserId === userId) return DocumentLockStatus.LOCKED_BY_ME;
    return DocumentLockStatus.LOCKED_BY_OTHER;
  }

  private ToLockResponseModel(
    key: string,
    lockData: LockData,
    lockStatus: DocumentLockStatus,
  ): DocumentLockResponseModel {
    const now = Math.floor(Date.now() / 1000);
    return plainToInstance(
      DocumentLockResponseModel,
      {
        Key: key,
        LockStatus: lockStatus,
        LockedBy: lockData.UserId,
        LockedByName: lockData.FullName,
        ExpiresAt: lockData.ExpiresAt,
        TTL: Math.max(0, lockData.ExpiresAt - now),
      },
      { excludeExtraneousValues: true },
    );
  }

  private async CheckStorageQuota(
    user: UserContext,
    additionalBytes: number,
  ): Promise<void> {
    const usage = await this.CloudUsageService.UserStorageUsage(user);
    const usedBytes = Number(usage.UsedStorageInBytes);
    const maxBytes = Number(usage.MaxStorageInBytes);

    if (maxBytes > 0 && usedBytes + additionalBytes > maxBytes) {
      throw new HttpException(
        'Storage limit exceeded. Please upgrade your subscription.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
