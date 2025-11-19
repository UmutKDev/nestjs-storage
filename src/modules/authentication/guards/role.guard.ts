import { ROLES_KEY } from '@common/decorators/roles.decorator';
import { Role, Status } from '@common/enums';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const request = context.switchToHttp().getRequest();

    if (request.route.path.includes('Authentication')) return true;

    const user = request.user;

    if (!user) throw new UnauthorizedException();

    if (user.status === Status.SUSPENDED || user.status === Status.INACTIVE)
      throw new UnauthorizedException();

    return requiredRoles.some((role) => user.role?.includes(role));
  }
}
