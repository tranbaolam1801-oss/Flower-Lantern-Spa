import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: 'Số điện thoại đăng nhập', example: '0900000001' })
  @IsNotEmpty({ message: 'Không được để trống!' })
  @IsString({ message: 'Số điện thoại không hợp lệ' })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @Matches(/^[0-9]{10,15}$/, { message: 'Số điện thoại phải chứa từ 10 đến 15 chữ số' })
  phone!: string;

  @ApiProperty({ description: 'Mật khẩu', example: 'Spa@123456' })
  @IsNotEmpty({ message: 'Không được để trống!' })
  @IsString({ message: 'Mật khẩu không hợp lệ' })
  @MaxLength(1024, { message: 'Mật khẩu quá dài' })
  password!: string;
}

export interface AuthUser {
  id: string;
  username: string;
  phone: string;
  role: string;
  fullName: string;
  permissions: string[];
  entityId?: string;
}

export interface JwtPayload {
  jti?: string;
  sub: string;
  username: string;
  phone: string;
  role: string;
  fullName: string;
  permissions: string[];
  entityId?: string;
  iat?: number;
  exp?: number;
}
