import { DatabaseService } from '../database.service';
import { returnedRows, affectedRows } from '../common/pg-result';
import { isUniqueViolation } from '../common/db-errors';
import { PgTestServer, startPgTestServer } from './pg-test-server';

jest.setTimeout(120_000);

describe('PostgreSQL foundation (real engine via PGlite)', () => {
  let pg: PgTestServer;
  let db: DatabaseService;

  beforeAll(async () => {
    pg = await startPgTestServer();
    db = new DatabaseService();
  });
  afterAll(async () => {
    await db.onApplicationShutdown();
    await pg.stop();
  });
  beforeEach(async () => pg.reset());

  it('applies the full schema: 19 tables in dbo, 15 beds, 6 permissions', async () => {
    const t = await db.query<{ n: number }[]>(`SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='dbo'`);
    expect(t[0].n).toBe(19);
    const beds = await db.query<{ n: number }[]>('SELECT count(*) AS n FROM dbo.Giuong');
    expect(beds[0].n).toBe(15);
    const q = await db.query<{ n: number }[]>('SELECT count(*) AS n FROM dbo.Quyen');
    expect(q[0].n).toBe(6);
  });

  it('PascalCase unquoted identifiers resolve; unaliased columns come back lowercase; quoted aliases keep case', async () => {
    const rows = await db.query<Record<string, unknown>[]>(`SELECT MaGiuong, rtrim(MaGiuong) AS "bedId" FROM dbo.Giuong WHERE MaGiuong=$1`, ['G1']);
    expect(rows[0]).toEqual({ magiuong: 'G1        ', bedId: 'G1' });
  });

  it('parses timestamp as UTC wall-clock, numeric and bigint as numbers (old driver behaviour)', async () => {
    const rows = await db.query<{ ts: Date; money: number; big: number }[]>(
      `SELECT '2026-11-12 10:30:00'::timestamp(3) AS ts, 350000.0000::numeric(19,4) AS money, 7::bigint AS big`);
    expect(rows[0].ts.toISOString()).toBe('2026-11-12T10:30:00.000Z');
    expect(rows[0].money).toBe(350000);
    expect(rows[0].big).toBe(7);
  });

  it('dbo.vn_now() is Vietnam wall-clock time (UTC+7) even on a UTC server', async () => {
    const rows = await db.query<{ diff: number }[]>(`SELECT round(extract(epoch FROM (dbo.vn_now() - dbo.utc_now())) / 3600) AS diff`);
    expect(Number(rows[0].diff)).toBe(7);
  });

  it('transaction() commits on success and rolls back on error; UPDATE results unwrap via affectedRows', async () => {
    await db.transaction(async (r) => {
      await r.query(`INSERT INTO dbo.DanhMuc(MaDanhMuc,TenDanhMuc,TrangThai) VALUES ($1,$2,$3)`, ['DM01', 'Chăm sóc da', 'Hoạt động']);
    });
    await expect(db.transaction(async (r) => {
      await r.query(`INSERT INTO dbo.DanhMuc(MaDanhMuc,TenDanhMuc,TrangThai) VALUES ($1,$2,$3)`, ['DM02', 'Massage', 'Hoạt động']);
      throw new Error('boom');
    })).rejects.toThrow('boom');
    const rows = await db.query<{ id: string }[]>(`SELECT rtrim(MaDanhMuc) AS id FROM dbo.DanhMuc ORDER BY 1`);
    expect(rows.map((r) => r.id)).toEqual(['DM01']);
    const upd = await db.transaction((r) => r.query(`UPDATE dbo.DanhMuc SET TrangThai=$1 WHERE MaDanhMuc=$2 RETURNING rtrim(MaDanhMuc) AS id`, ['Ngừng', 'DM01']));
    expect(affectedRows(upd)).toBe(1);
    expect(returnedRows<{ id: string }>(upd)[0].id).toBe('DM01');
  });

  it('unique violations are recognised (23505), including the case-insensitive service name', async () => {
    await pg.exec(`INSERT INTO dbo.DanhMuc VALUES ('DM01','Da','Hoạt động');
      INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV01','DM01','Massage','Hoạt động');`);
    const err = await db.transaction((r) => r.query(
      `INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV02','DM01','MASSAGE','Hoạt động')`)).catch((e) => e);
    expect(isUniqueViolation(err)).toBe(true);
  });

  it('phone CHECK constraints reject non-digits (T-SQL NOT LIKE [^0-9] equivalent)', async () => {
    const err = await db.transaction((r) => r.query(
      `INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai) VALUES ('KH01','A','09x1234567')`)).catch((e) => e);
    expect(err?.driverError?.code ?? err?.code).toBe('23514');
  });
});
