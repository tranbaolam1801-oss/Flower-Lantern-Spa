import { Injectable, OnApplicationShutdown, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, DataSourceOptions, QueryRunner } from 'typeorm';
import { databaseOptions } from './config';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private source?: DataSource;
  private connecting?: Promise<DataSource>;

  async getDataSource(): Promise<DataSource> {
    return await this.connect();
  }

  private async connect(): Promise<DataSource> {
    if (this.source?.isInitialized) return this.source;
    if (this.connecting) return this.connecting;
    const options = databaseOptions(process.env);
    if (!options) throw new ServiceUnavailableException('Chưa cấu hình kết nối cơ sở dữ liệu.');
    this.connecting = this.initializeWithRetry(options);
    try {
      this.source = await this.connecting;
      return this.source;
    } finally {
      this.connecting = undefined;
    }
  }

  // DB_CONNECT_RETRIES/DB_CONNECT_RETRY_DELAY_MS default to 0/3000: no retry unless explicitly set.
  // Serverless databases (Neon scale-to-zero) can fail the very first connection after a pause.
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

  /** Parameterised query ($1, $2, ...). Driver errors never reach the client (503 with a generic message). */
  async query<T>(sql: string, parameters: unknown[] = []): Promise<T> {
    try {
      const source = await this.connect();
      return await source.query(sql, parameters) as T;
    } catch {
      // Never expose driver errors, connection strings or credentials over HTTP.
      throw new ServiceUnavailableException('Không thể kết nối dữ liệu. Vui lòng thử lại!');
    }
  }

  /**
   * Runs `work` inside one READ COMMITTED transaction on a dedicated connection and commits on success.
   * Any thrown error rolls back and is re-thrown unchanged, so callers keep their own HTTP mapping.
   * Replaces the former T-SQL "BEGIN TRY / BEGIN TRANSACTION / ... / CATCH ROLLBACK; THROW" batches.
   */
  async transaction<T>(work: (runner: QueryRunner) => Promise<T>): Promise<T> {
    const runner = (await this.connect()).createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      const result = await work(runner);
      await runner.commitTransaction();
      return result;
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction().catch(() => undefined);
      throw error;
    } finally {
      await runner.release();
    }
  }

  async onApplicationShutdown() {
    if (this.source?.isInitialized) await this.source.destroy();
  }
}
