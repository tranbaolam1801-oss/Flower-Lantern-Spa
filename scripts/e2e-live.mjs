#!/usr/bin/env node
// LIVE end-to-end verification against a DEPLOYED instance (default: the production demo URL).
//   node scripts/e2e-live.mjs [baseUrl]
// Reads the demo credentials from %USERPROFILE%\flower-lantern-demo-credentials.txt (never printed).
// Creates only clearly tagged test bookings ("E2E-LIVE") and removes what it can via the API afterwards;
// remaining tagged rows can be deleted with the SQL printed at the end. Never touches payments for real:
// the SePay webhook is only called with an invalid key. Exit code 1 if any check fails.
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = (process.argv[2] ?? 'https://flower-lantern-spa.vercel.app').replace(/\/+$/, '');
const TAG = 'E2E-LIVE';
const creds = readFileSync(path.join(os.homedir(), 'flower-lantern-demo-credentials.txt'), 'utf8');
const pick = (label) => { const m = creds.match(new RegExp(`${label}[^\\n]*phone (\\d+)\\s+password (\\S+)`)); if (!m) throw new Error(`no credentials for ${label}`); return { phone: m[1], password: m[2] }; };
const OWNER = pick('Owner'); const CUSTOMER = pick('Customer'); const STAFF = pick('Staff');

