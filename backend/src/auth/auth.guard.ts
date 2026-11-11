import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtTokenService } from './jwt-token.service';
import { JwtPayload } from './auth.dto';

interface RequestWithUser extends Request {
  user?: JwtPayload;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(JwtTokenService) private readonly jwtService: JwtTokenService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Chưa đăng nhập hoặc phiên đã hết hạn.');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('Invalid subject');
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }
    // Permissions and role always come from SQL, never from stale token claims.
    if(process.env.AUTH_SESSION_STORE==='sql')await this.authService.validateSession(payload);
    // SQL outages remain 503 rather than incorrectly reporting an expired session.
    const user = await this.authService.getMe(payload.sub);
    request.user = { ...user, sub: user.id };
    return true;
  }

  private extractToken(request: Request): string | undefined {
    // 1. Ưu tiên đọc từ HttpOnly Cookie
    if (request.cookies && request.cookies.access_token) {
      return request.cookies.access_token as string;
    }

    // 2. Dự phòng đọc từ Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return undefined;
  }
}
