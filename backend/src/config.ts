import { DataSourceOptions } from 'typeorm';
import { types } from 'pg';

// ---- pg result parsing: keep the values the application received from the previous SQL Server driver ----
// timestamp WITHOUT time zone (OID 1114): tedious (useUTC=true, its default) read DATETIME as UTC wall-clock.
// node-pg would otherwise interpret it in the process's local zone (UTC+7 on a developer PC, UTC on Vercel).
types.setTypeParser(1114, (value: string) => new Date(value.replace(' ', 'T') + 'Z'));
// date (OID 1082): tedious returned DATE as a Date at UTC midnight; node-pg would use LOCAL midnight.
types.setTypeParser(1082, (value: string) => new Date(value + 'T00:00:00Z'));
// time (OID 1083): tedious returned TIME as a Date on 1970-01-01 (UTC); node-pg would return a string.
types.setTypeParser(1083, (value: string) => new Date('1970-01-01T' + value + 'Z'));
// numeric (OID 1700, MONEY -> numeric(19,4)) and bigint (OID 20, COUNT(*)) arrive as strings in node-pg;
// SQL Server returned JS numbers. Amounts here are VND <= 1e12, well inside Number's exact-integer range.
types.setTypeParser(1700, (value: string) => Number(value));
types.setTypeParser(20, (value: string) => Number(value));

// DB_CONNECT_TIMEOUT_MS / DB_REQUEST_TIMEOUT_MS override the defaults. Neon Free scales to zero after
// 5 minutes idle and usually resumes in a few hundred ms; the first query after a pause can still be slower.
function timeoutMs(env: NodeJS.ProcessEnv, key: 'DB_CONNECT_TIMEOUT_MS' | 'DB_REQUEST_TIMEOUT_MS', fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1000 || n > 120000) throw new Error(`${key} không hợp lệ (1000-120000)`);
  return n;
}

function poolMax(env: NodeJS.ProcessEnv): number {
  const raw = env.DB_POOL_MAX;
  if (raw === undefined || raw === '') return 5;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error('DB_POOL_MAX không hợp lệ (1-50)');
  return n;
}

/**
 * PostgreSQL connection (Neon in production). DATABASE_URL is the POOLED connection string
 * (host contains "-pooler"; PgBouncer transaction mode) — the application only uses transaction-scoped
 * features (row locks, SET LOCAL), never session state. Migrations use the direct URL instead.
 * TLS: Neon requires it; certificates are verified (rejectUnauthorized) unless DB_SSL=disable, which is
 * refused in production and only meant for the local PGlite test server.
 */
export function databaseOptions(env: NodeJS.ProcessEnv): DataSourceOptions | undefined {
  const url = env.DATABASE_URL?.trim();
  if (!url) return undefined;
  if (!/^postgres(ql)?:\/\//i.test(url)) throw new Error('DATABASE_URL phải là chuỗi kết nối postgres://');
  const sslDisabled = env.DB_SSL === 'disable';
  if (sslDisabled && env.NODE_ENV === 'production') throw new Error('DB_SSL=disable is not allowed in production');
  const connectionTimeout = timeoutMs(env, 'DB_CONNECT_TIMEOUT_MS', 10000);
  const requestTimeout = timeoutMs(env, 'DB_REQUEST_TIMEOUT_MS', 15000);
  return {
    type: 'postgres',
    url,
    ssl: sslDisabled ? false : { rejectUnauthorized: true },
    // The application uses raw SQL only; the entity classes document the schema but are not loaded.
    entities: [],
    synchronize: false,
    migrationsRun: false,
    logging: false,
    connectTimeoutMS: connectionTimeout,
    extra: {
      max: poolMax(env),
      idleTimeoutMillis: 10000,
      // Client-side timeout only. A server-side statement_timeout would travel as a startup parameter,
      // which PgBouncer in front of Neon's pooled endpoint can reject.
      query_timeout: requestTimeout,
      application_name: 'flower-lantern-spa',
    },
  };
}
