import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Readable } from 'stream';
import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from 'crypto';
import {
  CloudKeyRequestModel,
  CloudRenameDirectoryRequestModel,
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
import { CloudS3Service } from './cloud.s3.service';
import { RedisService } from '@modules/redis/redis.service';
import { CloudKeys } from '@modules/redis/redis.keys';
import {
  ENCRYPTED_FOLDER_SESSION_TTL,
  ENCRYPTED_MANIFEST_CACHE_TTL,
} from '@modules/redis/redis.ttl';
import { KeyBuilder } from '@common/helpers/cast.helper';
import { EnsureTrailingSlash, NormalizeDirectoryPath } from './cloud.utils';
import { CloudUsageService } from './cloud.usage.service';

type EncryptedFolderRecord = {
  ciphertext: string;
  iv: string;
  authTag: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
};

type EncryptedFolderManifest = {
  folders: Record<string, EncryptedFolderRecord>;
};

type EncryptedFolderSession = {
  token: string;
  folderPath: string;
  folderKey: string;
  expiresAt: number;
};

@Injectable()
export class CloudDirectoryService {
  private readonly Logger = new Logger(CloudDirectoryService.name);
  private readonly EmptyFolderPlaceholder = '.emptyFolderPlaceholder';
  private readonly EncryptedFoldersManifestKey =
    '.secure/encrypted-folders.json';
  private readonly EncryptedFolderKeyBytes = 32;
  private readonly EncryptedFolderIvLength = 12;
  private readonly EncryptedFolderKdfIterations = 120000;
  private readonly EncryptedFolderAlgorithm = 'aes-256-gcm';
  private readonly MaxListObjects = 1000;

  constructor(
    private readonly CloudS3Service: CloudS3Service,
    private readonly RedisService: RedisService,
    private readonly CloudUsageService: CloudUsageService,
  ) {}

  async CreateDirectory(
    { Key }: CloudKeyRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    const directoryKey =
      Key.replace(/^\/+|\/+$/g, '') + '/' + this.EmptyFolderPlaceholder;

    await this.CloudS3Service.Send(
      new PutObjectCommand({
        Bucket: this.CloudS3Service.GetBuckets().Storage,
        Key: KeyBuilder([User.Id, directoryKey]),
        Body: '',
      }),
    );

    return true;
  }

  async RenameDirectory(
    { Key, Name }: CloudRenameDirectoryRequestModel,
    User: UserContext,
    options?: { allowEncryptedDirectories?: boolean },
  ): Promise<boolean> {
    const sourcePath = NormalizeDirectoryPath(Key);
    if (!sourcePath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!options?.allowEncryptedDirectories) {
      const encryptedFolders = await this.GetEncryptedFolderSet(User);
      if (encryptedFolders.has(sourcePath)) {
        throw new HttpException(
          'Encrypted folders must be renamed via the encrypted-folder endpoint.',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    const trimmedName = (Name || '').trim();
    if (!trimmedName) {
      throw new HttpException(
        'Directory name is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const sanitizedName = trimmedName.replace(/^\/+|\/+$/g, '');
    if (!sanitizedName) {
      throw new HttpException(
        'Directory name is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const segments = sourcePath.split('/').filter((segment) => !!segment);
    if (!segments.length) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const parentSegments = segments.slice(0, -1);
    const targetPath = parentSegments.length
      ? `${parentSegments.join('/')}/${sanitizedName}`
      : sanitizedName;
    const normalizedTargetPath = NormalizeDirectoryPath(targetPath);

    if (!normalizedTargetPath) {
      throw new HttpException(
        'Target directory path is invalid',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (normalizedTargetPath === sourcePath) {
      return true;
    }

    const bucket = this.CloudS3Service.GetBuckets().Storage;
    const sourcePrefixFull = EnsureTrailingSlash(
      KeyBuilder([User.Id, sourcePath]),
    );
    const targetPrefixFull = EnsureTrailingSlash(
      KeyBuilder([User.Id, normalizedTargetPath]),
    );

    try {
      const targetCheck = await this.CloudS3Service.Send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: targetPrefixFull,
          MaxKeys: 1,
        }),
      );

      const targetExists =
        (targetCheck.KeyCount ?? targetCheck.Contents?.length ?? 0) > 0;

      if (targetExists) {
        throw new HttpException(
          'Target directory already exists',
          HttpStatus.CONFLICT,
        );
      }

      let continuationToken: string | undefined = undefined;
      let movedObjects = 0;

      do {
        const listResp = await this.CloudS3Service.Send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: sourcePrefixFull,
            ContinuationToken: continuationToken,
            MaxKeys: this.MaxListObjects,
          }),
        );

        const contents = listResp.Contents || [];
        if (!contents.length && !listResp.IsTruncated && movedObjects === 0) {
          throw new HttpException(
            Codes.Error.Cloud.FILE_NOT_FOUND,
            HttpStatus.NOT_FOUND,
          );
        }

        for (const content of contents) {
          if (!content.Key) {
            continue;
          }

          const suffix = content.Key.startsWith(sourcePrefixFull)
            ? content.Key.slice(sourcePrefixFull.length)
            : '';
          const destinationKey = suffix
            ? targetPrefixFull + suffix
            : targetPrefixFull.slice(0, -1);

          await this.CloudS3Service.Send(
            new CopyObjectCommand({
              Bucket: bucket,
              CopySource: `${bucket}/${content.Key}`,
              Key: destinationKey,
            }),
          );

          await this.CloudS3Service.Send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: content.Key,
            }),
          );

          movedObjects++;
        }

        continuationToken = listResp.IsTruncated
          ? listResp.NextContinuationToken
          : undefined;
      } while (continuationToken);

      await this.UpdateEncryptedFoldersAfterRename(
        sourcePath,
        normalizedTargetPath,
        User,
      );

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (this.CloudS3Service.IsNotFoundError(error)) {
        throw new HttpException(Codes.Error.Cloud.FILE_NOT_FOUND, 404);
      }
      throw error;
    }
  }

  async DirectoryCreate(
    { Path, IsEncrypted }: DirectoryCreateRequestModel,
    passphrase: string | undefined,
    User: UserContext,
  ): Promise<DirectoryResponseModel> {
    const normalizedPath = NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (IsEncrypted) {
      if (!passphrase || passphrase.length < 8) {
        throw new HttpException(
          'Passphrase is required (min 8 characters) for encrypted directories. Provide via X-Folder-Passphrase header.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const manifest = await this.GetEncryptedFolderManifest(User);
      if (manifest.folders[normalizedPath]) {
        throw new HttpException(
          'Encrypted folder already exists',
          HttpStatus.CONFLICT,
        );
      }

      await this.CreateDirectory(
        { Key: normalizedPath } as CloudKeyRequestModel,
        User,
      );

      const folderKey = randomBytes(this.EncryptedFolderKeyBytes).toString(
        'base64',
      );
      const encrypted = this.EncryptFolderKey(passphrase, folderKey);

      const now = new Date().toISOString();
      manifest.folders[normalizedPath] = {
        ...encrypted,
        createdAt: now,
        updatedAt: now,
      };

      await this.SaveEncryptedFolderManifest(User, manifest);

      return plainToInstance(DirectoryResponseModel, {
        Path: normalizedPath,
        IsEncrypted: true,
        CreatedAt: now,
        UpdatedAt: now,
      });
    }

    await this.CreateDirectory(
      { Key: normalizedPath } as CloudKeyRequestModel,
      User,
    );

    return plainToInstance(DirectoryResponseModel, {
      Path: normalizedPath,
      IsEncrypted: false,
    });
  }

  async DirectoryRename(
    { Path, Name }: DirectoryRenameRequestModel,
    passphrase: string | undefined,
    User: UserContext,
  ): Promise<DirectoryResponseModel> {
    const normalizedPath = NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const manifest = await this.GetEncryptedFolderManifest(User);
    const isEncrypted = !!manifest.folders[normalizedPath];

    if (isEncrypted) {
      if (!passphrase) {
        throw new HttpException(
          'Passphrase required for encrypted directories. Provide via X-Folder-Passphrase header.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const entry = manifest.folders[normalizedPath];
      try {
        this.DecryptFolderKey(passphrase, entry);
      } catch {
        throw new HttpException('Invalid passphrase', HttpStatus.BAD_REQUEST);
      }
    }

    await this.RenameDirectory({ Key: normalizedPath, Name }, User, {
      allowEncryptedDirectories: isEncrypted,
    });

    const segments = normalizedPath.split('/').filter((s) => !!s);
    const parentSegments = segments.slice(0, -1);
    const newPath = parentSegments.length
      ? `${parentSegments.join('/')}/${Name}`
      : Name;

    return plainToInstance(DirectoryResponseModel, {
      Path: NormalizeDirectoryPath(newPath),
      IsEncrypted: isEncrypted,
    });
  }

  async DirectoryDelete(
    { Path }: DirectoryDeleteRequestModel,
    passphrase: string | undefined,
    User: UserContext,
  ): Promise<boolean> {
    const normalizedPath = NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const manifest = await this.GetEncryptedFolderManifest(User);
    const isEncrypted = !!manifest.folders[normalizedPath];

    if (isEncrypted) {
      if (!passphrase) {
        throw new HttpException(
          'Passphrase required for encrypted directories. Provide via X-Folder-Passphrase header.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const entry = manifest.folders[normalizedPath];
      try {
        this.DecryptFolderKey(passphrase, entry);
      } catch {
        throw new HttpException('Invalid passphrase', HttpStatus.BAD_REQUEST);
      }

      await this.DeleteDirectoryContents(normalizedPath, User);

      delete manifest.folders[normalizedPath];
      await this.SaveEncryptedFolderManifest(User, manifest);
    } else {
      await this.DeleteDirectoryContents(normalizedPath, User);
    }

    return true;
  }

  async DeleteDirectoryContents(
    Key: string,
    User: UserContext,
  ): Promise<number> {
    const normalized = NormalizeDirectoryPath(Key);
    if (!normalized) {
      return 0;
    }

    const prefix = EnsureTrailingSlash(KeyBuilder([User.Id, normalized]));
    let continuationToken: string | undefined = undefined;
    let totalBytes = 0;

    do {
      const list = await this.CloudS3Service.Send(
        new ListObjectsV2Command({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Prefix: prefix,
          MaxKeys: this.MaxListObjects,
          ContinuationToken: continuationToken,
        }),
      );

      const contents = list.Contents || [];
      for (const content of contents) {
        if (!content.Key) {
          continue;
        }
        if (content.Size) {
          totalBytes += content.Size;
        }
        await this.CloudS3Service.Send(
          new DeleteObjectCommand({
            Bucket: this.CloudS3Service.GetBuckets().Storage,
            Key: content.Key,
          }),
        );
      }

      continuationToken = list.IsTruncated
        ? list.NextContinuationToken
        : undefined;
    } while (continuationToken);

    if (totalBytes > 0) {
      await this.CloudUsageService.DecrementUsage(User.Id, totalBytes);
    }

    return totalBytes;
  }

  async DirectoryUnlock(
    { Path }: DirectoryUnlockRequestModel,
    passphrase: string | undefined,
    User: UserContext,
  ): Promise<DirectoryUnlockResponseModel> {
    const normalizedPath = NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!passphrase || passphrase.length < 8) {
      throw new HttpException(
        'Passphrase is required (min 8 characters). Provide via X-Folder-Passphrase header.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const manifest = await this.GetEncryptedFolderManifest(User);

    let entry = manifest.folders[normalizedPath];
    let encryptedFolderPath = normalizedPath;

    if (!entry) {
      const pathSegments = normalizedPath.split('/');

      for (let i = pathSegments.length - 1; i > 0; i--) {
        const parentPath = pathSegments.slice(0, i).join('/');
        if (manifest.folders[parentPath]) {
          entry = manifest.folders[parentPath];
          encryptedFolderPath = parentPath;
          break;
        }
      }

      if (!entry) {
        throw new HttpException(
          'Encrypted folder not found',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    let folderKey: string;
    try {
      folderKey = this.DecryptFolderKey(passphrase, entry);
    } catch {
      this.Logger.warn(
        `Failed to unlock encrypted folder ${normalizedPath} for user ${User.Id}`,
      );
      throw new HttpException('Invalid passphrase', HttpStatus.BAD_REQUEST);
    }

    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt =
      Math.floor(Date.now() / 1000) + ENCRYPTED_FOLDER_SESSION_TTL;

    const session: EncryptedFolderSession = {
      token: sessionToken,
      folderPath: encryptedFolderPath,
      folderKey,
      expiresAt,
    };

    const cacheKey = CloudKeys.EncryptedFolderSession(
      User.Id,
      encryptedFolderPath,
    );
    await this.RedisService.Set(
      cacheKey,
      session,
      ENCRYPTED_FOLDER_SESSION_TTL,
    );

    if (normalizedPath !== encryptedFolderPath) {
      const childCacheKey = CloudKeys.EncryptedFolderSession(
        User.Id,
        normalizedPath,
      );
      await this.RedisService.Set(
        childCacheKey,
        session,
        ENCRYPTED_FOLDER_SESSION_TTL,
      );
    }

    return plainToInstance(DirectoryUnlockResponseModel, {
      Path: normalizedPath,
      EncryptedFolderPath: encryptedFolderPath,
      SessionToken: sessionToken,
      ExpiresAt: expiresAt,
      TTL: ENCRYPTED_FOLDER_SESSION_TTL,
    });
  }

  async DirectoryLock(
    { Path }: DirectoryLockRequestModel,
    User: UserContext,
  ): Promise<boolean> {
    const normalizedPath = NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.RedisService.DeleteByPattern(
      CloudKeys.EncryptedFolderSessionPattern(User.Id, normalizedPath),
    );

    return true;
  }

  async DirectoryConvertToEncrypted(
    { Path }: DirectoryConvertToEncryptedRequestModel,
    passphrase: string | undefined,
    User: UserContext,
  ): Promise<DirectoryResponseModel> {
    const normalizedPath = NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!passphrase || passphrase.length < 8) {
      throw new HttpException(
        'Passphrase is required (min 8 characters). Provide via X-Folder-Passphrase header.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const manifest = await this.GetEncryptedFolderManifest(User);
    if (manifest.folders[normalizedPath]) {
      throw new HttpException(
        'Directory is already encrypted',
        HttpStatus.CONFLICT,
      );
    }

    const ensureTrailingSlash = (value: string): string =>
      value.endsWith('/') ? value : value + '/';
    const directoryPrefix = ensureTrailingSlash(
      KeyBuilder([User.Id, normalizedPath]),
    );

    const listResponse = await this.CloudS3Service.Send(
      new ListObjectsV2Command({
        Bucket: this.CloudS3Service.GetBuckets().Storage,
        Prefix: directoryPrefix,
        MaxKeys: 1,
      }),
    );

    const hasObjects = (listResponse.Contents?.length ?? 0) > 0;
    if (!hasObjects) {
      throw new HttpException(
        'Directory not found or is empty',
        HttpStatus.NOT_FOUND,
      );
    }

    const folderKey = randomBytes(this.EncryptedFolderKeyBytes).toString(
      'base64',
    );
    const encrypted = this.EncryptFolderKey(passphrase, folderKey);
    const now = new Date().toISOString();

    manifest.folders[normalizedPath] = {
      ...encrypted,
      createdAt: now,
      updatedAt: now,
    };

    await this.SaveEncryptedFolderManifest(User, manifest);

    return plainToInstance(DirectoryResponseModel, {
      Path: normalizedPath,
      IsEncrypted: true,
      CreatedAt: now,
      UpdatedAt: now,
    });
  }

  async DirectoryDecrypt(
    { Path }: DirectoryDecryptRequestModel,
    passphrase: string | undefined,
    User: UserContext,
  ): Promise<DirectoryResponseModel> {
    const normalizedPath = NormalizeDirectoryPath(Path);
    if (!normalizedPath) {
      throw new HttpException(
        'Directory path is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!passphrase) {
      throw new HttpException(
        'Passphrase is required. Provide via X-Folder-Passphrase header.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const manifest = await this.GetEncryptedFolderManifest(User);
    const entry = manifest.folders[normalizedPath];

    if (!entry) {
      throw new HttpException(
        'Directory is not encrypted',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      this.DecryptFolderKey(passphrase, entry);
    } catch {
      throw new HttpException('Invalid passphrase', HttpStatus.BAD_REQUEST);
    }

    delete manifest.folders[normalizedPath];
    await this.SaveEncryptedFolderManifest(User, manifest);

    return plainToInstance(DirectoryResponseModel, {
      Path: normalizedPath,
      IsEncrypted: false,
    });
  }

  async ValidateDirectorySession(
    userId: string,
    folderPath: string,
    sessionToken: string,
  ): Promise<EncryptedFolderSession | null> {
    const normalizedPath = NormalizeDirectoryPath(folderPath);

    const cacheKey = CloudKeys.EncryptedFolderSession(userId, normalizedPath);
    const session =
      await this.RedisService.Get<EncryptedFolderSession>(cacheKey);

    if (!session || session.token !== sessionToken) {
      return null;
    }

    if (session.expiresAt < Math.floor(Date.now() / 1000)) {
      await this.RedisService.Delete(cacheKey);
      return null;
    }

    return session;
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
    const normalizedPath = NormalizeDirectoryPath(path);
    const manifest = await this.GetEncryptedFolderManifestByUserId(userId);

    let encryptingFolder: string | undefined;
    for (const encPath of Object.keys(manifest.folders)) {
      if (
        normalizedPath === encPath ||
        normalizedPath.startsWith(encPath + '/')
      ) {
        encryptingFolder = encPath;
        break;
      }
    }

    if (!encryptingFolder) {
      return { isEncrypted: false, hasAccess: true };
    }

    if (!sessionToken) {
      return { isEncrypted: true, hasAccess: false, encryptingFolder };
    }

    const session = await this.ValidateDirectorySession(
      userId,
      encryptingFolder,
      sessionToken,
    );

    return {
      isEncrypted: true,
      hasAccess: !!session,
      encryptingFolder,
    };
  }

  async GetActiveSession(
    userId: string,
    folderPath: string,
  ): Promise<EncryptedFolderSession | null> {
    const cacheKey = CloudKeys.EncryptedFolderSession(userId, folderPath);
    const session =
      await this.RedisService.Get<EncryptedFolderSession>(cacheKey);

    if (!session || session.expiresAt < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return session;
  }

  async GetEncryptedFolderSet(User: UserContext): Promise<Set<string>> {
    const manifest = await this.GetEncryptedFolderManifest(User);
    return this.BuildEncryptedFolderSet(manifest);
  }

  private async UpdateEncryptedFoldersAfterRename(
    sourcePath: string,
    targetPath: string,
    User: UserContext,
  ): Promise<void> {
    const manifest = await this.GetEncryptedFolderManifest(User);
    const folders = manifest.folders || {};
    const updatedFolders: Record<string, EncryptedFolderRecord> = {};
    const sourcePrefix = sourcePath + '/';
    let hasChanges = false;
    const now = new Date().toISOString();

    for (const [path, record] of Object.entries(folders)) {
      if (path === sourcePath || path.startsWith(sourcePrefix)) {
        const suffix = path.slice(sourcePath.length);
        const normalizedSuffix = suffix.startsWith('/')
          ? suffix.slice(1)
          : suffix;
        const updatedPath = normalizedSuffix
          ? `${targetPath}/${normalizedSuffix}`
          : targetPath;
        const normalizedUpdatedPath = NormalizeDirectoryPath(updatedPath);
        updatedFolders[normalizedUpdatedPath] = {
          ...record,
          updatedAt: now,
        };
        hasChanges = true;
      } else {
        updatedFolders[path] = record;
      }
    }

    if (hasChanges) {
      manifest.folders = updatedFolders;
      await this.SaveEncryptedFolderManifest(User, manifest);
    }
  }

  private BuildEncryptedFolderSet(
    manifest: EncryptedFolderManifest,
  ): Set<string> {
    const folders = manifest.folders || {};
    const set = new Set<string>();
    for (const path of Object.keys(folders)) {
      const normalized = NormalizeDirectoryPath(path);
      if (normalized) {
        set.add(normalized);
      }
    }
    return set;
  }

  private async GetEncryptedFolderManifest(
    User: UserContext,
  ): Promise<EncryptedFolderManifest> {
    // Try Redis cache first
    const cacheKey = CloudKeys.EncryptedFolderManifest(User.Id);
    const cached =
      await this.RedisService.Get<EncryptedFolderManifest>(cacheKey);
    if (cached) {
      return cached;
    }

    const manifestKey = KeyBuilder([User.Id, this.EncryptedFoldersManifestKey]);

    try {
      const command = await this.CloudS3Service.Send(
        new GetObjectCommand({
          Bucket: this.CloudS3Service.GetBuckets().Storage,
          Key: manifestKey,
        }),
      );

      const body = command.Body as Readable;
      if (!body) {
        const empty: EncryptedFolderManifest = { folders: {} };
        await this.RedisService.Set(
          cacheKey,
          empty,
          ENCRYPTED_MANIFEST_CACHE_TTL,
        );
        return empty;
      }

      const json = await this.ReadStreamToString(body);
      if (!json) {
        const empty: EncryptedFolderManifest = { folders: {} };
        await this.RedisService.Set(
          cacheKey,
          empty,
          ENCRYPTED_MANIFEST_CACHE_TTL,
        );
        return empty;
      }

      let raw: Record<string, unknown> = {};
      try {
        raw = JSON.parse(json) as Record<string, unknown>;
      } catch (parseError) {
        this.Logger.warn(
          'Failed to parse encrypted folder manifest, returning empty manifest',
          parseError,
        );
        const empty: EncryptedFolderManifest = { folders: {} };
        await this.RedisService.Set(
          cacheKey,
          empty,
          ENCRYPTED_MANIFEST_CACHE_TTL,
        );
        return empty;
      }
      const normalized: Record<string, EncryptedFolderRecord> = {};
      if (raw && typeof raw === 'object' && raw.folders) {
        for (const [path, entry] of Object.entries(
          raw.folders as Record<string, EncryptedFolderRecord>,
        )) {
          const normalizedPath = NormalizeDirectoryPath(path);
          if (
            normalizedPath &&
            entry &&
            typeof entry === 'object' &&
            entry.ciphertext &&
            entry.iv &&
            entry.authTag &&
            entry.salt
          ) {
            normalized[normalizedPath] = entry;
          }
        }
      }
      const manifest: EncryptedFolderManifest = { folders: normalized };
      await this.RedisService.Set(
        cacheKey,
        manifest,
        ENCRYPTED_MANIFEST_CACHE_TTL,
      );
      return manifest;
    } catch (error) {
      if (this.CloudS3Service.IsNotFoundError(error)) {
        const empty: EncryptedFolderManifest = { folders: {} };
        await this.RedisService.Set(
          cacheKey,
          empty,
          ENCRYPTED_MANIFEST_CACHE_TTL,
        );
        return empty;
      }
      this.Logger.error('Failed to load encrypted folder manifest', error);
      throw error;
    }
  }

  private async SaveEncryptedFolderManifest(
    User: UserContext,
    manifest: EncryptedFolderManifest,
  ): Promise<void> {
    const manifestKey = KeyBuilder([User.Id, this.EncryptedFoldersManifestKey]);

    await this.CloudS3Service.Send(
      new PutObjectCommand({
        Bucket: this.CloudS3Service.GetBuckets().Storage,
        Key: manifestKey,
        Body: JSON.stringify({ folders: manifest.folders || {} }),
        ContentType: 'application/json',
      }),
    );

    // Invalidate the cached manifest
    await this.RedisService.Delete(CloudKeys.EncryptedFolderManifest(User.Id));
  }

  private EncryptFolderKey(
    passphrase: string,
    folderKey: string,
  ): Omit<EncryptedFolderRecord, 'createdAt' | 'updatedAt'> {
    const salt = randomBytes(16);
    const key = pbkdf2Sync(
      passphrase,
      salt,
      this.EncryptedFolderKdfIterations,
      32,
      'sha512',
    );
    const iv = randomBytes(this.EncryptedFolderIvLength);
    const cipher = createCipheriv(this.EncryptedFolderAlgorithm, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(folderKey, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      salt: salt.toString('base64'),
    };
  }

  private DecryptFolderKey(
    passphrase: string,
    record: EncryptedFolderRecord,
  ): string {
    const salt = Buffer.from(record.salt, 'base64');
    const key = pbkdf2Sync(
      passphrase,
      salt,
      this.EncryptedFolderKdfIterations,
      32,
      'sha512',
    );
    const iv = Buffer.from(record.iv, 'base64');
    const decipher = createDecipheriv(this.EncryptedFolderAlgorithm, key, iv);
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private async ReadStreamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      const bufferChunk = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk instanceof Uint8Array ? chunk : String(chunk));
      chunks.push(bufferChunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  private async GetEncryptedFolderManifestByUserId(
    userId: string,
  ): Promise<EncryptedFolderManifest> {
    return this.GetEncryptedFolderManifest({ Id: userId } as UserContext);
  }
}
