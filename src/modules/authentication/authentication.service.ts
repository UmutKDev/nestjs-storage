import { HttpException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { jwtConstants } from './authentication.constants';
import {
  AuthenticationDecodeTokenBodyRequestModel,
  AuthenticationRefreshTokenRequestModel,
  AuthenticationSignInRequestModel,
  AuthenticationSignUpRequestModel,
  AuthenticationTokenResponseModel,
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

  async Login(
    { email, password }: AuthenticationSignInRequestModel,
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
      ])
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

    const loginDate = user.role !== Role.ADMIN ? null : new Date();

    if (loginDate) {
      await this.userRepository.update(
        { id: user.id },
        { lastLoginAt: loginDate },
      );
    }

    const payload: JWTPayloadModel = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLogin: loginDate,
      image: user.image,
    };

    if (user.status === Status.PENDING) {
      await this.userRepository.update(
        { id: user.id },
        { status: Status.ACTIVE },
      );
    }

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
    };

    return plainToInstance(AuthenticationTokenResponseModel, response);
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
}
