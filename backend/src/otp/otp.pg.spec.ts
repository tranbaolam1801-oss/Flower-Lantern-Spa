import 'reflect-metadata';
import { Global, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AuthModule } from '../auth/auth.module';
import { PasswordService } from '../auth/password.service';
import { DatabaseModule } from '../database.module';
import { DatabaseService } from '../database.service';
import { MockMessageProvider, OTP_SENDER, ProviderPermanentError, ProviderTemporaryError } from '../messaging/message-provider';
import { setup } from '../setup';
import { PgTestServer, startPgTestServer } from '../testing/pg-test-server';
import { OtpModule } from './otp.module';

jest.setTimeout(180_000);

const mock = new MockMessageProvider();
@Global()
@Module({ providers: [{ provide: OTP_SENDER, useValue: mock }], exports: [OTP_SENDER] })
class TestMessagingModule {}

const ACCEPTED = { message: 'Nếu số điện thoại hợp lệ, mã xác thực đã được gửi.', resendAfterSeconds: 60, expiresInSeconds: 300 };
const BAD_CODE = 'Mã xác thực không đúng hoặc đã hết hạn.';
const BAD_REQUEST = 'Yêu cầu không hợp lệ hoặc đã hết hạn.';
const POLICY = 'Mật khẩu phải có ít nhất 8 ký tự, gồm chữ và số.';

