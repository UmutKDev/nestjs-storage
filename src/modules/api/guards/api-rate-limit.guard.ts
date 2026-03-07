import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
} from '@nestjs/common';
import { ApiRateLimitService } from '../services/api-rate-limit.service';
import { ApiQuotaService } from '../services/api-quota.service';

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  constructor(
    private readonly apiRateLimitService: ApiRateLimitService,
    private readonly apiQuotaService: ApiQuotaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const ApiKeyId: string = request.apiKey.Id;
    const UserId: string = request.user.Id;

    // ── Get tier limits ─────────────────────────────────────────────────────
    const tierLimits = await this.apiQuotaService.GetTierLimits(UserId);

    // ── Check burst limit (per-second) ──────────────────────────────────────
    const burstAllowed = await this.apiRateLimitService.CheckBurstLimit(
      ApiKeyId,
      tierLimits.RateLimitBurstPerSecond,
    );

    if (!burstAllowed) {
      throw new HttpException('Burst rate limit exceeded', 429);
    }

    // ── Check rate limit (per-minute) ───────────────────────────────────────
    const rateResult = await this.apiRateLimitService.CheckRateLimit(
      ApiKeyId,
      tierLimits.RateLimitPerMinute,
    );

    if (!rateResult.Allowed) {
      response.setHeader('Retry-After', rateResult.RetryAfterSeconds);
      response.setHeader('X-RateLimit-Limit', tierLimits.RateLimitPerMinute);
      response.setHeader('X-RateLimit-Remaining', 0);
      throw new HttpException(
        `Rate limit exceeded. Retry after ${rateResult.RetryAfterSeconds} seconds.`,
        429,
      );
    }

    // ── Set rate limit response headers ─────────────────────────────────────
    response.setHeader('X-RateLimit-Limit', tierLimits.RateLimitPerMinute);
    response.setHeader('X-RateLimit-Remaining', rateResult.Remaining);

    return true;
  }
}
