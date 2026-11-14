import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database.module';
import { imageStorageFromEnv } from '../uploads/image-storage';
import { ProfileController } from './profile.controller';
import { AVATAR_STORAGE, ProfileService } from './profile.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ProfileController],
  providers: [ProfileService, { provide: AVATAR_STORAGE, useFactory: () => imageStorageFromEnv(process.env, 'avatars') }],
})
export class ProfileModule {}
