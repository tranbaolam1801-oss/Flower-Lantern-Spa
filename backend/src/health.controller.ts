import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DatabaseService } from './database.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}
  @Get('live') live() { return { status: 'ok', service: 'flower-lantern-spa' }; }
  @Get('ready') async ready() {
    await this.database.query('SELECT 1 AS ok');
    return { status: 'ok', database: 'postgres' };
  }
}
