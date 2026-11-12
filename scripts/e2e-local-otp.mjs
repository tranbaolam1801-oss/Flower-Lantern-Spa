#!/usr/bin/env node
// Local end-to-end test of OTP registration / password reset and booking notifications through the REAL deployed entry
// (api/index.js) on a real PostgreSQL engine (PGlite), with the MOCK message provider (no phone is ever contacted).
//   npm run build && node scripts/e2e-local-otp.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'backend/package.json'));
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);
const { PGLiteSocketServer } = await import(pathToFileURL(require.resolve('@electric-sql/pglite-socket')).href);
const argon2 = require('argon2');

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`); };

const db = await PGlite.create();
for (const f of ['001-schema.sql', '002-demo-catalog.sql', '004-otp-notifications.sql']) await db.exec(readFileSync(path.join(root, 'database/postgres', f), 'utf8'));
const hash = (pw) => argon2.hash(pw, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
const OWNER_PW = 'Owner-e2e-pass-1', STAFF_PW = 'Staff-e2e-pass-1';
await db.query("INSERT INTO dbo.TaiKhoan VALUES ('TK00000001','admin','0900000001',$1,'Chủ Spa','Hoạt động'),('TK00000003','nhanvien','0900000003',$2,'Nhân viên','Hoạt động')", [await hash(OWNER_PW), await hash(STAFF_PW)]);
await db.exec(`INSERT INTO dbo.NhanVien(MaNhanVien,MaTaiKhoan,HoTen,SoDienThoai,TrangThaiLamViec,TrangThaiHoSo) VALUES ('NV00000001','TK00000001','Chu e2e','0900000001','Đang làm việc','Hoạt động'),('NV00000003','TK00000003','NV e2e','0900000003','Đang làm việc','Hoạt động');
  INSERT INTO dbo.TaiKhoanQuyen SELECT 'TK00000001', MaQuyen FROM dbo.Quyen;`);
const server = new PGLiteSocketServer({ db, port: 54341, host: '127.0.0.1' });
await server.start();

const INTERNAL = 'i'.repeat(48);
Object.assign(process.env, {
  NODE_ENV: 'test', MESSAGING_MOCK: 'true', DATABASE_URL: 'postgres://postgres@127.0.0.1:54341/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
  JWT_SECRET: 'e2e-local-secret-not-for-production-use-0123456789', AUTH_SESSION_STORE: 'sql', FRONTEND_ORIGIN: 'http://localhost', RATE_LIMIT_ENABLED: 'false',
  OTP_PEPPER: 'p'.repeat(48), INTERNAL_API_KEY: INTERNAL, REMINDER_LEAD_MINUTES: '1440,120', NOTIFY_CHANGES: 'true', OTP_RESEND_COOLDOWN_SECONDS: '60',
});
const handler = require(path.join(root, 'api/index.js'));
const mock = require(path.join(root, 'backend/dist/messaging/messaging.module.js')).messagingProviders.otp; // MockMessageProvider
const app = http.createServer((q, s) => handler(q, s));
await new Promise((r) => app.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.address().port}`;

class S {
  cookie = '';
  async call(method, url, body, extra = {}) {
    const headers = { 'content-type': 'application/json', ...(method !== 'GET' ? { 'x-spa-request': '1' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...extra };
    const r = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, json, text, headers: r.headers };
  }
  async login(phone, password) { const r = await this.call('POST', '/api/auth/login', { phone, password }); if (r.status === 200) this.cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]; return r; }
}
const anon = new S();
const NEW = '0933000001', PW1 = 'Passw0rd-one', PW2 = 'Passw0rd-two';

