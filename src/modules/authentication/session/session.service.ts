import { Injectable } from '@nestjs/common';
import { RedisService } from '@modules/redis/redis.service';
import { SessionKeys } from '@modules/redis/redis.keys';
import {
  SESSION_TTL,
  SESSION_ACTIVITY_THROTTLE,
} from '@modules/redis/redis.ttl';
import { SessionData, DeviceInfo, SessionListItem } from './session.interface';
import { randomBytes } from 'crypto';
import { UserEntity } from '@entities/user.entity';
import { Role, Status } from '@common/enums';

@Injectable()
export class SessionService {
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
    const expiresAt = new Date(now.getTime() + SESSION_TTL * 1000);

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
      SESSION_TTL,
    );

    // Store reference for user's sessions
    await this.redisService.Set(
      SessionKeys.UserSession(user.Id, sessionId),
      sessionId,
      SESSION_TTL,
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

    // Throttle: skip write if last activity is within the threshold
    const lastActivity = new Date(session.LastActivityAt).getTime();
    const now = Date.now();
    if (now - lastActivity < SESSION_ACTIVITY_THROTTLE * 1000) {
      return;
    }

    session.LastActivityAt = new Date();

    await this.redisService.Set(
      SessionKeys.Session(sessionId),
      session,
      SESSION_TTL,
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
      SESSION_TTL,
    );

    return true;
  }

  async revokeSession(sessionId: string): Promise<void> {
    // Read session directly from Redis without going through getSession
    // to avoid infinite recursion (getSession → expired → revokeSession → getSession → ...)
    const session = await this.redisService.Get<SessionData>(
      SessionKeys.Session(sessionId),
    );
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
      SESSION_TTL,
    );

    return session;
  }
}
