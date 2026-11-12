import { DataSourceOptions } from 'typeorm';
import { databaseOptions } from './config';

function withTimeouts(opts: DataSourceOptions | undefined): { connectionTimeout?: number; requestTimeout?: number } {
  return opts as unknown as { connectionTimeout?: number; requestTimeout?: number };
}

const baseEnv: NodeJS.ProcessEnv = {
  DB_HOST: 'test-server.database.windows.net',
  DB_NAME: 'FlowerLanternSpa_Test',
  DB_USER: 'spa_app',
  DB_PASSWORD: 'x',
};

describe('databaseOptions timeouts (Azure SQL serverless cold start)', () => {
  it('defaults both timeouts to 5000ms when unset', () => {
    const opts = withTimeouts(databaseOptions({ ...baseEnv }));
    expect(opts.connectionTimeout).toBe(5000);
    expect(opts.requestTimeout).toBe(5000);
  });

  it('honors DB_CONNECT_TIMEOUT_MS / DB_REQUEST_TIMEOUT_MS overrides', () => {
    const opts = withTimeouts(databaseOptions({
      ...baseEnv,
      DB_CONNECT_TIMEOUT_MS: '30000',
      DB_REQUEST_TIMEOUT_MS: '15000',
    }));
    expect(opts.connectionTimeout).toBe(30000);
    expect(opts.requestTimeout).toBe(15000);
  });

  it('rejects an out-of-range DB_CONNECT_TIMEOUT_MS', () => {
    expect(() => databaseOptions({ ...baseEnv, DB_CONNECT_TIMEOUT_MS: '500' })).toThrow();
    expect(() => databaseOptions({ ...baseEnv, DB_CONNECT_TIMEOUT_MS: '999999' })).toThrow();
    expect(() => databaseOptions({ ...baseEnv, DB_CONNECT_TIMEOUT_MS: 'abc' })).toThrow();
  });

  it('returns undefined when DB env is incomplete (unchanged behavior)', () => {
    expect(databaseOptions({})).toBeUndefined();
  });
});