describe('Phone OTP registration and password reset (real PostgreSQL, Argon2id, mock sender)', () => {
  let pg: PgTestServer;
  let app: INestApplication;
  let db: DatabaseService;
  const saved: Record<string, string | undefined> = {};
  const pepper = randomBytes(24).toString('hex'); // 48 chars
  const goodPassword = () => `Aa1${randomBytes(6).toString('hex')}`;
  let ipCounter = 0;
  const nextIp = () => `10.1.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

  const NEW = '0911000001';
  const CUSTOMER = '0911000002';
  const STAFF = '0911000003';
  let customerHash: string;
  let customerPassword: string;

  beforeAll(async () => {
    for (const k of ['JWT_SECRET', 'AUTH_SESSION_STORE', 'RATE_LIMIT_ENABLED', 'OTP_PEPPER', 'TRUST_PROXY', 'OTP_TTL_SECONDS', 'OTP_RESEND_COOLDOWN_SECONDS']) saved[k] = process.env[k];
    process.env.JWT_SECRET = randomBytes(32).toString('hex');
    process.env.AUTH_SESSION_STORE = 'sql';
    process.env.RATE_LIMIT_ENABLED = 'false';
    process.env.OTP_PEPPER = pepper;
    process.env.TRUST_PROXY = '1';
    delete process.env.OTP_TTL_SECONDS;
    delete process.env.OTP_RESEND_COOLDOWN_SECONDS;
    pg = await startPgTestServer({ notifications: true });
    customerPassword = goodPassword();
    customerHash = await new PasswordService().hash(customerPassword);
    const module = await Test.createTestingModule({ imports: [DatabaseModule, TestMessagingModule, AuthModule, OtpModule] }).compile();
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
    process.env.OTP_PEPPER = pepper;
    mock.clear();
    await pg.reset();
    await pg.exec(`DELETE FROM dbo.DongYNhanTin; DELETE FROM dbo.XacMinhDienThoai; DELETE FROM dbo.XacThucOtp;
      INSERT INTO dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai) VALUES
        ('TK00000001','kh-existing','${CUSTOMER}','${customerHash}','Khách hàng','Hoạt động'),
        ('TK00000002','nv-staff','${STAFF}','${customerHash}','Nhân viên','Hoạt động');
      INSERT INTO dbo.KhachHang(MaKhachHang,MaTaiKhoan,HoTen,SoDienThoai) VALUES ('KH00000001','TK00000001','Trần Thị Ba','${CUSTOMER}');`);
  });

  const post = (path: string, body: unknown, ip = nextIp()) =>
    request(app.getHttpServer()).post(`/api${path}`).set('X-Spa-Request', '1').set('X-Forwarded-For', ip).send(body as object);
  const requestOtp = (phone: string, purpose: string, ip?: string) => post('/auth/otp/request', { phone, purpose }, ip);
  const verifyOtp = (phone: string, purpose: string, code: string) => post('/auth/otp/verify', { phone, purpose, code });
  const age = (seconds: number) => db.query(`UPDATE dbo.XacThucOtp SET TaoLuc = TaoLuc - make_interval(secs => $1::double precision),
      GuiLanCuoiLuc = GuiLanCuoiLuc - make_interval(secs => $1::double precision)`, [seconds]);
  const challenge = async (phone: string, purpose: string) => (await db.query<{ n: number; voHieu: Date | null; daXacMinh: Date | null; gui: number }[]>(
    `SELECT SoLanThu AS n, VoHieuLuc AS "voHieu", DaXacMinhLuc AS "daXacMinh", SoLanGui AS gui FROM dbo.XacThucOtp
     WHERE SoDienThoai=$1 AND MucDich=$2 ORDER BY TaoLuc DESC, MaXacThuc LIMIT 1`, [phone, purpose]))[0];
  const wrongCode = (code: string) => (code === '000000' ? '000001' : '000000');
  const issue = async (phone: string, purpose: string) => {
    await requestOtp(phone, purpose).expect(202);
    const code = mock.lastOtp(phone);
    expect(code).toMatch(/^[0-9]{6}$/);
    return code!;
  };
  const completionToken = async (phone: string, purpose: string) => {
    const code = await issue(phone, purpose);
    const res = await verifyOtp(phone, purpose, code).expect(200);
    expect(res.body.expiresInSeconds).toBe(600);
    return res.body.completionToken as string;
  };
  const login = (phone: string, password: string) => post('/auth/login', { phone, password });

  describe('registration', () => {
    it('full happy path: request, verify, register, then the new customer can log in', async () => {
      const req = await requestOtp(NEW, 'REGISTER').expect(202);
      expect(req.body).toEqual(ACCEPTED);
      expect(mock.otps).toHaveLength(1);
      expect(mock.otps[0]).toMatchObject({ phone: NEW, purpose: 'REGISTER', ttlMinutes: 5 });
      const token = await (async () => { const c = mock.lastOtp(NEW)!; return (await verifyOtp(NEW, 'REGISTER', c).expect(200)).body.completionToken as string; })();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const password = goodPassword();
      const res = await post('/auth/register', { phone: NEW, completionToken: token, fullName: '  Lê Văn Mới ', password, consentZalo: true }).expect(201);
      expect(res.body).toEqual({ success: true });

      const acc = await db.query<{ id: string; user: string; role: string; status: string; hash: string }[]>(
        `SELECT MaTaiKhoan AS id, TenDangNhap AS "user", VaiTro AS role, TrangThai AS status, MatKhauBam AS hash FROM dbo.TaiKhoan WHERE SoDienThoai=$1`, [NEW]);
      expect(acc).toHaveLength(1);
      expect(acc[0]).toMatchObject({ user: NEW, role: 'Khách hàng', status: 'Hoạt động' });
      expect(acc[0].id).toMatch(/^TK[0-9]{8}$/);
      expect(acc[0].hash).toMatch(/^\$argon2id\$/);
      const kh = await db.query<{ id: string; name: string; account: string }[]>(
        `SELECT MaKhachHang AS id, HoTen AS name, MaTaiKhoan AS account FROM dbo.KhachHang WHERE SoDienThoai=$1`, [NEW]);
      expect(kh).toEqual([{ id: 'KH00000002', name: 'Lê Văn Mới', account: acc[0].id }]);
      const consent = await db.query<{ kenh: string; nguon: string; thuHoi: Date | null }[]>(
        `SELECT Kenh AS kenh, Nguon AS nguon, ThuHoiLuc AS "thuHoi" FROM dbo.DongYNhanTin WHERE SoDienThoai=$1`, [NEW]);
      expect(consent).toEqual([{ kenh: 'ZALO', nguon: 'REGISTRATION', thuHoi: null }]);
      const verified = await db.query<{ p: string }[]>(`SELECT MucDich AS p FROM dbo.XacMinhDienThoai WHERE SoDienThoai=$1`, [NEW]);
      expect(verified).toEqual([{ p: 'REGISTER' }]);

      const logged = await login(NEW, password).expect(200);
      expect(logged.body.user).toMatchObject({ role: 'Khách hàng', fullName: 'Lê Văn Mới', entityId: 'KH00000002' });
    });

    it('links to an existing guest KhachHang without an account and records no consent unless ticked', async () => {
      await pg.exec(`INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai) VALUES ('KH00000005','Khách Vãng Lai','${NEW}')`);
      const token = await completionToken(NEW, 'REGISTER');
      await post('/auth/register', { phone: NEW, completionToken: token, fullName: 'Tên Khác', password: goodPassword(), consentZalo: false }).expect(201);
      const kh = await db.query<{ id: string; name: string; account: string | null }[]>(
        `SELECT MaKhachHang AS id, HoTen AS name, MaTaiKhoan AS account FROM dbo.KhachHang WHERE SoDienThoai=$1`, [NEW]);
      expect(kh).toHaveLength(1);
      expect(kh[0].id).toBe('KH00000005');
      expect(kh[0].name).toBe('Khách Vãng Lai');
      expect(kh[0].account).toMatch(/^TK[0-9]{8}$/);
      expect(await db.query<unknown[]>(`SELECT 1 FROM dbo.DongYNhanTin`)).toHaveLength(0);
    });

    it('registration without the consent field records nothing either', async () => {
      const token = await completionToken(NEW, 'REGISTER');
      await post('/auth/register', { phone: NEW, completionToken: token, fullName: 'A', password: goodPassword() }).expect(201);
      expect(await db.query<unknown[]>(`SELECT 1 FROM dbo.DongYNhanTin`)).toHaveLength(0);
    });

    it('enforces the password policy without burning the completion token', async () => {
      const token = await completionToken(NEW, 'REGISTER');
      for (const password of ['short1A', 'onlyletters', '1234567890', 'a'.repeat(129) + '1', '', undefined, 12345678]) {
        const res = await post('/auth/register', { phone: NEW, completionToken: token, fullName: 'A', password, consentZalo: false }).expect(400);
        expect(res.body).toMatchObject({ message: POLICY, fields: { password: POLICY } });
      }
      await post('/auth/register', { phone: NEW, completionToken: token, fullName: '', password: goodPassword() }).expect(400);
      await post('/auth/register', { phone: NEW, completionToken: token, fullName: 'x'.repeat(51), password: goodPassword() }).expect(400);
      await post('/auth/register', { phone: NEW, completionToken: token, fullName: 'Hợp Lệ', password: goodPassword() }).expect(201);
    });

    it('rejects a token for another phone, another purpose, a forged token and a replayed token', async () => {
      const token = await completionToken(NEW, 'REGISTER');
      const body = { fullName: 'A', password: goodPassword() };
      await post('/auth/register', { ...body, phone: '0911000009', completionToken: token }).expect(400);
      await post('/auth/register', { ...body, phone: NEW, completionToken: randomBytes(32).toString('base64url') }).expect(400);
      await post('/auth/password/reset', { phone: NEW, completionToken: token, newPassword: goodPassword() }).expect(400);
      await post('/auth/register', { ...body, phone: NEW, completionToken: token }).expect(201);
      const replay = await post('/auth/register', { ...body, phone: NEW, completionToken: token }).expect(400);
      expect(replay.body.message).toBe(BAD_REQUEST);
      expect(await db.query<unknown[]>(`SELECT 1 FROM dbo.TaiKhoan WHERE SoDienThoai=$1`, [NEW])).toHaveLength(1);
    });

    it('rejects an expired completion token', async () => {
      const token = await completionToken(NEW, 'REGISTER');
      await db.query(`UPDATE dbo.XacThucOtp SET PhieuHetHanLuc = dbo.utc_now() - interval '1 second'`);
      const res = await post('/auth/register', { phone: NEW, completionToken: token, fullName: 'A', password: goodPassword() }).expect(400);
      expect(res.body.message).toBe(BAD_REQUEST);
    });

    it('returns 409 when the phone got an account in the meantime and leaves the token usable (rollback)', async () => {
      const token = await completionToken(NEW, 'REGISTER');
      await pg.exec(`INSERT INTO dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai)
        VALUES ('TK00000009','other','${NEW}','${customerHash}','Khách hàng','Hoạt động')`);
      const res = await post('/auth/register', { phone: NEW, completionToken: token, fullName: 'A', password: goodPassword() }).expect(409);
      expect(res.body.message).toBe('Số điện thoại đã được đăng ký.');
      const used = await db.query<{ used: Date | null }[]>(`SELECT PhieuDaDungLuc AS used FROM dbo.XacThucOtp`);
      expect(used[0].used).toBeNull();
    });
  });

  describe('password reset', () => {
    it('full happy path: revokes every session, clears the lockout and the new password works', async () => {
      const cookieOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
      const a = cookieOf(await login(CUSTOMER, customerPassword).expect(200));
      const b = cookieOf(await login(CUSTOMER, customerPassword).expect(200));
      for (let i = 0; i < 5; i++) await login(CUSTOMER, 'wrong-password-1');
      expect((await db.query<{ n: number }[]>(`SELECT SoLanSai AS n FROM dbo.KhoaDangNhap WHERE SoDienThoai=$1`, [CUSTOMER]))[0].n).toBe(5);
      await login(CUSTOMER, customerPassword).expect(403); // locked
      const me = (cookie: string) => request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie);
      await me(a).expect(200);

      const token = await completionToken(CUSTOMER, 'RESET_PASSWORD');
      const newPassword = goodPassword();
      const res = await post('/auth/password/reset', { phone: CUSTOMER, completionToken: token, newPassword }).expect(200);
      expect(res.body).toEqual({ success: true });

      await me(a).expect(401);
      await me(b).expect(401);
      expect(await db.query<unknown[]>(`SELECT 1 FROM dbo.PhienDangNhap WHERE MaTaiKhoan='TK00000001' AND ThuHoiLuc IS NULL`)).toHaveLength(0);
      expect(await db.query<unknown[]>(`SELECT 1 FROM dbo.KhoaDangNhap WHERE SoDienThoai=$1`, [CUSTOMER])).toHaveLength(0);
      await login(CUSTOMER, customerPassword).expect(401);
      const ok = await login(CUSTOMER, newPassword).expect(200);
      expect(ok.body.user.entityId).toBe('KH00000001');
      const hash = (await db.query<{ h: string }[]>(`SELECT MatKhauBam AS h FROM dbo.TaiKhoan WHERE MaTaiKhoan='TK00000001'`))[0].h;
      expect(hash).toMatch(/^\$argon2id\$/);

      const replay = await post('/auth/password/reset', { phone: CUSTOMER, completionToken: token, newPassword: goodPassword() }).expect(400);
      expect(replay.body.message).toBe(BAD_REQUEST);
    });

    it('policy violation is a 400 with fields.newPassword and keeps the token', async () => {
      const token = await completionToken(CUSTOMER, 'RESET_PASSWORD');
      const res = await post('/auth/password/reset', { phone: CUSTOMER, completionToken: token, newPassword: 'abcdefgh' }).expect(400);
      expect(res.body).toMatchObject({ message: POLICY, fields: { newPassword: POLICY } });
      await post('/auth/password/reset', { phone: CUSTOMER, completionToken: token, newPassword: goodPassword() }).expect(200);
    });

    it('a staff phone can never be reset: nothing is sent, verify fails, and even a planted token is refused without being burnt', async () => {
      const res = await requestOtp(STAFF, 'RESET_PASSWORD').expect(202);
      expect(res.body).toEqual(ACCEPTED);
      expect(mock.otps).toHaveLength(0);
      const v = await verifyOtp(STAFF, 'RESET_PASSWORD', '123456').expect(400);
      expect(v.body.message).toBe(BAD_CODE);

      const { sha256Hex } = await import('./otp.policy');
      const planted = randomBytes(32).toString('base64url');
      await pg.exec(`INSERT INTO dbo.XacThucOtp(MucDich,SoDienThoai,HetHanLuc,DaXacMinhLuc,MaBamPhieuHoanTat,PhieuHetHanLuc)
        VALUES ('RESET_PASSWORD','${STAFF}', dbo.utc_now() + interval '5 minutes', dbo.utc_now(), '${sha256Hex(planted)}', dbo.utc_now() + interval '5 minutes')`);
      const before = (await db.query<{ h: string }[]>(`SELECT MatKhauBam AS h FROM dbo.TaiKhoan WHERE MaTaiKhoan='TK00000002'`))[0].h;
      await post('/auth/password/reset', { phone: STAFF, completionToken: planted, newPassword: goodPassword() }).expect(400);
      const after = (await db.query<{ h: string }[]>(`SELECT MatKhauBam AS h FROM dbo.TaiKhoan WHERE MaTaiKhoan='TK00000002'`))[0].h;
      expect(after).toBe(before);
    });

    it('an inactive customer account is not eligible', async () => {
      await pg.exec(`UPDATE dbo.TaiKhoan SET TrangThai='Đã khóa' WHERE MaTaiKhoan='TK00000001'`);
      await requestOtp(CUSTOMER, 'RESET_PASSWORD').expect(202);
      expect(mock.otps).toHaveLength(0);
    });

    it('an unregistered phone gets no code for RESET_PASSWORD and a registered phone gets none for REGISTER', async () => {
      await requestOtp(NEW, 'RESET_PASSWORD').expect(202);
      await requestOtp(CUSTOMER, 'REGISTER').expect(202);
      expect(mock.otps).toHaveLength(0);
    });
  });

  describe('verification rules', () => {
    it('wrong codes increment the attempt counter and the 6th attempt, even with the correct code, is rejected after invalidation', async () => {
      const code = await issue(NEW, 'REGISTER');
      for (let i = 1; i <= 5; i++) {
        const res = await verifyOtp(NEW, 'REGISTER', wrongCode(code)).expect(400);
        expect(res.body.message).toBe(BAD_CODE);
        const row = await challenge(NEW, 'REGISTER');
        expect(row.n).toBe(i);
        expect(row.voHieu === null).toBe(i < 5);
      }
      const late = await verifyOtp(NEW, 'REGISTER', code).expect(400);
      expect(late.body.message).toBe(BAD_CODE);
      expect((await challenge(NEW, 'REGISTER')).daXacMinh).toBeNull();
    });

    it('a correct code within the limit still succeeds after some wrong attempts', async () => {
      const code = await issue(NEW, 'REGISTER');
      for (let i = 0; i < 4; i++) await verifyOtp(NEW, 'REGISTER', wrongCode(code)).expect(400);
      await verifyOtp(NEW, 'REGISTER', code).expect(200);
    });

    it('rejects an expired challenge', async () => {
      const code = await issue(NEW, 'REGISTER');
      await db.query(`UPDATE dbo.XacThucOtp SET TaoLuc = dbo.utc_now() - interval '10 minutes', HetHanLuc = dbo.utc_now() - interval '1 second'`);
      const res = await verifyOtp(NEW, 'REGISTER', code).expect(400);
      expect(res.body.message).toBe(BAD_CODE);
    });

    it('a consumed code cannot be replayed and a code from another purpose or phone does not verify', async () => {
      const code = await issue(NEW, 'REGISTER');
      await verifyOtp(NEW, 'RESET_PASSWORD', code).expect(400);
      await verifyOtp('0911000008', 'REGISTER', code).expect(400);
      await verifyOtp(NEW, 'REGISTER', code).expect(200);
      const replay = await verifyOtp(NEW, 'REGISTER', code).expect(400);
      expect(replay.body.message).toBe(BAD_CODE);
    });

    it('verify without any issued code, or with a malformed code, gives the identical 400', async () => {
      const none = await verifyOtp(NEW, 'REGISTER', '123456').expect(400);
      expect(none.body).toEqual({ statusCode: 400, message: BAD_CODE, error: 'Bad Request' });
      for (const code of ['12345', '1234567', 'abcdef', '12 456', '']) {
        expect((await verifyOtp(NEW, 'REGISTER', code).expect(400)).body).toEqual(none.body);
      }
      expect((await post('/auth/otp/verify', { phone: NEW, purpose: 'REGISTER', code: 123456 }).expect(400)).body).toEqual(none.body);
      expect((await post('/auth/otp/verify', { phone: 'abc', purpose: 'REGISTER', code: '123456' }).expect(400)).body).toEqual(none.body);
    });

    it('concurrent verification with the same correct code succeeds exactly once', async () => {
      const code = await issue(NEW, 'REGISTER');
      const results = await Promise.all(Array.from({ length: 8 }, () => verifyOtp(NEW, 'REGISTER', code)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 400)).toHaveLength(7);
      expect(await db.query<unknown[]>(`SELECT 1 FROM dbo.XacThucOtp WHERE MaBamPhieuHoanTat IS NOT NULL`)).toHaveLength(1);
    });

    it('concurrent wrong guesses cannot exceed the attempt limit, and a late correct guess fails', async () => {
      const code = await issue(NEW, 'REGISTER');
      const results = await Promise.all(Array.from({ length: 14 }, () => verifyOtp(NEW, 'REGISTER', wrongCode(code))));
      expect(results.every((r) => r.status === 400)).toBe(true);
      const row = await challenge(NEW, 'REGISTER');
      expect(row.n).toBe(5);
      expect(row.voHieu).not.toBeNull();
      await verifyOtp(NEW, 'REGISTER', code).expect(400);
    });
  });

  describe('limits', () => {
    it('resend cooldown: a second request within 60 seconds is 429 with retryAfterSeconds, a later one supersedes the first code', async () => {
      await requestOtp(NEW, 'REGISTER').expect(202);
      const first = mock.lastOtp(NEW)!;
      const blocked = await requestOtp(NEW, 'REGISTER').expect(429);
      expect(blocked.body.message).toBe('Bạn thao tác quá nhanh. Vui lòng thử lại sau!');
      expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.body.retryAfterSeconds).toBeLessThanOrEqual(60);
      expect(mock.otps).toHaveLength(1);

      await age(61);
      await requestOtp(NEW, 'REGISTER').expect(202);
      expect(mock.otps).toHaveLength(2);
      const second = mock.lastOtp(NEW)!;
      if (second !== first) await verifyOtp(NEW, 'REGISTER', first).expect(400); // superseded
      await verifyOtp(NEW, 'REGISTER', second).expect(200);
      expect(await db.query<unknown[]>(`SELECT 1 FROM dbo.XacThucOtp WHERE SoDienThoai=$1 AND VoHieuLuc IS NULL AND DaXacMinhLuc IS NULL`, [NEW])).toHaveLength(0);
    });

    it('cooldown also applies to ineligible phones (limits never reveal eligibility)', async () => {
      await requestOtp(CUSTOMER, 'REGISTER').expect(202);
      const blocked = await requestOtp(CUSTOMER, 'REGISTER').expect(429);
      expect(blocked.body.message).toBe('Bạn thao tác quá nhanh. Vui lòng thử lại sau!');
    });

    it('per-phone hourly limit: the 6th challenge within an hour is 429 for eligible and ineligible phones alike', async () => {
      for (const phone of [NEW, CUSTOMER]) {
        for (let i = 0; i < 5; i++) { await requestOtp(phone, 'REGISTER').expect(202); await age(61); }
        const res = await requestOtp(phone, 'REGISTER').expect(429);
        expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
      }
      expect(mock.otps).toHaveLength(5);
    });

    it('per-IP hourly limit: the 11th challenge from one IP is 429 even for different phones', async () => {
      const ip = '203.0.113.7';
      for (let i = 0; i < 10; i++) await requestOtp(`09220000${String(i).padStart(2, '0')}`, 'REGISTER', ip).expect(202);
      const res = await requestOtp('0922000099', 'REGISTER', ip).expect(429);
      expect(res.body.message).toBe('Bạn thao tác quá nhanh. Vui lòng thử lại sau!');
      await requestOtp('0922000099', 'REGISTER', '203.0.113.8').expect(202);
    });

    it('stores only a hashed IP', async () => {
      await requestOtp(NEW, 'REGISTER', '198.51.100.23').expect(202);
      const rows = await db.query<{ ip: string }[]>(`SELECT BamIp AS ip FROM dbo.XacThucOtp`);
      expect(rows[0].ip).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(rows)).not.toContain('198.51.100.23');
    });
  });

  describe('no enumeration and no secrets at rest', () => {
    it('request answers are byte-identical for registered, unregistered, staff and inactive phones; only eligible phones receive a code', async () => {
      const unregistered = await requestOtp('0933000001', 'REGISTER');
      const registered = await requestOtp(CUSTOMER, 'REGISTER');
      const staff = await requestOtp(STAFF, 'REGISTER');
      const resetCustomer = await requestOtp(CUSTOMER, 'RESET_PASSWORD');
      const resetStaff = await requestOtp(STAFF, 'RESET_PASSWORD');
      const resetUnknown = await requestOtp('0933000002', 'RESET_PASSWORD');
      const all = [unregistered, registered, staff, resetCustomer, resetStaff, resetUnknown];
      for (const r of all) {
        expect(r.status).toBe(202);
        expect(r.text).toBe(unregistered.text);
        expect(r.body).toEqual(ACCEPTED);
      }
      expect(mock.otps.map((m) => `${m.phone}:${m.purpose}`).sort()).toEqual([`0933000001:REGISTER`, `${CUSTOMER}:RESET_PASSWORD`].sort());
    });

    it('malformed phone is the only 400 on request', async () => {
      for (const phone of ['', '123', '09abc00001', 'x', null, 912345678]) {
        const res = await post('/auth/otp/request', { phone, purpose: 'REGISTER' }).expect(400);
        expect(res.body.message).toBe('Số điện thoại không hợp lệ!');
      }
      await post('/auth/otp/request', { phone: '+84933000003', purpose: 'REGISTER' }).expect(202);
      expect(mock.otps[0].phone).toBe('0933000003');
    });

    it('the OTP code, completion token, pepper and password never appear in any database column', async () => {
      const code = await issue(NEW, 'REGISTER');
      const token = await completionToken('0944000001', 'REGISTER');
      const password = goodPassword();
      await post('/auth/register', { phone: '0944000001', completionToken: token, fullName: 'Kín Đáo', password, consentZalo: true }).expect(201);
      const dump = [
        ...(await db.query<{ t: string }[]>(`SELECT x::text AS t FROM dbo.XacThucOtp x`)),
        ...(await db.query<{ t: string }[]>(`SELECT x::text AS t FROM dbo.XacMinhDienThoai x`)),
        ...(await db.query<{ t: string }[]>(`SELECT x::text AS t FROM dbo.DongYNhanTin x`)),
        ...(await db.query<{ t: string }[]>(`SELECT x::text AS t FROM dbo.TaiKhoan x`)),
      ].map((r) => r.t).join('\n');
      expect(dump).not.toContain(token);
      expect(dump).not.toContain(pepper);
      expect(dump).not.toContain(password);
      // a six-digit code cannot be searched as free text (it could collide with digits in timestamps), so assert on the specific columns
      const cols = await db.query<{ t: string }[]>(
        `SELECT concat_ws('|', MaBamOtp, MaBamPhieuHoanTat, KenhGui, MaThamChieuNhaCungCap, BamIp) AS t FROM dbo.XacThucOtp`);
      for (const row of cols) expect(row.t).not.toContain(code);
      const stored = await db.query<{ d: string | null; len: number }[]>(`SELECT MaBamOtp AS d, length(MaBamOtp) AS len FROM dbo.XacThucOtp WHERE SoDienThoai=$1`, [NEW]);
      expect(stored[0].d).toMatch(/^[0-9a-f]{64}$/);
      expect(stored[0].d).not.toBe(code);
    });

    it('the mock records the code but the HTTP response never contains it', async () => {
      const res = await requestOtp(NEW, 'REGISTER').expect(202);
      expect(res.text).not.toContain(mock.lastOtp(NEW)!);
      expect(res.text).not.toMatch(/code|token|hash/i);
    });
  });

  describe('provider failures and configuration', () => {
    it('a temporary provider failure is a generic 503 and the next request is immediately possible', async () => {
      mock.failNext = new ProviderTemporaryError('RATE_LIMITED', 'secret-detail-from-provider');
      const res = await requestOtp(NEW, 'REGISTER').expect(503);
      expect(res.body.message).toBe('Không thể gửi mã xác thực. Vui lòng thử lại sau!');
      expect(res.text).not.toMatch(/RATE_LIMITED|secret-detail/);
      expect(mock.otps).toHaveLength(0);
      const failed = await challenge(NEW, 'REGISTER');
      expect(failed.gui).toBe(0);
      expect(failed.voHieu).not.toBeNull();

      const retry = await requestOtp(NEW, 'REGISTER').expect(202);
      expect(retry.body).toEqual(ACCEPTED);
      expect(mock.otps).toHaveLength(1);
      await verifyOtp(NEW, 'REGISTER', mock.lastOtp(NEW)!).expect(200);
    });

    it('a permanent provider failure is the same generic 503; an unexpected error too', async () => {
      mock.failNext = new ProviderPermanentError('INVALID_NUMBER');
      expect((await requestOtp(NEW, 'REGISTER').expect(503)).body.message).toBe('Không thể gửi mã xác thực. Vui lòng thử lại sau!');
      const spy = jest.spyOn(mock, 'sendOtp').mockRejectedValueOnce(new Error('boom: https://user:pass@provider'));
      const res = await requestOtp(NEW, 'REGISTER').expect(503);
      spy.mockRestore();
      expect(res.text).not.toContain('boom');
      await requestOtp(NEW, 'REGISTER').expect(202);
    });

    it('a missing or short OTP_PEPPER yields the generic 503 and creates no challenge', async () => {
      for (const value of [undefined, 'short-pepper']) {
        if (value === undefined) delete process.env.OTP_PEPPER; else process.env.OTP_PEPPER = value;
        const res = await requestOtp(NEW, 'REGISTER').expect(503);
        expect(res.body.message).toBe('Không thể gửi mã xác thực. Vui lòng thử lại sau!');
        await verifyOtp(NEW, 'REGISTER', '123456').expect(503);
      }
      expect(await db.query<unknown[]>(`SELECT 1 FROM dbo.XacThucOtp`)).toHaveLength(0);
      expect(mock.otps).toHaveLength(0);
    });

    it('OTP_TTL_SECONDS and OTP_RESEND_COOLDOWN_SECONDS are read at call time', async () => {
      process.env.OTP_TTL_SECONDS = '120';
      process.env.OTP_RESEND_COOLDOWN_SECONDS = '30';
      try {
        const res = await requestOtp(NEW, 'REGISTER').expect(202);
        expect(res.body).toEqual({ ...ACCEPTED, resendAfterSeconds: 30, expiresInSeconds: 120 });
        expect(mock.otps[0].ttlMinutes).toBe(2);
        const ttl = await db.query<{ s: string }[]>(`SELECT extract(epoch FROM (HetHanLuc - TaoLuc)) AS s FROM dbo.XacThucOtp`);
        expect(Math.round(Number(ttl[0].s))).toBe(120);
      } finally {
        delete process.env.OTP_TTL_SECONDS;
        delete process.env.OTP_RESEND_COOLDOWN_SECONDS;
      }
    });
  });
});