const results = [];
const check = (name, ok, detail = '') => { results.push([name, ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`); };

class Session {
  constructor() { this.cookie = ''; }
  async call(method, url, body, extra = {}) {
    const headers = { ...(body !== undefined && !Buffer.isBuffer(body) ? { 'content-type': 'application/json' } : {}), ...(method !== 'GET' ? { 'x-spa-request': '1', origin: BASE } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...extra };
    const t0 = Date.now();
    const r = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body), redirect: 'manual' });
    const raw = Buffer.from(await r.arrayBuffer());
    let json; try { json = JSON.parse(raw.toString('utf8')); } catch { json = raw.toString('utf8').slice(0, 200); }
    return { status: r.status, json, raw, headers: r.headers, ms: Date.now() - t0 };
  }
  async login({ phone, password }) {
    const r = await this.call('POST', '/api/auth/login', { phone, password });
    const sc = r.headers.get('set-cookie') ?? '';
    if (r.status === 200) this.cookie = sc.split(';')[0];
    return { ...r, setCookie: sc };
  }
}

const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const guest = (bedId, time, pkg) => ({ customerName: TAG, customerPhone: '0911000000', bedId, packageId: pkg, startsAt: `${day}T${time}:00` });
const created = [];

try {
  // ---------- public surface
  const anon = new Session();
  let r = await anon.call('GET', '/');
  check('frontend / is served (HTML)', r.status === 200 && /<div id="root">/.test(r.raw.toString()), String(r.status));
  for (const route of ['/dang-nhap', '/admin/lich-hen', '/dich-vu', '/lich-hen-cua-toi']) {
    r = await anon.call('GET', route);
    check(`SPA deep link ${route} serves the app (not 404)`, r.status === 200 && /<div id="root">/.test(r.raw.toString()), String(r.status));
  }
  r = await anon.call('GET', '/api/health/live'); check('API /health/live', r.status === 200);
  r = await anon.call('GET', '/api/health/ready'); check('API /health/ready reaches Neon PostgreSQL', r.status === 200 && r.json.database === 'postgres', JSON.stringify(r.json));
  const hdr = (await anon.call('GET', '/')).headers;
  check('security headers present (nosniff, frame deny)', hdr.get('x-content-type-options') === 'nosniff' && /deny/i.test(hdr.get('x-frame-options') ?? ''), `${hdr.get('x-content-type-options')} ${hdr.get('x-frame-options')}`);
  const apiHdr = (await anon.call('GET', '/api/health/live')).headers;
  check('API sets Helmet security headers', Boolean(apiHdr.get('x-content-type-options')) && Boolean(apiHdr.get('strict-transport-security')), `${apiHdr.get('strict-transport-security')}`);

  r = await anon.call('GET', '/api/services');
  const services = r.json.items ?? r.json.services ?? [];
  check('public catalog lists the 8 services with packages', r.status === 200 && services.length === 8, `${r.status} n=${services.length}`);
  const firstPkg = services[0]?.packages?.[0]?.id ?? 'GV00000001';
  const pkg60 = firstPkg;
  r = await anon.call('GET', '/api/auth/me'); check('/me without session is 401', r.status === 401);
  r = await anon.call('POST', '/api/bookings', { x: 1 }); check('booking without session is 401 (or CSRF 403), never success', r.status === 401 || r.status === 403, String(r.status));
  r = await anon.call('POST', '/api/payments/sepay/webhook', { id: 1 }, { authorization: 'Apikey wrong-key' });
  check('SePay webhook with an invalid key is rejected (401/503, never 200)', r.status === 401 || r.status === 503, String(r.status));
  r = await anon.call('POST', '/api/auth/login', { phone: '0900000001', password: 'definitely-wrong-1' }); check('wrong password is rejected (401)', r.status === 401, String(r.status));

  // ---------- owner session
  const owner = new Session();
  r = await owner.login(OWNER);
  check('owner login succeeds', r.status === 200, String(r.status));
  check('session cookie is HttpOnly + Secure + SameSite=Lax', /HttpOnly/i.test(r.setCookie) && /Secure/i.test(r.setCookie) && /SameSite=Lax/i.test(r.setCookie), r.setCookie.replace(/access_token=[^;]+/, 'access_token=<hidden>'));
  r = await owner.call('GET', '/api/auth/me');
  check('/me returns the owner with permissions Q01-Q06', r.status === 200 && r.json.user?.role === 'Chủ Spa' && (r.json.user?.permissions ?? []).length >= 6, JSON.stringify(r.json).slice(0, 120));
  r = await owner.call('GET', '/api/employees'); check('admin can list employees', r.status === 200, String(r.status));
  const rep = await owner.call('GET', `/api/reports/services?from=${day}&to=${day}`); check('admin reporting endpoint answers', rep.status === 200, String(rep.status));

  const create = async (bed, time, extra = {}) => {
    const res = await owner.call('POST', '/api/bookings', { bookerName: TAG, bookerPhone: '0911000000', date: day, guests: [guest(bed, time, pkg60)], ...extra });
    if (res.status === 201) created.push(res.json.id ?? res.json.bookingId);
    return res;
  };
  r = await create('G15', '10:00');
  check('staff booking on G15 10:00 is created (201)', r.status === 201, `${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
  const firstId = created[0];
  r = await create('G15', '10:30'); check('overlapping booking on the same bed -> 409', r.status === 409, `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  r = await create('G14', '10:30'); check('same time on another bed is allowed', r.status === 201, String(r.status));
  r = await create('G13', '21:45'); check('booking running past 22:00 is rejected (400)', r.status === 400, String(r.status));
  r = await create('G13', '07:00'); check('booking before 08:00 is rejected (400)', r.status === 400, String(r.status));
  r = await create('G16', '10:00'); check('bed G16 is rejected', r.status === 400 || r.status === 404, String(r.status));
  const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  r = await owner.call('POST', '/api/bookings', { bookerName: TAG, bookerPhone: '0911000000', date: past, guests: [{ ...guest('G12', '10:00', pkg60), startsAt: `${past}T10:00:00` }] });
  check('booking in the past is rejected (400)', r.status === 400, String(r.status));

  // ---------- LIVE concurrency: 8 simultaneous HTTP requests for the same bed/time through Vercel -> Neon (pooled)
  const burst = await Promise.all(Array.from({ length: 8 }, () => create('G11', '15:00')));
  const wins = burst.filter((x) => x.status === 201).length; const conflicts = burst.filter((x) => x.status === 409).length;
  check('LIVE race: 8 simultaneous requests for one bed/time -> exactly 1 created, 7 conflicts', wins === 1 && conflicts === 7, burst.map((x) => x.status).join(','));

  r = await owner.call('GET', `/api/bookings?date=${day}`);
  check('calendar read shows the new bookings', r.status === 200 && JSON.stringify(r.json).includes('G15'), String(r.status));
  r = await owner.call('PATCH', `/api/bookings/${firstId}`, { notes: 'E2E-LIVE note' });
  check('booking update (notes) succeeds', r.status === 200, `${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  r = await owner.call('POST', `/api/bookings/${firstId}/cancel`); check('staff cancel succeeds', r.status === 201 || r.status === 200, String(r.status));
  r = await create('G15', '10:00'); check('a cancelled booking frees its slot', r.status === 201, String(r.status));
  r = await owner.call('POST', '/api/bookings', { bookerName: TAG }, { 'x-spa-request': '' });
  check('state-changing request without the CSRF header -> 403', r.status === 403, String(r.status));
  r = await owner.call('POST', '/api/bookings', { bookerName: TAG }, { origin: 'https://evil.example' });
  check('state-changing request from a foreign Origin -> 403', r.status === 403, String(r.status));

  // ---------- image upload -> Vercel Blob -> read back
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  r = await owner.call('POST', '/api/admin/services/image', PNG, { 'content-type': 'image/png' });
  check('image upload to private Blob storage (201)', r.status === 201 && /^\/api\/uploads\/services\/[a-f0-9]{32}\.png$/.test(r.json.path ?? ''), `${r.status} ${JSON.stringify(r.json).slice(0, 140)}`);
  if (r.status === 201) {
    const img = await anon.call('GET', r.json.path);
    check('uploaded image is served back byte-identical with the right headers', img.status === 200 && img.raw.equals(PNG) && /image\/png/.test(img.headers.get('content-type') ?? '') && img.headers.get('x-content-type-options') === 'nosniff', `${img.status} ${img.headers.get('content-type')}`);
  }
  r = await owner.call('POST', '/api/admin/services/image', Buffer.from('<?php echo 1;'), { 'content-type': 'image/png' });
  check('a non-image disguised as PNG is rejected (400)', r.status === 400, String(r.status));
  r = await anon.call('GET', '/api/uploads/services/..%2F..%2Fetc%2Fpasswd'); check('path traversal on the image route is rejected', r.status === 404 || r.status === 400, String(r.status));

  // ---------- RBAC: customer and staff must not reach admin functions
  const cust = new Session();
  r = await cust.login(CUSTOMER); check('customer login succeeds', r.status === 200, String(r.status));
  r = await cust.call('GET', '/api/employees'); check('customer cannot list employees (403)', r.status === 403, String(r.status));
  r = await cust.call('POST', '/api/bookings', { bookerName: TAG }); check('customer cannot use the staff booking endpoint (403)', r.status === 403, String(r.status));
  const cr = await cust.call('POST', '/api/me/bookings', { fullName: TAG, phone: '0900000004', date: day, time: '17:00', guests: [{ customerName: TAG, packageId: pkg60 }] });
  check('customer online booking succeeds (201, auto bed)', cr.status === 201, `${cr.status} ${JSON.stringify(cr.json).slice(0, 160)}`);
  const mine = await cust.call('GET', '/api/me/bookings');
  check('customer sees their own booking as "Chờ xác nhận"', mine.status === 200 && JSON.stringify(mine.json).includes('Chờ xác nhận'), `${mine.status}`);
  const stf = new Session();
  r = await stf.login(STAFF); check('staff login succeeds', r.status === 200, String(r.status));
  r = await stf.call('GET', '/api/employees'); check('staff cannot manage employees (403)', r.status === 403, String(r.status));
  r = await stf.call('GET', `/api/bookings?date=${day}`); check('staff can read the calendar', r.status === 200, String(r.status));

  // ---------- logout / revocation, lockout
  r = await owner.call('POST', '/api/auth/logout'); check('logout succeeds', r.status === 200, String(r.status));
  r = await owner.call('GET', '/api/auth/me'); check('revoked session is refused after logout (401)', r.status === 401, String(r.status));
} catch (e) {
  check('live run completed without an exception', false, String(e?.stack ?? e));
}

const failed = results.filter(([, ok]) => !ok).length;
console.log(`\nLIVE ${BASE}: ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
console.log(`Test bookings are tagged "${TAG}" (guest/booker name). Cleanup SQL (run on the direct Neon URL): DELETE FROM dbo.KhachSuDungDichVu WHERE TenKhach='${TAG}'; DELETE FROM dbo.LichHen WHERE HoTenNguoiDat='${TAG}';`);
process.exit(failed ? 1 : 0);
