import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { InternalApiGuard } from './internal-api.guard';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { DEFAULT_DISPATCH_LIMIT, MAX_DISPATCH_LIMIT } from './notification-config';

export class DispatchBody {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_DISPATCH_LIMIT) limit?: number;
}

@ApiExcludeController()
@Controller('internal/notifications')
export class NotificationsController {
  constructor(@Inject(NotificationDispatcherService) private readonly dispatcher: NotificationDispatcherService) {}

  /** Called by the scheduler (n8n). Idempotent: concurrent or repeated calls never send a job twice. */
  @Post('dispatch') @HttpCode(200) @UseGuards(InternalApiGuard)
  dispatch(@Body() body: DispatchBody) {
    return this.dispatcher.dispatch(body?.limit ?? DEFAULT_DISPATCH_LIMIT);
  }
}
