import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '@modules/redis/redis.service';
import { ENCRYPTED_FOLDER_METADATA } from '../cloud.constants';

/**
 * Guard that validates encrypted folder access via session token.
 *
 * The token is passed via X-Folder-Session header and validated against Redis.
 * When a folder is unlocked, a session token is created and stored in Redis
 * with a short TTL (e.g., 15 minutes). This token grants access to the folder
 * contents without needing to provide the passphrase on every request.
 */
@Injectable()
export class EncryptedFolderGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresEncryptedAccess = this.reflector.get<boolean>(
      ENCRYPTED_FOLDER_METADATA,
      context.getHandler(),
    );

    if (!requiresEncryptedAccess) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const sessionToken = request.headers['x-folder-session'];
    const folderPath = this.extractFolderPath(request);

    if (!sessionToken || !folderPath) {
      return true; // Let the service handle the check
    }

    const userId = request.user?.id;
    if (!userId) {
      return true;
    }

    const session = await this.validateSession(
      userId,
      folderPath,
      sessionToken,
    );
    if (session) {
      // Attach session info to request for service use
      request.encryptedFolderSession = session;
    }

    return true;
  }

  private extractFolderPath(request: unknown): string | null {
    const req = request as {
      query?: { Path?: string };
      body?: { Path?: string };
    };
    return req.query?.Path || req.body?.Path || null;
  }

  private async validateSession(
    userId: string,
    folderPath: string,
    sessionToken: string,
  ): Promise<EncryptedFolderSession | null> {
    const cacheKey = this.buildSessionKey(userId, folderPath);
    const session =
      await this.redisService.get<EncryptedFolderSession>(cacheKey);

    if (!session || session.token !== sessionToken) {
      return null;
    }

    return session;
  }

  private buildSessionKey(userId: string, folderPath: string): string {
    const normalizedPath = folderPath.replace(/^\/+|\/+$/g, '');
    return `encrypted-folder:session:${userId}:${normalizedPath}`;
  }
}

export interface EncryptedFolderSession {
  token: string;
  folderPath: string;
  folderKey: string; // Base64 encoded symmetric key
  expiresAt: number;
}
