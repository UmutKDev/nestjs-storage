import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { RedisService } from '@modules/redis/redis.service';
import { DocumentKeys } from '@modules/redis/redis.keys';
import { DOCUMENT_LOCK_TTL } from '@modules/redis/redis.ttl';
import { DocumentLockStatus } from '@common/enums';

export interface LockData {
  UserId: string;
  FullName: string;
  AcquiredAt: number;
  ExpiresAt: number;
}

@Injectable()
export class DocumentLockService {
  private readonly Logger = new Logger(DocumentLockService.name);

  constructor(private readonly RedisService: RedisService) {}

  /**
   * Acquire an edit lock on a document.
   * If already locked by the same user, extends the lock (heartbeat).
   * If locked by another user, throws 423 Locked.
   */
  async AcquireLock(
    ownerId: string,
    key: string,
    user: UserContext,
  ): Promise<LockData> {
    const redisKey = DocumentKeys.Lock(ownerId, key);
    const existing = await this.RedisService.Get<LockData>(redisKey);

    if (existing) {
      if (existing.UserId === user.Id) {
        return this.ExtendLock(ownerId, key, user.Id);
      }

      throw new HttpException(
        {
          Message: `Document is locked by ${existing.FullName}`,
          LockedBy: existing.UserId,
          LockedByName: existing.FullName,
          ExpiresAt: existing.ExpiresAt,
        },
        HttpStatus.LOCKED,
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const lockData: LockData = {
      UserId: user.Id,
      FullName: user.FullName,
      AcquiredAt: now,
      ExpiresAt: now + DOCUMENT_LOCK_TTL,
    };

    await this.RedisService.Set(redisKey, lockData, DOCUMENT_LOCK_TTL);
    return lockData;
  }

  /**
   * Release an edit lock. Only the lock owner can release.
   */
  async ReleaseLock(
    ownerId: string,
    key: string,
    userId: string,
  ): Promise<boolean> {
    const redisKey = DocumentKeys.Lock(ownerId, key);
    const existing = await this.RedisService.Get<LockData>(redisKey);

    if (!existing) return true;

    if (existing.UserId !== userId) {
      throw new HttpException(
        { Message: 'You do not own this lock' },
        HttpStatus.FORBIDDEN,
      );
    }

    await this.RedisService.Delete(redisKey);
    return true;
  }

  /**
   * Extend the lock TTL (heartbeat). Only the lock owner can extend.
   */
  async ExtendLock(
    ownerId: string,
    key: string,
    userId: string,
  ): Promise<LockData> {
    const redisKey = DocumentKeys.Lock(ownerId, key);
    const existing = await this.RedisService.Get<LockData>(redisKey);

    if (!existing) {
      throw new HttpException(
        { Message: 'No active lock found' },
        HttpStatus.NOT_FOUND,
      );
    }

    if (existing.UserId !== userId) {
      throw new HttpException(
        { Message: 'You do not own this lock' },
        HttpStatus.FORBIDDEN,
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const updated: LockData = {
      ...existing,
      ExpiresAt: now + DOCUMENT_LOCK_TTL,
    };

    await this.RedisService.Set(redisKey, updated, DOCUMENT_LOCK_TTL);
    return updated;
  }

  /**
   * Get lock info for a document. Returns null if not locked.
   */
  async GetLockInfo(ownerId: string, key: string): Promise<LockData | null> {
    const redisKey = DocumentKeys.Lock(ownerId, key);
    return (await this.RedisService.Get<LockData>(redisKey)) ?? null;
  }

  /**
   * Get the lock status relative to a specific user.
   */
  async GetLockStatus(
    ownerId: string,
    key: string,
    userId: string,
  ): Promise<DocumentLockStatus> {
    const lock = await this.GetLockInfo(ownerId, key);
    if (!lock) return DocumentLockStatus.UNLOCKED;
    if (lock.UserId === userId) return DocumentLockStatus.LOCKED_BY_ME;
    return DocumentLockStatus.LOCKED_BY_OTHER;
  }

  /**
   * Check if a document is locked by someone other than the given user.
   */
  async IsLockedByOther(
    ownerId: string,
    key: string,
    userId: string,
  ): Promise<boolean> {
    const lock = await this.GetLockInfo(ownerId, key);
    return !!lock && lock.UserId !== userId;
  }

  /**
   * Force-release a lock (for cleanup purposes).
   */
  async ForceReleaseLock(ownerId: string, key: string): Promise<void> {
    const redisKey = DocumentKeys.Lock(ownerId, key);
    await this.RedisService.Delete(redisKey);
  }
}
