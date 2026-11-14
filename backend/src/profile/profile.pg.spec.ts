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
import { ImageExtension, ImageStorage } from '../uploads/image-storage';
import { ProfileController } from './profile.controller';
import { AVATAR_STORAGE, ProfileService } from './profile.service';

jest.setTimeout(120_000);

class MemoryStorage implements ImageStorage {
  files = new Map<string, Buffer>();
  fail = false;
  async save(bytes: Buffer, extension: ImageExtension) {
    if (this.fail) throw new Error('boom');
    const name = `${randomBytes(16).toString('hex')}.${extension}`;
    this.files.set(name, bytes);
    return name;
  }
  async read(name: string) { return this.files.get(name) ?? null; }
  async remove(name: string) { this.files.delete(name); }
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(64)]);
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([0x20, 0, 0, 0]), Buffer.from('WEBP', 'latin1'), randomBytes(40)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);
const ROLES = [
  ['owner', 'Chủ Spa', '0900000001', 'TK00000001', 'NV00000001'],
  ['manager', 'Quản lý', '0900000002', 'TK00000002', 'NV00000002'],
  ['staff', 'Nhân viên', '0900000003', 'TK00000003', 'NV00000003'],
  ['customer', 'Khách hàng', '0900000004', 'TK00000004', 'KH00000001'],
] as const;

