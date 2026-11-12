import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingTransactionService } from './booking-transaction.service';
import { BookingWriteService } from './booking-write.service';
import { BookingWriteController, MyBookingWriteController } from './booking-write.controller';

@Module({
  imports: [AuthModule],
  controllers: [BookingWriteController, MyBookingWriteController],
  providers: [BookingTransactionService, BookingWriteService],
})
export class BookingWriteModule {}
