#!/usr/bin/env node
// REAL browser E2E for "Lịch theo giường": past slots / ended appointments are dimmed and inert, in-progress and future ones keep working.
// The browser clock is FIXED to 10:30 Asia/Ho_Chi_Minh on 2026-11-20 (Playwright clock), so the result is deterministic.
// Real frontend build + REAL API entry + real PostgreSQL engine (PGlite). In-memory only. Requires `npm run build`.
//   node scripts/e2e-local-calendar-past-browser.mjs
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'backend/package.json'));
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);
const { PGLiteSocketServer } = await import(pathToFileURL(require.resolve('@electric-sql/pglite-socket')).href);
const argon2 = require('argon2');
const { chromium } = require(path.join(root, 'node_modules/@playwright/test'));

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  -> ${detail}`}`); };

const DAY = '2026-11-20';
const db = await PGlite.create();
await db.exec(readFileSync(path.join(root, 'database/postgres/001-schema.sql'), 'utf8'));
const PW = 'Browser-pass-1';
const hash = await argon2.hash(PW, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
await db.query(`INSERT INTO dbo.TaiKhoan VALUES ('TK00000001','owner','0900000001',$1,'Chủ Spa','Hoạt động')`, [hash]);
await db.exec(`INSERT INTO dbo.TaiKhoanQuyen SELECT 'TK00000001', MaQuyen FROM dbo.Quyen;
  INSERT INTO dbo.DanhMuc VALUES ('DM00000001','Da','Hoạt động');
  INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV00000001','DM00000001','Chăm sóc da','Hoạt động');
  INSERT INTO dbo.GoiDichVu VALUES ('GV00000001','DV00000001','Gói 60',60,350000,'Hoạt động');
  INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai) VALUES ('KH00000001','Khách E2E','0912000001');`);
const addBooking = async (id, bed, start, end, status) => {
  await db.query(`INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan) VALUES ($1,'KH00000001',$2,'0912000001',$3,$4,$5,'Chưa thanh toán')`, [id, `Khách ${id}`, DAY, start, status]);
  await db.query(`INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,ThoiDiemBatDau,ThoiDiemKetThuc) VALUES ($1,$2,'GV00000001',$3,$4,$5,$6)`, ['CT' + id.slice(2), id, bed, `Khách ${id}`, `${DAY}T${start}:00`, `${DAY}T${end}:00`]);
};
await addBooking('LH00000001', 'G1', '08:00', '09:00', 'Đã xác nhận'); // ENDED before 10:30
await addBooking('LH00000002', 'G2', '10:00', '11:00', 'Đã xác nhận'); // IN PROGRESS at 10:30
await addBooking('LH00000003', 'G3', '14:00', '15:00', 'Chờ xác nhận'); // FUTURE
await addBooking('LH00000004', 'G4', '10:00', '10:30', 'Chưa đến'); // ends exactly at 10:30 -> NOT yet "end < now"
const dbServer = new PGLiteSocketServer({ db, port: 54345, host: '127.0.0.1' });
await dbServer.start();
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgres://postgres@127.0.0.1:54345/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
  JWT_SECRET: 'e2e-local-secret-not-for-production-use-0123456789', AUTH_SESSION_STORE: 'sql', RATE_LIMIT_ENABLED: 'false',
});
const handler = require(path.join(root, 'api/index.js'));
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
const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-spa-request': '1' }, body: JSON.stringify({ phone: '0900000001', password: PW }) });
const [cookieName, cookieValue] = (login.headers.get('set-cookie') ?? '').split(';')[0].split('=');

