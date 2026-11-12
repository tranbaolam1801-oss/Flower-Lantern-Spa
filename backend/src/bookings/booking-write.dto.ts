import { Transform, Type } from 'class-transformer';
import { phoneTransform } from '../common/phone';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { ACTIVE_BED, BOOKING_STATUSES, LOCAL_DATETIME, MESSAGES, PAYMENT_STATUSES, PHONE } from './booking-rules';

const phone = { message: 'Số điện thoại không hợp lệ!' };
const dateRule = { message: MESSAGES.date };

export class BookingGuestDto {
  @IsString({ message: MESSAGES.guest }) @MinLength(1, { message: MESSAGES.guest }) @MaxLength(50, { message: MESSAGES.guest })
  customerName!: string;
  @IsOptional() @Transform(phoneTransform) @Matches(PHONE, phone)
  customerPhone?: string;
  @Matches(ACTIVE_BED, { message: MESSAGES.bed })
  bedId!: string;
  @Matches(/^[A-Za-z0-9]{1,10}$/, { message: MESSAGES.package })
  packageId!: string;
  @Matches(LOCAL_DATETIME, dateRule)
  startsAt!: string;
}

export class CreateAdminBookingDto {
  @IsString({ message: 'Vui lòng nhập họ tên người đặt!' }) @MinLength(1, { message: 'Vui lòng nhập họ tên người đặt!' }) @MaxLength(50, { message: 'Họ tên không được quá 50 ký tự!' })
  bookerName!: string;
  @Transform(phoneTransform) @Matches(PHONE, phone)
  bookerPhone!: string;
  @IsOptional() @IsEmail({}, { message: 'Email không hợp lệ!' }) @MaxLength(100)
  bookerEmail?: string;
  @IsOptional() @IsIn(['Trực tiếp', 'Facebook', 'Zalo', 'Website', 'Khác'])
  source?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, dateRule)
  date!: string;
  @IsOptional() @IsString() @MaxLength(500, { message: 'Ghi chú không được quá 500 ký tự!' })
  notes?: string;
  @IsOptional() @IsIn(['Chờ xác nhận', 'Chưa đến', 'Đã xác nhận'], { message: MESSAGES.transition })
  status?: 'Chờ xác nhận' | 'Chưa đến' | 'Đã xác nhận';
  @IsOptional() @IsIn(PAYMENT_STATUSES as unknown as string[])
  paymentStatus?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000)
  prepaidAmount?: number;
  @IsArray() @ArrayMinSize(1, { message: MESSAGES.guest }) @ArrayMaxSize(15) @ValidateNested({ each: true }) @Type(() => BookingGuestDto)
  guests!: BookingGuestDto[];
}

export class UpdateAdminBookingDto {
  @IsOptional() @IsIn(BOOKING_STATUSES as unknown as string[], { message: MESSAGES.transition })
  status?: string;
  @IsOptional() @IsIn(PAYMENT_STATUSES as unknown as string[])
  paymentStatus?: string;
  @IsOptional() @IsString() @MaxLength(500, { message: 'Ghi chú không được quá 500 ký tự!' })
  notes?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, dateRule)
  date?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1, { message: MESSAGES.guest }) @ArrayMaxSize(15) @ValidateNested({ each: true }) @Type(() => BookingGuestDto)
  guests?: BookingGuestDto[];
}

export class SearchBookingsQuery {
  @IsOptional() @IsString() @MaxLength(100)
  q?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, dateRule)
  date?: string;
  @IsOptional() @IsIn(BOOKING_STATUSES as unknown as string[])
  status?: string;
}

export class CustomerGuestDto {
  @IsString({ message: MESSAGES.guest }) @MinLength(1, { message: MESSAGES.guest }) @MaxLength(50, { message: MESSAGES.guest })
  customerName!: string;
  @IsOptional() @Transform(phoneTransform) @Matches(PHONE, phone)
  customerPhone?: string;
  @Matches(/^[A-Za-z0-9]{1,10}$/, { message: MESSAGES.package })
  packageId!: string;
}

export class CreateCustomerBookingDto {
  @IsString({ message: 'Vui lòng nhập họ tên!' }) @MinLength(1, { message: 'Vui lòng nhập họ tên!' }) @MaxLength(50, { message: 'Họ tên không được quá 50 ký tự!' })
  fullName!: string;
  @Transform(phoneTransform) @Matches(PHONE, phone)
  phone!: string;
  @IsOptional() @IsEmail({}, { message: 'Email không hợp lệ!' }) @MaxLength(100)
  email?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, dateRule)
  date!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: MESSAGES.date })
  time!: string;
  @IsOptional() @IsString() @MaxLength(500, { message: 'Ghi chú không được quá 500 ký tự!' })
  notes?: string;
  @IsArray() @ArrayMinSize(1, { message: MESSAGES.guest }) @ArrayMaxSize(15) @ValidateNested({ each: true }) @Type(() => CustomerGuestDto)
  guests!: CustomerGuestDto[];
}

export class RescheduleMyBookingDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, dateRule)
  date!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: MESSAGES.date })
  time!: string;
}

export class BookingIdParam {
  @Matches(/^[A-Za-z0-9]{1,10}$/, { message: MESSAGES.notFound })
  id!: string;
}
