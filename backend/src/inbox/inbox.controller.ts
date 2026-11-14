import { Controller, Get, Header, Inject, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { JwtPayload } from '../auth/auth.dto';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { InboxService } from './inbox.service';

export class InboxListQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}

type WithUser = Request & { user: JwtPayload };

/** In-app notifications of the signed-in management account (Chủ Spa / Quản lý / Nhân viên). Customers are refused (403). */
@ApiExcludeController()
@Controller('notifications')
@UseGuards(AuthGuard, RolesGuard)
@Roles('Nhân viên', 'Quản lý')
export class InboxController {
  constructor(@Inject(InboxService) private readonly inbox: InboxService) {}

  @Get() @Header('Cache-Control', 'no-store') list(@Req() req: WithUser, @Query() query: InboxListQuery) { return this.inbox.list(req.user.sub, query.page, query.limit); }

  @Get('unread-count') @Header('Cache-Control', 'no-store') async unread(@Req() req: WithUser) { return { unread: await this.inbox.unread(req.user.sub) }; }

  @Patch('read-all') @Header('Cache-Control', 'no-store') readAll(@Req() req: WithUser) { return this.inbox.markAllRead(req.user.sub); }

  @Patch(':id/read') @Header('Cache-Control', 'no-store') read(@Req() req: WithUser, @Param('id', new ParseUUIDPipe()) id: string) { return this.inbox.markRead(req.user.sub, id); }
}
