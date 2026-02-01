import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SessionService } from '../session/session.service';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { SessionData } from '../session/session.interface';

export const SESSION_HEADER = 'x-session-id';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessionService: SessionService,
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
    const sessionId = this.extractSessionId(request);

    if (!sessionId) {
      throw new UnauthorizedException('Session ID required');
    }

    const session = await this.sessionService.getSession(sessionId);

    if (!session) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Check if 2FA is pending
    if (session.TwoFactorPending) {
      throw new UnauthorizedException('Two-factor authentication required');
    }

    // Update activity
    await this.sessionService.updateSessionActivity(sessionId);

    // Attach session and user info to request
    request.session = session;
    request.user = this.sessionToUser(session);
    request.sessionId = sessionId;

    return true;
  }

  private extractSessionId(request: Request): string | null {
    // Check header first
    const headerSession = request.headers[SESSION_HEADER] as string;
    if (headerSession) {
      return headerSession;
    }

    // Check Authorization header (Bearer token format)
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check cookie
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
