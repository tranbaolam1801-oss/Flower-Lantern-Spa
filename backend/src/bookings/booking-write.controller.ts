import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Permissions } from '../auth/roles.decorator';
import { JwtPayload } from '../auth/auth.dto';
import { BookingWriteService } from './booking-write.service';
import { BookingIdParam, CreateAdminBookingDto, CreateCustomerBookingDto, RescheduleMyBookingDto, SearchBookingsQuery, UpdateAdminBookingDto } from './booking-write.dto';

@ApiTags('bookings') @Controller('bookings')
@UseGuards(AuthGuard, RolesGuard) @Roles('Nhân viên', 'Quản lý') @Permissions('Q01')
export class BookingWriteController {
  constructor(@Inject(BookingWriteService) private readonly service: BookingWriteService) {}
  @Get('search') search(@Query() query: SearchBookingsQuery) { return this.service.search(query); }
  @Post() @HttpCode(201) create(@Body() dto: CreateAdminBookingDto) { return this.service.createAdmin(dto); }
  @Patch(':id') update(@Param() params: BookingIdParam, @Body() dto: UpdateAdminBookingDto) { return this.service.updateAdmin(params.id, dto); }
}

@ApiTags('bookings') @Controller('me/bookings')
@UseGuards(AuthGuard, RolesGuard) @Roles('Khách hàng')
export class MyBookingWriteController {
  constructor(@Inject(BookingWriteService) private readonly service: BookingWriteService) {}
  @Post() @HttpCode(201) create(@Req() request: Request & { user: JwtPayload }, @Body() dto: CreateCustomerBookingDto) { return this.service.createCustomer(request.user.sub, dto); }
  @Patch(':id/time') reschedule(@Req() request: Request & { user: JwtPayload }, @Param() params: BookingIdParam, @Body() dto: RescheduleMyBookingDto) { return this.service.rescheduleMine(request.user.sub, params.id, dto.date, dto.time); }
  @Post(':id/cancel') @HttpCode(200) cancel(@Req() request: Request & { user: JwtPayload }, @Param() params: BookingIdParam) { return this.service.cancelMine(request.user.sub, params.id); }
}
