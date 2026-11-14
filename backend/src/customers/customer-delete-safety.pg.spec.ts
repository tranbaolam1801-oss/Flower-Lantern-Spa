import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { PasswordService } from '../auth/password.service';
import { DatabaseModule } from '../database.module';
import { DatabaseService } from '../database.service';
import { setup } from '../setup';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';
import { CustomerReadController } from './customer-read.controller';
import { CustomerWriteController } from './customer-write.controller';

jest.setTimeout(120_000);

/**
 * UC_3 "Xóa/Hủy khách hàng": the approved SRS defines NO delete/cancel use case for customers, KhachHang has no status
 * column (deactivating would need a schema change) and a hard delete would break booking/review history. These tests pin the
 * safe state on a real PostgreSQL engine: the API exposes no delete route, every attempt is refused, and no customer,
 * booking, payment or review row is ever changed.
 */
describe('Customer delete/cancel is NOT available and cannot change data', () => {
  let pg: PgTestServer;
  let app: INestApplication;
  let db: DatabaseService;
  const password = randomBytes(18).toString('hex');
  const cookies: Record<string, string> = {};
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const k of ['JWT_SECRET', 'AUTH_SESSION_STORE', 'RATE_LIMIT_ENABLED']) saved[k] = process.env[k];
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    process.env.AUTH_SESSION_STORE = 'sql';
    process.env.RATE_LIMIT_ENABLED = 'false';
    pg = await startPgTestServer();
    const module = await Test.createTestingModule({
      imports: [DatabaseModule, AuthModule], controllers: [CustomerReadController, CustomerWriteController],
    }).compile();
    app = module.createNestApplication();
    setup(app);
    await app.init();
    db = app.get(DatabaseService);
    const hash = await new PasswordService().hash(password);
    await pg.exec(`
      INSERT INTO dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai) VALUES
        ('TK00000001','owner','0900000001','${hash}','Chủ Spa','Hoạt động'),
        ('TK00000002','manager','0900000002','${hash}','Quản lý','Hoạt động'),
        ('TK00000003','staff','0900000003','${hash}','Nhân viên','Hoạt động');
      INSERT INTO dbo.TaiKhoanQuyen(MaTaiKhoan,MaQuyen) VALUES ('TK00000001','Q02'),('TK00000002','Q02'),('TK00000003','Q02');
      INSERT INTO dbo.DanhMuc VALUES ('DM00000001','Da','Hoạt động');
      INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV00000001','DM00000001','Chăm sóc da','Hoạt động');
      INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES ('GV00000001','DV00000001','Gói 60',60,350000);
      INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai) VALUES ('KH00000001','Nguyễn An','0912345678');
      INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan)
        VALUES ('LH00000001','KH00000001','Nguyễn An','0912345678','2030-01-01','10:00','Hoàn thành','Đã thanh toán');
      INSERT INTO dbo.ThanhToan(MaThanhToan,MaLichHen,SoTienThanhToan,NgayGhiNhan,TrangThaiGiaoDich) VALUES ('TT00000001','LH00000001',350000,dbo.vn_now(),'Thành công');
      INSERT INTO dbo.DanhGia(MaDanhGia,MaLichHen,MaKhachHang,MaDichVu,SoSao) VALUES ('DG00000001','LH00000001','KH00000001','DV00000001',5);`);
    for (const [role, phone] of [['owner', '0900000001'], ['manager', '0900000002'], ['staff', '0900000003']]) {
      const res = await request(app.getHttpServer()).post('/api/auth/login').set('X-Spa-Request', '1').send({ phone, password }).expect(200);
      cookies[role] = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    }
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });

  const snapshot = async () => (await db.query<Record<string, unknown>[]>(
    `SELECT (SELECT count(*)::int FROM dbo.KhachHang) AS customers, (SELECT count(*)::int FROM dbo.LichHen) AS bookings,
            (SELECT count(*)::int FROM dbo.ThanhToan) AS payments, (SELECT count(*)::int FROM dbo.DanhGia) AS reviews,
            (SELECT md5(string_agg(k::text, '|' ORDER BY k::text)) FROM dbo.KhachHang k) AS customer_hash`))[0];

  it('every role gets a refusal for DELETE /api/customers/:id and nothing changes', async () => {
    const before = await snapshot();
    for (const role of ['owner', 'manager', 'staff']) {
      for (const [method, url] of [['delete', '/api/customers/KH00000001'], ['delete', '/api/customers/KH99999999'], ['delete', '/api/customers/not-an-id']] as const) {
        const res = await request(app.getHttpServer())[method](url).set('X-Spa-Request', '1').set('Cookie', cookies[role]);
        expect([404, 405]).toContain(res.status);
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it('unauthenticated delete attempts are refused as well (401/403/404), never 2xx', async () => {
    const res = await request(app.getHttpServer()).delete('/api/customers/KH00000001').set('X-Spa-Request', '1');
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(res.status).toBeLessThan(500);
    const noCsrf = await request(app.getHttpServer()).delete('/api/customers/KH00000001').set('Cookie', cookies.owner);
    expect(noCsrf.status).toBe(403);
  });

  it('there is no hidden "deactivate/cancel" route either (POST/PATCH variants are refused or do not change the customer)', async () => {
    const before = await snapshot();
    for (const [method, url] of [['post', '/api/customers/KH00000001/delete'], ['post', '/api/customers/KH00000001/cancel'], ['post', '/api/customers/KH00000001/deactivate']] as const) {
      const res = await request(app.getHttpServer())[method](url).set('X-Spa-Request', '1').set('Cookie', cookies.owner).send({});
      expect(res.status).toBe(404);
    }
    expect(await snapshot()).toEqual(before);
  });

  it('the history stays readable after the refused attempts: detail still shows the customer with its booking', async () => {
    const res = await request(app.getHttpServer()).get('/api/customers/KH00000001').set('Cookie', cookies.manager).expect(200);
    expect(res.body).toMatchObject({ id: 'KH00000001', name: 'Nguyễn An', bookingCount: 1 });
    expect(res.body.recentBookings).toHaveLength(1);
  });

  it('a missing customer still answers 404 on detail (view is unaffected)', async () => {
    await request(app.getHttpServer()).get('/api/customers/KH99999999').set('Cookie', cookies.owner).expect(404);
  });

  it('referential integrity would block a raw delete even if some code tried it (history is protected by the database)', async () => {
    const err = await db.transaction((r) => r.query(`DELETE FROM dbo.KhachHang WHERE MaKhachHang='KH00000001'`)).catch((e) => e as { code?: string; driverError?: { code?: string } });
    expect(err?.driverError?.code ?? err?.code).toBe('23503');
    expect((await snapshot()).customers).toBe(1);
  });
});
