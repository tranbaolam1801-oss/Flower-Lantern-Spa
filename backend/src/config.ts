import { DataSourceOptions } from 'typeorm';
import { createRequire } from 'node:module';
import * as entities from './entities';

// DB_CONNECT_TIMEOUT_MS / DB_REQUEST_TIMEOUT_MS: override the 5000ms default. Needed for Azure SQL Database
// serverless (free offer), whose auto-pause can take well over 5s to resume on the first query after idle.
function timeoutMs(env: NodeJS.ProcessEnv, key: 'DB_CONNECT_TIMEOUT_MS' | 'DB_REQUEST_TIMEOUT_MS'): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return 5000;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1000 || n > 120000) throw new Error(`${key} không hợp lệ (1000-120000)`);
  return n;
}

export function databaseOptions(env: NodeJS.ProcessEnv): DataSourceOptions | undefined {
  const entityList = Object.values(entities);
  const connectionTimeout = timeoutMs(env, 'DB_CONNECT_TIMEOUT_MS');
  const requestTimeout = timeoutMs(env, 'DB_REQUEST_TIMEOUT_MS');
  if (env.DB_AUTH === 'windows') {
    if (env.NODE_ENV === 'production') throw new Error('Windows integrated development mode is disabled in production');
    if (env.DB_HOST !== 'localhost' || !env.DB_NAME || !/^[A-Za-z0-9_]+$/.test(env.DB_NAME)) throw new Error('Windows mode requires localhost and a valid explicit database name');
    const load = createRequire(__filename);
    return {
      type:'mssql', host:'localhost', database:env.DB_NAME,
      driver:load('mssql/msnodesqlv8'),
      extra:{connectionString:`Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=${env.DB_NAME};Trusted_Connection=Yes;Encrypt=Yes;TrustServerCertificate=Yes;`},
      entities: entityList,
      synchronize:false,migrationsRun:false,logging:false,
      connectionTimeout,requestTimeout,pool:{max:10,min:0,idleTimeoutMillis:30000},
    };
  }
  if (!env.DB_HOST || !env.DB_NAME || !env.DB_USER || !env.DB_PASSWORD) return undefined;
  const port = Number(env.DB_PORT ?? 1433);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT không hợp lệ');
  return {
    type: 'mssql', host: env.DB_HOST, port, database: env.DB_NAME,
    username: env.DB_USER, password: env.DB_PASSWORD,
    entities: entityList,
    synchronize: false, migrationsRun: false, logging: false,
    options: { encrypt: true, trustServerCertificate: env.NODE_ENV !== 'production' && env.DB_TRUST_CERTIFICATE === 'true' },
    connectionTimeout, requestTimeout,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  };
}
