#!/usr/bin/env node
// Local end-to-end smoke test of the REAL deployed code path: api/index.js (the Vercel Function entry) on a real
// PostgreSQL engine (PGlite, WASM) with the production schema, demo catalog and demo accounts.
// Runs entirely in memory: touches no cloud service and no real database. Requires `npm run build` first.
//
//   node scripts/e2e-local.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'backend/package.json'));
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);
const argon2 = require('argon2');

const results = [];
const check = (name, ok, detail = '') => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`); };

// ---- database: schema + catalog + accounts straight into the engine, then hand it to the app over the pg wire protocol
const { PGLiteSocketServer } = await import(pathToFileURL(require.resolve('@electric-sql/pglite-socket')).href);
const db = await PGlite.create();
await db.exec(readFileSync(path.join(root, 'database/postgres/001-schema.sql'), 'utf8'));
await db.exec(readFileSync(path.join(root, 'database/postgres/002-demo-catalog.sql'), 'utf8'));
const PASSWORD = 'E2e-local-password-1';
const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
await db.query(`INSERT INTO dbo.TaiKhoan VALUES ('TK00000001','admin','0900000001',$1,'Chủ Spa','Hoạt động')`, [hash]);
await db.exec(`INSERT INTO dbo.NhanVien(MaNhanVien,MaTaiKhoan,HoTen,SoDienThoai,TrangThaiLamViec,TrangThaiHoSo) VALUES ('NV00000001','TK00000001','Chủ Spa e2e','0900000001','Đang làm việc','Hoạt động');
  INSERT INTO dbo.TaiKhoanQuyen SELECT 'TK00000001', MaQuyen FROM dbo.Quyen;`);
const server = new PGLiteSocketServer({ db, port: 54340, host: '127.0.0.1' });
await server.start();

Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgres://postgres@127.0.0.1:54340/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
  JWT_SECRET: 'e2e-local-secret-not-for-production-use-0123456789', AUTH_SESSION_STORE: 'sql',
  FRONTEND_ORIGIN: 'http://localhost', RATE_LIMIT_ENABLED: 'false',
});
const handler = require(path.join(root, 'api/index.js'));
const app = http.createServer((q, s) => handler(q, s));
await new Promise((r) => app.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.address().port}`;

let cookie = '';
async function api(method, url, body, extra = {}) {
  const headers = { 'content-type': 'application/json', ...(method !== 'GET' ? { 'x-spa-request': '1' } : {}), ...(cookie ? { cookie } : {}), ...extra };
  const r = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json, headers: r.headers };
}

