import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { RedisService } from '@modules/redis/redis.service';
import { ApiUsageKeys } from '@modules/redis/redis.keys';
import { SubscriptionService } from '@modules/subscription/subscription.service';
import { ApiTierLimits, DEFAULT_TIER_LIMITS } from '@modules/api/api.constants';

@Injectable()
export class ApiQuotaService {
  constructor(
    private readonly RedisService: RedisService,
    private readonly SubscriptionService: SubscriptionService,
  ) {}

  /**
   * Resolve the API tier limits for a user based on their current subscription.
   *
   * If the subscription plan has explicit `Features.api` overrides they are
   * used; otherwise the limits fall back to `DEFAULT_TIER_LIMITS` keyed by
   * the subscription slug (or `'free'` when no active subscription exists).
   */
  async GetTierLimits(UserId: string): Promise<ApiTierLimits> {
    const userSubscription = await this.SubscriptionService.GetCurrentForUser({
      userId: UserId,
    });

    if (!userSubscription?.Subscription) {
      return DEFAULT_TIER_LIMITS['free'];
    }

    const subscription = userSubscription.Subscription;

    // If the plan carries explicit API feature overrides, use them
    if (
      subscription.Features &&
      (subscription.Features as Record<string, unknown>)['api']
    ) {
      const apiFeatures = (subscription.Features as Record<string, unknown>)[
        'api'
      ] as Record<string, unknown>;

      return {
        MonthlyRequestQuota:
          (apiFeatures['MonthlyRequestQuota'] as number) ??
          DEFAULT_TIER_LIMITS['free'].MonthlyRequestQuota,
        RateLimitPerMinute:
          (apiFeatures['RateLimitPerMinute'] as number) ??
          DEFAULT_TIER_LIMITS['free'].RateLimitPerMinute,
        RateLimitBurstPerSecond:
          (apiFeatures['RateLimitBurstPerSecond'] as number) ??
          DEFAULT_TIER_LIMITS['free'].RateLimitBurstPerSecond,
        HmacRequired:
          (apiFeatures['HmacRequired'] as boolean) ??
          DEFAULT_TIER_LIMITS['free'].HmacRequired,
        MaxWebhooks:
          (apiFeatures['MaxWebhooks'] as number) ??
          DEFAULT_TIER_LIMITS['free'].MaxWebhooks,
        RetentionDays:
          (apiFeatures['RetentionDays'] as number) ??
          DEFAULT_TIER_LIMITS['free'].RetentionDays,
      };
    }

    // Fall back to slug-based defaults
    const slug = (subscription as unknown as { Slug?: string }).Slug ?? 'free';
    return DEFAULT_TIER_LIMITS[slug] ?? DEFAULT_TIER_LIMITS['free'];
  }

  /**
   * Check whether a user is within their monthly API request quota.
   *
   * A `Limit` of 0 means unlimited (always allowed).
   */
  async CheckQuota(UserId: string): Promise<{
    Allowed: boolean;
    Used: number;
    Limit: number;
    Remaining: number;
  }> {
    const tierLimits = await this.GetTierLimits(UserId);
    const yearMonth = dayjs().format('YYYY-MM');
    const counterKey = ApiUsageKeys.MonthlyCounter(UserId, yearMonth);

    const used = (await this.RedisService.Get<number>(counterKey)) ?? 0;
    const limit = tierLimits.MonthlyRequestQuota;

    // 0 = unlimited
    if (limit === 0) {
      return { Allowed: true, Used: used, Limit: 0, Remaining: -1 };
    }

    const remaining = Math.max(0, limit - used);

    return {
      Allowed: used < limit,
      Used: used,
      Limit: limit,
      Remaining: remaining,
    };
  }
}
