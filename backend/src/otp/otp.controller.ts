import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OtpService } from './otp.service';

/**
 * Bodies are typed as plain objects on purpose: the global ValidationPipe skips them and OtpService validates field by field,
 * so every failure uses the exact generic Vietnamese message of the contract (no class-validator detail leaks).
 */
@ApiTags('auth')
@Controller('auth')
export class OtpController {
  constructor(@Inject(OtpService) private readonly otp: OtpService) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Yêu cầu mã OTP (đăng ký / quên mật khẩu)' })
  @ApiResponse({ status: 202, description: 'Phản hồi giống nhau cho mọi số điện thoại hợp lệ.' })
  request(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.otp.request(body ?? {}, req.ip);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác thực mã OTP, trả về mã hoàn tất dùng một lần' })
  verify(@Body() body: Record<string, unknown>) {
    return this.otp.verify(body ?? {});
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Đăng ký tài khoản khách hàng sau khi xác thực số điện thoại' })
  register(@Body() body: Record<string, unknown>) {
    return this.otp.register(body ?? {});
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại mật khẩu khách hàng sau khi xác thực số điện thoại' })
  resetPassword(@Body() body: Record<string, unknown>) {
    return this.otp.resetPassword(body ?? {});
  }
}
