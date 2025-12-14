import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { jwtConstants } from '../authentication.constants';
import { JWTPayloadModel } from '../authentication.model';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConstants.secret,
      // issuer: 'http://localhost:8080',
      // audience: 'Storage',
    });
  }

  async validate(payload: JWTPayloadModel): Promise<JWTPayloadModel> {
    return {
      id: payload.id,
      fullName: payload.fullName,
      email: payload.email,
      role: payload.role,
      status: payload.status,
      lastLogin: payload.lastLogin,
      image: payload.image,
      isTwoFactorEnabled: payload.isTwoFactorEnabled,
    };
  }
}
