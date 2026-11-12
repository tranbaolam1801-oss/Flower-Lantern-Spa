import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions, Roles } from '../auth/roles.decorator';
import { GroupBy, INVALID_RANGE, ReportsService } from './reports.service';

export class ReportRangeQuery {
  @ApiProperty({ example: '2026-11-01' }) @Matches(/^\d{4}-\d\d-\d\d$/, { message: INVALID_RANGE }) from!: string;
  @ApiProperty({ example: '2026-11-30' }) @Matches(/^\d{4}-\d\d-\d\d$/, { message: INVALID_RANGE }) to!: string;
}

export class RevenueQuery extends ReportRangeQuery {
  @ApiPropertyOptional({ enum: ['day', 'week', 'month', 'year'], default: 'day' })
  @IsOptional() @IsIn(['day', 'week', 'month', 'year'], { message: INVALID_RANGE }) groupBy: GroupBy = 'day';
}

@ApiTags('reports')
@Controller('reports')
@UseGuards(AuthGuard, RolesGuard)
@Roles('Quản lý') @Permissions('Q06')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get('services') services(@Query() q: ReportRangeQuery) { return this.reports.services(q.from, q.to); }
  @Get('customers') customers(@Query() q: ReportRangeQuery) { return this.reports.customers(q.from, q.to); }
  @Get('revenue') revenue(@Query() q: RevenueQuery) { return this.reports.revenue(q.from, q.to, q.groupBy); }
}
