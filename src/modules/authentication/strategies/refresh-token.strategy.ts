import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtConstants } from '../authentication.constants';
import { JWTPayloadModel } from '../authentication.model';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshTokenEntity } from '@entities/refresh-token.entity';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private refreshTokenRepository: Repository<RefreshTokenEntity>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.refreshSecret,
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: JWTPayloadModel): Promise<JWTPayloadModel> {
    const refreshToken = req.body.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    // Check if refresh token exists and is not revoked
    const storedRefreshToken = await this.refreshTokenRepository.findOne({
      where: { token: refreshToken, isRevoked: false },
    });

    if (!storedRefreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if refresh token is expired
    if (new Date() > storedRefreshToken.expiresAt) {
      throw new UnauthorizedException('Refresh token expired');
    }

    return {
      id: payload.id,
      fullName: payload.fullName,
      email: payload.email,
      role: payload.role,
      status: payload.status,
      lastLogin: payload.lastLogin,
    };
  }
}
