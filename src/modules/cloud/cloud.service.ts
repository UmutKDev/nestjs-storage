import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import {
  CloudAbortMultipartUploadRequestModel,
  CloudBreadCrumbModel,
  CloudCompleteMultipartUploadRequestModel,
  CloudCompleteMultipartUploadResponseModel,
  CloudExtractZipStartRequestModel,
  CloudExtractZipStartResponseModel,
  CloudExtractZipStatusRequestModel,
  CloudExtractZipStatusResponseModel,
  CloudExtractZipCancelRequestModel,
  CloudExtractZipCancelResponseModel,
  CloudCreateMultipartUploadRequestModel,
  CloudCreateMultipartUploadResponseModel,
  CloudKeyRequestModel,
  CloudRenameDirectoryRequestModel,
  CloudGetMultipartPartUrlRequestModel,
  CloudGetMultipartPartUrlResponseModel,
  CloudListRequestModel,
  CloudListResponseModel,
  CloudObjectModel,
  CloudDeleteRequestModel,
  CloudMoveRequestModel,
  CloudUpdateRequestModel,
  CloudDirectoryModel,
  CloudListDirectoriesRequestModel,
  CloudListBreadcrumbRequestModel,
  CloudUploadPartRequestModel,
  CloudUploadPartResponseModel,
  CloudUserStorageUsageResponseModel,
  CloudScanStatusResponseModel,
  CloudPreSignedUrlRequestModel,
  // New Directories API models
  DirectoryCreateRequestModel,
  DirectoryRenameRequestModel,
  DirectoryDeleteRequestModel,
  DirectoryUnlockRequestModel,
  DirectoryUnlockResponseModel,
  DirectoryLockRequestModel,
  DirectoryConvertToEncryptedRequestModel,
  DirectoryDecryptRequestModel,
  DirectoryResponseModel,
} from './cloud.model';
import { asyncLocalStorage } from '@common/context/context.service';
import { CloudListService } from './cloud.list.service';
import { CloudObjectService } from './cloud.object.service';
import { CloudZipService } from './cloud.zip.service';
import { CloudUploadService } from './cloud.upload.service';
import { CloudDirectoryService } from './cloud.directory.service';
import { CloudUsageService } from './cloud.usage.service';
import { CloudScanService } from './cloud.scan.service';
import { NormalizeDirectoryPath } from './cloud.utils';
import { SizeFormatter } from '@common/helpers/cast.helper';
import { RedisService } from '@modules/redis/redis.service';

@Injectable()
export class CloudService {
  public readonly MaxMultipartUploadSizeBytes = 50 * 1024 * 1024; // 50 MB

  constructor(
    private readonly CloudListService: CloudListService,
    private readonly CloudObjectService: CloudObjectService,
    private readonly CloudZipService: CloudZipService,
    private readonly CloudUploadService: CloudUploadService,
    private readonly CloudDirectoryService: CloudDirectoryService,
    private readonly CloudUsageService: CloudUsageService,
    private readonly CloudScanService: CloudScanService,
    private readonly RedisService: RedisService,
  ) {}

  //#region List

  async List(
    { Path, Delimiter, IsMetadataProcessing }: CloudListRequestModel,
    User: UserContext,
    sessionToken?: string,
  ): Promise<CloudListResponseModel> {
    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';

    // Check if we're trying to access an encrypted folder
    const accessCheck = await this.CheckEncryptedFolderAccess(
      cleanedPath,
      User.id,
      sessionToken,
    );

    if (accessCheck.isEncrypted && !accessCheck.hasAccess) {
      throw new HttpException(
        `Access denied. Folder "${accessCheck.encryptingFolder}" is encrypted. Unlock it first via POST /Cloud/Directories/Unlock`,
        HttpStatus.FORBIDDEN,
      );
    }

    const encryptedFolders = await this.GetEncryptedFolderSet(User);

    return this.CloudListService.List(
      {
        Path,
        Delimiter,
        IsMetadataProcessing,
        search: undefined,
        skip: undefined,
        take: undefined,
      },
      User,
      encryptedFolders,
      sessionToken,
      this.ValidateDirectorySession.bind(this),
    );
  }

