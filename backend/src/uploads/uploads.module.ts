import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IMAGE_STORAGE, LocalDiskImageStorage, uploadRoot } from './image-storage';
import { UploadsController } from './uploads.controller';

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [{ provide: IMAGE_STORAGE, useFactory: () => new LocalDiskImageStorage(uploadRoot()) }],
})
export class UploadsModule {}
