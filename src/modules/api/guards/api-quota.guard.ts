import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
} from '@nestjs/common';
import { ApiQuotaService } from '../services/api-quota.service';

@Injectable()
export class ApiQuotaGuard implements CanActivate {
  constructor(private readonly apiQuotaService: ApiQuotaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const UserId: string = request.user.Id;

    // ── Check monthly quota ─────────────────────────────────────────────────
    const quota = await this.apiQuotaService.CheckQuota(UserId);

    if (!quota.Allowed) {
      response.setHeader('X-RateLimit-Limit', quota.Limit);
      response.setHeader('X-RateLimit-Remaining', 0);
      throw new HttpException('Monthly API quota exceeded', 429);
    }

    // ── Set quota response headers ──────────────────────────────────────────
    response.setHeader('X-Quota-Limit', quota.Limit);
    response.setHeader('X-Quota-Remaining', quota.Remaining);
    response.setHeader('X-Quota-Used', quota.Used);

    return true;
  }
}
