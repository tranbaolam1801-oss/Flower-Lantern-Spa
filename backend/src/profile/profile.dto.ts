import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

const blankToNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value);

/**
 * Self-service whitelist. Anything else (role, permissions, status, ids, phone, password…) is rejected by the global
 * ValidationPipe (forbidNonWhitelisted) before it reaches the service. The account is always the authenticated one.
 */
export class UpdateProfileDto {
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @IsString({ message: 'Họ và tên không hợp lệ!' }) @MinLength(2, { message: 'Họ và tên phải từ 2 đến 50 ký tự!' }) @MaxLength(50, { message: 'Họ và tên phải từ 2 đến 50 ký tự!' })
  fullName?: string;

  @IsOptional() @Transform(blankToNull) @ValidateIf((_o, v) => v !== null)
  @IsEmail({}, { message: 'Email không hợp lệ!' }) @MaxLength(100, { message: 'Email không hợp lệ!' })
  email?: string | null;

  @IsOptional() @Transform(blankToNull) @ValidateIf((_o, v) => v !== null)
  @IsIn(['Nam', 'Nữ', 'Khác'], { message: 'Giới tính không hợp lệ!' })
  gender?: string | null;

  @IsOptional() @Transform(blankToNull) @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày sinh không hợp lệ!' })
  birthDate?: string | null;

  @IsOptional() @Transform(blankToNull) @ValidateIf((_o, v) => v !== null)
  @IsString() @MaxLength(255, { message: 'Địa chỉ tối đa 255 ký tự!' })
  address?: string | null;
}