describe('Profile API (all 4 roles) on real PostgreSQL with migration 006', () => {
  let pg: PgTestServer;
  let app: INestApplication;
  let db: DatabaseService;
  const storage = new MemoryStorage();
  const password = randomBytes(18).toString('hex');
  const cookies: Record<string, string> = {};
  const saved: Record<string, string | undefined> = {};
  const http = () => request(app.getHttpServer());
  const as = (role: string) => ({ Cookie: cookies[role], 'X-Spa-Request': '1' });

  beforeAll(async () => {
    for (const k of ['JWT_SECRET', 'AUTH_SESSION_STORE', 'RATE_LIMIT_ENABLED']) saved[k] = process.env[k];
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    process.env.AUTH_SESSION_STORE = 'sql';
    process.env.RATE_LIMIT_ENABLED = 'false';
    pg = await startPgTestServer({ profile: true });
    const module = await Test.createTestingModule({
      imports: [DatabaseModule, AuthModule], controllers: [ProfileController], providers: [ProfileService, { provide: AVATAR_STORAGE, useValue: storage }],
    }).compile();
    app = module.createNestApplication();
    setup(app);
    await app.init();
    db = app.get(DatabaseService);
    const hash = await new PasswordService().hash(password);
    const values = ROLES.map(([u, role, phone, id]) => `('${id}','${u}','${phone}','${hash}','${role}','Hoạt động')`).join(',');
    await pg.exec(`
      INSERT INTO dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai) VALUES ${values};
      INSERT INTO dbo.TaiKhoanQuyen(MaTaiKhoan,MaQuyen) VALUES ('TK00000002','Q01'),('TK00000003','Q01');
      INSERT INTO dbo.NhanVien(MaNhanVien,MaTaiKhoan,HoTen,SoDienThoai,Email,TrangThaiLamViec,TrangThaiHoSo) VALUES
        ('NV00000001','TK00000001','Chủ Spa','0900000001','owner@example.com','Đang làm việc','Hoạt động'),
        ('NV00000002','TK00000002','Quản Lý Một','0900000002',NULL,'Đang làm việc','Hoạt động'),
        ('NV00000003','TK00000003','Nhân Viên Một','0900000003',NULL,'Đang làm việc','Hoạt động');
      INSERT INTO dbo.KhachHang(MaKhachHang,MaTaiKhoan,HoTen,SoDienThoai) VALUES ('KH00000001','TK00000004','Khách Một','0900000004');`);
    for (const [u, , phone] of ROLES) {
      const res = await http().post('/api/auth/login').set('X-Spa-Request', '1').send({ phone, password }).expect(200);
      cookies[u] = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    }
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });

  it.each(ROLES)('%s reads ONLY their own profile (GET /api/me)', async (u, role, phone, _id, entity) => {
    const res = await http().get('/api/me').set(as(u)).expect(200);
    expect(res.body.profile).toMatchObject({ role, phone, entityId: entity, status: 'Hoạt động', avatarUrl: null });
    expect(res.body.profile.editable).toMatchObject({ fullName: true, avatar: true, email: true });
  });

  it('requires a session', async () => {
    await http().get('/api/me').expect(401);
    await http().patch('/api/me').set('X-Spa-Request', '1').send({ fullName: 'Ai Đó' }).expect(401);
    await http().post('/api/me/avatar').set('X-Spa-Request', '1').set('Content-Type', 'image/png').send(PNG).expect(401);
  });

  it.each(ROLES)('%s updates name, email, gender, birth date and address, and it persists (re-read from SQL)', async (u, _r, _p, _i, entity) => {
    const res = await http().patch('/api/me').set(as(u)).send({ fullName: `  Tên   Mới ${u} `, email: `${u}.new@example.com`, gender: 'Nữ', birthDate: '1990-05-20', address: 'Hội An' }).expect(200);
    expect(res.body.profile).toMatchObject({ fullName: `Tên Mới ${u}`, email: `${u}.new@example.com`, gender: 'Nữ', birthDate: '1990-05-20', address: 'Hội An' });
    const table = u === 'customer' ? 'KhachHang' : 'NhanVien';
    const key = u === 'customer' ? 'MaKhachHang' : 'MaNhanVien';
    const rows = await db.query<{ HoTen: string; Email: string }[]>(`SELECT HoTen, Email FROM dbo.${table} WHERE ${key}=$1`, [entity]);
    expect(Object.values(rows[0])).toEqual([`Tên Mới ${u}`, `${u}.new@example.com`]);
    // the session/guard now reports the new name too (header sync)
    const me = await http().get('/api/auth/me').set(as(u)).expect(200);
    expect(me.body.user.fullName).toBe(`Tên Mới ${u}`);
  });

  it('validation: bad name/email/date are rejected (400) and nothing changes', async () => {
    const before = (await http().get('/api/me').set(as('staff'))).body.profile;
    for (const body of [{ fullName: 'A' }, { fullName: 'x'.repeat(51) }, { email: 'not-an-email' }, { birthDate: '2999-01-01' }, { birthDate: '2020-02-31' }, { gender: 'Robot' }, { address: 'a'.repeat(256) }]) {
      await http().patch('/api/me').set(as('staff')).send(body).expect(400);
    }
    expect((await http().get('/api/me').set(as('staff'))).body.profile).toEqual(before);
  });

  it('cannot change role, permissions, status, ids, phone or password through the profile API (whitelist → 400)', async () => {
    for (const field of [{ role: 'Chủ Spa' }, { permissions: ['Q05'] }, { status: 'Hoạt động' }, { trangThai: 'x' }, { id: 'TK00000001' }, { userId: 'TK00000001' }, { entityId: 'NV00000001' }, { phone: '0999999999' }, { password: 'x', passwordHash: 'y' }, { vaiTro: 'Chủ Spa' }]) {
      await http().patch('/api/me').set(as('staff')).send({ fullName: 'Nhân Viên Hai', ...field }).expect(400);
    }
    const rows = await db.query<Record<string, string>[]>(`SELECT VaiTro, TrangThai, SoDienThoai, MatKhauBam FROM dbo.TaiKhoan WHERE MaTaiKhoan='TK00000003'`);
    expect(rows[0].vaitro ?? rows[0].VaiTro).toBe('Nhân viên');
    const perms = await db.query<{ n: number }[]>(`SELECT count(*)::int AS n FROM dbo.TaiKhoanQuyen WHERE MaTaiKhoan='TK00000003'`);
    expect(perms[0].n).toBe(1);
  });

  it('updates only the caller: another account\'s data is untouched, even when a foreign id is supplied', async () => {
    const owner = (await http().get('/api/me').set(as('owner'))).body.profile;
    await http().patch('/api/me').set(as('staff')).send({ fullName: 'Chỉ Của Tôi', id: 'NV00000001' }).expect(400);
    await http().patch('/api/me').set(as('staff')).send({ fullName: 'Chỉ Của Tôi' }).expect(200);
    expect((await http().get('/api/me').set(as('owner'))).body.profile).toEqual(owner);
    expect((await http().get('/api/me').set(as('customer'))).body.profile.fullName).not.toBe('Chỉ Của Tôi');
  });

  it('email must stay unique across staff and customers (409) and can be cleared', async () => {
    await http().patch('/api/me').set(as('manager')).send({ email: 'staff.new@example.com' }).expect(409);
    await http().patch('/api/me').set(as('customer')).send({ email: 'manager.new@example.com' }).expect(409);
    await http().patch('/api/me').set(as('staff')).send({ email: 'STAFF.NEW@example.com' }).expect(200); // own address, other case
    const cleared = await http().patch('/api/me').set(as('customer')).send({ email: '' }).expect(200);
    expect(cleared.body.profile.email).toBeNull();
  });

  it.each(ROLES)('%s changes avatar: stored in object storage under avatars, name saved in SQL, served back, persists', async (u) => {
    const res = await http().post('/api/me/avatar').set(as(u)).set('Content-Type', 'image/png').send(PNG).expect(201);
    expect(res.body.avatarUrl).toMatch(/^\/api\/uploads\/avatars\/[a-f0-9]{32}\.png$/);
    const file = res.body.avatarUrl.split('/').pop() as string;
    expect(storage.files.get(file)?.equals(PNG)).toBe(true);
    expect((await http().get('/api/me').set(as(u))).body.profile.avatarUrl).toBe(res.body.avatarUrl);
    const served = await http().get(res.body.avatarUrl).expect(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(Buffer.from(served.body).equals(PNG)).toBe(true);
    // no image bytes / base64 in the database
    const col = await db.query<Record<string, string>[]>(`SELECT AnhDaiDien FROM dbo.TaiKhoan WHERE SoDienThoai=$1`, [ROLES.find((r) => r[0] === u)![2]]);
    expect(Object.values(col[0])[0]).toBe(file);
  });

  it('avatar validation: type, magic bytes, size; a failed upload keeps the old avatar', async () => {
    const before = (await http().get('/api/me').set(as('staff'))).body.profile.avatarUrl;
    expect(before).toBeTruthy();
    await http().post('/api/me/avatar').set(as('staff')).set('Content-Type', 'image/gif').send(Buffer.from('GIF89a')).expect(400);
    await http().post('/api/me/avatar').set(as('staff')).set('Content-Type', 'image/png').send(JPG).expect(400);        // declared PNG, real JPEG
    await http().post('/api/me/avatar').set(as('staff')).set('Content-Type', 'image/png').send(Buffer.from('<svg onload=alert(1)>')).expect(400);
    await http().post('/api/me/avatar').set(as('staff')).set('Content-Type', 'image/png').send(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)])).expect(413);
    storage.fail = true;
    await http().post('/api/me/avatar').set(as('staff')).set('Content-Type', 'image/jpeg').send(JPG).expect(503);
    storage.fail = false;
    expect((await http().get('/api/me').set(as('staff'))).body.profile.avatarUrl).toBe(before);
    const jpg = await http().post('/api/me/avatar').set(as('staff')).set('Content-Type', 'image/jpeg').send(JPG).expect(201);
    expect(jpg.body.avatarUrl).toMatch(/\.jpg$/);
  });

  it('WebP is accepted; replacing an avatar removes the previous object; a cross-account upload never touches another account', async () => {
    const other = (await http().get('/api/me').set(as('manager'))).body.profile.avatarUrl;
    const first = (await http().get('/api/me').set(as('staff'))).body.profile.avatarUrl as string;
    const res = await http().post('/api/me/avatar').set(as('staff')).set('Content-Type', 'image/webp').send(WEBP).expect(201);
    expect(res.body.avatarUrl).toMatch(/\.webp$/);
    expect(storage.files.has(first.split('/').pop() as string)).toBe(false);          // previous object removed
    expect(storage.files.has(res.body.avatarUrl.split('/').pop() as string)).toBe(true);
    expect((await http().get('/api/me').set(as('manager'))).body.profile.avatarUrl).toBe(other); // other account unchanged
  });

  it('if the database write fails after the upload, the new object is removed and the old avatar stays', async () => {
    const before = (await http().get('/api/me').set(as('owner'))).body.profile.avatarUrl;
    const filesBefore = new Set(storage.files.keys());
    await pg.exec(`CREATE OR REPLACE FUNCTION dbo.deny_avatar() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'denied'; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_deny_avatar BEFORE UPDATE OF AnhDaiDien ON dbo.TaiKhoan FOR EACH ROW EXECUTE FUNCTION dbo.deny_avatar();`);
    try {
      const res = await http().post('/api/me/avatar').set(as('owner')).set('Content-Type', 'image/png').send(PNG).expect(503);
      expect(JSON.stringify(res.body)).not.toMatch(/denied|trigger|stack/i);
    } finally { await pg.exec('DROP TRIGGER trg_deny_avatar ON dbo.TaiKhoan; DROP FUNCTION dbo.deny_avatar();'); }
    expect(new Set(storage.files.keys())).toEqual(filesBefore);                          // no orphan left behind
    expect((await http().get('/api/me').set(as('owner'))).body.profile.avatarUrl).toBe(before);
  });

  it('avatar route rejects malformed names and unknown files', async () => {
    await http().get('/api/uploads/avatars/..%2F..%2Fetc%2Fpasswd').expect(404);
    await http().get('/api/uploads/avatars/' + 'a'.repeat(32) + '.png').expect(404);
    await http().get('/api/uploads/avatars/evil.svg').expect(404);
  });

  it('CSRF header is required for PATCH and avatar upload', async () => {
    await http().patch('/api/me').set('Cookie', cookies.staff).send({ fullName: 'Không CSRF' }).expect(403);
    await http().post('/api/me/avatar').set('Cookie', cookies.staff).set('Content-Type', 'image/png').send(PNG).expect(403);
  });
});

