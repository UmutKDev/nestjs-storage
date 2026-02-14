import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class RedisService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  /**
   * Get a value from cache
   * @param key Cache key
   * @returns Cached value or undefined
   */
  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  /**
   * Set a value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in seconds (optional)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl ? ttl * 1000 : undefined);
  }

  /**
   * Delete a value from cache
   * @param key Cache key
   */
  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  /**
   * Get all keys matching a pattern
   * @param pattern Pattern to match (e.g., 'encrypted-folder:session:*')
   * @returns Array of matching keys
   */
  async keys(pattern: string): Promise<string[]> {
    const cacheManagerAny = this.cacheManager as unknown as {
      stores?: Array<{
        keys?: (pattern: string) => Promise<string[]>;
        client?: { keys: (pattern: string) => Promise<string[]> };
      }>;
      store?: {
        keys?: (pattern: string) => Promise<string[]>;
        client?: { keys: (pattern: string) => Promise<string[]> };
      };
    };

    let keys: string[] = [];

    // Try stores array first (cache-manager v5+)
    if (cacheManagerAny.stores && cacheManagerAny.stores.length > 0) {
      const store = cacheManagerAny.stores[0];
      if (typeof store.keys === 'function') {
        keys = await store.keys(pattern);
      } else if (store.client && typeof store.client.keys === 'function') {
        keys = await store.client.keys(pattern);
      }
    }
    // Fallback to single store
    else if (cacheManagerAny.store) {
      const store = cacheManagerAny.store;
      if (typeof store.keys === 'function') {
        keys = await store.keys(pattern);
      } else if (store.client && typeof store.client.keys === 'function') {
        keys = await store.client.keys(pattern);
      }
    }

    return keys;
  }

  /**
   * Delete all keys matching a pattern (user-based invalidation)
   * @param pattern Pattern to match (e.g., 'cloud:user:123:*')
   */
  async delByPattern(pattern: string): Promise<void> {
    const keys = await this.keys(pattern);

    // Delete all matching keys
    for (const key of keys) {
      await this.cacheManager.del(key);
    }
  }

  /**
   * Clear all cache - uses del pattern to clear all keys
   */
  async clearAll(): Promise<void> {
    await this.delByPattern('*');
  }

  /**
   * Generate a user-scoped cache key for cloud operations
   * @param userId User ID
   * @param operation Operation name
   * @param params Additional parameters
   */
  generateCloudCacheKey(
    userId: string,
    operation: string,
    params?: Record<string, unknown>,
  ): string {
    const baseKey = `cloud:user:${userId}:${operation}`;
    if (params) {
      const paramString = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(':');
      return paramString ? `${baseKey}:${paramString}` : baseKey;
    }
    return baseKey;
  }

  /**
   * Invalidate all cloud cache for a specific user
   * @param userId User ID
   */
  async invalidateUserCloudCache(userId: string): Promise<void> {
    await this.delByPattern(`cloud:user:${userId}:*`);
  }
}
