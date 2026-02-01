import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from '../api-key/api-key.service';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { ApiKeyScope } from '@common/enums/authentication.enum';

export const API_KEY_HEADER = 'x-api-key';
export const API_SECRET_HEADER = 'x-api-secret';
export const SCOPES_KEY = 'scopes';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const publicKey = request.headers[API_KEY_HEADER];
    const secretKey = request.headers[API_SECRET_HEADER];

    if (!publicKey || !secretKey) {
      throw new UnauthorizedException('API key and secret required');
    }

    const ipAddress = request.ip || request.socket?.remoteAddress;

    const { ApiKey, UserId } = await this.apiKeyService.validateSimpleApiKey(
      publicKey,
      secretKey,
      ipAddress,
    );

    // Check required scopes
    const requiredScopes = this.reflector.getAllAndOverride<ApiKeyScope[]>(
      SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredScopes && requiredScopes.length > 0) {
      const hasAllScopes = requiredScopes.every((scope) =>
        this.apiKeyService.hasScope(ApiKey, scope),
      );

      if (!hasAllScopes) {
        throw new UnauthorizedException('Insufficient API key scopes');
      }
    }

    // Attach API key info to request
    request.apiKey = ApiKey;
    request.user = { id: UserId };
    request.authenticationType = 'API_KEY';

    return true;
  }
}
