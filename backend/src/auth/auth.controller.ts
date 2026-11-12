import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, JwtPayload } from './auth.dto';
import { AuthGuard } from './auth.guard';

/** Always Secure in production; staging/other HTTPS environments opt in with COOKIE_SECURE=true. */
export const cookieSecure = (env: NodeJS.ProcessEnv = process.env) => env.NODE_ENV === 'production' || env.COOKIE_SECURE === 'true';

// Default 'lax': frontend and backend are the same registrable domain (recommended; no cross-site risk).
// COOKIE_SAMESITE=none: only for a deployment where the frontend is served from a different domain than the
// backend (e.g. Azure Static Web Apps + a separate App Service). Browsers reject SameSite=None without Secure,
// so this silently stays 'lax' unless cookieSecure() is also true (HTTPS). CSRF is still enforced independently
// by the x-spa-request header + Origin allow-list check in setup.ts, which does not rely on SameSite.
export const cookieSameSite = (env: NodeJS.ProcessEnv = process.env): 'lax' | 'none' =>
  env.COOKIE_SAMESITE === 'none' && cookieSecure(env) ? 'none' : 'lax';

// CHIPS (Partitioned): only meaningful alongside SameSite=None, and only improves Firefox/Chrome
// partitioned-storage compatibility — no downside, so it is tied to the same condition, not a separate flag.
export const cookiePartitioned = (env: NodeJS.ProcessEnv = process.env): boolean => cookieSameSite(env) === 'none';

interface RequestWithUser extends Request {
  user?: JwtPayload;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập hệ thống (UC_1)' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công, thiết lập HttpOnly cookie.' })
  @ApiResponse({ status: 401, description: 'Số điện thoại hoặc mật khẩu không đúng.' })
  @ApiResponse({ status: 403, description: 'Tài khoản bị khóa hoặc tạm khóa 15 phút.' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token } = await this.authService.login(dto);

    // Thiết lập cookie HttpOnly an toàn
    response.cookie('access_token', token, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: cookieSameSite(),
      partitioned: cookiePartitioned(),
      path: '/',
      maxAge: 7 * 24 * 3600 * 1000, // 7 ngày
    });

    return {
      success: true,
      user,
    };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Lấy thông tin người dùng hiện tại' })
  @ApiResponse({ status: 200, description: 'Thông tin tài khoản và quyền truy cập.' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập hoặc phiên hết hạn.' })
  async getMe(@Req() request: RequestWithUser) {
    // AuthGuard has already loaded current profile and permissions from SQL.
    const {sub, ...profile} = request.user!;
    const user = {...profile,id:sub};
    return {
      success: true,
      user,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất khỏi hệ thống' })
  @ApiResponse({ status: 200, description: 'Xóa cookie phiên đăng nhập.' })
  async logout(@Res({ passthrough: true }) response: Response, @Req() request: Request) {
    if(process.env.AUTH_SESSION_STORE==='sql')await this.authService.revokeToken(request.cookies?.access_token ?? request.headers.authorization?.replace(/^Bearer /,''));
    response.clearCookie('access_token', {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: cookieSameSite(),
      partitioned: cookiePartitioned(),
      path: '/',
    });

    return {
      success: true,
      message: 'Đăng xuất thành công',
    };
  }
}
