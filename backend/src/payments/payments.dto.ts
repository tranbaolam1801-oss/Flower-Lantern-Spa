import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const ID = /^[A-Za-z0-9]{1,10}$/;

export class CreateSepayIntentDto {
  @Matches(ID, { message: 'Mã lịch hẹn không hợp lệ.' })
  bookingId!: string;
}

export class PaymentIdParam {
  @Matches(ID, { message: 'Mã thanh toán không hợp lệ.' })
  id!: string;
}

export class RefundPaymentDto {
  @IsInt() @Min(1) @Max(1_000_000_000)
  amount!: number;
  @IsString({ message: 'Lý do hoàn tiền là bắt buộc.' }) @Matches(/\S/, { message: 'Lý do hoàn tiền là bắt buộc.' }) @MaxLength(255, { message: 'Lý do hoàn tiền tối đa 255 ký tự.' })
  reason!: string;
}

export class UnreconciledQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number;
}

/** Test-only: simulates an incoming transfer for a pending payment; `amount` defaults to the exact payable amount. */
export class MockWebhookDto {
  @Matches(ID, { message: 'Mã thanh toán không hợp lệ.' })
  paymentId!: string;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000)
  amount?: number;
  @IsOptional() @IsIn(['in', 'out'])
  transferType?: 'in' | 'out';
}