describe('Profile API before migration 006 is applied (production state today)', () => {
  let pg: PgTestServer;
  let app: INestApplication;
  const password = randomBytes(18).toString('hex');
  const saved: Record<string, string | undefined> = {};
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    for (const k of ['JWT_SECRET', 'AUTH_SESSION_STORE', 'RATE_LIMIT_ENABLED']) saved[k] = process.env[k];
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    process.env.AUTH_SESSION_STORE = 'sql';
    process.env.RATE_LIMIT_ENABLED = 'false';
    pg = await startPgTestServer();
    const module = await Test.createTestingModule({
      imports: [DatabaseModule, AuthModule], controllers: [ProfileController], providers: [ProfileService, { provide: AVATAR_STORAGE, useValue: new MemoryStorage() }],
    }).compile();
    app = module.createNestApplication();
    setup(app);
    await app.init();
    const hash = await new PasswordService().hash(password);
    await pg.exec(`
      INSERT INTO dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai) VALUES
        ('TK00000001','staff','0900000003','${hash}','Nhân viên','Hoạt động'),('TK00000002','guest','0900000004','${hash}','Khách hàng','Hoạt động');
      INSERT INTO dbo.NhanVien(MaNhanVien,MaTaiKhoan,HoTen,SoDienThoai,TrangThaiLamViec,TrangThaiHoSo) VALUES ('NV00000001','TK00000001','Nhân Viên','0900000003','Đang làm việc','Hoạt động');
      INSERT INTO dbo.KhachHang(MaKhachHang,MaTaiKhoan,HoTen,SoDienThoai) VALUES ('KH00000001','TK00000002','Khách','0900000004');`);
    for (const [u, phone] of [['staff', '0900000003'], ['customer', '0900000004']]) {
      const res = await request(app.getHttpServer()).post('/api/auth/login').set('X-Spa-Request', '1').send({ phone, password }).expect(200);
      cookies[u] = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    }
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });

  it('profile still reads/updates the name; avatar and customer email report as unavailable instead of failing', async () => {
    const http = () => request(app.getHttpServer());
    const staff = await http().get('/api/me').set('Cookie', cookies.staff).expect(200);
    expect(staff.body.profile.editable).toMatchObject({ fullName: true, email: true, avatar: false });
    const customer = await http().get('/api/me').set('Cookie', cookies.customer).expect(200);
    expect(customer.body.profile.editable).toMatchObject({ fullName: true, email: false, avatar: false });
    await http().patch('/api/me').set('Cookie', cookies.customer).set('X-Spa-Request', '1').send({ fullName: 'Khách Hai' }).expect(200);
    await http().patch('/api/me').set('Cookie', cookies.customer).set('X-Spa-Request', '1').send({ email: 'a@example.com' }).expect(409);
    await http().post('/api/me/avatar').set('Cookie', cookies.staff).set('X-Spa-Request', '1').set('Content-Type', 'image/png').send(PNG).expect(503);
  });
});