  //#endregion

  async GetDownloadSpeedBytesPerSec(User: UserContext): Promise<number> {
    return this.CloudUsageService.GetDownloadSpeedBytesPerSec(User);
  }

  //#region Breadcrumb

  async ListBreadcrumb({
    Path,
    Delimiter,
  }: CloudListBreadcrumbRequestModel): Promise<CloudBreadCrumbModel[]> {
    const store = asyncLocalStorage.getStore();
    const request: Request = store?.get('request');

    const breadcrumb = await this.CloudListService.ProcessBreadcrumb(
      Path || '',
      Delimiter,
    );

    request.totalRowCount = breadcrumb.length;

    return breadcrumb;
  }

  //#endregion

  //#region Directories

  async ListDirectories(
    { Path, Delimiter, search, skip, take }: CloudListDirectoriesRequestModel,
    User: UserContext,
    sessionToken?: string,
  ): Promise<CloudDirectoryModel[]> {
    const store = asyncLocalStorage.getStore();
    const request: Request = store?.get('request');

    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';

    // Check encrypted folder access
    const accessCheck = await this.CheckEncryptedFolderAccess(
      cleanedPath,
      User.id,
      sessionToken,
    );

    if (accessCheck.isEncrypted && !accessCheck.hasAccess) {
      throw new HttpException(
        `Access denied. Folder "${accessCheck.encryptingFolder}" is encrypted. Unlock it first via POST /Cloud/Directories/Unlock`,
        HttpStatus.FORBIDDEN,
      );
    }

    const encryptedFolders = await this.GetEncryptedFolderSet(User);
    const result = await this.CloudListService.ListDirectories(
      { Path, Delimiter, IsMetadataProcessing: false, search, skip, take },
      User,
      encryptedFolders,
      sessionToken,
      this.ValidateDirectorySession.bind(this),
    );

    if (request) {
      request.totalRowCount = result.TotalCount;
    }

    return result.Directories;
  }

  //#endregion

  // /**
  //  * Invalidate list objects cache for a user's path.
  //  * Call this when objects are added, deleted, moved, or renamed.
  //  */
  // async InvalidateListObjectsCache(
  //   userId: string,
  //   path?: string,
  // ): Promise<void> {
  //   const pattern = path
  //     ? `cloud:list-objects:${userId}:${path.replace(/^\/+|\/+$/g, '') || 'root'}:*`
  //     : `cloud:list-objects:${userId}:*`;
  //   await this.RedisService.delByPattern(pattern);
  // }

