import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { DatabaseService } from './database.service';
import { PgTestServer, startPgTestServer } from './testing/pg-test-server';
import './entities';

jest.setTimeout(120_000);

// Replaces the SQL Server-only schema.sql.integration.spec.ts: audits database/postgres/001-schema.sql
// on a real PostgreSQL engine (PGlite) and checks that the documentation-only entities still match it.
describe('PostgreSQL schema (database/postgres/001-schema.sql)', () => {
  let pg: PgTestServer;
  let db: DatabaseService;
  const q = <T>(sql: string, p: unknown[] = []) => db.query<T[]>(sql, p);

  beforeAll(async () => {
    pg = await startPgTestServer();
    db = new DatabaseService();
  });
  afterAll(async () => {
    await db.onApplicationShutdown();
    await pg.stop();
  });

  it('creates exactly the 19 expected tables in schema dbo', async () => {
    const rows = await q<{ t: string }>(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema='dbo' AND table_type='BASE TABLE' ORDER BY 1`);
    expect(rows.map((r) => r.t)).toEqual([
      'danhgia', 'danhmuc', 'dichvu', 'giuong', 'goidichvu', 'khachhang', 'khachsudungdichvu', 'khoadangnhap', 'lichhen',
      'lichsuphanquyen', 'nhanvien', 'phanhoi', 'phiendangnhap', 'quyen', 'sepaywebhookevent', 'taikhoan', 'taikhoanquyen',
      'thanhtoan', 'thanhtoanhoantien',
    ]);
  });

  it('declares the key foreign keys', async () => {
    const rows = await q<{ c: string; r: string }>(
      `SELECT conrelid::regclass::text AS c, confrelid::regclass::text AS r FROM pg_constraint WHERE contype='f' AND connamespace='dbo'::regnamespace`);
    const fks = new Set(rows.map((r) => `${r.c}->${r.r}`));
    for (const fk of [
      'dbo.dichvu->dbo.danhmuc', 'dbo.goidichvu->dbo.dichvu', 'dbo.khachsudungdichvu->dbo.lichhen', 'dbo.khachsudungdichvu->dbo.goidichvu',
      'dbo.khachsudungdichvu->dbo.giuong', 'dbo.lichhen->dbo.khachhang', 'dbo.thanhtoan->dbo.lichhen', 'dbo.danhgia->dbo.lichhen',
      'dbo.danhgia->dbo.khachhang', 'dbo.danhgia->dbo.dichvu', 'dbo.phanhoi->dbo.danhgia', 'dbo.phanhoi->dbo.nhanvien',
      'dbo.nhanvien->dbo.taikhoan', 'dbo.khachhang->dbo.taikhoan', 'dbo.taikhoanquyen->dbo.taikhoan', 'dbo.taikhoanquyen->dbo.quyen',
      'dbo.lichsuphanquyen->dbo.taikhoan', 'dbo.phiendangnhap->dbo.taikhoan', 'dbo.sepaywebhookevent->dbo.thanhtoan',
      'dbo.thanhtoanhoantien->dbo.thanhtoan', 'dbo.thanhtoanhoantien->dbo.taikhoan',
    ]) expect(fks).toContain(fk);
  });

  it('declares the unique and partial/functional indexes', async () => {
    const rows = await q<{ n: string; d: string }>(`SELECT indexname AS n, indexdef AS d FROM pg_indexes WHERE schemaname='dbo'`);
    const def = (n: string) => rows.find((r) => r.n === n)?.d ?? '';
    expect(def('ux_nhanvien_email')).toMatch(/UNIQUE.*\(email\) WHERE \(email IS NOT NULL\)/);
    expect(def('ux_dichvu_tendichvu')).toMatch(/UNIQUE.*\(lower\(\(tendichvu\)::text\)\)/);
    expect(def('ux_nhanvien_mataikhoan')).toMatch(/UNIQUE.*WHERE \(mataikhoan IS NOT NULL\)/);
    expect(def('ux_khachhang_mataikhoan')).toMatch(/UNIQUE.*WHERE \(mataikhoan IS NOT NULL\)/);
    expect(def('ux_thanhtoan_mathamchieu')).toMatch(/UNIQUE.*WHERE \(mathamchieu IS NOT NULL\)/);
    expect(def('ux_thanhtoan_nhacungcap_giaodich')).toMatch(/UNIQUE.*WHERE \(magiaodichnhacungcap IS NOT NULL\)/);
    for (const n of ['ux_taikhoan_sodienthoai', 'ux_khachhang_sodienthoai', 'ux_nhanvien_sodienthoai', 'ux_danhgia_lichhen', 'ux_phanhoi_danhgia'])
      expect(def(n)).toMatch(/UNIQUE/);
    expect(def('ix_khachsudungdichvu_giuong_thoigian')).toContain('magiuong, thoidiembatdau, thoidiemketthuc');
  });

  it('seeds 15 beds G1-G15 and permissions Q01-Q06', async () => {
    const beds = await q<{ id: string }>('SELECT rtrim(MaGiuong) AS id FROM dbo.Giuong');
    expect(beds.map((b) => b.id).sort()).toEqual(Array.from({ length: 15 }, (_, i) => `G${i + 1}`).sort());
    const perms = await q<{ id: string }>('SELECT rtrim(MaQuyen) AS id FROM dbo.Quyen ORDER BY 1');
    expect(perms.map((p) => p.id)).toEqual(['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06']);
  });

  it('enforces the case-insensitive service name and filtered email uniqueness at the database level', async () => {
    await pg.exec(`INSERT INTO dbo.DanhMuc VALUES ('DM01','Da','Hoạt động');
      INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV01','DM01','Massage','Hoạt động');`);
    await expect(db.transaction((r) => r.query(`INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV02','DM01','mAsSaGe','Hoạt động')`)))
      .rejects.toMatchObject({ driverError: { code: '23505' } });
    await pg.exec(`INSERT INTO dbo.TaiKhoan VALUES ('TK01','u1','0900000001','h','Nhân viên','Hoạt động'),('TK02','u2','0900000002','h','Nhân viên','Hoạt động');
      INSERT INTO dbo.NhanVien(MaNhanVien,MaTaiKhoan,HoTen,SoDienThoai,Email,TrangThaiLamViec,TrangThaiHoSo) VALUES
        ('NV01','TK01','A','0900000001',NULL,'Đang làm việc','Hoạt động'),('NV02','TK02','B','0900000002',NULL,'Đang làm việc','Hoạt động');`);
    // two NULL emails are allowed (partial index); duplicate non-NULL is not.
    await pg.exec(`UPDATE dbo.NhanVien SET Email='a@x.vn' WHERE MaNhanVien='NV01'`);
    await expect(db.transaction((r) => r.query(`UPDATE dbo.NhanVien SET Email='a@x.vn' WHERE MaNhanVien='NV02'`)))
      .rejects.toMatchObject({ driverError: { code: '23505' } });
    await pg.reset();
  });

  it('entity metadata (documentation only) matches the physical tables and columns', async () => {
    const storage = getMetadataArgsStorage();
    const physical = await q<{ t: string; c: string }>(`SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema='dbo'`);
    const byTable = new Map<string, Set<string>>();
    for (const r of physical) byTable.set(r.t, (byTable.get(r.t) ?? new Set()).add(r.c));
    expect(storage.tables.length).toBe(17);
    for (const t of storage.tables) {
      expect(t.schema).toBe('dbo');
      const cols = byTable.get(t.name as string);
      expect(cols).toBeDefined();
      const mapped = storage.columns.filter((c) => c.target === t.target).map((c) => c.options.name as string);
      for (const name of mapped) expect({ table: t.name, column: name, exists: cols!.has(name) }).toEqual({ table: t.name, column: name, exists: true });
      expect({ table: t.name, mapped: mapped.length }).toEqual({ table: t.name, mapped: cols!.size });
    }
  });
});
