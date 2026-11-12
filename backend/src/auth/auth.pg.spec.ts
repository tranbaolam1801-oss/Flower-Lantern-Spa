import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { DatabaseModule } from '../database.module';
import { DatabaseService } from '../database.service';
import { setup } from '../setup';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { JwtPayload } from './auth.dto';
import { JwtTokenService } from './jwt-token.service';
import { PasswordService } from './password.service';

jest.setTimeout(120_000);

const LOCK_MESSAGE = 'Bạn đã nhập sai quá số lần cho phép. Vui lòng thử lại sau 15 phút.';

/** Real PostgreSQL (PGlite) + real Argon2id + real AuthModule over HTTP. No password is committed: it is random per run. */
describe('Auth with real PostgreSQL and Argon2id', () => {
  let pg: PgTestServer;
  let app: INestApplication;
  let db: DatabaseService;
  const password = randomBytes(18).toString('hex');
  const phone = '0900000001';
  const inactivePhone = '0900000002';
  let hash: string;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const k of ['JWT_SECRET', 'AUTH_SESSION_STORE', 'RATE_LIMIT_ENABLED']) saved[k] = process.env[k];
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    process.env.AUTH_SESSION_STORE = 'sql';
    process.env.RATE_LIMIT_ENABLED = 'false';
    pg = await startPgTestServer();
    hash = await new PasswordService().hash(password);
    const module = await Test.createTestingModule({ imports: [DatabaseModule, AuthModule] }).compile();
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
    process.env.AUTH_SESSION_STORE = 'sql';
    await pg.reset();
    await pg.exec(`
      INSERT INTO dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai) VALUES
        ('TK00000001','nv-one','${phone}','${hash}','Nhân viên','Hoạt động'),
        ('TK00000002','nv-two','${inactivePhone}','${hash}','Nhân viên','Đã khóa');
      INSERT INTO dbo.NhanVien(MaNhanVien,MaTaiKhoan,HoTen,SoDienThoai,TrangThaiLamViec,TrangThaiHoSo)
        VALUES ('NV00000001','TK00000001','Nguyễn Văn Một','${phone}','Đang làm việc','Hoạt động');
      INSERT INTO dbo.TaiKhoanQuyen(MaTaiKhoan,MaQuyen) VALUES ('TK00000001','Q01'),('TK00000001','Q02');`);
  });

  const login = (pwd = password, p = phone) =>
    request(app.getHttpServer()).post('/api/auth/login').set('X-Spa-Request', '1').send({ phone: p, password: pwd });
  const cookieOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  const me = (cookie: string) => request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie);
  const lockRow = async () => (await db.query<{ n: number; until: Date | null; remaining: number | null; last: Date | null }[]>(
    `SELECT SoLanSai AS n, ThoiDiemKhoaDen AS until, LanCuoiSai AS last,
            extract(epoch FROM (ThoiDiemKhoaDen - dbo.vn_now())) AS remaining
     FROM dbo.KhoaDangNhap WHERE SoDienThoai=$1`, [phone]))[0];

  describe('login and /me', () => {
    it('logs in with Argon2id, loads profile + RBAC permissions from SQL and sets an HttpOnly cookie', async () => {
      const res = await login().expect(200);
      expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/);
      expect(res.body.user).toEqual({
        id: 'TK00000001', username: 'nv-one', phone, role: 'Nhân viên', fullName: 'Nguyễn Văn Một',
        permissions: ['Q01', 'Q02'], entityId: 'NV00000001',
      });
      expect(JSON.stringify(res.body)).not.toContain(hash);
    });

    it('/me reloads permissions from SQL, not from the token', async () => {
      const cookie = cookieOf(await login().expect(200));
      expect((await me(cookie).expect(200)).body.user.permissions).toEqual(['Q01', 'Q02']);
      await db.query(`DELETE FROM dbo.TaiKhoanQuyen WHERE MaTaiKhoan=$1 AND MaQuyen=$2`, ['TK00000001', 'Q02']);
      const again = await me(cookie).expect(200);
      expect(again.body.user.permissions).toEqual(['Q01']);
      expect(again.body.user.entityId).toBe('NV00000001');
    });

    it('resolves the display name from KhachHang for a customer account', async () => {
      await pg.exec(`
        INSERT INTO dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai)
          VALUES ('TK00000003','kh-three','0900000003','${hash}','Khách hàng','Hoạt động');
        INSERT INTO dbo.KhachHang(MaKhachHang,MaTaiKhoan,HoTen,SoDienThoai) VALUES ('KH00000001','TK00000003','Trần Thị Ba','0900000003');`);
      const res = await login(password, '0900000003').expect(200);
      expect(res.body.user).toMatchObject({ fullName: 'Trần Thị Ba', entityId: 'KH00000001', permissions: [] });
    });

    it('rejects an inactive account with 403 ACCOUNT_INACTIVE and does not count it as a failed attempt', async () => {
      const res = await login(password, inactivePhone).expect(403);
      expect(res.body.code).toBe('ACCOUNT_INACTIVE');
      const rows = await db.query<unknown[]>(`SELECT 1 FROM dbo.KhoaDangNhap WHERE SoDienThoai=$1`, [inactivePhone]);
      expect(rows).toHaveLength(0);
    });

    it('rejects /me and revokes the sessions once the account is deactivated', async () => {
      const cookie = cookieOf(await login().expect(200));
      await me(cookie).expect(200);
      await db.query(`UPDATE dbo.TaiKhoan SET TrangThai=$1 WHERE MaTaiKhoan=$2`, ['Đã khóa', 'TK00000001']);
      await me(cookie).expect(401);
      await db.query(`UPDATE dbo.TaiKhoan SET TrangThai=$1 WHERE MaTaiKhoan=$2`, ['Hoạt động', 'TK00000001']);
      await me(cookie).expect(401); // the revocation is permanent: re-activation does not revive the old session
      const open = await db.query<unknown[]>(`SELECT 1 FROM dbo.PhienDangNhap WHERE MaTaiKhoan=$1 AND ThuHoiLuc IS NULL`, ['TK00000001']);
      expect(open).toHaveLength(0);
    });

    it('does not create a session row when AUTH_SESSION_STORE is not sql', async () => {
      process.env.AUTH_SESSION_STORE = '';
      const cookie = cookieOf(await login().expect(200));
      await me(cookie).expect(200);
      const rows = await db.query<unknown[]>(`SELECT 1 FROM dbo.PhienDangNhap`);
      expect(rows).toHaveLength(0);
    });
  });

  describe('persistent lockout (dbo.KhoaDangNhap)', () => {
    it('wrong password: generic 401 and the counter is persisted', async () => {
      const res = await login('wrong-password').expect(401);
      expect(res.body.message).toBe('Số điện thoại hoặc mật khẩu không đúng');
      expect((await lockRow()).n).toBe(1);
      await login('wrong-password').expect(401);
      expect((await lockRow()).n).toBe(2);
    });

    it('unknown phone is counted too, with the same generic message (no user enumeration)', async () => {
      const res = await login('x', '0911111111').expect(401);
      expect(res.body.message).toBe('Số điện thoại hoặc mật khẩu không đúng');
      const rows = await db.query<{ n: number }[]>(`SELECT SoLanSai AS n FROM dbo.KhoaDangNhap WHERE SoDienThoai=$1`, ['0911111111']);
      expect(rows[0].n).toBe(1);
    });

    it('5th failure locks for 15 minutes with the exact message; a correct password is refused and the lock is not extended', async () => {
      for (let i = 0; i < 4; i++) await login('wrong').expect(401);
      const locked = await login('wrong').expect(403);
      expect(locked.body).toMatchObject({ message: LOCK_MESSAGE, code: 'ACCOUNT_TEMPORARILY_LOCKED' });
      const before = await lockRow();
      expect(before.n).toBe(5);
      expect(Number(before.remaining)).toBeGreaterThan(880);
      expect(Number(before.remaining)).toBeLessThanOrEqual(900);

      const whileLocked = await login().expect(403);
      expect(whileLocked.body).toMatchObject({ message: LOCK_MESSAGE, code: 'ACCOUNT_TEMPORARILY_LOCKED' });
      await login('wrong').expect(403);
      const after = await lockRow();
      expect(after.n).toBe(5);
      expect(after.until).toEqual(before.until);
    });

    it('counts exactly five failures across 12 concurrent requests (no lost increments, no 500)', async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => login('wrong')));
      expect(results.filter((r) => r.status === 401)).toHaveLength(4);
      expect(results.filter((r) => r.status === 403)).toHaveLength(8);
      const row = await lockRow();
      expect(row.n).toBe(5);
      expect(Number(row.remaining)).toBeGreaterThan(880);
    });

    it('after the lock expires a correct login succeeds and resets the counter', async () => {
      for (let i = 0; i < 5; i++) await login('wrong');
      await db.query(`UPDATE dbo.KhoaDangNhap SET ThoiDiemKhoaDen = dbo.vn_now() - make_interval(mins => 1) WHERE SoDienThoai=$1`, [phone]);
      await login().expect(200);
      const row = await lockRow();
      expect(row.n).toBe(0);
      expect(row.until).toBeNull();
      expect(row.last).toBeNull();
    });

    it('after the lock expires a wrong password restarts counting at 1 and clears the lock', async () => {
      for (let i = 0; i < 5; i++) await login('wrong');
      await db.query(`UPDATE dbo.KhoaDangNhap SET ThoiDiemKhoaDen = dbo.vn_now() - make_interval(mins => 1) WHERE SoDienThoai=$1`, [phone]);
      await login('wrong').expect(401);
      const row = await lockRow();
      expect(row.n).toBe(1);
      expect(row.until).toBeNull();
    });

    it('a successful login before the threshold clears earlier failures', async () => {
      for (let i = 0; i < 3; i++) await login('wrong').expect(401);
      expect((await lockRow()).n).toBe(3);
      await login().expect(200);
      expect((await lockRow()).n).toBe(0);
      for (let i = 0; i < 4; i++) await login('wrong').expect(401); // would be locked if the reset had not happened
      expect((await lockRow()).n).toBe(4);
    });

    it('the lock survives an application restart (state lives in SQL, not in memory)', async () => {
      for (let i = 0; i < 5; i++) await login('wrong');
      const before = await lockRow();
      await app.close();
      const module = await Test.createTestingModule({ imports: [DatabaseModule, AuthModule] }).compile();
      app = module.createNestApplication();
      setup(app);
      await app.init();
      db = app.get(DatabaseService);
      await login().expect(403);
      expect((await lockRow()).until).toEqual(before.until);
    });
  });

  describe('JWT session store (dbo.PhienDangNhap)', () => {
    const payloadOf = async (cookie: string) =>
      new JwtTokenService().verifyAsync<JwtPayload>(cookie.slice('access_token='.length));

    it('login stores a session (uuid jti, ~7 day expiry); logout revokes only that device and is idempotent', async () => {
      const a = cookieOf(await login().expect(200));
      const b = cookieOf(await login().expect(200));
      const rows = await db.query<{ id: string; days: number }[]>(
        `SELECT MaPhien::text AS id, extract(epoch FROM (HetHanLuc - dbo.utc_now())) / 86400 AS days
         FROM dbo.PhienDangNhap WHERE MaTaiKhoan=$1`, ['TK00000001']);
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.id)).toContain((await payloadOf(a)).jti);
      expect(Number(rows[0].days)).toBeGreaterThan(6.9);
      expect(Number(rows[0].days)).toBeLessThanOrEqual(7);

      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer()).post('/api/auth/logout').set('X-Spa-Request', '1').set('Cookie', a).expect(200);
      }
      await me(a).expect(401);
      await me(b).expect(200);
      const revoked = await db.query<{ n: number }[]>(`SELECT count(*) AS n FROM dbo.PhienDangNhap WHERE ThuHoiLuc IS NOT NULL`);
      expect(revoked[0].n).toBe(1);
    });

    it('rejects database-expired sessions, unknown jti, missing jti and a jti belonging to another account', async () => {
      const cookie = cookieOf(await login().expect(200));
      const payload = await payloadOf(cookie);
      const jwt = new JwtTokenService();
      const tokenWith = (override: Partial<JwtPayload>) => jwt.signAsync({
        sub: payload.sub, username: payload.username, phone: payload.phone, role: payload.role,
        fullName: payload.fullName, permissions: payload.permissions, jti: payload.jti, ...override,
      });
      for (const override of [{ jti: undefined }, { jti: '00000000-0000-4000-8000-000000000000' }, { jti: 'not-a-uuid' }, { sub: 'TK00000002' }]) {
        await me(`access_token=${await tokenWith(override)}`).expect(401);
      }
      await me(cookie).expect(200);
      await db.query(`UPDATE dbo.PhienDangNhap SET TaoLuc = dbo.utc_now() - make_interval(days => 2), HetHanLuc = dbo.utc_now() - make_interval(days => 1)`);
      await me(cookie).expect(401);
    });

    it('does not open a session for an account that is deactivated between the password check and the insert', async () => {
      const auth = app.get(AuthService);
      const jwt = new JwtTokenService();
      const spy = jest.spyOn(jwt, 'signAsync').mockImplementation(async () => {
        await db.query(`UPDATE dbo.TaiKhoan SET TrangThai=$1 WHERE MaTaiKhoan=$2`, ['Đã khóa', 'TK00000001']);
        return 'unused';
      });
      const racing = new AuthService(db, new PasswordService(), jwt);
      await expect(racing.login({ phone, password })).rejects.toThrow('Tài khoản đã bị khóa.');
      spy.mockRestore();
      const rows = await db.query<unknown[]>(`SELECT 1 FROM dbo.PhienDangNhap`);
      expect(rows).toHaveLength(0);
      expect(auth.sessionsEnabled()).toBe(true);
    });
  });
});
