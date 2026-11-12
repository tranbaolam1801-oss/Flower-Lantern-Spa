import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions, Roles } from '../auth/roles.decorator';
import { JwtPayload } from '../auth/auth.dto';
import { PaymentsService } from './payments.service';
import { CreateSepayIntentDto, MockWebhookDto, PaymentIdParam, RefundPaymentDto, UnreconciledQuery } from './payments.dto';

type AuthedRequest = Request & { user: JwtPayload };

@ApiTags('payments') @Controller('payments')
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly service: PaymentsService) {}

  @Post('sepay/intent') @HttpCode(201) @UseGuards(AuthGuard, RolesGuard) @Roles('Khách hàng', 'Nhân viên', 'Quản lý')
  intent(@Req() request: AuthedRequest, @Body() dto: CreateSepayIntentDto) { return this.service.createIntent(request.user, dto.bookingId); }

  /** Public by design: authenticated per SePay docs (API key or HMAC), never by cookie. Body is parsed manually because SePay may add fields. */
  @Post('sepay/webhook') @HttpCode(200)
  webhook(@Req() request: Request & { rawBody?: Buffer }, @Headers() headers: Record<string, string | string[] | undefined>, @Body() body: Record<string, unknown>) {
    return this.service.handleSepayWebhook({ headers, rawBody: request.rawBody }, body);
  }

  /** TEST ONLY: answers 404 unless PAYMENT_MOCK_ENABLED=true and NODE_ENV is not production. */
  @Post('mock/webhook') @HttpCode(200) @UseGuards(AuthGuard, RolesGuard) @Roles('Quản lý')
  mock(@Body() dto: MockWebhookDto) { return this.service.mockSettle(dto); }

  @Get(':id/status') @UseGuards(AuthGuard, RolesGuard) @Roles('Khách hàng', 'Nhân viên', 'Quản lý')
  status(@Req() request: AuthedRequest, @Param() params: PaymentIdParam) { return this.service.status(request.user, params.id); }

  /** Held transfers: webhook events that did not confirm a payment. No raw payload is returned. */
  @Get('unreconciled') @UseGuards(AuthGuard, RolesGuard) @Roles('Nhân viên', 'Quản lý') @Permissions('Q01')
  unreconciled(@Query() query: UnreconciledQuery) { return this.service.unreconciled(query); }

  @Post(':id/refund') @HttpCode(200) @UseGuards(AuthGuard, RolesGuard) @Roles('Quản lý') @Permissions('Q01')
  refund(@Req() request: AuthedRequest, @Param() params: PaymentIdParam, @Body() dto: RefundPaymentDto) { return this.service.refund(params.id, dto, request.user.sub); }
}
