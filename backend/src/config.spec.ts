import { databaseOptions } from './config';

type PgOptions = { type: string; url: string; ssl: unknown; connectTimeoutMS: number; extra: { max: number; query_timeout: number } };
const opts = (env: NodeJS.ProcessEnv) => databaseOptions(env) as unknown as PgOptions;
const url = 'postgres://app:x@ep-demo-pooler.ap-southeast-1.aws.neon.tech/spa?sslmode=require';

describe('databaseOptions (PostgreSQL / Neon)', () => {
  it('returns undefined when DATABASE_URL is not set', () => {
    expect(databaseOptions({})).toBeUndefined();
  });

  it('uses the postgres driver with verified TLS by default', () => {
    const o = opts({ DATABASE_URL: url });
    expect(o.type).toBe('postgres');
    expect(o.url).toBe(url);
    expect(o.ssl).toEqual({ rejectUnauthorized: true });
  });

  it('rejects non-postgres URLs', () => {
    expect(() => databaseOptions({ DATABASE_URL: 'mssql://x' })).toThrow();
  });

  it('allows DB_SSL=disable only outside production (local PGlite tests)', () => {
    expect(opts({ DATABASE_URL: url, DB_SSL: 'disable' }).ssl).toBe(false);
    expect(() => databaseOptions({ DATABASE_URL: url, DB_SSL: 'disable', NODE_ENV: 'production' })).toThrow();
  });

  it('defaults timeouts and pool size, and honours valid overrides', () => {
    const d = opts({ DATABASE_URL: url });
    expect(d.connectTimeoutMS).toBe(10000);
    expect(d.extra.query_timeout).toBe(15000);
    expect(d.extra.max).toBe(5);
    const o = opts({ DATABASE_URL: url, DB_CONNECT_TIMEOUT_MS: '30000', DB_REQUEST_TIMEOUT_MS: '20000', DB_POOL_MAX: '2' });
    expect(o.connectTimeoutMS).toBe(30000);
    expect(o.extra.query_timeout).toBe(20000);
    expect(o.extra.max).toBe(2);
  });

  it('rejects out-of-range timeouts and pool sizes', () => {
    expect(() => databaseOptions({ DATABASE_URL: url, DB_CONNECT_TIMEOUT_MS: '500' })).toThrow();
    expect(() => databaseOptions({ DATABASE_URL: url, DB_REQUEST_TIMEOUT_MS: 'abc' })).toThrow();
    expect(() => databaseOptions({ DATABASE_URL: url, DB_POOL_MAX: '0' })).toThrow();
  });
});
