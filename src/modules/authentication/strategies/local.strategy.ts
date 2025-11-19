import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthenticationService } from '../authentication.service';
import { UserEntity } from '@entities/user.entity';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authenticationService: AuthenticationService) {
    super();
  }

  async validate(email: string, password: string): Promise<UserEntity> {
    const user = await this.authenticationService.validateUser({
      email,
      password,
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
