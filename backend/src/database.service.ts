import { Injectable, OnApplicationShutdown, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, DataSourceOptions, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { databaseOptions } from './config';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private source?: DataSource;
  private connecting?: Promise<DataSource>;

  async getDataSource(): Promise<DataSource> {
    return await this.connect();
  }

  async getRepository<T extends ObjectLiteral>(target: EntityTarget<T>): Promise<Repository<T>> {
    const source = await this.connect();
    return source.getRepository(target);
  }

  private async connect(): Promise<DataSource> {
    if (this.source?.isInitialized) return this.source;
    if (this.connecting) return this.connecting;
    const options = databaseOptions(process.env);
    if (!options) throw new ServiceUnavailableException('Chưa cấu hình kết nối SQL Server.');
    this.connecting = this.initializeWithRetry(options);
    try {
      this.source = await this.connecting;
      return this.source;
    } finally {
      this.connecting = undefined;
    }
  }

  // DB_CONNECT_RETRIES/DB_CONNECT_RETRY_DELAY_MS default to 0/3000: no retry unless explicitly set.
  // Azure SQL Database serverless (free offer) auto-pauses when idle; the first connection after a
  // pause can fail even with a generous connectionTimeout, so Staging sets a few retries with backoff.
  private async initializeWithRetry(options: DataSourceOptions): Promise<DataSource> {
    const retries = Math.max(0, Number(process.env.DB_CONNECT_RETRIES ?? 0) || 0);
    const delayMs = Math.max(0, Number(process.env.DB_CONNECT_RETRY_DELAY_MS ?? 3000) || 0);
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await new DataSource(options).initialize();
      } catch (err) {
        lastError = err;
        if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError;
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
