import { CanActivate, ExecutionContext, Injectable, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, PERMISSIONS_KEY } from './roles.decorator';
import { JwtPayload } from './auth.dto';

interface RequestWithUser {
  user?: JwtPayload;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles && !requiredPermissions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user) {
      throw new ForbiddenException('Không có quyền truy cập.');
    }

    // Chủ Spa luôn có toàn quyền
    if (user.role === 'Chủ Spa') {
      return true;
    }

    // Kiểm tra Vai trò (Roles)
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.includes(user.role);
      if (!hasRole) {
        throw new ForbiddenException('Vai trò của bạn không có quyền thực hiện thao tác này.');
      }
    }

    // Kiểm tra Quyền chi tiết (Permissions)
    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions = user.permissions || [];
      const hasPermission = requiredPermissions.every((perm) => userPermissions.includes(perm));
      if (!hasPermission) {
        throw new ForbiddenException('Bạn không có quyền hạn để thực hiện thao tác này.');
      }
    }

    return true;
  }
}
