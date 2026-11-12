/**
 * Real PostgreSQL for integration tests without installing a server: PGlite is the PostgreSQL engine
 * compiled to WebAssembly (no native binary — unaffected by Windows Smart App Control), exposed over the
 * normal wire protocol by pglite-socket so the production `pg` driver and TypeORM connect unchanged.
 *
 * Limitation (documented in TEST_REPORT.md): PGlite is a single-session engine. The socket server serialises
 * clients, so it proves SQL/transaction CORRECTNESS but not true parallel-transaction CONCURRENCY. The bed
 * double-booking race test therefore runs against a real multi-connection server when PG_CONCURRENCY_URL is set.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AddressInfo, createServer } from 'node:net';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

export const SCHEMA_SQL_PATH = join(__dirname, '..', '..', '..', 'database', 'postgres', '001-schema.sql');

export interface PgTestServer {
  url: string;
  db: PGlite;
  /** Runs SQL directly on the engine (setup/assertions), bypassing the socket. */
  exec(sql: string): Promise<void>;
  /** Removes all business rows but keeps reference data (beds, permissions). */
  reset(): Promise<void>;
  stop(): Promise<void>;
}

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

const BUSINESS_TABLES = [
  'ThanhToanHoanTien', 'SePayWebhookEvent', 'PhanHoi', 'DanhGia', 'ThanhToan', 'KhachSuDungDichVu', 'LichHen',
  'GoiDichVu', 'DichVu', 'DanhMuc', 'PhienDangNhap', 'KhoaDangNhap', 'LichSuPhanQuyen', 'TaiKhoanQuyen',
  'KhachHang', 'NhanVien', 'TaiKhoan',
];

/** Starts an in-memory PostgreSQL with the production schema applied and points DATABASE_URL at it. */
export async function startPgTestServer(): Promise<PgTestServer> {
  const db = await PGlite.create();
  await db.exec(readFileSync(SCHEMA_SQL_PATH, 'utf8'));
  const port = await freePort();
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();
  const url = `postgres://postgres@127.0.0.1:${port}/postgres`;
  process.env.DATABASE_URL = url;
  process.env.DB_SSL = 'disable';
  process.env.DB_POOL_MAX = '1';
  return {
    url,
    db,
    exec: async (sql: string) => { await db.exec(sql); },
    reset: async () => {
      await db.exec(BUSINESS_TABLES.map((t) => `DELETE FROM dbo.${t};`).join('\n'));
    },
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}
