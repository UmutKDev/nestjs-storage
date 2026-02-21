import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { CloudKeys } from './redis.keys';

@Injectable()
export class RedisService {
  /** Resolved once from the first Keyv store; empty string when no namespace */
  private StorePrefix: string | undefined;

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  /**
   * Derive the key prefix from the Keyv store at runtime.
   * The NestJS cache-manager provider may or may not set a namespace on the
   * underlying Keyv instance — we read whatever was actually configured.
   */
  private ResolveStorePrefix(): string {
    if (this.StorePrefix !== undefined) return this.StorePrefix;

    const stores = this.cacheManager.stores;
    const ns = (stores?.[0] as unknown as { _namespace?: string })?._namespace;
    this.StorePrefix = ns ? `${ns}:` : '';
    return this.StorePrefix;
  }

  /**
   * Get a value from cache.
   */
  async Get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  /**
   * Set a value in cache.
   * @param ttl Time to live in **seconds** (optional)
   */
  async Set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl ? ttl * 1000 : undefined);
  }

  /**
   * Delete a single key from cache.
   */
  async Delete(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  /**
   * Access the underlying Redis client from the first Keyv store.
   * Returns null when running with the in-memory Map fallback.
   */
  private GetNativeClient(): {
    keys: (pattern: string) => Promise<string[]>;
    del: (keys: string | string[]) => Promise<number>;
  } | null {
    const stores = this.cacheManager.stores;
    if (!stores?.length) return null;

    const keyvRedis = (
      stores[0] as unknown as { store?: Record<string, unknown> }
    )?.store as
      | {
          client?: {
            keys: (p: string) => Promise<string[]>;
            del: (k: string | string[]) => Promise<number>;
          };
        }
      | undefined;

    if (keyvRedis?.client && typeof keyvRedis.client.keys === 'function') {
      return keyvRedis.client;
    }

    return null;
  }

  /**
   * Return all keys matching a glob pattern.
   * @returns Keys without store namespace prefix
   */
  async FindKeys(pattern: string): Promise<string[]> {
    const client = this.GetNativeClient();
    const prefix = this.ResolveStorePrefix();
    if (client) {
      const raw = await client.keys(`${prefix}${pattern}`);
      return raw.map((k) =>
        prefix && k.startsWith(prefix) ? k.slice(prefix.length) : k,
      );
    }

    return this.FindKeysFromMemoryStore(pattern);
  }

  /**
   * Pattern-match keys from the in-memory Map store (development fallback).
   */
  private FindKeysFromMemoryStore(pattern: string): string[] {
    const stores = this.cacheManager.stores;
    if (!stores?.length) return [];

    const innerStore = (stores[0] as unknown as { _store?: unknown })._store;
    if (!(innerStore instanceof Map)) return [];

    const prefix = this.ResolveStorePrefix();

    // Convert glob-like pattern to regex
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const regex = new RegExp(
      `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${escaped}$`,
    );

    const result: string[] = [];
    for (const key of innerStore.keys()) {
      if (typeof key === 'string' && regex.test(key)) {
        result.push(
          prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key,
        );
      }
    }
    return result;
  }

  /**
   * Delete all keys matching a glob pattern.
   */
  async DeleteByPattern(pattern: string): Promise<void> {
    const client = this.GetNativeClient();
    if (client) {
      const prefix = this.ResolveStorePrefix();
      const keys = await client.keys(`${prefix}${pattern}`);
      if (keys.length > 0) {
        await client.del(keys);
      }
      return;
    }

    const keys = await this.FindKeys(pattern);
    for (const key of keys) {
      await this.cacheManager.del(key);
    }
  }

  /**
   * Clear the entire cache store.
   */
  async Clear(): Promise<void> {
    await this.DeleteByPattern('*');
  }

  /**
   * Generate a user-scoped cache key for cloud operations.
   */
  GenerateCloudCacheKey(
    userId: string,
    operation: string,
    params?: Record<string, unknown>,
  ): string {
    return CloudKeys.UserCache(userId, operation, params);
  }

  /**
   * Invalidate all cloud cache for a specific user.
   */
  async InvalidateUserCloudCache(userId: string): Promise<void> {
    await this.DeleteByPattern(CloudKeys.UserCachePattern(userId));
  }

  /**
   * Return the raw Keyv stores for diagnostics.
   */
  GetStores(): unknown[] {
    return this.cacheManager.stores;
  }
}
