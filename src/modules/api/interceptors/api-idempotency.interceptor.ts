import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { RedisService } from '@modules/redis/redis.service';
import { ApiIdempotencyKeys } from '@modules/redis/redis.keys';
import { API_IDEMPOTENCY_TTL } from '@modules/redis/redis.ttl';
import { IS_IDEMPOTENT_KEY } from '../decorators/api-idempotent.decorator';
import { MAX_IDEMPOTENCY_KEY_LENGTH } from '../api.constants';

@Injectable()
export class ApiIdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    // ── Check if handler is marked as idempotent ────────────────────────────
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(
      IS_IDEMPOTENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!isIdempotent) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['idempotency-key'] as string;
    const method = request.method?.toUpperCase();

    // ── Require idempotency key for mutating requests ───────────────────────
    if (!idempotencyKey && ['POST', 'PUT', 'DELETE'].includes(method)) {
      throw new BadRequestException(
        'Idempotency key required for this operation',
      );
    }

    // ── If no key (e.g. GET request), proceed normally ──────────────────────
    if (!idempotencyKey) {
      return next.handle();
    }

    // ── Validate key length ─────────────────────────────────────────────────
    if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new BadRequestException('Idempotency key too long');
    }

    const userId = request.user?.Id;
    const cacheKey = ApiIdempotencyKeys.Result(userId, idempotencyKey);

    // ── Check for cached result ─────────────────────────────────────────────
    const cachedResult = await this.redisService.Get<unknown>(cacheKey);

    if (cachedResult !== undefined && cachedResult !== null) {
      return of(cachedResult);
    }

    // ── Proceed and cache the result ────────────────────────────────────────
    return next.handle().pipe(
      tap(async (result) => {
        await this.redisService.Set(cacheKey, result, API_IDEMPOTENCY_TTL);
      }),
    );
  }
}
