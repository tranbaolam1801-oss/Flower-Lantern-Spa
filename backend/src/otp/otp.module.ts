import { Module } from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { OtpController } from './otp.controller';
import { OtpService } from './otp.service';

/** DatabaseService (DatabaseModule) and OTP_SENDER (MessagingModule) are @Global; PasswordService is stateless and provided locally. */
@Module({
  controllers: [OtpController],
  providers: [OtpService, PasswordService],
  exports: [OtpService],
})
export class OtpModule {}
