import { Injectable } from '@nestjs/common';
import { RedisService } from '@modules/redis/redis.service';
import { ApiRateLimitKeys } from '@modules/redis/redis.keys';
import {
  API_RATE_LIMIT_WINDOW_TTL,
  API_RATE_LIMIT_BURST_TTL,
} from '@modules/redis/redis.ttl';

@Injectable()
export class ApiRateLimitService {
  constructor(private readonly RedisService: RedisService) {}

  /**
   * Check the per-minute rate limit for an API key.
   *
   * Uses a fixed-window strategy with minute granularity.
   * Returns how many requests remain and, if blocked, how many seconds
   * until the next window opens.
   */
  async CheckRateLimit(
    ApiKeyId: string,
    LimitPerMinute: number,
  ): Promise<{
    Allowed: boolean;
    Remaining: number;
    RetryAfterSeconds: number;
  }> {
    const windowStart = Math.floor(Date.now() / 60_000);
    const key = ApiRateLimitKeys.Window(ApiKeyId, windowStart);

    const current = (await this.RedisService.Get<number>(key)) ?? 0;

    if (current >= LimitPerMinute) {
      // Seconds remaining until the next minute window
      const elapsedMs = Date.now() % 60_000;
      const retryAfter = Math.ceil((60_000 - elapsedMs) / 1000);

      return {
        Allowed: false,
        Remaining: 0,
        RetryAfterSeconds: retryAfter,
      };
    }

    await this.RedisService.Set(key, current + 1, API_RATE_LIMIT_WINDOW_TTL);

    return {
      Allowed: true,
      Remaining: LimitPerMinute - current - 1,
      RetryAfterSeconds: 0,
    };
  }

  /**
   * Check the per-second burst limit for an API key.
   *
   * Returns `true` when the request is allowed, `false` when the burst
   * threshold has been reached.
   */
  async CheckBurstLimit(
    ApiKeyId: string,
    BurstPerSecond: number,
  ): Promise<boolean> {
    const key = ApiRateLimitKeys.Burst(ApiKeyId);

    const current = (await this.RedisService.Get<number>(key)) ?? 0;

    if (current >= BurstPerSecond) {
      return false;
    }

    await this.RedisService.Set(key, current + 1, API_RATE_LIMIT_BURST_TTL);

    return true;
  }
}
