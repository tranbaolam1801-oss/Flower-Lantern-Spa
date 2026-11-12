import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
