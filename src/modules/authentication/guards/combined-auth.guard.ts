import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SessionService } from '../session/session.service';
import { ApiKeyService } from '../api-key/api-key.service';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { API_KEY_HEADER, API_SECRET_HEADER, SCOPES_KEY } from './api-key.guard';
import { SESSION_HEADER } from './session.guard';
import {
  ApiKeyScope,
  AuthenticationType,
} from '@common/enums/authentication.enum';
import { SessionData } from '../session/session.interface';

@Injectable()
export class CombinedAuthGuard implements CanActivate {
  constructor(
    private readonly sessionService: SessionService,
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

    // Try API Key authentication first
    const publicKey = request.headers[API_KEY_HEADER];
    const secretKey = request.headers[API_SECRET_HEADER];

    if (publicKey && secretKey) {
      return this.authenticateWithApiKey(
        context,
        request,
        publicKey,
        secretKey,
      );
    }

    // Try Session authentication
    const sessionId = this.extractSessionId(request);

    if (sessionId) {
      return this.authenticateWithSession(request, sessionId);
    }

    throw new UnauthorizedException('Authentication required');
  }

  private async authenticateWithApiKey(
    context: ExecutionContext,
    request: Request & {
      apiKey?: unknown;
      user?: unknown;
      authenticationType?: AuthenticationType;
    },
    publicKey: string,
    secretKey: string,
  ): Promise<boolean> {
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

    request.apiKey = ApiKey;
    request.user = { id: UserId };
    request.authenticationType = AuthenticationType.API_KEY;

    return true;
  }

  private async authenticateWithSession(
    request: Request & {
      session?: SessionData;
      user?: UserContext;
      sessionId?: string;
      authenticationType?: AuthenticationType;
    },
    sessionId: string,
  ): Promise<boolean> {
    const session = await this.sessionService.getSession(sessionId);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    if (session.TwoFactorPending) {
      throw new UnauthorizedException('Two-factor authentication required');
    }

    await this.sessionService.updateSessionActivity(sessionId);

    request.session = session;
    request.user = this.sessionToUser(session);
    request.sessionId = sessionId;
    request.authenticationType = AuthenticationType.SESSION;

    return true;
  }

  private extractSessionId(request: Request): string | null {
    const headerSession = request.headers[SESSION_HEADER] as string;
    if (headerSession) {
      return headerSession;
    }

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    const cookieSession = (
      request as Request & { cookies?: Record<string, string> }
    ).cookies?.session_id;
    if (cookieSession) {
      return cookieSession;
    }

    return null;
  }

  private sessionToUser(session: SessionData): UserContext {
    return {
      Id: session.UserId,
      Email: session.Email,
      FullName: session.FullName,
      Role: session.Role,
      Status: session.Status,
      Image: session.Image,
    };
  }
}
