import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { phoneTransform } from '../common/phone';
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsDateString, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString,
  Matches, Max, MaxLength, Min,
} from 'class-validator';

export const PERMISSION_CODES = ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06'] as const;
export const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const PASSWORD_POLICY_MESSAGE = 'Mật khẩu không đáp ứng yêu cầu bảo mật (tối thiểu 8 ký tự gồm chữ hoa, thường, số và ký tự đặc biệt)!';
export const CONFIRM_MISMATCH_MESSAGE = 'Mật khẩu xác nhận không khớp!';
const REQUIRED = 'Không được để trống!';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
// Empty optional text clears the column (null); undefined leaves it untouched.
const blankToNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value);
export class EmployeeIdParam {
  @Matches(/^[A-Za-z0-9]{1,10}$/, { message: 'Mã nhân viên không hợp lệ!' }) id!: string;
}

export class EmployeeListQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) @Transform(trim) q = '';
  @ApiPropertyOptional({ enum: ['Hoạt động', 'Đã khóa', 'Vô hiệu hóa'] })
  @IsOptional() @IsIn(['', 'Hoạt động', 'Đã khóa', 'Vô hiệu hóa']) status = '';
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
}

class EmployeeProfileFields {
  @ApiProperty() @IsNotEmpty({ message: REQUIRED }) @IsString() @MaxLength(50, { message: 'Họ tên tối đa 50 ký tự!' }) @Transform(trim) fullName!: string;
  @ApiProperty() @IsNotEmpty({ message: REQUIRED }) @Transform(phoneTransform)
  @Matches(/^0[0-9]{9}$/, { message: 'Số điện thoại không hợp lệ!' }) phone!: string;
  @ApiProperty() @IsNotEmpty({ message: REQUIRED }) @Transform(trim) @MaxLength(100)
  @IsEmail({}, { message: 'Email không hợp lệ!' }) email!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @IsString() @MaxLength(10) gender?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @IsDateString({}, { message: 'Ngày sinh không hợp lệ!' }) birthDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @IsString() @MaxLength(255) address?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(blankToNull) @IsString() @MaxLength(500) notes?: string | null;
}

export class CreateEmployeeDto extends EmployeeProfileFields {
  @ApiProperty() @IsNotEmpty({ message: REQUIRED }) @Transform(trim)
  @Matches(/^[A-Za-z0-9._]{4,50}$/, { message: 'Tên đăng nhập gồm 4-50 ký tự chữ, số, dấu chấm hoặc gạch dưới!' }) username!: string;
  @ApiProperty() @IsNotEmpty({ message: REQUIRED }) @IsString() @MaxLength(128)
  @Matches(PASSWORD_POLICY, { message: PASSWORD_POLICY_MESSAGE }) password!: string;
  @ApiProperty() @IsNotEmpty({ message: REQUIRED }) @IsString() @MaxLength(128) confirmPassword!: string;
}

export class UpdateEmployeeDto extends EmployeeProfileFields {}

export class UpdatePermissionsDto {
  @ApiProperty({ enum: ['Quản lý', 'Nhân viên'] }) @IsIn(['Quản lý', 'Nhân viên'], { message: 'Vai trò không hợp lệ!' }) role!: 'Quản lý' | 'Nhân viên';
  @ApiProperty({ isArray: true, enum: PERMISSION_CODES })
  @IsArray() @ArrayMaxSize(PERMISSION_CODES.length) @ArrayUnique() @IsIn(PERMISSION_CODES as unknown as string[], { each: true, message: 'Quyền không hợp lệ!' })
  permissions!: string[];
}

export class UpdateAccountStatusDto {
  @ApiProperty({ enum: ['Hoạt động', 'Đã khóa'] }) @IsIn(['Hoạt động', 'Đã khóa'], { message: 'Trạng thái không hợp lệ!' }) status!: 'Hoạt động' | 'Đã khóa';
}
