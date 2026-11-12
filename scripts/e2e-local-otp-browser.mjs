#!/usr/bin/env node
// REAL browser E2E (headless Chromium) of registration and forgotten-password through the built frontend, served together with the
// REAL API entry (api/index.js) on a real PostgreSQL engine (PGlite). The OTP is read from the in-process MOCK provider outbox
// (a real phone is never contacted). Requires `npm run build` first.
//   node scripts/e2e-local-otp-browser.mjs
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'backend/package.json'));
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);
const { PGLiteSocketServer } = await import(pathToFileURL(require.resolve('@electric-sql/pglite-socket')).href);
const { chromium } = require(path.join(root, 'node_modules/@playwright/test'));

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`); };

const db = await PGlite.create();
for (const f of ['001-schema.sql', '004-otp-notifications.sql']) await db.exec(readFileSync(path.join(root, 'database/postgres', f), 'utf8'));
const dbServer = new PGLiteSocketServer({ db, port: 54342, host: '127.0.0.1' });
await dbServer.start();

Object.assign(process.env, {
  NODE_ENV: 'test', MESSAGING_MOCK: 'true', DATABASE_URL: 'postgres://postgres@127.0.0.1:54342/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
  JWT_SECRET: 'e2e-local-secret-not-for-production-use-0123456789', AUTH_SESSION_STORE: 'sql', RATE_LIMIT_ENABLED: 'false', OTP_PEPPER: 'p'.repeat(48),
  OTP_RESEND_COOLDOWN_SECONDS: '60',
});
const handler = require(path.join(root, 'api/index.js'));
const mock = require(path.join(root, 'backend/dist/messaging/messaging.module.js')).messagingProviders.otp;

// One origin for UI + API (like Vercel): /api/* -> NestJS handler, everything else -> frontend/dist with SPA fallback.
const dist = path.join(root, 'frontend/dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handler(req, res);
  let file = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
process.env.FRONTEND_ORIGIN = origin;

const chromeRoot = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
const exe = readdirSync(chromeRoot).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
  .map((d) => path.join(chromeRoot, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')).find(existsSync);
const shots = path.join(os.tmpdir(), 'spa-otp-real-shots'); mkdirSync(shots, { recursive: true });

const PHONE = '0933111222', PW1 = 'Browser-pass-1', PW2 = 'Browser-pass-2';
const browser = await chromium.launch({ headless: true, executablePath: exe, timeout: 45000 });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const waitOtp = async (phone) => { for (let i = 0; i < 50; i++) { const c = mock.lastOtp(phone); if (c) return c; await page.waitForTimeout(100); } return undefined; };

  // ---------- registration through the UI
  await page.goto(`${origin}/dang-nhap`, { waitUntil: 'networkidle' });
  await page.getByText('Đăng ký ngay').click();
  await page.waitForURL(/\/dang-ky$/);
  check('login page "Đăng ký ngay" opens /dang-ky', true);
  await page.fill('#otp-phone', PHONE);
  await page.getByRole('button', { name: 'Gửi mã xác thực' }).click();
  await page.waitForSelector('#otp-code');
  check('UI shows the generic sentence after requesting a code', (await page.locator('body').innerText()).includes('Nếu số điện thoại hợp lệ, mã xác thực đã được gửi.'));
  const code = await waitOtp(PHONE);
  check('the mock provider received a 6-digit code for that phone', /^\d{6}$/.test(code ?? ''));
  await page.fill('#otp-code', '000000' === code ? '111111' : '000000');
  await page.waitForSelector('text=Mã xác thực không đúng hoặc đã hết hạn.', { timeout: 15000 });
  check('a wrong code shows the generic error in the UI', true);
  await page.fill('#otp-code', code);
  await page.waitForSelector('#reg-name', { timeout: 20000 });
  check('the correct code advances to the details step', true);
  await page.screenshot({ path: path.join(shots, 'register-details.png') });
  await page.fill('#reg-name', 'Khách Trình Duyệt');
  await page.fill('#reg-password', PW1);
  await page.fill('#reg-confirm', PW1);
  await page.locator('.otp-consent input[type="checkbox"]').check();
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await page.waitForSelector('text=Đăng ký thành công', { timeout: 20000 });
  check('registration completes in the UI', true);
  const acc = (await db.query("SELECT VaiTro FROM dbo.TaiKhoan WHERE SoDienThoai=$1", [PHONE])).rows[0];
  check('the account exists in PostgreSQL as a customer, with consent stored', acc?.vaitro === 'Khách hàng' && (await db.query('SELECT 1 FROM dbo.DongYNhanTin WHERE SoDienThoai=$1', [PHONE])).rows.length === 1);

  // ---------- login with the new account through the real login screen
  await page.goto(`${origin}/dang-nhap`, { waitUntil: 'networkidle' });
  await page.fill('#phone', PHONE); await page.fill('#password', PW1);
  await Promise.all([page.waitForURL(/\/lich-hen-cua-toi/, { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
  check('the new customer can log in through the UI and lands on "Lịch hẹn của tôi"', /lich-hen-cua-toi/.test(page.url()), page.url());

  // ---------- forgotten password through the UI (fresh context = logged out)
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(`${origin}/dang-nhap`, { waitUntil: 'networkidle' });
  await p2.getByText('Quên mật khẩu?').click();
  await p2.waitForURL(/\/quen-mat-khau$/);
  await p2.fill('#otp-phone', PHONE);
  mock.clear();
  await p2.getByRole('button', { name: 'Gửi mã xác thực' }).click();
  await p2.waitForSelector('#otp-code');
  let rc; for (let i = 0; i < 50 && !(rc = mock.lastOtp(PHONE)); i++) await p2.waitForTimeout(100);
  check('reset: a code was sent to the registered customer', /^\d{6}$/.test(rc ?? ''));
  await p2.fill('#otp-code', rc);
  await p2.waitForSelector('#reg-password', { timeout: 20000 });
  await p2.fill('#reg-password', PW2); await p2.fill('#reg-confirm', PW2);
  await p2.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
  await p2.waitForSelector('text=Đặt lại mật khẩu thành công', { timeout: 20000 });
  check('reset completes in the UI', true);
  await p2.goto(`${origin}/dang-nhap`, { waitUntil: 'networkidle' });
  await p2.fill('#phone', PHONE); await p2.fill('#password', PW1);
  await p2.locator('button[type="submit"]').first().click();
  await p2.waitForSelector('[aria-live="polite"]:has-text("không đúng"), [role="alert"]', { timeout: 15000 }).catch(() => undefined);
  check('the OLD password is rejected after the reset (still on the login page)', /dang-nhap/.test(p2.url()), p2.url());
  await p2.fill('#password', PW2);
  await Promise.all([p2.waitForURL(/\/lich-hen-cua-toi/, { timeout: 30000 }), p2.locator('button[type="submit"]').first().click()]);
  check('the NEW password logs in through the UI', /lich-hen-cua-toi/.test(p2.url()), p2.url());
  await ctx2.close();

  // ---------- an unknown phone shows exactly the same message (no enumeration in the UI)
  const ctx3 = await browser.newContext(); const p3 = await ctx3.newPage();
  await p3.goto(`${origin}/quen-mat-khau`, { waitUntil: 'networkidle' });
  await p3.fill('#otp-phone', '0944000999');
  await p3.getByRole('button', { name: 'Gửi mã xác thực' }).click();
  await p3.waitForSelector('#otp-code');
  check('unknown phone: the UI shows the same generic sentence and the code step', (await p3.locator('body').innerText()).includes('Nếu số điện thoại hợp lệ, mã xác thực đã được gửi.') && mock.lastOtp('0944000999') === undefined);
  await p3.screenshot({ path: path.join(shots, 'reset-unknown.png') });
  await ctx3.close();
  check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('browser run completed without an exception', false, String(e?.stack ?? e).slice(0, 400));
} finally {
  await browser.close(); server.close(); await dbServer.stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\nBROWSER (real stack) ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}\nScreenshots: ${shots}`);
process.exit(failed ? 1 : 0);
