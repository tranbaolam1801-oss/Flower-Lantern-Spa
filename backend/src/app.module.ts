import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { HealthController } from './health.controller';
import { CatalogController } from './catalog.controller';
import { AuthModule } from './auth/auth.module';
import { BookingReadController } from './bookings/booking-read.controller';
import { CustomerReadController } from './customers/customer-read.controller';
import { BookingCancelController } from './bookings/booking-cancel.controller';
import { CustomerWriteController } from './customers/customer-write.controller';
import { ReviewsController } from './reviews/reviews.controller';
import { AdminServicesModule } from './admin-services/admin-services.module';
import { ReportsModule } from './reports/reports.module';
import { EmployeesModule } from './employees/employees.module';
import { BookingWriteModule } from './bookings/booking-write.module';
import { PaymentsModule } from './payments/payments.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [DatabaseModule,AuthModule,AdminServicesModule,ReportsModule,EmployeesModule,BookingWriteModule,PaymentsModule,UploadsModule],
  controllers: [HealthController, CatalogController, BookingReadController, CustomerReadController, CustomerWriteController, ReviewsController, BookingCancelController],
})
export class AppModule {}
