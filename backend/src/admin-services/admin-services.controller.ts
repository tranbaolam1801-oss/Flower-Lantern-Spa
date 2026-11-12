import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions, Roles } from '../auth/roles.decorator';
import { AdminServiceListQuery, AdminServiceWriteDto, ServiceIdParam } from './admin-services.dto';
import { AdminServicesService } from './admin-services.service';

@ApiTags('admin-services')
@Controller('admin/services')
@UseGuards(AuthGuard, RolesGuard)
@Roles('Quản lý') @Permissions('Q04')
export class AdminServicesController {
  constructor(@Inject(AdminServicesService) private readonly services: AdminServicesService) {}

  @Get() list(@Query() query: AdminServiceListQuery) { return this.services.list(query); }
  @Post() create(@Body() dto: AdminServiceWriteDto) { return this.services.create(dto); }
  @Patch(':id') update(@Param() p: ServiceIdParam, @Body() dto: AdminServiceWriteDto) { return this.services.update(p.id, dto); }
  @Delete(':id') @HttpCode(200) stop(@Param() p: ServiceIdParam) { return this.services.stop(p.id); }
}
