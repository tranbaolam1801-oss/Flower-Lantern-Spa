import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Permissions, Roles } from '../auth/roles.decorator';
import { JwtPayload } from '../auth/auth.dto';
import {
  CreateEmployeeDto, EmployeeIdParam, EmployeeListQuery, UpdateAccountStatusDto, UpdateEmployeeDto, UpdatePermissionsDto,
} from './employees.dto';
import { EmployeesService } from './employees.service';

type AuthedRequest = { user: JwtPayload };

@ApiTags('employees')
@Controller('employees')
@UseGuards(AuthGuard, RolesGuard)
@Roles('Quản lý') @Permissions('Q05')
export class EmployeesController {
  constructor(@Inject(EmployeesService) private readonly employees: EmployeesService) {}

  @Get() list(@Query() query: EmployeeListQuery) { return this.employees.list(query); }
  @Get(':id') get(@Param() p: EmployeeIdParam) { return this.employees.get(p.id); }
  @Post() create(@Req() req: AuthedRequest, @Body() dto: CreateEmployeeDto) { return this.employees.create(req.user, dto); }
  @Patch(':id') update(@Req() req: AuthedRequest, @Param() p: EmployeeIdParam, @Body() dto: UpdateEmployeeDto) { return this.employees.update(req.user, p.id, dto); }
  @Delete(':id') @HttpCode(200) remove(@Req() req: AuthedRequest, @Param() p: EmployeeIdParam) { return this.employees.softDelete(req.user, p.id); }
  @Put(':id/permissions') @HttpCode(200)
  permissions(@Req() req: AuthedRequest, @Param() p: EmployeeIdParam, @Body() dto: UpdatePermissionsDto) { return this.employees.setPermissions(req.user, p.id, dto); }
  @Patch(':id/account-status') @HttpCode(200)
  accountStatus(@Req() req: AuthedRequest, @Param() p: EmployeeIdParam, @Body() dto: UpdateAccountStatusDto) { return this.employees.setAccountStatus(req.user, p.id, dto); }
}