try {
  let r = await api('GET', '/api/health/live');
  check('health/live is 200', r.status === 200, JSON.stringify(r.json));
  r = await api('GET', '/api/health/ready');
  check('health/ready reaches PostgreSQL', r.status === 200 && r.json.database === 'postgres', JSON.stringify(r.json));

  r = await api('GET', '/api/auth/me');
  check('/me without a session is 401', r.status === 401);
  r = await api('POST', '/api/auth/login', { phone: '0900000001', password: 'wrong-password-123' });
  check('wrong password is rejected (401)', r.status === 401, String(r.status));
  r = await api('POST', '/api/auth/login', { phone: '0900000001', password: PASSWORD });
  const setCookie = r.headers.get('set-cookie') ?? '';
  check('login succeeds with an HttpOnly cookie', r.status === 200 && /HttpOnly/i.test(setCookie), `${r.status} ${setCookie}`);
  cookie = setCookie.split(';')[0];
  r = await api('GET', '/api/auth/me');
  check('/me returns the owner with all permissions', r.status === 200 && r.json.user?.role === 'Chủ Spa' && (r.json.user.permissions?.length ?? 0) >= 6, JSON.stringify(r.json).slice(0, 160));

  r = await api('GET', '/api/services');
  const svcCount = (r.json.items ?? r.json.services ?? []).length;
  check('public service catalog lists the 8 demo services', r.status === 200 && svcCount === 8, `${r.status} count=${svcCount}`);

  const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const guest = (bedId, startsAt) => ({ customerName: 'Khach demo', customerPhone: '0911111111', bedId, packageId: 'GV00000001', startsAt });
  const create = (body) => api('POST', '/api/bookings', body);
  const booking = (bedId, time, extra = {}) => ({ bookerName: 'Nguoi dat', bookerPhone: '0911111111', date: day, guests: [guest(bedId, `${day}T${time}:00`)], ...extra });

  r = await create(booking('G1', '10:00'));
  check('staff booking G1 10:00 is created as "Chưa đến"', r.status === 201, `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  const firstId = r.json.id ?? r.json.bookingId;
  r = await create(booking('G1', '10:30'));
  check('overlapping booking on the same bed is rejected (409)', r.status === 409, `${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
  r = await create(booking('G1', '11:00'));
  check('touching booking (starts when the first ends) is allowed', r.status === 201, `${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
  r = await create(booking('G2', '10:30'));
  check('same time on another bed is allowed', r.status === 201, `${r.status}`);
  r = await create(booking('G16', '10:00'));
  check('bed G16 (outside G1-G15) is rejected', r.status === 400 || r.status === 404, `${r.status}`);
  r = await create(booking('G3', '21:30'));
  check('booking that ends after 22:00 is rejected', r.status === 400, `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  r = await create(booking('G3', '06:00'));
  check('booking before 08:00 is rejected', r.status === 400, `${r.status}`);
  const past = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  r = await create({ ...booking('G4', '10:00'), date: past, guests: [guest('G4', `${past}T10:00:00`)] });
  check('booking in the past is rejected', r.status === 400, `${r.status}`);

  // concurrency through the full HTTP stack (PGlite serialises sessions, so this proves correctness, not parallelism)
  const racers = await Promise.all([0, 1, 2, 3].map(() => create(booking('G5', '14:00'))));
  const ok = racers.filter((x) => x.status === 201).length;
  const conflict = racers.filter((x) => x.status === 409).length;
  check('4 simultaneous requests for one bed/time: exactly 1 wins, 3 get 409', ok === 1 && conflict === 3, racers.map((x) => x.status).join(','));

  r = await api('GET', `/api/bookings?date=${day}`);
  check('calendar lists the created bookings', r.status === 200 && JSON.stringify(r.json).includes('G1'), `${r.status}`);

  r = await api('POST', `/api/bookings/${firstId}/cancel`);
  check('staff can cancel a booking', r.status === 201 && r.json.message === 'Hủy lịch hẹn thành công!', `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  r = await create(booking('G1', '10:00'));
  check('a cancelled booking frees its slot', r.status === 201, `${r.status}`);

  r = await api('POST', '/api/bookings', booking('G6', '10:00'), { 'x-spa-request': '' });
  check('state-changing request without the CSRF header is blocked (403)', r.status === 403, `${r.status}`);
  const noCookie = cookie; cookie = '';
  r = await api('POST', '/api/bookings', booking('G6', '10:00'));
  check('booking without a session is 401', r.status === 401, `${r.status}`);
  cookie = noCookie;

  r = await api('POST', '/api/auth/logout');
  check('logout succeeds', r.status === 200, `${r.status}`);
  r = await api('GET', '/api/auth/me');
  check('the session is revoked after logout (401)', r.status === 401, `${r.status}`);

  r = await api('POST', '/api/payments/sepay/webhook', { id: 1 }, { authorization: 'Apikey wrong' });
  check('webhook with a wrong API key is rejected (401/503, never 200)', r.status === 401 || r.status === 503, `${r.status}`);
} catch (e) {
  check('e2e run completed without an exception', false, String(e?.stack ?? e));
}

app.close();
await server.stop();
const failed = results.filter(([, ok]) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