const chromeRoot = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
const exe = readdirSync(chromeRoot).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
  .map((d) => path.join(chromeRoot, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')).find(existsSync);
const shots = path.join(os.tmpdir(), 'spa-calendar-shots'); mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: exe, timeout: 45000 });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([{ name: cookieName, value: cookieValue, url: origin }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-11-20T03:30:00Z') }); // = 10:30 in Asia/Ho_Chi_Minh
  await page.goto(`${origin}/admin/lich-hen`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.calendar-appointment', { timeout: 20000 });
  const label = await page.locator('.calendar-toolbar input, .calendar-toolbar').first().innerText().catch(() => '');
  check('the calendar shows the fixed test day (2026-11-20) loaded from the real API', (await page.locator('.calendar-appointment').count()) === 4, `${label}`);

  const cell = (bed, hour) => page.locator('.hour-row').nth(hour).locator('> div').nth(bed - 1);
  const dialogOpen = async () => (await page.locator('dialog.booking-create-modal').evaluateAll((ds) => ds.some((d) => d.open)));
  const hasDetail = async () => (await page.locator('.booking-detail').count()) > 0;

  // ---- 1. empty past slots
  const past = cell(5, 9); // G5 09:00 (start 09:00 < 10:30)
  check('an empty slot in the past is marked as past (dimmed class) and has no button role / tooltip', (await past.getAttribute('class'))?.includes('hour-cell-past') && (await past.getAttribute('role')) === null && (await past.getAttribute('title')) === null);
  const bgBefore = await past.evaluate((e) => getComputedStyle(e).backgroundColor);
  const normalBg = await cell(5, 12).evaluate((e) => getComputedStyle(e).backgroundColor);
  await past.hover();
  const bgHover = await past.evaluate((e) => getComputedStyle(e).backgroundColor);
  check('past empty slot: greyed compared with a normal slot, and no hover change; cursor not-allowed', bgBefore !== normalBg && bgBefore === bgHover && (await past.evaluate((e) => getComputedStyle(e).cursor)) === 'not-allowed', `${bgBefore} | ${normalBg} | ${bgHover}`);
  await past.click({ force: true });
  check('clicking a past empty slot does NOT open the create-booking form', !(await dialogOpen()));
  await cell(5, 10).click({ force: true }); // G5 10:00 started at 10:00 < 10:30
  check('a slot that already started (10:00 at 10:30) cannot be used to create a booking either', !(await dialogOpen()));

  // ---- 2. future empty slot still works
  const future = cell(5, 12);
  check('a future empty slot is a normal clickable slot (button role + tooltip)', (await future.getAttribute('role')) === 'button' && !!(await future.getAttribute('title')));
  await future.click();
  await page.locator('dialog[aria-labelledby="create-booking-title"][open]').waitFor();
  check('clicking a future slot opens the create form with that bed and time preset', (await page.locator('dialog[aria-labelledby="create-booking-title"] select').first().inputValue()).length > 0);
  await page.screenshot({ path: path.join(shots, 'create-from-future-slot.png') });
  await page.locator('dialog[aria-labelledby="create-booking-title"] .spa-modal-close').click();

  // ---- 3. ended appointment
  const ended = page.locator('.calendar-appointment', { hasText: 'Khách LH00000001' });
  check('ended appointment (08:00-09:00): still visible with its service and customer', (await ended.count()) === 1 && (await ended.innerText()).includes('Chăm sóc da') && (await ended.innerText()).includes('Khách LH00000001'));
  const endedCss = await ended.evaluate((e) => { const s = getComputedStyle(e); return { tag: e.tagName, opacity: Number(s.opacity), pe: s.pointerEvents, cursor: s.cursor, filter: s.filter }; });
  check('ended appointment: rendered dimmed (opacity < 1, desaturated) and is not a button', endedCss.tag === 'DIV' && endedCss.opacity < 0.7 && endedCss.filter.includes('saturate'), JSON.stringify(endedCss));
  await ended.dispatchEvent('click');
  await page.waitForTimeout(250);
  check('clicking an ended appointment opens no popup/detail/update form and offers no actions', !(await hasDetail()) && !(await dialogOpen()));
  const endedBox = await ended.boundingBox();
  await page.mouse.click(endedBox.x + endedBox.width / 2, endedBox.y + endedBox.height / 2);
  await page.waitForTimeout(250);
  check('a real mouse click on it (through the overlay) also does nothing', !(await hasDetail()) && !(await dialogOpen()));

  // ---- 4. in-progress and future appointments keep working
  const live = page.locator('.calendar-appointment', { hasText: 'Khách LH00000002' });
  const liveCss = await live.evaluate((e) => ({ tag: e.tagName, opacity: Number(getComputedStyle(e).opacity) }));
  check('in-progress appointment (10:00-11:00 at 10:30): normal button, full opacity (not treated as past)', liveCss.tag === 'BUTTON' && liveCss.opacity === 1, JSON.stringify(liveCss));
  await live.click();
  await page.waitForTimeout(250);
  check('clicking the in-progress appointment still opens its detail', await hasDetail());
  await page.keyboard.press('Escape');
  const edge = page.locator('.calendar-appointment', { hasText: 'Khách LH00000004' });
  check('an appointment that ends exactly now (10:30) is NOT past yet (end < now is false)', (await edge.evaluate((e) => e.tagName)) === 'BUTTON');
  const fut = page.locator('.calendar-appointment', { hasText: 'Khách LH00000003' });
  check('future appointment (14:00): normal button, full opacity, clickable', (await fut.evaluate((e) => e.tagName)) === 'BUTTON' && (await fut.evaluate((e) => Number(getComputedStyle(e).opacity))) === 1);
  await fut.click(); await page.waitForTimeout(250);
  check('clicking the future appointment opens its detail', await hasDetail());
  await page.screenshot({ path: path.join(shots, 'calendar-1030.png') });
  await page.locator('.booking-detail button').first().evaluate((el) => el.closest('.booking-detail')?.querySelector('button')).catch(() => undefined);

  // ---- 5. legend intact
  const legend = await page.locator('.calendar-legend').innerText();
  check('the status legend is intact (5 statuses)', ['Chờ xác nhận', 'Đã xác nhận', 'Chưa đến', 'Hoàn thành', 'Đã hủy'].every((t) => legend.includes(t)), legend);

  // ---- 6. time moves on: the in-progress booking becomes past without reloading
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('.calendar-appointment');
  await page.clock.fastForward('02:00:00'); // 12:30 Vietnam time
  await page.waitForTimeout(500);
  const liveAfter = page.locator('.calendar-appointment', { hasText: 'Khách LH00000002' });
  check('2 hours later (12:30) with the page left open: the 10:00-11:00 booking has become past (dimmed, inert) and the 11:00 slot is now past', (await liveAfter.evaluate((e) => e.tagName)) === 'DIV' && (await cell(5, 11).getAttribute('class'))?.includes('hour-cell-past') && (await cell(5, 13).getAttribute('role')) === 'button');
  const stillFuture = page.locator('.calendar-appointment', { hasText: 'Khách LH00000003' });
  check('the 14:00 booking is still a normal clickable booking at 12:30', (await stillFuture.evaluate((e) => e.tagName)) === 'BUTTON');
  await page.screenshot({ path: path.join(shots, 'calendar-1230.png') });

  // ---- 7. another day: whole past day is inert, future day is normal
  const dateInput = page.locator('.calendar-toolbar input[type="date"]').first();
  if (await dateInput.count()) {
    await dateInput.fill('2026-11-19'); await page.waitForTimeout(600);
    check('a previous day: every empty slot is past and inert', (await page.locator('.hour-row > div.hour-cell-past').count()) > 0 && (await page.locator('.hour-row > div[role="button"]').count()) === 0);
    await dateInput.fill('2026-11-21'); await page.waitForTimeout(600);
    check('the next day: every slot is a normal clickable slot (nothing is dimmed)', (await page.locator('.hour-row > div.hour-cell-past').count()) === 0 && (await page.locator('.hour-row > div[role="button"]').count()) > 0);
  } else check('date picker found', false);
  check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
} catch (e) {
  check('browser run completed without an exception', false, String(e?.stack ?? e).slice(0, 700));
} finally {
  await browser.close(); server.close(); await dbServer.stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\nBROWSER (real stack) ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}\nScreenshots: ${shots}`);
process.exit(failed ? 1 : 0);
