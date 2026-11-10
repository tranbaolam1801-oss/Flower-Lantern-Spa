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
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
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
    const user = await this.authService.getMe(request.user!.sub);
    return {
      success: true,
      user,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất khỏi hệ thống' })
  @ApiResponse({ status: 200, description: 'Xóa cookie phiên đăng nhập.' })
  async logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('access_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return {
      success: true,
      message: 'Đăng xuất thành công',
    };
  }
}
