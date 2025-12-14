import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { Status } from '@common/enums';
import { UserEntity } from '@entities/user.entity';

import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class JwtAuthenticationGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    @InjectDataSource() private dataSource: DataSource,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    // 2. Run the default AuthGuard logic (JWT validation)
    const canActivateResult = await super.canActivate(context);
    if (!canActivateResult) {
      return false;
    }

    const request = context.switchToHttp().getRequest();

    if (request.route.path.includes('Authentication')) return true;

    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    const foundUser = await this.dataSource.getRepository(UserEntity).findOne({
      where: { id: user.id, status: Status.ACTIVE },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        status: true,
        lastLoginAt: true,
        image: true,
        isTwoFactorEnabled: true,
      },
    });

    if (!foundUser) {
      throw new UnauthorizedException();
    }

    request.user = {
      id: foundUser.id,
      fullName: foundUser.fullName,
      email: foundUser.email,
      role: foundUser.role,
      status: foundUser.status,
      lastLogin: foundUser.lastLoginAt,
      image: foundUser.image,
      isTwoFactorEnabled: foundUser.isTwoFactorEnabled,
    } as UserContext;

    return true;
  }

  handleRequest(err: never, user: never) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
