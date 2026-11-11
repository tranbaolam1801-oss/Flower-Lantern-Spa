import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { HealthController } from './health.controller';
import { CatalogController } from './catalog.controller';
import { AuthModule } from './auth/auth.module';
import { BookingReadController } from './bookings/booking-read.controller';
import { CustomerReadController } from './customers/customer-read.controller';
import { BookingCancelController } from './bookings/booking-cancel.controller';

@Module({
  imports: [DatabaseModule,AuthModule],
  controllers: [HealthController, CatalogController, BookingReadController, CustomerReadController, BookingCancelController],
})
export class AppModule {}
