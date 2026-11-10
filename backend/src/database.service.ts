import { Injectable, OnApplicationShutdown, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { databaseOptions } from './config';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private source?: DataSource;
  private connecting?: Promise<DataSource>;

  private async connect(): Promise<DataSource> {
    if (this.source?.isInitialized) return this.source;
    if (this.connecting) return this.connecting;
    const options = databaseOptions(process.env);
    if (!options) throw new ServiceUnavailableException('Chưa cấu hình kết nối SQL Server.');
    this.source = new DataSource(options);
    this.connecting = this.source.initialize();
    try { return await this.connecting; }
    finally { this.connecting = undefined; }
  }

  async query<T>(sql: string, parameters: unknown[] = []): Promise<T> {
    try {
      const source = await this.connect();
      return await source.query(sql, parameters) as T;
    } catch {
      // Never expose driver errors, connection strings or credentials over HTTP.
      throw new ServiceUnavailableException('Không thể kết nối dữ liệu. Vui lòng thử lại!');
    }
  }

  async onApplicationShutdown() {
    if (this.source?.isInitialized) await this.source.destroy();
  }
}
