import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';

export const ACTIVE = 'Hoạt động';
export const INACTIVE = 'Ngừng hoạt động';
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ServiceIdParam {
  @Matches(/^[A-Za-z0-9]{1,10}$/, { message: 'Mã dịch vụ không hợp lệ!' }) id!: string;
}

export class AdminServiceListQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) @Transform(trim) q?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Za-z0-9]{1,10}$/) category?: string;
  @ApiPropertyOptional({ enum: [ACTIVE, INACTIVE] }) @IsOptional() @IsIn([ACTIVE, INACTIVE]) status?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
}

export class ServicePackageDto {
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Za-z0-9]{1,10}$/, { message: 'Mã gói dịch vụ không hợp lệ!' }) id?: string;
  @ApiProperty() @Transform(trim) @IsString() @IsNotEmpty({ message: 'Vui lòng nhập tên gói dịch vụ!' })
  @MaxLength(100, { message: 'Tên gói dịch vụ tối đa 100 ký tự!' }) name!: string;
  @ApiProperty() @IsInt({ message: 'Thời lượng phải là số nguyên dương!' }) @Min(1, { message: 'Thời lượng phải là số nguyên dương!' })
  @Max(1440, { message: 'Thời lượng tối đa 1440 phút!' }) durationMinutes!: number;
  @ApiProperty() @IsInt({ message: 'Giá dịch vụ phải là số nguyên không âm!' }) @Min(0, { message: 'Giá dịch vụ phải là số nguyên không âm!' })
  @Max(1_000_000_000, { message: 'Giá dịch vụ quá lớn!' }) price!: number;
}

export class AdminServiceWriteDto {
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Za-z0-9]{1,10}$/, { message: 'Mã dịch vụ không hợp lệ!' }) id?: string;
  @ApiProperty() @Transform(trim) @IsString() @IsNotEmpty({ message: 'Vui lòng nhập tên dịch vụ!' })
  @MaxLength(150, { message: 'Tên dịch vụ tối đa 150 ký tự!' }) name!: string;
  @ApiProperty() @Matches(/^[A-Za-z0-9]{1,10}$/, { message: 'Danh mục không hợp lệ!' }) categoryId!: string;
  @ApiProperty({ enum: [ACTIVE, INACTIVE] }) @IsIn([ACTIVE, INACTIVE], { message: 'Trạng thái không hợp lệ!' }) status!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(255) description?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(20000) details?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(255) image?: string;
  @ApiProperty({ type: [ServicePackageDto] })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => ServicePackageDto) packages!: ServicePackageDto[];
  @ApiPropertyOptional({ type: [String], description: 'PATCH only: package ids to delete (kept if they have booking history)' })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @Matches(/^[A-Za-z0-9]{1,10}$/, { each: true, message: 'Mã gói dịch vụ không hợp lệ!' })
  removePackageIds?: string[];
}

/** Only a clean relative path or an https URL; never javascript:, data:, protocol-relative or traversal. */
const UNSAFE_IMAGE_PUNCTUATION = '\\<>"\'`';
const hasUnsafeImageChar = (value: string) => [...value].some((c) => c.charCodeAt(0) <= 0x20 || UNSAFE_IMAGE_PUNCTUATION.includes(c));

export function isSafeImage(value: string): boolean {
  if (value.length === 0 || value.length > 255 || hasUnsafeImageChar(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//') && !value.split('/').includes('..');
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}
