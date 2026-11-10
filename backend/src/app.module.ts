import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { HealthController } from './health.controller';
import { CatalogController } from './catalog.controller';
import { AuthModule } from './auth/auth.module';
import { BookingReadController } from './bookings/booking-read.controller';

@Module({
  imports: [AuthModule],
  controllers: [HealthController, CatalogController, BookingReadController],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class AppModule {}
