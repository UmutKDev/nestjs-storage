import { Injectable } from '@nestjs/common';
import { RedisService } from '@modules/redis/redis.service';
import { SessionKeys } from '@modules/redis/redis.keys';
import { SessionData, DeviceInfo, SessionListItem } from './session.interface';
import { randomBytes } from 'crypto';
import { UserEntity } from '@entities/user.entity';
import { Role, Status } from '@common/enums';

@Injectable()
export class SessionService {
  private readonly SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

  constructor(private readonly redisService: RedisService) {}

  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  parseUserAgent(userAgent: string): DeviceInfo {
    let browser = 'Unknown';
    let os = 'Unknown';
    let device = 'Unknown';

    // Browser detection
    if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Edg')) browser = 'Edge';
    else if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Safari')) browser = 'Safari';
    else if (userAgent.includes('Opera') || userAgent.includes('OPR'))
      browser = 'Opera';

    // OS detection
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Mac OS')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS') || userAgent.includes('iPhone'))
      os = 'iOS';

    // Device type detection
    if (userAgent.includes('Mobile') || userAgent.includes('Android'))
      device = 'Mobile';
    else if (userAgent.includes('Tablet') || userAgent.includes('iPad'))
      device = 'Tablet';
    else device = 'Desktop';

    return {
      UserAgent: userAgent,
      Browser: browser,
      Os: os,
      Device: device,
    };
  }

  async createSession(
    user: UserEntity,
    ipAddress: string,
    userAgent: string,
    requiresTwoFactor: boolean = false,
  ): Promise<{ SessionId: string; Session: SessionData }> {
    const sessionId = this.generateSessionId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.SESSION_TTL * 1000);

    const session: SessionData = {
      Id: sessionId,
      UserId: user.Id,
      Email: user.Email,
      FullName: user.FullName,
      Role: user.Role as Role,
      Status: user.Status as Status,
      Image: user.Image,
      DeviceInfo: this.parseUserAgent(userAgent),
      IpAddress: ipAddress,
      CreatedAt: now,
      ExpiresAt: expiresAt,
      LastActivityAt: now,
      IsTwoFactorVerified: !requiresTwoFactor,
      TwoFactorPending: requiresTwoFactor,
    };

    // Store session by session ID
    await this.redisService.Set(
      SessionKeys.Session(sessionId),
      session,
      this.SESSION_TTL,
    );

    // Store reference for user's sessions
    await this.redisService.Set(
      SessionKeys.UserSession(user.Id, sessionId),
      sessionId,
      this.SESSION_TTL,
    );

    return { SessionId: sessionId, Session: session };
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    const session = await this.redisService.Get<SessionData>(
      SessionKeys.Session(sessionId),
    );

    if (!session) return null;

    // Check if expired
    if (new Date() > new Date(session.ExpiresAt)) {
      await this.revokeSession(sessionId);
      return null;
    }

    return session;
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;

    session.LastActivityAt = new Date();

    await this.redisService.Set(
      SessionKeys.Session(sessionId),
      session,
      this.SESSION_TTL,
    );
  }

  async completeTwoFactorVerification(sessionId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) return false;

    session.IsTwoFactorVerified = true;
    session.TwoFactorPending = false;

    await this.redisService.Set(
      SessionKeys.Session(sessionId),
      session,
      this.SESSION_TTL,
    );

    return true;
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      await this.redisService.Delete(
        SessionKeys.UserSession(session.UserId, sessionId),
      );
    }
    await this.redisService.Delete(SessionKeys.Session(sessionId));
  }

  async revokeAllUserSessions(userId: string): Promise<number> {
    const pattern = SessionKeys.UserSessionsPattern(userId);
    const keys = await this.redisService.FindKeys(pattern);

    let count = 0;
    for (const key of keys) {
      const sessionId = await this.redisService.Get<string>(key);
      if (sessionId) {
        await this.redisService.Delete(SessionKeys.Session(sessionId));
        await this.redisService.Delete(key);
        count++;
      }
    }

    return count;
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<number> {
    const pattern = SessionKeys.UserSessionsPattern(userId);
    const keys = await this.redisService.FindKeys(pattern);

    let count = 0;
    for (const key of keys) {
      const sessionId = await this.redisService.Get<string>(key);
      if (sessionId && sessionId !== currentSessionId) {
        await this.redisService.Delete(SessionKeys.Session(sessionId));
        await this.redisService.Delete(key);
        count++;
      }
    }

    return count;
  }

  async getUserSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<SessionListItem[]> {
    const pattern = SessionKeys.UserSessionsPattern(userId);
    const keys = await this.redisService.FindKeys(pattern);

    const sessions: SessionListItem[] = [];

    for (const key of keys) {
      const sessionId = await this.redisService.Get<string>(key);
      if (sessionId) {
        const session = await this.getSession(sessionId);
        if (session) {
          sessions.push({
            Id: session.Id,
            DeviceInfo: session.DeviceInfo,
            IpAddress: session.IpAddress,
            CreatedAt: session.CreatedAt,
            LastActivityAt: session.LastActivityAt,
            IsCurrent: sessionId === currentSessionId,
          });
        }
      }
    }

    return sessions.sort(
      (a, b) =>
        new Date(b.LastActivityAt).getTime() -
        new Date(a.LastActivityAt).getTime(),
    );
  }

  async refreshSession(
    sessionId: string,
    user: UserEntity,
  ): Promise<SessionData | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    // Update user data in session
    session.Email = user.Email;
    session.FullName = user.FullName;
    session.Role = user.Role as Role;
    session.Status = user.Status as Status;
    session.Image = user.Image;
    session.LastActivityAt = new Date();

    await this.redisService.Set(
      SessionKeys.Session(sessionId),
      session,
      this.SESSION_TTL,
    );

    return session;
  }
}