try {
  // ---------------- registration
  let r = await anon.call('POST', '/api/auth/otp/request', { phone: NEW, purpose: 'REGISTER' });
  check('register: OTP request accepted (202, generic sentence)', r.status === 202 && /Nếu số điện thoại hợp lệ/.test(r.json.message), `${r.status} ${r.text}`);
  const code = mock.lastOtp(NEW);
  check('register: the (mock) provider received a 6-digit code and it is NOT in the HTTP response', /^\d{6}$/.test(code ?? '') && !r.text.includes(code), String(code));
  r = await anon.call('POST', '/api/auth/otp/verify', { phone: NEW, purpose: 'REGISTER', code: code === '000000' ? '111111' : '000000' });
  check('register: wrong code -> generic 400', r.status === 400 && /không đúng hoặc đã hết hạn/.test(r.json.message), `${r.status} ${r.text}`);
  r = await anon.call('POST', '/api/auth/otp/verify', { phone: NEW, purpose: 'REGISTER', code });
  check('register: correct code -> completion token', r.status === 200 && typeof r.json.completionToken === 'string' && r.json.completionToken.length >= 40, `${r.status} ${r.text.slice(0, 80)}`);
  const token = r.json.completionToken;
  r = await anon.call('POST', '/api/auth/otp/verify', { phone: NEW, purpose: 'REGISTER', code });
  check('register: replaying the same code is refused (single use)', r.status === 400, String(r.status));
  r = await anon.call('POST', '/api/auth/register', { phone: NEW, completionToken: token, fullName: 'Khách E2E', password: 'short1', consentZalo: true });
  check('register: weak password is rejected without burning the token', r.status === 400, `${r.status} ${r.text.slice(0, 100)}`);
  r = await anon.call('POST', '/api/auth/register', { phone: NEW, completionToken: 'x'.repeat(43), fullName: 'Khách E2E', password: PW1, consentZalo: true });
  check('register: forged token is refused', r.status === 400, String(r.status));
  r = await anon.call('POST', '/api/auth/register', { phone: NEW, completionToken: token, fullName: 'Khách E2E', password: PW1, consentZalo: true });
  check('register: account created (201)', r.status === 201, `${r.status} ${r.text.slice(0, 100)}`);
  r = await anon.call('POST', '/api/auth/register', { phone: NEW, completionToken: token, fullName: 'Khách E2E', password: PW1, consentZalo: true });
  check('register: replaying the completion token is refused', r.status === 400 || r.status === 409, String(r.status));
  const cust = new S();
  r = await cust.login(NEW, PW1);
  check('login with the new account works (role Khách hàng)', r.status === 200 && r.json.user?.role === 'Khách hàng', `${r.status}`);
  const consent = (await db.query("SELECT count(*)::int n FROM dbo.DongYNhanTin WHERE SoDienThoai=$1 AND Kenh='ZALO' AND ThuHoiLuc IS NULL", [NEW])).rows[0].n;
  check('consent recorded because the box was ticked', consent === 1, String(consent));
  const stored = JSON.stringify((await db.query('SELECT * FROM dbo.XacThucOtp')).rows);
  check('no OTP code and no completion token stored in plain text', !stored.includes(code) && !stored.includes(token));

  // ---------------- enumeration + cooldown
  const a = await anon.call('POST', '/api/auth/otp/request', { phone: '0944999999', purpose: 'RESET_PASSWORD' });
  const b = await anon.call('POST', '/api/auth/otp/request', { phone: NEW, purpose: 'RESET_PASSWORD' });
  const c = await anon.call('POST', '/api/auth/otp/request', { phone: '0900000003', purpose: 'RESET_PASSWORD' }); // staff
  check('reset request: unknown phone / registered customer / staff phone give IDENTICAL responses', a.status === 202 && a.text === b.text && b.text === c.text, `${a.text} | ${b.text} | ${c.text}`);
  check('reset request: nothing was sent to the unknown phone or the staff phone', mock.lastOtp('0944999999') === undefined && mock.lastOtp('0900000003') === undefined);
  r = await anon.call('POST', '/api/auth/otp/request', { phone: NEW, purpose: 'RESET_PASSWORD' });
  check('resend inside the cooldown -> 429 with retryAfterSeconds', r.status === 429 && r.json.retryAfterSeconds > 0, `${r.status} ${r.text}`);

  // ---------------- password reset
  const rcode = mock.lastOtp(NEW);
  r = await anon.call('POST', '/api/auth/otp/verify', { phone: NEW, purpose: 'RESET_PASSWORD', code: rcode });
  const rtoken = r.json.completionToken;
  check('reset: code verified', r.status === 200 && !!rtoken, String(r.status));
  r = await anon.call('POST', '/api/auth/password/reset', { phone: NEW, completionToken: rtoken, newPassword: PW2 });
  check('reset: password changed (200)', r.status === 200, `${r.status} ${r.text}`);
  r = await cust.call('GET', '/api/auth/me');
  check('reset: the OLD session was revoked (401)', r.status === 401, String(r.status));
  r = await new S().login(NEW, PW1); check('reset: old password no longer works (401)', r.status === 401, String(r.status));
  const cust2 = new S(); r = await cust2.login(NEW, PW2); check('reset: new password works', r.status === 200, String(r.status));
  r = await anon.call('POST', '/api/auth/password/reset', { phone: NEW, completionToken: rtoken, newPassword: 'Another-pass-9' });
  check('reset: replaying the reset token is refused', r.status === 400, String(r.status));

  // ---------------- booking notifications
  const owner = new S(); await owner.login('0900000001', OWNER_PW);
  const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const mk = (bed, time, phone, extra = {}) => owner.call('POST', '/api/bookings', { bookerName: 'Khách E2E', bookerPhone: phone, date: day, guests: [{ customerName: 'Khách E2E', customerPhone: phone, bedId: bed, packageId: 'GV00000001', startsAt: `${day}T${time}:00` }], ...extra });
  r = await mk('G1', '10:00', NEW);
  check('staff booking (consented phone) created', r.status === 201, `${r.status} ${r.text.slice(0, 100)}`);
  const bookingId = r.json.id ?? r.json.bookingId;
  let jobs = (await db.query("SELECT Loai, TrangThai, to_char(GuiLuc,'YYYY-MM-DD HH24:MI') due FROM dbo.ThongBaoCongViec ORDER BY Loai, GuiLuc")).rows;
  check('jobs: 1 confirmation + 2 reminders (1440 and 120 minutes) were queued with the booking', jobs.length === 3 && jobs.filter((j) => j.loai === 'BOOKING_REMINDER').length === 2, JSON.stringify(jobs));
  const startUtc = new Date(`${day}T10:00:00+07:00`);
  const dueFor = (lead) => new Date(startUtc.getTime() - lead * 60000).toISOString().slice(0, 16).replace('T', ' ');
  const reminderDues = jobs.filter((j) => j.loai === 'BOOKING_REMINDER').map((j) => j.due).sort();
  check('reminder due times are start (Asia/Ho_Chi_Minh = UTC+7) minus the lead, exactly', JSON.stringify(reminderDues) === JSON.stringify([dueFor(1440), dueFor(120)].sort()), `${reminderDues} vs ${dueFor(1440)},${dueFor(120)}`);
  r = await anon.call('POST', '/api/internal/notifications/dispatch', {});
  check('dispatch without the key -> 401', r.status === 401, String(r.status));
  r = await anon.call('POST', '/api/internal/notifications/dispatch', {}, { authorization: 'Bearer ' + 'x'.repeat(48) });
  check('dispatch with a wrong key -> 401', r.status === 401, String(r.status));
  const auth = { authorization: `Bearer ${INTERNAL}` };
  r = await anon.call('POST', '/api/internal/notifications/dispatch', {}, auth);
  check('dispatch with the key sends the due confirmation only (reminders are not due yet)', r.status === 200 && r.json.sent === 1 && mock.notifications.length === 1, `${r.status} ${r.text}`);
  const msg = mock.notifications[0];
  check('confirmation content is correct (kind, phone, date DD/MM/YYYY, time 10:00, service, package)', msg?.kind === 'BOOKING_CONFIRMED' && msg.phone === NEW && msg.data.date === day.split('-').reverse().join('/') && msg.data.time === '10:00' && !!msg.data.serviceName && !!msg.data.packageName, JSON.stringify(msg));
  r = await anon.call('POST', '/api/internal/notifications/dispatch', {}, auth);
  check('dispatching again sends nothing new (idempotent)', r.json.sent === 0 && mock.notifications.length === 1, r.text);
  await db.exec("UPDATE dbo.ThongBaoCongViec SET GuiLuc = dbo.utc_now() - interval '1 minute' WHERE Loai='BOOKING_REMINDER' AND GuiLuc = (SELECT min(GuiLuc) FROM dbo.ThongBaoCongViec WHERE Loai='BOOKING_REMINDER')");
  r = await anon.call('POST', '/api/internal/notifications/dispatch', {}, auth);
  check('a reminder that has become due is sent exactly once', r.json.sent === 1 && mock.notifications.filter((m) => m.kind === 'BOOKING_REMINDER').length === 1, r.text);
  const deliveries = JSON.stringify((await db.query('SELECT * FROM dbo.ThongBaoGiaoNhan')).rows);
  check('delivery records exist and contain no tokens/secrets', (await db.query('SELECT count(*)::int n FROM dbo.ThongBaoGiaoNhan')).rows[0].n === 2 && !/token|secret|bearer/i.test(deliveries));

  r = await mk('G2', '11:00', '0955000002');
  check('booking for a phone WITHOUT consent is created', r.status === 201, String(r.status));
  r = await anon.call('POST', '/api/internal/notifications/dispatch', {}, auth);
  const skipped = (await db.query("SELECT LyDoBoQua FROM dbo.ThongBaoCongViec WHERE SoDienThoai='0955000002' AND TrangThai='SKIPPED'")).rows;
  check('no consent -> confirmation SKIPPED(NO_CONSENT), nothing sent', skipped.length >= 1 && skipped[0].lydoboqua === 'NO_CONSENT' && !mock.notifications.some((m) => m.phone === '0955000002'), JSON.stringify(skipped));

  const before = (await db.query("SELECT count(*)::int n FROM dbo.ThongBaoCongViec")).rows[0].n;
  r = await cust2.call('POST', '/api/me/bookings', { fullName: 'Khách E2E', phone: NEW, date: day, time: '15:00', guests: [{ customerName: 'Khách E2E', packageId: 'GV00000001' }] });
  const afterOnline = (await db.query("SELECT count(*)::int n FROM dbo.ThongBaoCongViec")).rows[0].n;
  check('online booking awaiting confirmation ("Chờ xác nhận") queues NO notification', r.status === 201 && afterOnline === before, `${r.status} jobs ${before}->${afterOnline}`);
  const onlineId = r.json.id ?? r.json.bookingId;
  r = await owner.call('PATCH', `/api/bookings/${onlineId}`, { status: 'Đã xác nhận' });
  check('staff confirms the online booking', r.status === 200, `${r.status} ${r.text.slice(0, 100)}`);
  const confirmedJobs = (await db.query("SELECT count(*)::int n FROM dbo.ThongBaoCongViec WHERE KhoaChongTrung LIKE $1", [`BOOKING_CONFIRMED:${String(onlineId).trim()}`])).rows[0].n;
  check('confirming it queues exactly one confirmation', confirmedJobs === 1, String(confirmedJobs));

  r = await owner.call('POST', `/api/bookings/${bookingId}/cancel`);
  check('cancelling the first booking works', r.status === 201 || r.status === 200, String(r.status));
  const pendingLeft = (await db.query("SELECT count(*)::int n FROM dbo.ThongBaoCongViec WHERE MaLichHen=$1 AND Loai='BOOKING_REMINDER' AND TrangThai='PENDING'", [bookingId])).rows[0].n;
  check('cancel: the obsolete pending reminder was cancelled', pendingLeft === 0, String(pendingLeft));
  r = await anon.call('POST', '/api/internal/notifications/dispatch', {}, auth);
  check('cancel: a cancellation message is sent (NOTIFY_CHANGES=true), no reminder goes out for the cancelled booking', mock.notifications.some((m) => m.kind === 'BOOKING_CANCELLED' && m.phone === NEW) && mock.notifications.filter((m) => m.kind === 'BOOKING_REMINDER').length === 1, JSON.stringify(mock.notifications.map((m) => m.kind)));

  // ---------------- provider outage handling
  r = await mk('G3', '12:00', NEW);
  mock.failNext = Object.assign(new Error('x'), { name: 'ProviderTemporaryError', code: 'HTTP_503' });
  Object.setPrototypeOf(mock.failNext, (await import(pathToFileURL(path.join(root, 'backend/dist/messaging/message-provider.js')).href)).ProviderTemporaryError.prototype);
  r = await anon.call('POST', '/api/internal/notifications/dispatch', {}, auth);
  const retry = (await db.query("SELECT TrangThai, SoLanThu FROM dbo.ThongBaoCongViec WHERE Loai='BOOKING_CONFIRMED' AND SoDienThoai=$1 ORDER BY CapNhatLuc DESC LIMIT 1", [NEW])).rows[0];
  check('a temporary provider failure schedules a retry (job back to PENDING, not lost, not duplicated)', r.status === 200 && r.json.retried >= 1 && retry.trangthai === 'PENDING', `${r.text} ${JSON.stringify(retry)}`);
} catch (e) {
  check('e2e run completed without an exception', false, String(e?.stack ?? e));
}

app.close(); await server.stop();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
