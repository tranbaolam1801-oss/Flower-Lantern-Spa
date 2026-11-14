import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [InboxController],
  providers: [InboxService],
})
export class InboxModule {}
