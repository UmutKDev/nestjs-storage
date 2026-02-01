import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionService } from '../session/session.service';
import { SESSION_HEADER } from './session.guard';

export const REQUIRE_2FA_KEY = 'require2fa';

@Injectable()
export class TwoFactorGuard implements CanActivate {
  constructor(
    private readonly sessionService: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if 2FA is required for this route
    const require2FA = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_2FA_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If 2FA not required, allow access
    if (!require2FA) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    
    // If using API key, 2FA check doesn't apply
    if (request.authenticationType === 'API_KEY') {
      return true;
    }

    const sessionId =
      request.sessionId ||
      request.headers[SESSION_HEADER] ||
      request.headers.authorization?.substring(7);

    if (!sessionId) {
      throw new UnauthorizedException('Session required for 2FA verification');
    }

    const session = await this.sessionService.getSession(sessionId);

    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    if (!session.IsTwoFactorVerified) {
      throw new UnauthorizedException('Two-factor authentication required');
    }

    return true;
  }
}
