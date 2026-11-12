import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminServicesController } from './admin-services.controller';
import { AdminServicesService } from './admin-services.service';

@Module({ imports: [AuthModule], controllers: [AdminServicesController], providers: [AdminServicesService] })
export class AdminServicesModule {}
