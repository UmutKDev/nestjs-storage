import { HttpException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { jwtConstants } from './authentication.constants';
import {
  AuthenticationDecodeTokenBodyRequestModel,
  AuthenticationRefreshTokenRequestModel,
  AuthenticationSignInRequestModel,
  AuthenticationSignUpRequestModel,
  AuthenticationTokenResponseModel,
  AuthenticationTwoFactorGenerateResponseModel,
  AuthenticationTwoFactorLoginRequestModel,
  AuthenticationTwoFactorVerifyRequestModel,
  JWTPayloadModel,
  JWTTokenDecodeResponseModel,
} from './authentication.model';
import { MailService } from '../mail/mail.service';
import { passwordGenerator } from '@common/helpers/cast.helper';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '@entities/user.entity';
import { RefreshTokenEntity } from '@entities/refresh-token.entity';
import { Role, Status } from '@common/enums';
import { Request } from 'express';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class AuthenticationService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(RefreshTokenEntity)
    private refreshTokenRepository: Repository<RefreshTokenEntity>,
    private jwtService: JwtService,
    private mailService: MailService,
  ) {}

  private getTwoFactorIssuer(): string {
    return process.env.APP_NAME || 'Storage';
  }

  private ensureTwoFactorCodeIfRequired(
    user: Pick<UserEntity, 'isTwoFactorEnabled' | 'twoFactorSecret'>,
    token?: string,
  ): void {
    if (!user.isTwoFactorEnabled) {
      return;
    }

    if (!user.twoFactorSecret) {
      throw new HttpException(Codes.Error.TwoFactor.NOT_SETUP, 400);
    }

    if (!token) {
      throw new HttpException(Codes.Error.TwoFactor.REQUIRED, 403);
    }

    const isValid = authenticator.verify({
      token,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      throw new HttpException(Codes.Error.TwoFactor.INVALID, 403);
    }
  }

  private async getUserWithTwoFactorSecret(
    userId: string,
  ): Promise<UserEntity> {
    return this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.isTwoFactorEnabled',
        'user.role',
        'user.status',
      ])
      .addSelect('user.twoFactorSecret')
      .where('user.id = :userId', { userId })
      .getOneOrFail()
      .catch((error: Error) => {
        if (
          error.name === Codes.Error.Database.EntityMetadataNotFoundError ||
          error.name === Codes.Error.Database.EntityNotFoundError
        ) {
          throw new HttpException(Codes.Error.User.NOT_FOUND, 404);
        }

        throw error;
      });
  }

  private buildJwtPayload(
    user: Pick<
      UserEntity,
      | 'id'
      | 'fullName'
      | 'email'
      | 'role'
      | 'status'
      | 'lastLoginAt'
      | 'image'
      | 'isTwoFactorEnabled'
    >,
    loginDate?: Date | null,
  ): JWTPayloadModel {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLogin: loginDate ?? user.lastLoginAt,
      image: user.image,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
    };
  }

  private async createTwoFactorChallengeResponse(
    user: Pick<UserEntity, 'id' | 'email'>,
  ): Promise<AuthenticationTokenResponseModel> {
    const token = await this.jwtService.signAsync(
      { id: user.id, email: user.email },
      {
        secret: jwtConstants.twoFactorSecret,
        expiresIn: jwtConstants.twoFactorTokenExpiresIn,
        subject: user.id,
      },
    );

    return plainToInstance(AuthenticationTokenResponseModel, {
      twoFactorRequired: true,
      twoFactorToken: token,
      twoFactorTokenExpiresIn: jwtConstants.twoFactorTokenExpiresIn,
    });
  }

  async Login(
    { email, password, twoFactorCode }: AuthenticationSignInRequestModel,
    request?: Request,
  ): Promise<AuthenticationTokenResponseModel> {
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.role',
        'user.fullName',
        'user.email',
        'user.password',
        'user.status',
        'user.lastLoginAt',
        'user.image',
        'user.isTwoFactorEnabled',
      ])
      .addSelect('user.twoFactorSecret')
      .where('user.email = :email', { email });

    const user = await queryBuilder.getOneOrFail().catch((error: Error) => {
      if (
        error.name === Codes.Error.Database.EntityMetadataNotFoundError ||
        error.name === Codes.Error.Database.EntityNotFoundError
      )
        throw new HttpException(Codes.Error.User.NOT_FOUND, 400);

      throw error;
    });

    const comparePassword = await argon2.verify(user?.password, password);

    if (!comparePassword) {
      throw new HttpException(Codes.Error.User.NOT_FOUND, 400);
    }

    if (user.status === Status.SUSPENDED) {
      throw new HttpException(Codes.Error.User.SUSPENDED, 403);
    }

    if (user.isTwoFactorEnabled && !twoFactorCode) {
      return this.createTwoFactorChallengeResponse(user);
    }

    this.ensureTwoFactorCodeIfRequired(user, twoFactorCode);

    const loginDate = user.role !== Role.ADMIN ? null : new Date();

    if (loginDate) {
      await this.userRepository.update(
        { id: user.id },
        { lastLoginAt: loginDate },
      );
      user.lastLoginAt = loginDate;
    }

    if (user.status === Status.PENDING) {
      await this.userRepository.update(
        { id: user.id },
        { status: Status.ACTIVE },
      );
      user.status = Status.ACTIVE;
    }

    const payload = this.buildJwtPayload(user, loginDate);

    return this.generateTokens(payload, request);
  }

  async RefreshToken({
    refreshToken,
    request,
  }: {
    refreshToken: AuthenticationRefreshTokenRequestModel['refreshToken'];
    request?: Request;
  }): Promise<AuthenticationTokenResponseModel> {
    try {
      // Verify refresh token
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: jwtConstants.refreshSecret,
      });

      // Get all non-revoked tokens for this user and verify hash
      const storedTokens = await this.refreshTokenRepository.find({
        where: { userId: payload.id, isRevoked: false },
      });

      let storedRefreshToken = null;
      for (const token of storedTokens) {
        const isValid = await argon2.verify(token.token, refreshToken);
        if (isValid) {
          storedRefreshToken = token;
          break;
        }
      }

      if (!storedRefreshToken) {
        throw new HttpException('Invalid refresh token', 401);
      }

      // Check if refresh token is expired
      if (new Date() > storedRefreshToken.expiresAt) {
        await this.refreshTokenRepository.update(
          { id: storedRefreshToken.id },
          { isRevoked: true },
        );
        throw new HttpException('Refresh token expired', 401);
      }

      // Get user data
      const user = await this.userRepository.findOne({
        where: { id: payload.id },
      });

      if (!user || user.status === Status.SUSPENDED) {
        throw new HttpException('User not found or suspended', 401);
      }

      // Revoke old refresh token
      await this.refreshTokenRepository.update(
        { id: storedRefreshToken.id },
        { isRevoked: true },
      );

      // Generate new tokens
      const newPayload: JWTPayloadModel = {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
        lastLogin: user.lastLoginAt,
        image: user.image,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
      };

      return this.generateTokens(newPayload, request);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Invalid refresh token', 401);
    }
  }

  async Register(
    { email, password }: AuthenticationSignUpRequestModel,
    request?: Request,
  ): Promise<AuthenticationTokenResponseModel> {
    const queryRunner =
      this.userRepository.manager.connection.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const newUser = new UserEntity({
        email: email,
        password: password,
        status: Status.ACTIVE,
        role: Role.USER,
        isTwoFactorEnabled: false,
      });

      // await this.mailService.sendMail({
      //   to: newUser.email,
      //   subject: 'QR Menüye Hoşgeldin',
      //   text: `Şifren: ${password}`,
      //   html: WelcomeTemplate()
      //     .replace('{Username}', newUser.email)
      //     .replace('{Password}', password),
      // });

      await queryRunner.manager.save(newUser);

      const payload: JWTPayloadModel = {
        id: newUser.id,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
        lastLogin: newUser.lastLoginAt,
        image: newUser.image,
        isTwoFactorEnabled: newUser.isTwoFactorEnabled,
      };

      await queryRunner.commitTransaction();

      return this.generateTokens(payload, request);
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

  private async generateTokens(
    payload: JWTPayloadModel,
    request?: Request,
  ): Promise<AuthenticationTokenResponseModel> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: jwtConstants.secret,
        expiresIn: jwtConstants.accessTokenExpiresIn,
        subject: payload.id,
      }),
      this.jwtService.signAsync(payload, {
        secret: jwtConstants.refreshSecret,
        expiresIn: jwtConstants.refreshTokenExpiresIn,
        subject: payload.id,
      }),
    ]);

    // Store refresh token hash in database for security
    const hashedToken = await argon2.hash(refreshToken);

    const refreshTokenEntity = new RefreshTokenEntity({
      token: hashedToken,
      userId: payload.id,
      expiresAt: new Date(Date.now() + jwtConstants.refreshTokenExpiresIn),
      userAgent: request?.headers['user-agent'],
      ipAddress: request?.ip || request?.socket?.remoteAddress,
    });

    await this.refreshTokenRepository.save(refreshTokenEntity);

    const response: AuthenticationTokenResponseModel = {
      accessToken,
      refreshToken,
      expiresIn: jwtConstants.accessTokenExpiresIn,
      twoFactorRequired: false,
    };

    return plainToInstance(AuthenticationTokenResponseModel, response);
  }

  async VerifyTwoFactorLogin({
    token,
    code,
    request,
  }: {
    token: string;
    code: string;
    request?: Request;
  }): Promise<AuthenticationTokenResponseModel> {
    let challengePayload: JWTPayloadModel | null = null;

    try {
      challengePayload = (await this.jwtService.verifyAsync(token, {
        secret: jwtConstants.twoFactorSecret,
      })) as JWTPayloadModel;
    } catch {
      throw new HttpException(Codes.Error.TwoFactor.INVALID_CHALLENGE, 400);
    }

    const user = await this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.role',
        'user.fullName',
        'user.email',
        'user.status',
        'user.lastLoginAt',
        'user.image',
        'user.isTwoFactorEnabled',
      ])
      .addSelect('user.twoFactorSecret')
      .where('user.id = :id', {
        id: challengePayload.id,
      })
      .getOneOrFail()
      .catch((error: Error) => {
        if (
          error.name === Codes.Error.Database.EntityMetadataNotFoundError ||
          error.name === Codes.Error.Database.EntityNotFoundError
        )
          throw new HttpException(Codes.Error.User.NOT_FOUND, 400);

        throw error;
      });

    if (!user.isTwoFactorEnabled) {
      throw new HttpException(Codes.Error.TwoFactor.NOT_ENABLED, 400);
    }

    if (user.status === Status.SUSPENDED) {
      throw new HttpException(Codes.Error.User.SUSPENDED, 403);
    }

    this.ensureTwoFactorCodeIfRequired(user, code);

    const loginDate = user.role !== Role.ADMIN ? null : new Date();

    if (loginDate) {
      await this.userRepository.update(
        { id: user.id },
        { lastLoginAt: loginDate },
      );
      user.lastLoginAt = loginDate;
    }

    if (user.status === Status.PENDING) {
      await this.userRepository.update(
        { id: user.id },
        { status: Status.ACTIVE },
      );
      user.status = Status.ACTIVE;
    }

    const payload = this.buildJwtPayload(user, loginDate);

    return this.generateTokens(payload, request);
  }

  async RevokeRefreshToken(refreshToken: string): Promise<boolean> {
    // Get all non-revoked tokens and find matching hash
    const storedTokens = await this.refreshTokenRepository.find({
      where: { isRevoked: false },
    });

    for (const token of storedTokens) {
      try {
        const isValid = await argon2.verify(token.token, refreshToken);
        if (isValid) {
          await this.refreshTokenRepository.update(
            { id: token.id },
            { isRevoked: true },
          );
          return true;
        }
      } catch (error) {
        // Invalid hash format, skip
        continue;
      }
    }

    return false;
  }

  async RevokeAllUserTokens(userId: string): Promise<boolean> {
    await this.refreshTokenRepository.update(
      { userId, isRevoked: false },
      { isRevoked: true },
    );
    return true;
  }

  async CleanupExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenRepository
      .createQueryBuilder()
      .delete()
      .from(RefreshTokenEntity)
      .where('expires_at < :now', { now: new Date() })
      .execute();

    return result.affected || 0;
  }

  async DecodeToken({
    token,
  }: AuthenticationDecodeTokenBodyRequestModel): Promise<JWTTokenDecodeResponseModel> {
    try {
      return this.jwtService.verifyAsync(token, {
        secret: jwtConstants.secret,
      });
    } catch (error) {
      throw new HttpException(error, 400);
    }
  }

  async ResetPassword({ email }): Promise<boolean> {
    const user = await this.userRepository
      .findOneOrFail({
        where: { email },
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

    await this.userRepository.update(
      { id: user.id },
      { password: generatedPassword },
    );

    // Revoke all refresh tokens for this user
    await this.RevokeAllUserTokens(user.id);

    this.mailService.sendMail({
      to: user.email,
      subject: 'Reset Password',
      text: `Your new password: ${generatedPassword}`,
    });

    return true;
  }

  async validateUser({
    email,
    password,
  }: AuthenticationSignInRequestModel): Promise<UserEntity> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    const comparePassword = await argon2.verify(user?.password, password);

    if (!comparePassword) {
      throw new HttpException(Codes.Error.Password.WRONG, 400);
    }

    if (user.status === Status.INACTIVE) {
      throw new HttpException(Codes.Error.User.INACTIVE, 403);
    }

    if (user.status === Status.SUSPENDED) {
      throw new HttpException(Codes.Error.User.SUSPENDED, 403);
    }

    return user;
  }

  async GenerateTwoFactorSecret({
    user,
  }: {
    user: UserContext;
  }): Promise<AuthenticationTwoFactorGenerateResponseModel> {
    const existingUser = await this.getUserWithTwoFactorSecret(user.id);

    if (existingUser.isTwoFactorEnabled) {
      throw new HttpException(Codes.Error.TwoFactor.ALREADY_ENABLED, 400);
    }

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(
      existingUser.email,
      this.getTwoFactorIssuer(),
      secret,
    );

    await this.userRepository.update(existingUser.id, {
      twoFactorSecret: secret,
      isTwoFactorEnabled: false,
    });

    return plainToInstance(AuthenticationTwoFactorGenerateResponseModel, {
      secret,
      otpauthUrl,
    });
  }

  async EnableTwoFactor({
    user,
    body,
  }: {
    user: UserContext;
    body: AuthenticationTwoFactorVerifyRequestModel;
  }): Promise<boolean> {
    const existingUser = await this.getUserWithTwoFactorSecret(user.id);

    if (existingUser.isTwoFactorEnabled) {
      throw new HttpException(Codes.Error.TwoFactor.ALREADY_ENABLED, 400);
    }

    if (!existingUser.twoFactorSecret) {
      throw new HttpException(Codes.Error.TwoFactor.SECRET_NOT_FOUND, 400);
    }

    const isValid = authenticator.verify({
      token: body.code,
      secret: existingUser.twoFactorSecret,
    });

    if (!isValid) {
      throw new HttpException(Codes.Error.TwoFactor.INVALID, 400);
    }

    await this.userRepository.update(existingUser.id, {
      isTwoFactorEnabled: true,
    });

    await this.RevokeAllUserTokens(existingUser.id);

    return true;
  }

  async DisableTwoFactor({
    user,
    body,
  }: {
    user: UserContext;
    body: AuthenticationTwoFactorVerifyRequestModel;
  }): Promise<boolean> {
    const existingUser = await this.getUserWithTwoFactorSecret(user.id);

    if (!existingUser.isTwoFactorEnabled) {
      throw new HttpException(Codes.Error.TwoFactor.NOT_ENABLED, 400);
    }

    if (!existingUser.twoFactorSecret) {
      throw new HttpException(Codes.Error.TwoFactor.SECRET_NOT_FOUND, 400);
    }

    const isValid = authenticator.verify({
      token: body.code,
      secret: existingUser.twoFactorSecret,
    });

    if (!isValid) {
      throw new HttpException(Codes.Error.TwoFactor.INVALID, 400);
    }

    await this.userRepository.update(existingUser.id, {
      isTwoFactorEnabled: false,
      twoFactorSecret: null,
    });

    await this.RevokeAllUserTokens(existingUser.id);

    return true;
  }
}
