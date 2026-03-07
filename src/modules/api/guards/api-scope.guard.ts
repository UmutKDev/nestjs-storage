import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from '@modules/authentication/api-key/api-key.service';
import { ApiKeyScope } from '@common/enums/authentication.enum';
import { API_SCOPES_KEY } from '../decorators/api-scopes.decorator';

@Injectable()
export class ApiScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // ── Read required scopes from metadata ──────────────────────────────────
    const requiredScopes = this.reflector.getAllAndOverride<ApiKeyScope[]>(
      API_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    // ── Get API key from request ────────────────────────────────────────────
    const request = context.switchToHttp().getRequest();
    const apiKey = request.apiKey;

    // ── Check each required scope ───────────────────────────────────────────
    const missingScopes = requiredScopes.filter(
      (scope) => !this.apiKeyService.hasScope(apiKey, scope),
    );

    if (missingScopes.length > 0) {
      throw new ForbiddenException('Insufficient API key scopes');
    }

    return true;
  }
}
