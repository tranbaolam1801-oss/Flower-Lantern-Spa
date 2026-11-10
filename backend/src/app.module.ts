import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { HealthController } from './health.controller';
import { CatalogController } from './catalog.controller';
@Module({controllers:[HealthController,CatalogController],providers:[DatabaseService]})
export class AppModule {}