  //#region Objects

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
    sessionToken?: string,
  ): Promise<CloudObjectModel[]> {
    const store = asyncLocalStorage.getStore();
    const request: Request = store?.get('request');

    const cleanedPath = Path ? Path.replace(/^\/+|\/+$/g, '') : '';

    // Check encrypted folder access
    const accessCheck = await this.CheckEncryptedFolderAccess(
      cleanedPath,
      User.id,
      sessionToken,
    );

    if (accessCheck.isEncrypted && !accessCheck.hasAccess) {
      throw new HttpException(
        `Access denied. Folder "${accessCheck.encryptingFolder}" is encrypted. Unlock it first via POST /Cloud/Directories/Unlock`,
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.CloudListService.ListObjects(
      { Path, Delimiter, IsMetadataProcessing, search, skip, take },
      User,
    );

    if (request) {
      request.totalRowCount = result.TotalCount;
    }

    return result.Objects;
  }

  //#endregion

  //#region User Storage Usage

  async UserStorageUsage(
    User: UserContext,
  ): Promise<CloudUserStorageUsageResponseModel> {
    return this.CloudUsageService.UserStorageUsage(User);
  }

  async GetScanStatus(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<CloudScanStatusResponseModel | null> {
    const status = await this.CloudScanService.GetScanStatus(User.id, Key);
    if (!status) {
      return null;
    }
    return {
      Status: status.status,
      Reason: status.reason,
      Signature: status.signature,
      ScannedAt: status.scannedAt,
    };
  }

  //#endregion

  //#region Find

  async Find(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<CloudObjectModel> {
    return this.CloudObjectService.Find({ Key }, User);
  }

  //#endregion

  //#region PresignedURL

  async GetPresignedUrl(
    { Key, ExpiresInSeconds }: CloudPreSignedUrlRequestModel,
    User: UserContext,
  ): Promise<string> {
    return this.CloudObjectService.GetPresignedUrl(
      { Key, ExpiresInSeconds },
      User,
    );
  }

  //#region Get Object Stream

  async GetObjectStream(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<ReadableStream> {
    return this.CloudObjectService.GetObjectStream({ Key }, User);
  }

  // Return a Node Readable stream for the requested object (useful for piping)
  async GetObjectReadable(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<Readable> {
    return this.CloudObjectService.GetObjectReadable({ Key }, User);
  }

  //#endregion

  //#region Move

  async Move(
    { SourceKeys, DestinationKey }: CloudMoveRequestModel,
    User: UserContext,
    idempotencyKey?: string,
  ): Promise<boolean> {
    const cached = await this.GetIdempotentResult<boolean>(
      User.id,
      'move',
      idempotencyKey,
    );
    if (cached !== undefined) {
      return cached;
    }
    const result = await this.CloudObjectService.Move(
      { SourceKeys, DestinationKey },
      User,
    );
    await this.SetIdempotentResult(
      User.id,
      'move',
      idempotencyKey,
      result,
    );
    return result;
  }

  //#endregion

  //#region Delete

  async Delete(
    { Items }: CloudDeleteRequestModel,
    User: UserContext,
    _options?: { allowEncryptedDirectories?: boolean },
    idempotencyKey?: string,
  ): Promise<boolean> {
    // mark _options as used to avoid unused-parameter errors
    void _options;
    const cached = await this.GetIdempotentResult<boolean>(
      User.id,
      'delete',
      idempotencyKey,
    );
    if (cached !== undefined) {
      return cached;
    }
    const files: CloudDeleteRequestModel['Items'] = [];
    let bytesToDecrement = 0;
    for (const item of Items) {
      if (item.IsDirectory) {
        await this.CloudDirectoryService.DeleteDirectoryContents(
          item.Key,
          User,
        );
        continue;
      }
      try {
        const fileInfo = await this.CloudObjectService.Find(
          { Key: item.Key },
          User,
        );
        bytesToDecrement += fileInfo.Size || 0;
      } catch (error) {
        if (
          error instanceof HttpException &&
          error.getStatus() === HttpStatus.NOT_FOUND
        ) {
          continue;
        }
        throw error;
      }
      files.push(item);
    }

    if (files.length) {
      const deleted = await this.CloudObjectService.Delete(
        { Items: files },
        User,
      );
      await this.CloudUsageService.DecrementUsage(User.id, bytesToDecrement);
      await this.SetIdempotentResult(
        User.id,
        'delete',
        idempotencyKey,
        deleted,
      );
      return deleted;
    }
    await this.SetIdempotentResult(User.id, 'delete', idempotencyKey, true);
    return true;
  }

  //#endregion

  //#region Directory Management

  async CreateDirectory(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    return this.CloudDirectoryService.CreateDirectory({ Key }, User);
  }

  async RenameDirectory(
    { Key, Name }: CloudRenameDirectoryRequestModel,
    User: UserContext,
    options?: { allowEncryptedDirectories?: boolean },
  ): Promise<boolean> {
    return this.CloudDirectoryService.RenameDirectory(
      { Key, Name },
      User,
      options,
    );
  }

  async GetEncryptedFolderSet(User: UserContext): Promise<Set<string>> {
    return this.CloudDirectoryService.GetEncryptedFolderSet(User);
  }

  async ValidateDirectorySession(
    userId: string,
    folderPath: string,
    sessionToken: string,
  ): Promise<unknown | null> {
    return this.CloudDirectoryService.ValidateDirectorySession(
      userId,
      folderPath,
      sessionToken,
    );
  }

  async CheckEncryptedFolderAccess(
    path: string,
    userId: string,
    sessionToken?: string,
  ): Promise<{
    isEncrypted: boolean;
    hasAccess: boolean;
    encryptingFolder?: string;
  }> {
    return this.CloudDirectoryService.CheckEncryptedFolderAccess(
      path,
      userId,
      sessionToken,
    );
  }

  async GetActiveSession(
    userId: string,
    folderPath: string,
  ): Promise<unknown | null> {
    return this.CloudDirectoryService.GetActiveSession(userId, folderPath);
  }

  //#endregion

  //#region Multipart Upload

  async UploadCreateMultipartUpload(
    {
      Key,
      ContentType,
      Metadata,
      TotalSize,
    }: CloudCreateMultipartUploadRequestModel,
    User: UserContext,
    sessionToken?: string,
  ): Promise<CloudCreateMultipartUploadResponseModel> {
    await this.EnsureUploadAccess(Key, User.id, sessionToken);
    return this.CloudUploadService.UploadCreateMultipartUpload(
      { Key, ContentType, Metadata, TotalSize },
      User,
    );
  }

  //#endregion

  //#region Multipart Upload

  async UploadGetMultipartPartUrl(
    { Key, UploadId, PartNumber }: CloudGetMultipartPartUrlRequestModel,
    User: UserContext,
    sessionToken?: string,
  ): Promise<CloudGetMultipartPartUrlResponseModel> {
    await this.EnsureUploadAccess(Key, User.id, sessionToken);
    return this.CloudUploadService.UploadGetMultipartPartUrl(
      { Key, UploadId, PartNumber },
      User,
    );
  }

  //#endregion

  //#region Multipart Upload

  async UploadPart(
    { Key, UploadId, PartNumber }: CloudUploadPartRequestModel,
    file: Express.Multer.File,
    User: UserContext,
    sessionToken?: string,
    contentMd5?: string,
  ): Promise<CloudUploadPartResponseModel> {
    await this.EnsureUploadAccess(Key, User.id, sessionToken);
    if (contentMd5) {
      const hash = createHash('md5')
        .update(file.buffer)
        .digest('base64');
      if (hash !== contentMd5) {
        throw new HttpException('Content-MD5 mismatch.', HttpStatus.BAD_REQUEST);
      }
    }
    return this.CloudUploadService.UploadPart(
      { Key, UploadId, PartNumber, File: file, ContentMd5: contentMd5 },
      User,
    );
  }

  //#endregion

  //#region Complete Multipart Upload

  async UploadCompleteMultipartUpload(
    { Key, UploadId, Parts }: CloudCompleteMultipartUploadRequestModel,
    User: UserContext,
    sessionToken?: string,
    idempotencyKey?: string,
  ): Promise<CloudCompleteMultipartUploadResponseModel> {
    await this.EnsureUploadAccess(Key, User.id, sessionToken);
    const cached =
      await this.GetIdempotentResult<CloudCompleteMultipartUploadResponseModel>(
        User.id,
        'upload-complete',
        idempotencyKey,
      );
    if (cached !== undefined) {
      return cached;
    }
    const result = await this.CloudUploadService.UploadCompleteMultipartUpload(
      { Key, UploadId, Parts },
      User,
    );
    const uploadedObject = await this.CloudObjectService.Find({ Key }, User);
    const uploadedSize = uploadedObject.Size || 0;
    await this.CloudUsageService.IncrementUsage(User.id, uploadedSize);
    await this.EnsureUploadedObjectWithinLimits(Key, User, uploadedSize);
    await this.CloudScanService.EnqueueScan(User.id, Key);
    await this.SetIdempotentResult(
      User.id,
      'upload-complete',
      idempotencyKey,
      result,
    );
    return result;
  }

  //#endregion

  //#region Image Metadata Processing
  //#endregion

  async ExtractZipStart(
    { Key }: CloudExtractZipStartRequestModel,
    User: UserContext,
    sessionToken?: string,
  ): Promise<CloudExtractZipStartResponseModel> {
    await this.EnsureUploadAccess(Key, User.id, sessionToken);
    return this.CloudZipService.ExtractZipStart({ Key }, User);
  }

  async ExtractZipStatus(
    { JobId }: CloudExtractZipStatusRequestModel,
    User: UserContext,
  ): Promise<CloudExtractZipStatusResponseModel> {
    return this.CloudZipService.ExtractZipStatus({ JobId }, User);
  }

  async ExtractZipCancel(
    { JobId }: CloudExtractZipCancelRequestModel,
    User: UserContext,
  ): Promise<CloudExtractZipCancelResponseModel> {
    return this.CloudZipService.ExtractZipCancel({ JobId }, User);
  }

  //#region Abort Multipart Upload

  async UploadAbortMultipartUpload(
    { Key, UploadId }: CloudAbortMultipartUploadRequestModel,
    User: UserContext,
  ): Promise<void> {
    await this.CloudUploadService.UploadAbortMultipartUpload(
      { Key, UploadId },
      User,
    );
  }

  //#region Update (rename/metadata)

  async Update(
    { Key, Name, Metadata }: CloudUpdateRequestModel,
    User: UserContext,
  ): Promise<CloudObjectModel> {
    return this.CloudObjectService.Update({ Key, Name, Metadata }, User);
  }

  //#endregion

  // ============================================================================
  // DIRECTORIES API - Unified Directory Management
  // ============================================================================

  //#region Directories API

  /**
   * Create a directory. If IsEncrypted is true, creates an encrypted directory.
   * For encrypted directories, passphrase is required via X-Folder-Passphrase header.
   */
  async DirectoryCreate(
    { Path, IsEncrypted }: DirectoryCreateRequestModel,
    passphrase: string | undefined,
    User: UserContext,
    sessionToken?: string,
  ): Promise<DirectoryResponseModel> {
    await this.EnsureDirectoryAccess(Path, User.id, sessionToken);
    return this.CloudDirectoryService.DirectoryCreate(
      { Path, IsEncrypted },
      passphrase,
      User,
    );
  }

  /**
   * Rename a directory. For encrypted directories, validates passphrase.
   */
  async DirectoryRename(
    { Path, Name }: DirectoryRenameRequestModel,
    passphrase: string | undefined,
    User: UserContext,
    sessionToken?: string,
  ): Promise<DirectoryResponseModel> {
    await this.EnsureDirectoryAccess(Path, User.id, sessionToken);
    return this.CloudDirectoryService.DirectoryRename(
      { Path, Name },
      passphrase,
      User,
    );
  }

  /**
   * Delete a directory. For encrypted directories, validates passphrase.
   */
  async DirectoryDelete(
    { Path }: DirectoryDeleteRequestModel,
    passphrase: string | undefined,
    User: UserContext,
    sessionToken?: string,
  ): Promise<boolean> {
    await this.EnsureDirectoryAccess(Path, User.id, sessionToken);
    return this.CloudDirectoryService.DirectoryDelete(
      { Path },
      passphrase,
      User,
    );
  }

  /**
   * Unlock an encrypted directory and create a session token.
   * The session token allows access to folder contents without providing passphrase.
   */
  async DirectoryUnlock(
    { Path }: DirectoryUnlockRequestModel,
    passphrase: string | undefined,
    User: UserContext,
  ): Promise<DirectoryUnlockResponseModel> {
    return this.CloudDirectoryService.DirectoryUnlock(
      { Path },
      passphrase,
      User,
    );
  }

  /**
   * Lock an encrypted directory (invalidate session).
   */
  async DirectoryLock(
    { Path }: DirectoryLockRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    return this.CloudDirectoryService.DirectoryLock({ Path }, User);
  }

  /**
   * Convert an existing directory to encrypted.
   */
  async DirectoryConvertToEncrypted(
    { Path }: DirectoryConvertToEncryptedRequestModel,
    passphrase: string | undefined,
    User: UserContext,
    sessionToken?: string,
  ): Promise<DirectoryResponseModel> {
    await this.EnsureDirectoryAccess(Path, User.id, sessionToken);
    return this.CloudDirectoryService.DirectoryConvertToEncrypted(
      { Path },
      passphrase,
      User,
    );
  }

  /**
   * Remove encryption from a directory (decrypt).
   */
  async DirectoryDecrypt(
    { Path }: DirectoryDecryptRequestModel,
    passphrase: string | undefined,
    User: UserContext,
    sessionToken?: string,
  ): Promise<DirectoryResponseModel> {
    await this.EnsureDirectoryAccess(Path, User.id, sessionToken);
    return this.CloudDirectoryService.DirectoryDecrypt(
      { Path },
      passphrase,
      User,
    );
  }

  //#endregion

  private GetParentDirectoryPath(key: string): string {
    const normalized = NormalizeDirectoryPath(key);
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

  private async EnsureUploadAccess(
    key: string,
    userId: string,
    sessionToken?: string,
  ): Promise<void> {
    const folderPath = this.GetParentDirectoryPath(key);
    const accessCheck = await this.CheckEncryptedFolderAccess(
      folderPath,
      userId,
      sessionToken,
    );

    if (accessCheck.isEncrypted && !accessCheck.hasAccess) {
      throw new HttpException(
        `Access denied. Folder "${accessCheck.encryptingFolder}" is encrypted. Unlock it first via POST /Cloud/Directories/Unlock`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async EnsureDirectoryAccess(
    path: string,
    userId: string,
    sessionToken?: string,
  ): Promise<void> {
    const normalizedPath = NormalizeDirectoryPath(path);
    const accessCheck = await this.CheckEncryptedFolderAccess(
      normalizedPath,
      userId,
      sessionToken,
    );

    if (accessCheck.isEncrypted && !accessCheck.hasAccess) {
      throw new HttpException(
        `Access denied. Folder "${accessCheck.encryptingFolder}" is encrypted. Unlock it first via POST /Cloud/Directories/Unlock`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async EnsureUploadedObjectWithinLimits(
    key: string,
    user: UserContext,
    objectSize?: number,
  ): Promise<void> {
    const usage = await this.CloudUsageService.UserStorageUsage(user);
    let resolvedSize = typeof objectSize === 'number' ? objectSize : 0;
    if (!resolvedSize) {
      const object = await this.CloudObjectService.Find({ Key: key }, user);
      resolvedSize = object.Size || 0;
    }

    if (usage.MaxUploadSizeBytes && resolvedSize > usage.MaxUploadSizeBytes) {
      await this.CloudObjectService.Delete(
        { Items: [{ Key: key, IsDirectory: false }] },
        user,
      );
      await this.CloudUsageService.DecrementUsage(user.id, resolvedSize);
      throw new HttpException(
        `File size exceeds the maximum upload size of ${SizeFormatter({ From: usage.MaxUploadSizeBytes, FromUnit: 'B', ToUnit: 'MB' })} MB.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      usage.MaxStorageInBytes &&
      usage.UsedStorageInBytes > usage.MaxStorageInBytes
    ) {
      await this.CloudObjectService.Delete(
        { Items: [{ Key: key, IsDirectory: false }] },
        user,
      );
      await this.CloudUsageService.DecrementUsage(user.id, resolvedSize);
      throw new HttpException(
        'Storage limit exceeded. Please upgrade your subscription.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private BuildIdempotencyKey(
    userId: string,
    action: string,
    idempotencyKey?: string,
  ): string | null {
    if (!idempotencyKey) {
      return null;
    }
    return `cloud:idempotency:${userId}:${action}:${idempotencyKey}`;
  }

  private async GetIdempotentResult<T>(
    userId: string,
    action: string,
    idempotencyKey?: string,
  ): Promise<T | undefined> {
    const key = this.BuildIdempotencyKey(userId, action, idempotencyKey);
    if (!key) {
      return undefined;
    }
    return this.RedisService.get<T>(key);
  }

  private async SetIdempotentResult<T>(
    userId: string,
    action: string,
    idempotencyKey: string | undefined,
    value: T,
  ): Promise<void> {
    const key = this.BuildIdempotencyKey(userId, action, idempotencyKey);
    if (!key) {
      return;
    }
    const ttlSeconds = Math.max(
      1,
      parseInt(process.env.CLOUD_IDEMPOTENCY_TTL_SECONDS ?? '300', 10),
    );
    await this.RedisService.set(key, value, ttlSeconds);
  }
}
