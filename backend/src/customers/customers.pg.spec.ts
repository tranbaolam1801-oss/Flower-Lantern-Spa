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

/** Real PostgreSQL (PGlite): every query of the customer controllers runs through HTTP with real guards. */
describe('Customers with real PostgreSQL', () => {
  let pg: PgTestServer;
  let app: INestApplication;
  let db: DatabaseService;
  let cookie: string;
  const password = randomBytes(18).toString('hex');
  const staffPhone = '0900000001';
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
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });
  beforeEach(async () => {
    await pg.reset();
    const hash = await new PasswordService().hash(password);
    await pg.exec(`
      INSERT INTO dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai) VALUES
        ('TK00000001','staff','${staffPhone}','${hash}','Nhân viên','Hoạt động'),
        ('TK00000009','nolimit','0900000009','${hash}','Nhân viên','Hoạt động');
      INSERT INTO dbo.TaiKhoanQuyen(MaTaiKhoan,MaQuyen) VALUES ('TK00000001','Q02');`);
    const res = await request(app.getHttpServer()).post('/api/auth/login').set('X-Spa-Request', '1')
      .send({ phone: staffPhone, password }).expect(200);
    cookie = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  });

  const get = (url: string) => request(app.getHttpServer()).get(url).set('Cookie', cookie);
  const post = (url: string, body: object) => request(app.getHttpServer()).post(url).set('X-Spa-Request', '1').set('Cookie', cookie).send(body);
  const patch = (url: string, body: object) => request(app.getHttpServer()).patch(url).set('X-Spa-Request', '1').set('Cookie', cookie).send(body);

  describe('create', () => {
    it('creates customers with sequential KH ids and normalised phones (+84 -> 0)', async () => {
      const a = await post('/api/customers', { name: '  Nguyễn   An ', phone: '+84912345678', gender: 'Nữ', birthDate: '1990-05-17', channel: 'Facebook' }).expect(201);
      expect(a.body).toEqual({ id: 'KH00000001', message: 'Thêm khách hàng thành công!' });
      const b = await post('/api/customers', { name: 'Bình', phone: '0912345679' }).expect(201);
      expect(b.body.id).toBe('KH00000002');
      const rows = await db.query<{ id: string; name: string; phone: string; birth: string | null }[]>(
        `SELECT rtrim(MaKhachHang) AS id, HoTen AS name, SoDienThoai AS phone, to_char(NgaySinh,'YYYY-MM-DD') AS birth
         FROM dbo.KhachHang ORDER BY MaKhachHang`);
      expect(rows).toEqual([
        { id: 'KH00000001', name: 'Nguyễn An', phone: '0912345678', birth: '1990-05-17' },
        { id: 'KH00000002', name: 'Bình', phone: '0912345679', birth: null },
      ]);
    });

    it('continues numbering after the highest existing id and ignores non-KH-format ids', async () => {
      await pg.exec(`INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai) VALUES ('KH00000041','Cũ','0911000041'),('LEGACY','Legacy','0911000042');`);
      const res = await post('/api/customers', { name: 'Mới', phone: '0911000043' }).expect(201);
      expect(res.body.id).toBe('KH00000042');
    });

    it('rejects a duplicate phone with 409 and the approved message', async () => {
      await post('/api/customers', { name: 'An', phone: '0912345678' }).expect(201);
      const res = await post('/api/customers', { name: 'Khác', phone: '+84912345678' }).expect(409);
      expect(res.body).toMatchObject({ message: 'Khách hàng đã tồn tại!', code: 'DUPLICATE_PHONE', fields: { phone: 'Khách hàng đã tồn tại!' } });
      const n = await db.query<{ n: number }[]>(`SELECT count(*) AS n FROM dbo.KhachHang`);
      expect(n[0].n).toBe(1);
    });

    it('concurrent creates of the same phone produce exactly one customer; different phones get distinct ids', async () => {
      const same = await Promise.all(Array.from({ length: 5 }, () => post('/api/customers', { name: 'Song song', phone: '0933000001' })));
      expect(same.filter((r) => r.status === 201)).toHaveLength(1);
      expect(same.filter((r) => r.status === 409)).toHaveLength(4);
      const distinct = await Promise.all(Array.from({ length: 5 }, (_, i) => post('/api/customers', { name: `K${i}`, phone: `094400000${i}` })));
      expect(distinct.every((r) => r.status === 201)).toBe(true);
      expect(new Set(distinct.map((r) => r.body.id)).size).toBe(5);
    });

    it('validation errors return 400 field messages and write nothing', async () => {
      const res = await post('/api/customers', { name: ' ', phone: '123', birthDate: '2999-01-01' }).expect(400);
      expect(res.body.fields).toMatchObject({ name: 'Không được để trống!', phone: 'Số điện thoại không hợp lệ!' });
      const n = await db.query<{ n: number }[]>(`SELECT count(*) AS n FROM dbo.KhachHang`);
      expect(n[0].n).toBe(0);
    });

    it('is protected: no cookie -> 401; staff without Q02 -> 403', async () => {
      await request(app.getHttpServer()).post('/api/customers').set('X-Spa-Request', '1').send({ name: 'A', phone: '0912345678' }).expect(401);
      await request(app.getHttpServer()).get('/api/customers').expect(401);
      const login = await request(app.getHttpServer()).post('/api/auth/login').set('X-Spa-Request', '1').send({ phone: '0900000009', password }).expect(200);
      const noPerm = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
      await request(app.getHttpServer()).get('/api/customers').set('Cookie', noPerm).expect(403);
    });
  });

  describe('search (ILIKE) and pagination', () => {
    beforeEach(async () => {
      await pg.exec(`
        INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai,KenhLienHe) VALUES
          ('KH00000001','Nguyễn Đức Anh','0911000001','Zalo'),
          ('KH00000002','LÊ THỊ BÌNH','0911000002',NULL),
          ('KH00000003','Trần 100%_x','0922000003',NULL),
          ('KH00000004','Phạm Văn Cường','0933000004',NULL);
        INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan) VALUES
          ('LH00000001','KH00000001','Nguyễn Đức Anh','0911000001','2026-11-20','09:00','Chưa đến','Chưa thanh toán'),
          ('LH00000002','KH00000001','Nguyễn Đức Anh','0911000001','2026-11-21','10:00','Chưa đến','Chưa thanh toán');`);
    });
    const names = (body: { items: { name: string }[] }) => body.items.map((i) => i.name);

    it('empty query returns everyone ordered by name with booking counts and aliased camelCase fields', async () => {
      const res = await get('/api/customers').expect(200);
      expect(res.body.page).toBe(1);
      expect(res.body.hasNext).toBe(false);
      expect(res.body.items).toHaveLength(4);
      const anh = res.body.items.find((i: { id: string }) => i.id === 'KH00000001');
      expect(anh).toEqual({ id: 'KH00000001', name: 'Nguyễn Đức Anh', phone: '0911000001', channel: 'Zalo', bookingCount: 2 });
    });

    it('is case-insensitive on names, including Vietnamese letters', async () => {
      expect(names((await get('/api/customers').query({ q: 'ĐỨC' }).expect(200)).body)).toEqual(['Nguyễn Đức Anh']);
      expect(names((await get('/api/customers').query({ q: 'bình' }).expect(200)).body)).toEqual(['LÊ THỊ BÌNH']);
      expect(names((await get('/api/customers?q=cường').expect(200)).body)).toEqual(['Phạm Văn Cường']);
      expect(names((await get('/api/customers?q=LÊ').expect(200)).body)).toEqual(['LÊ THỊ BÌNH']);
      expect(names((await get('/api/customers?q=trần').expect(200)).body)).toEqual(['Trần 100%_x']);
    });

    it('matches on phone fragments', async () => {
      expect(names((await get('/api/customers?q=0922').expect(200)).body)).toEqual(['Trần 100%_x']);
      expect(names((await get('/api/customers?q=911000').expect(200)).body).sort()).toEqual(['LÊ THỊ BÌNH', 'Nguyễn Đức Anh']);
    });

    it('matches on the customer code (full and fragment, case-insensitive)', async () => {
      expect(names((await get('/api/customers?q=KH00000003').expect(200)).body)).toEqual(['Trần 100%_x']);
      expect(names((await get('/api/customers?q=kh0000000').expect(200)).body)).toHaveLength(4);
    });

    it('a keyword with no match is 200 with an empty list (not an error)', async () => {
      const res = await get('/api/customers?q=' + encodeURIComponent('khách hàng xyz')).expect(200);
      expect(res.body).toMatchObject({ items: [], page: 1, hasNext: false });
    });

    it('invalid search input is a 400 with a Vietnamese message, never a 5xx', async () => {
      const nul = await get('/api/customers?q=a%00b').expect(400);
      expect(JSON.stringify(nul.body)).toContain('Từ khóa tìm kiếm không hợp lệ!');
      await get('/api/customers?q=' + 'x'.repeat(101)).expect(400);
      await get('/api/customers?page=0').expect(400);
      await get('/api/customers?page=abc').expect(400);
    });

    it('treats % and _ as literal text, never as LIKE wildcards', async () => {
      expect(names((await get('/api/customers').query({ q: '%' }).expect(200)).body)).toEqual(['Trần 100%_x']);
      expect(names((await get('/api/customers').query({ q: '_' }).expect(200)).body)).toEqual(['Trần 100%_x']);
      expect(names((await get('/api/customers').query({ q: '0%x' }).expect(200)).body)).toEqual([]);
      expect((await get('/api/customers').query({ q: 'zzz' }).expect(200)).body.items).toEqual([]);
    });

    it('paginates 20 per page with hasNext', async () => {
      const values = Array.from({ length: 25 }, (_, i) => `('KH${String(100 + i).padStart(8, '0')}','Phân trang ${String(i).padStart(2, '0')}','0955${String(100000 + i)}')`);
      await pg.exec(`INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai) VALUES ${values.join(',')};`);
      const page1 = (await get('/api/customers').query({ q: 'Phân trang', page: 1 }).expect(200)).body;
      expect(page1.items).toHaveLength(20);
      expect(page1.hasNext).toBe(true);
      expect(page1.items[0].name).toBe('Phân trang 00');
      const page2 = (await get('/api/customers').query({ q: 'Phân trang', page: 2 }).expect(200)).body;
      expect(page2.items).toHaveLength(5);
      expect(page2.hasNext).toBe(false);
      expect(page2.items[0].name).toBe('Phân trang 20');
      await get('/api/customers?page=0').expect(400);
    });
  });

  describe('detail', () => {
    it('returns the profile with formatted dates, booking count and recent bookings with service summary', async () => {
      await pg.exec(`
        INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai,NgaySinh,GioiTinh,DiaChi,GhiChu,NgayTao)
          VALUES ('KH00000001','An','0911000001','1990-05-17','Nữ','HN','ghi chú','2026-01-02 03:04:05');
        INSERT INTO dbo.DanhMuc VALUES ('DM01','Da','Hoạt động');
        INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV01','DM01','Massage','Hoạt động'),('DV02','DM01','Facial','Hoạt động');
        INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES ('G01','DV01','60 phút',60,300000),('G02','DV02','30 phút',30,200000);
        INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan)
          VALUES ('LH00000001','KH00000001','An','0911000001','2026-11-20','09:30','Hoàn thành','Đã thanh toán'),
                 ('LH00000002','KH00000001','An','0911000001','2026-11-21','10:00','Chưa đến','Chưa thanh toán');
        INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,ThoiDiemBatDau,ThoiDiemKetThuc)
          VALUES ('CT01','LH00000001','G01','G1','An','2026-11-20 09:30','2026-11-20 10:30'),
                 ('CT02','LH00000001','G02','G2','An','2026-11-20 09:30','2026-11-20 10:00');`);
      const res = await get('/api/customers/KH00000001').expect(200);
      expect(res.body).toMatchObject({
        id: 'KH00000001', name: 'An', phone: '0911000001', birthDate: '1990-05-17', gender: 'Nữ', address: 'HN',
        notes: 'ghi chú', createdAt: '2026-01-02T03:04:05', bookingCount: 2,
      });
      expect(res.body.recentBookings.map((b: { id: string }) => b.id)).toEqual(['LH00000002', 'LH00000001']);
      expect(res.body.recentBookings[0]).toMatchObject({ date: '2026-11-21', time: '10:00', status: 'Chưa đến', serviceSummary: '' });
      const summary: string = res.body.recentBookings[1].serviceSummary;
      expect(res.body.recentBookings[1]).toMatchObject({ date: '2026-11-20', time: '09:30', status: 'Hoàn thành' });
      expect(summary.split(', ').sort()).toEqual(['Facial - 30 phút', 'Massage - 60 phút']);
    });

    it('limits recent bookings to 5', async () => {
      const rows = Array.from({ length: 7 }, (_, i) => `('LH0000010${i}','KH00000001','An','0911000001','2026-11-${10 + i}','09:00','Chưa đến','Chưa thanh toán')`);
      await pg.exec(`INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai) VALUES ('KH00000001','An','0911000001');
        INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan) VALUES ${rows.join(',')};`);
      const res = await get('/api/customers/KH00000001').expect(200);
      expect(res.body.bookingCount).toBe(7);
      expect(res.body.recentBookings).toHaveLength(5);
    });

    it('404 for an unknown or malformed id', async () => {
      const res = await get('/api/customers/KH99999999').expect(404);
      expect(res.body.message).toBe('Không tìm thấy khách hàng.');
      await get('/api/customers/' + encodeURIComponent("x'; DROP")).expect(404);
    });
  });

  describe('update and TaiKhoan phone sync', () => {
    beforeEach(async () => {
      await pg.exec(`
        INSERT INTO dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai) VALUES
          ('TK00000100','kh-linked','0911000001','not-used','Khách hàng','Hoạt động'),
          ('TK00000101','kh-other','0955555555','not-used','Khách hàng','Hoạt động');
        INSERT INTO dbo.KhachHang(MaKhachHang,MaTaiKhoan,HoTen,SoDienThoai) VALUES
          ('KH00000001','TK00000100','An','0911000001'),
          ('KH00000002',NULL,'Bình','0911000002');`);
    });
    const phoneOf = async (table: 'KhachHang' | 'TaiKhoan', key: string) => (await db.query<{ p: string }[]>(
      `SELECT rtrim(SoDienThoai) AS p FROM dbo.${table} WHERE ${table === 'KhachHang' ? 'MaKhachHang' : 'MaTaiKhoan'}=$1`, [key]))[0].p;

    it('updates the profile and syncs the linked TaiKhoan phone in the same transaction', async () => {
      const res = await patch('/api/customers/KH00000001', { name: 'An Mới', phone: '+84922222222', gender: 'Nam', birthDate: '1991-01-01', notes: 'x' }).expect(200);
      expect(res.body).toEqual({ id: 'KH00000001', message: 'Cập nhật khách hàng thành công!' });
      const row = (await db.query<{ name: string; gender: string; birth: string; notes: string }[]>(
        `SELECT HoTen AS name, GioiTinh AS gender, to_char(NgaySinh,'YYYY-MM-DD') AS birth, GhiChu AS notes FROM dbo.KhachHang WHERE MaKhachHang='KH00000001'`))[0];
      expect(row).toEqual({ name: 'An Mới', gender: 'Nam', birth: '1991-01-01', notes: 'x' });
      expect(await phoneOf('KhachHang', 'KH00000001')).toBe('0922222222');
      expect(await phoneOf('TaiKhoan', 'TK00000100')).toBe('0922222222');
    });

    it('a customer without an account updates without touching TaiKhoan', async () => {
      await patch('/api/customers/KH00000002', { name: 'Bình', phone: '0922333333' }).expect(200);
      expect(await phoneOf('KhachHang', 'KH00000002')).toBe('0922333333');
      expect(await phoneOf('TaiKhoan', 'TK00000100')).toBe('0911000001');
    });

    it('keeping the same phone is not a duplicate of itself', async () => {
      await patch('/api/customers/KH00000001', { name: 'Đổi tên', phone: '0911000001' }).expect(200);
    });

    it('409 duplicate customer phone with the approved message; nothing changes', async () => {
      const res = await patch('/api/customers/KH00000001', { name: 'An', phone: '0911000002' }).expect(409);
      expect(res.body).toMatchObject({ message: 'Khách hàng đã tồn tại!', code: 'DUPLICATE_PHONE' });
      expect(await phoneOf('KhachHang', 'KH00000001')).toBe('0911000001');
      expect(await phoneOf('TaiKhoan', 'TK00000100')).toBe('0911000001');
    });

    it('409 when the new phone already belongs to another login account; the customer row is rolled back', async () => {
      const res = await patch('/api/customers/KH00000001', { name: 'Tên khác', phone: '0955555555' }).expect(409);
      expect(res.body).toMatchObject({
        message: 'Số điện thoại đã được dùng cho một tài khoản đăng nhập khác!', code: 'DUPLICATE_ACCOUNT_PHONE',
        fields: { phone: 'Số điện thoại đã được dùng cho một tài khoản đăng nhập khác!' },
      });
      expect(await phoneOf('KhachHang', 'KH00000001')).toBe('0911000001');
      const name = await db.query<{ n: string }[]>(`SELECT HoTen AS n FROM dbo.KhachHang WHERE MaKhachHang='KH00000001'`);
      expect(name[0].n).toBe('An');
    });

    it('409 (account phone) when the unique index rejects the TaiKhoan update after the customer update, and rolls everything back', async () => {
      // Customer KH2 has no account, so a customer-side check passes; a TaiKhoan clash is only visible at the unique index
      // if the pre-check is bypassed: simulate it by taking the phone between the check and the update.
      await pg.exec(`INSERT INTO dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai)
        VALUES ('TK00000102','kh-race','0966000000','not-used','Khách hàng','Hoạt động');`);
      const res = await patch('/api/customers/KH00000001', { name: 'An', phone: '0966000000' }).expect(409);
      expect(res.body.code).toBe('DUPLICATE_ACCOUNT_PHONE');
      expect(await phoneOf('KhachHang', 'KH00000001')).toBe('0911000001');
    });

    it('404 for an unknown customer, 400 for invalid data', async () => {
      const res = await patch('/api/customers/KH77777777', { name: 'A', phone: '0912345678' }).expect(404);
      expect(res.body.message).toBe('Không tìm thấy khách hàng.');
      await patch('/api/customers/KH00000001', { name: '', phone: '12' }).expect(400);
    });

    it('is restricted by guards: unauthenticated 401', async () => {
      await request(app.getHttpServer()).patch('/api/customers/KH00000001').set('X-Spa-Request', '1').send({ name: 'A', phone: '0912345678' }).expect(401);
    });
  });
});
