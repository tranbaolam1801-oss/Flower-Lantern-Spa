import { Module } from '@nestjs/common';
import { InternalApiGuard } from './internal-api.guard';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { NotificationsController } from './notifications.controller';

/** DatabaseModule and MessagingModule are global (DatabaseService, NOTIFICATION_PROVIDER). */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationDispatcherService, InternalApiGuard],
  exports: [NotificationDispatcherService],
})
export class NotificationsModule {}
