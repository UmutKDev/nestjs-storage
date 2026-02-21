import { HttpException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import {
  LoginRequestModel,
  LoginCheckRequestModel,
  LoginCheckResponseModel,
  RegisterRequestModel,
  ResetPasswordRequestModel,
  AuthenticationResponseModel,
} from './authentication.model';
import { SessionViewModel } from '../account/security/security.model';
import { MailService } from '../mail/mail.service';
import { passwordGenerator } from '@common/helpers/cast.helper';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '@entities/user.entity';
import { Role, Status } from '@common/enums';
import { Request } from 'express';
import { plainToInstance } from 'class-transformer';
import { SessionService } from './session/session.service';
import { TwoFactorService } from './two-factor/two-factor.service';
import { PasskeyService } from './passkey/passkey.service';
import { RedisService } from '../redis/redis.service';
import {
  TWO_FACTOR_MAX_ATTEMPTS,
  TWO_FACTOR_LOCKOUT_TTL,
} from '@modules/redis/redis.ttl';

@Injectable()
export class AuthenticationService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly sessionService: SessionService,
    private readonly twoFactorService: TwoFactorService,
    private readonly passkeyService: PasskeyService,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Step 1: Check email and return authentication requirements
   * Returns what authentication methods are available for this user
   */
  async LoginCheck({
    Email,
  }: LoginCheckRequestModel): Promise<LoginCheckResponseModel> {
    const user = await this.userRepository.findOne({
      where: { Email: Email },
    });

    if (!user) {
      // Return same structure as existing user to prevent email enumeration
      return plainToInstance(LoginCheckResponseModel, {
        HasPasskey: false,
        HasTwoFactor: false,
        TwoFactorMethod: null,
        AvailableMethods: ['password'],
        PasskeyOptions: null,
      });
    }

    if (user.Status === Status.SUSPENDED) {
      throw new HttpException(Codes.Error.User.SUSPENDED, 403);
    }

    const hasPasskey = await this.passkeyService.hasPasskey(user.Id);
    const hasTwoFactor = await this.twoFactorService.isTwoFactorEnabled(
      user.Id,
    );

    // Create a minimal UserContext for getStatus
    const userContext: UserContext = {
      Id: user.Id,
      Email: user.Email,
      FullName: user.FullName,
      Role: user.Role as Role,
      Status: user.Status as Status,
      Image: user.Image,
    };

    const twoFactorStatus = hasTwoFactor
      ? await this.twoFactorService.getStatus(userContext, hasPasskey)
      : null;

    const availableMethods: ('password' | 'passkey')[] = ['password'];
    let passkeyOptions = null;

    if (hasPasskey) {
      availableMethods.push('passkey');
      // Pre-generate passkey options for convenience
      try {
        const passkeyBegin = await this.passkeyService.beginLogin({ Email });
        passkeyOptions = passkeyBegin.Options;
      } catch {
        // If passkey options fail, just don't include them
      }
    }

    return plainToInstance(LoginCheckResponseModel, {
      HasPasskey: hasPasskey,
      HasTwoFactor: hasTwoFactor,
      TwoFactorMethod: twoFactorStatus?.Method || null,
      AvailableMethods: availableMethods,
      PasskeyOptions: passkeyOptions,
    });
  }

  async Login(
    { Email, Password }: LoginRequestModel,
    request?: Request,
  ): Promise<AuthenticationResponseModel> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.Id',
        'user.Role',
        'user.FullName',
        'user.Email',
        'user.Password',
        'user.Status',
        'user.LastLoginAt',
        'user.Image',
      ])
      .where('user.Email = :email', { email: Email })
      .getOneOrFail()
      .catch((error: Error) => {
        if (
          error.name === Codes.Error.Database.EntityMetadataNotFoundError ||
          error.name === Codes.Error.Database.EntityNotFoundError
        )
          throw new HttpException(Codes.Error.User.NOT_FOUND, 400);

        throw error;
      });

    const comparePassword = await argon2.verify(user?.Password, Password);

    if (!comparePassword) {
      throw new HttpException(Codes.Error.User.NOT_FOUND, 400);
    }

    if (user.Status === Status.SUSPENDED) {
      throw new HttpException(Codes.Error.User.SUSPENDED, 403);
    }

    if (user.Status === Status.PENDING) {
      user.Status = Status.ACTIVE;
    }

    const now = new Date();

    await this.userRepository.update(
      { Id: user.Id },
      { LastLoginAt: now, Status: user.Status },
    );

    user.LastLoginAt = now;

    const requires2FA = await this.twoFactorService.isTwoFactorEnabled(user.Id);

    const ipAddress = request?.ip || request?.socket?.remoteAddress || '';
    const userAgent = request?.headers['user-agent'] || '';

    const { SessionId, Session } = await this.sessionService.createSession(
      user,
      ipAddress,
      userAgent,
      requires2FA,
    );

    return plainToInstance(AuthenticationResponseModel, {
      SessionId: SessionId,
      ExpiresAt: Session.ExpiresAt,
      RequiresTwoFactor: requires2FA,
    });
  }

  async Register(
    { Email, Password }: RegisterRequestModel,
    request?: Request,
  ): Promise<AuthenticationResponseModel> {
    const queryRunner =
      this.userRepository.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const newUser = new UserEntity({
        Email: Email,
        Password: Password,
        Status: Status.ACTIVE,
        Role: Role.USER,
      });

      await queryRunner.manager.save(newUser);
      await queryRunner.commitTransaction();

      const ipAddress = request?.ip || request?.socket?.remoteAddress || '';
      const userAgent = request?.headers['user-agent'] || '';

      const { SessionId, Session } = await this.sessionService.createSession(
        newUser,
        ipAddress,
        userAgent,
        false,
      );

      return plainToInstance(AuthenticationResponseModel, {
        SessionId: SessionId,
        ExpiresAt: Session.ExpiresAt,
        RequiresTwoFactor: false,
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error.code === Codes.Error.Database.EntityConflictError) {
        throw new HttpException(Codes.Error.Email.ALREADY_EXISTS, 400);
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async Logout(sessionId: string): Promise<boolean> {
    await this.sessionService.revokeSession(sessionId);
    return true;
  }

  async LogoutAll(User: UserContext): Promise<number> {
    return this.sessionService.revokeAllUserSessions(User.Id);
  }

  async LogoutOthers(
    User: UserContext,
    currentSessionId: string,
  ): Promise<number> {
    return this.sessionService.revokeOtherSessions(User.Id, currentSessionId);
  }

  async GetSessions(
    User: UserContext,
    currentSessionId?: string,
  ): Promise<SessionViewModel[]> {
    const sessions = await this.sessionService.getUserSessions(
      User.Id,
      currentSessionId,
    );

    return sessions.map((session) =>
      plainToInstance(SessionViewModel, session),
    );
  }

  async RevokeSession(User: UserContext, sessionId: string): Promise<boolean> {
    const session = await this.sessionService.getSession(sessionId);

    if (!session || session.UserId !== User.Id) {
      throw new HttpException('Session not found', 404);
    }

    await this.sessionService.revokeSession(sessionId);
    return true;
  }

  async ResetPassword({ Email }: ResetPasswordRequestModel): Promise<boolean> {
    const user = await this.userRepository
      .findOneOrFail({
        where: { Email: Email },
      })
      .catch((error: Error) => {
        if (
          error.name === Codes.Error.Database.EntityMetadataNotFoundError ||
          error.name === Codes.Error.Database.EntityNotFoundError
        )
          throw new HttpException(Codes.Error.User.NOT_FOUND, 400);

        throw error;
      });

    const generatedPassword = passwordGenerator(12);
    const hashedPassword = await argon2.hash(generatedPassword);

    await this.userRepository.update(
      { Id: user.Id },
      { Password: hashedPassword },
    );

    await this.sessionService.revokeAllUserSessions(user.Id);

    this.mailService.sendMail({
      to: user.Email,
      subject: 'Reset Password',
      text: `Your new password: ${generatedPassword}`,
    });

    return true;
  }

  async ValidateUser({
    Email,
    Password,
  }: LoginRequestModel): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { Email: Email },
    });

    if (!user) {
      throw new HttpException(Codes.Error.User.NOT_FOUND, 400);
    }

    const comparePassword = await argon2.verify(user?.Password, Password);

    if (!comparePassword) {
      throw new HttpException(Codes.Error.Password.WRONG, 400);
    }

    if (user.Status === Status.INACTIVE) {
      throw new HttpException(Codes.Error.User.INACTIVE, 403);
    }

    if (user.Status === Status.SUSPENDED) {
      throw new HttpException(Codes.Error.User.SUSPENDED, 403);
    }

    return user;
  }

  async Verify2FA(
    sessionId: string,
    code: string,
  ): Promise<AuthenticationResponseModel> {
    const session = await this.sessionService.getSession(sessionId);

    if (!session) {
      throw new HttpException('Invalid session', 401);
    }

    if (!session.TwoFactorPending) {
      throw new HttpException('Two-factor verification not required', 400);
    }

    // Brute force protection
    const attemptKey = `2fa:attempts:${sessionId}`;
    const attempts = (await this.redisService.Get<number>(attemptKey)) || 0;

    if (attempts >= TWO_FACTOR_MAX_ATTEMPTS) {
      await this.sessionService.revokeSession(sessionId);
      throw new HttpException(
        'Too many failed attempts. Session revoked. Please login again.',
        429,
      );
    }

    const isValid = await this.twoFactorService.verifyCode(
      session.UserId,
      code,
    );

    if (!isValid) {
      await this.redisService.Set(
        attemptKey,
        attempts + 1,
        TWO_FACTOR_LOCKOUT_TTL,
      );
      throw new HttpException('Invalid verification code', 400);
    }

    await this.redisService.Delete(attemptKey);
    await this.sessionService.completeTwoFactorVerification(sessionId);

    return plainToInstance(AuthenticationResponseModel, {
      SessionId: sessionId,
      ExpiresAt: session.ExpiresAt,
      RequiresTwoFactor: false,
    });
  }
}
