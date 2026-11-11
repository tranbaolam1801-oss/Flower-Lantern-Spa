import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { PasswordService } from './password.service';
import { JwtTokenService } from './jwt-token.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [
    PasswordService,
    JwtTokenService,
    AuthService,
    AuthGuard,
    RolesGuard,
  ],
  exports: [AuthService, PasswordService, JwtTokenService, AuthGuard, RolesGuard],
})
export class AuthModule {}
