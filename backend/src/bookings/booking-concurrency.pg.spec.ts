/**
 * True multi-connection race test. PGlite serialises sessions, so it cannot prove parallel-transaction safety;
 * this suite runs only when PG_CONCURRENCY_URL points at a real PostgreSQL (scratch database, e.g. a local server
 * or a throw-away Neon branch). Otherwise it is SKIPPED (reported as skipped, never as passed).
 * Optional: PG_CONCURRENCY_SSL=disable for a local server without TLS.
 */
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { QueryRunner } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { SCHEMA_SQL_PATH } from '../testing/pg-test-server';
import { BookingTransactionService } from './booking-transaction.service';

const url = process.env.PG_CONCURRENCY_URL;
const suite = url ? describe : describe.skip;

suite('REAL multi-connection PostgreSQL bed-lock concurrency (skipped unless PG_CONCURRENCY_URL is set)', () => {
  const key = 'Z' + randomBytes(4).toString('hex'); // 9 chars, fits char(10)
  let db: DatabaseService;
  let service: BookingTransactionService;
  let admin: Client;
  const noSsl = process.env.PG_CONCURRENCY_SSL === 'disable';

  beforeAll(async () => {
    admin = new Client({ connectionString: url, ssl: noSsl ? false : { rejectUnauthorized: true } });
    await admin.connect();
    await admin.query(readFileSync(SCHEMA_SQL_PATH, 'utf8')); // idempotent
    await admin.query(`INSERT INTO dbo.DanhMuc VALUES ($1,'Concurrency','Hoạt động')`, [key]);
    await admin.query(`INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ($1::char(10),$1::char(10),$1::varchar,'Hoạt động')`, [key]);
    await admin.query(`INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES ($1::char(10),$1::char(10),'x',60,1)`, [key]);
    await admin.query(`INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai) VALUES ($1,'x','0900000000')`, [key]);
    await admin.query(`INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan)
      VALUES ($1::char(10),$1::char(10),'x','0900000000','2099-12-21','09:00','Chưa đến','Chưa thanh toán')`, [key]);
    process.env.DATABASE_URL = url;
    process.env.DB_POOL_MAX = '10';
    process.env.DB_SSL = noSsl ? 'disable' : 'require';
    db = new DatabaseService();
    service = new BookingTransactionService(db);
  }, 60_000);

  afterAll(async () => {
    await db?.onApplicationShutdown();
    if (admin) {
      await admin.query('DELETE FROM dbo.KhachSuDungDichVu WHERE MaLichHen=$1', [key]);
      await admin.query('DELETE FROM dbo.LichHen WHERE MaLichHen=$1', [key]);
      await admin.query('DELETE FROM dbo.KhachHang WHERE MaKhachHang=$1', [key]);
      await admin.query('DELETE FROM dbo.GoiDichVu WHERE MaGoi=$1', [key]);
      await admin.query('DELETE FROM dbo.DichVu WHERE MaDichVu=$1', [key]);
      await admin.query('DELETE FROM dbo.DanhMuc WHERE MaDanhMuc=$1', [key]);
      await admin.end();
    }
  }, 60_000);

  it('exactly one of 8 simultaneous overlapping reservations of the same bed succeeds', async () => {
    const slot = { bedId: 'G15', startsAt: '2099-12-21T09:00:00', endsAt: '2099-12-21T10:00:00' };
    const write = async (r: QueryRunner) => {
      await r.query(`INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,ThoiDiemBatDau,ThoiDiemKetThuc)
        VALUES ($1,$2,$2,$3,'x',$4::timestamp,$5::timestamp)`, ['C' + randomBytes(4).toString('hex'), key, slot.bedId, slot.startsAt, slot.endsAt]);
    };
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => service.reserve([slot], write)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(ConflictException);
    const n = await admin.query('SELECT count(*)::int AS n FROM dbo.KhachSuDungDichVu WHERE MaLichHen=$1', [key]);
    expect(n.rows[0].n).toBe(1);
  }, 60_000);
});
