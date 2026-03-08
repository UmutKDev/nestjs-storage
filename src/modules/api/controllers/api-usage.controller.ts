import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { User } from '@common/decorators/user.decorator';
import { ApiKeyScope } from '@common/enums/authentication.enum';
import { plainToInstance } from 'class-transformer';
import dayjs from 'dayjs';
import { ApiAuthGuard } from '../guards/api-auth.guard';
import { ApiScopeGuard } from '../guards/api-scope.guard';
import { ApiQuotaGuard } from '../guards/api-quota.guard';
import { ApiRateLimitGuard } from '../guards/api-rate-limit.guard';
import { ApiGeolocationInterceptor } from '../interceptors/api-geolocation.interceptor';
import { ApiIdempotencyInterceptor } from '../interceptors/api-idempotency.interceptor';
import { ApiUsageTrackingInterceptor } from '../interceptors/api-usage-tracking.interceptor';
import { ApiScopes } from '../decorators/api-scopes.decorator';
import { ApiUsageService } from '../services/api-usage.service';
import { ApiQuotaService } from '../services/api-quota.service';
import { ApiUsageCurrentResponseModel } from '../api.model';

@Controller({ path: 'Usage', version: '1' })
@ApiTags('API / Usage')
@Public()
@UseGuards(ApiAuthGuard, ApiScopeGuard, ApiQuotaGuard, ApiRateLimitGuard)
@UseInterceptors(
  ApiGeolocationInterceptor,
  ApiIdempotencyInterceptor,
  ApiUsageTrackingInterceptor,
)
@ApiHeader({ name: 'x-api-key', required: true })
@ApiHeader({ name: 'x-api-secret', required: true })
export class ApiUsageController {
  constructor(
    private readonly ApiUsageService: ApiUsageService,
    private readonly ApiQuotaService: ApiQuotaService,
  ) {}

  @Get('Current')
  @ApiScopes(ApiKeyScope.READ)
  async Current(
    @User() user: UserContext,
  ): Promise<ApiUsageCurrentResponseModel> {
    const yearMonth = dayjs().format('YYYY-MM');

    const [monthlyUsed, dailyUsed, tierLimits] = await Promise.all([
      this.ApiUsageService.GetMonthlyUsage(user.Id),
      this.ApiUsageService.GetDailyUsage(user.Id),
      this.ApiQuotaService.GetTierLimits(user.Id),
    ]);

    const monthlyLimit = tierLimits.MonthlyRequestQuota;
    const monthlyRemaining =
      monthlyLimit === 0 ? -1 : Math.max(0, monthlyLimit - monthlyUsed);

    return plainToInstance(
      ApiUsageCurrentResponseModel,
      {
        MonthlyUsed: monthlyUsed,
        MonthlyLimit: monthlyLimit,
        MonthlyRemaining: monthlyRemaining,
        DailyUsed: dailyUsed,
        RateLimitPerMinute: tierLimits.RateLimitPerMinute,
        RateLimitBurstPerSecond: tierLimits.RateLimitBurstPerSecond,
        BillingPeriod: yearMonth,
      },
      { excludeExtraneousValues: true },
    );
  }
}
