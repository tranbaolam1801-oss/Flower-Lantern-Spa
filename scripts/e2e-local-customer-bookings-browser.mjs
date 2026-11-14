#!/usr/bin/env node
// REAL browser E2E (headless Chromium) for customer booking / my bookings / reschedule and fluid scaling,
// against the built frontend served with the REAL API entry (api/index.js) on a real PostgreSQL engine (PGlite). In-memory only.
// Requires `npm run build` first.   node scripts/e2e-local-customer-bookings-browser.mjs
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

const db = await PGlite.create();
await db.exec(readFileSync(path.join(root, 'database/postgres/001-schema.sql'), 'utf8'));
const PW = 'Browser-pass-1';
const hash = await argon2.hash(PW, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
await db.query(`INSERT INTO dbo.TaiKhoan VALUES
  ('TK00000001','owner','0900000001',$1,'Chủ Spa','Hoạt động'),('TK00000002','manager','0900000002',$1,'Quản lý','Hoạt động'),
  ('TK00000003','staff','0900000003',$1,'Nhân viên','Hoạt động'),('TK00000004','customer','0900000004',$1,'Khách hàng','Hoạt động')`, [hash]);
await db.exec(`INSERT INTO dbo.NhanVien(MaNhanVien,MaTaiKhoan,HoTen,SoDienThoai,TrangThaiLamViec,TrangThaiHoSo) VALUES
  ('NV00000001','TK00000001','Chủ Spa Demo','0900000001','Đang làm việc','Hoạt động'),('NV00000002','TK00000002','Quản Lý Demo','0900000002','Đang làm việc','Hoạt động'),('NV00000003','TK00000003','Nhân Viên Demo','0900000003','Đang làm việc','Hoạt động');
  INSERT INTO dbo.KhachHang(MaKhachHang,MaTaiKhoan,HoTen,SoDienThoai) VALUES ('KH00000001','TK00000004','Khách Demo','0900000004'),('KH00000002',NULL,'Trần Bảo Ngọc','0912000002');
  INSERT INTO dbo.TaiKhoanQuyen SELECT 'TK00000001', MaQuyen FROM dbo.Quyen;
  INSERT INTO dbo.TaiKhoanQuyen VALUES ('TK00000002','Q01'),('TK00000002','Q02'),('TK00000002','Q03'),('TK00000002','Q04'),('TK00000002','Q06'),('TK00000003','Q01'),('TK00000003','Q02');`);
const dbServer = new PGLiteSocketServer({ db, port: 54352, host: '127.0.0.1' });
await dbServer.start();
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgres://postgres@127.0.0.1:54352/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
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

const chromeRoot = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
const exe = readdirSync(chromeRoot).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
  .map((d) => path.join(chromeRoot, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')).find(existsSync);
const shots = path.join(os.tmpdir(), 'spa-auth-shots'); mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: exe, timeout: 45000 });
const pageErrors = [];


const errs2 = [];
const custShots = path.join(os.tmpdir(), 'spa-customer-shots2'); mkdirSync(custShots, { recursive: true });
const vnDate = (d = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() + d * 86400000));
await db.exec(`
  INSERT INTO dbo.DanhMuc VALUES ('DM00000001','Massage','Hoạt động');
  INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV00000001','DM00000001','Massage thư giãn toàn thân','Hoạt động');
  INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES ('GV00000001','DV00000001','Gói 90 phút',90,450000),('GV00000002','DV00000001','Gói 60 phút',60,350000);`);
async function loginC(page, phone = '0900000004') {
  await page.goto(`${origin}/dang-nhap`, { waitUntil: 'networkidle' });
  await page.fill('#phone', phone); await page.fill('#password', PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/dang-nhap'), { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
const apiC = async (cookie, method, url, body) => { const r = await fetch(`${origin}${url}`, { method, headers: { 'content-type': 'application/json', 'x-spa-request': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
const toastC = (page, kind) => page.locator(`[data-testid="notice-toast-${kind}"]`);
const whereC = (page) => new URL(page.url()).pathname;

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs2.push(e.message));
  await loginC(page);
  // ---------------- empty state (Figma 1:11228)
  await page.goto(`${origin}/lich-hen-cua-toi`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="my-bookings-empty"]').waitFor({ timeout: 15000 });
  const empty = page.locator('[data-testid="my-bookings-empty"]'); const et = await empty.innerText(); const eb = await empty.boundingBox();
  check('My bookings, no booking: Figma empty state (calendar icon, "Bạn chưa có lịch hẹn nào!", sub text, green "Đặt lịch ngay"), centred card, no empty table', et.includes('Bạn chưa có lịch hẹn nào!') && et.includes('Hãy đặt lịch để trải nghiệm dịch vụ tại Flower Lantern Spa.') && (await empty.locator('.booking-empty-icon svg').count()) === 1 && (await page.locator('.booking-table').count()) === 0 && Math.abs(eb.x + eb.width / 2 - 720) <= 20, JSON.stringify(eb));
  await page.screenshot({ path: path.join(custShots, 'empty.png') });
  await empty.getByRole('link', { name: 'Đặt lịch ngay' }).click(); await page.waitForURL(/\/dat-lich/);
  check('Empty state button goes to the booking page', whereC(page) === '/dat-lich');

  // ---------------- booking page: time picker + date format (doc p.12-13)
  await page.locator('.date-field-button').waitFor();
  check('Booking: the date field shows dd/mm/yyyy (Vietnamese order), not mm/dd/yyyy', (await page.locator('.date-field-button span').innerText()) === vnDate(0).split('-').reverse().join('/'));
  await page.locator('select').first().waitFor().catch(() => undefined);
  const submit = page.getByRole('button', { name: 'Xác nhận đặt lịch' });
  const sb = await submit.boundingBox(); const form = await page.locator('form').first().boundingBox();
  check('Booking: "Xác nhận đặt lịch" is on the RIGHT side of the form (Figma)', Math.abs(sb.x + sb.width - (form.x + form.width)) <= 40 && sb.x > form.x + form.width / 2, JSON.stringify({ sb, form }));
  // choose service + package so durations apply
  const selects = page.locator('form select');
  await selects.nth(0).selectOption({ index: 1 }).catch(() => undefined);
  await page.waitForTimeout(400);
  const pkgSel = page.locator('form select').filter({ has: page.locator('option', { hasText: 'Gói 90 phút' }) }).first();
  if (await pkgSel.count()) await pkgSel.selectOption({ label: /Gói 90 phút/ }.constructor === RegExp ? undefined : undefined).catch(() => undefined);
  const opts = await pkgSel.locator('option').allInnerTexts().catch(() => []);
  const val90 = (await pkgSel.locator('option', { hasText: '90 phút' }).first().getAttribute('value').catch(() => null));
  if (val90) await pkgSel.selectOption(val90);
  await page.waitForTimeout(300);
  await page.locator('.date-field-button').click();
  await page.locator('.month-cal').waitFor();
  const tomorrow = vnDate(1); const tNum = String(Number(tomorrow.slice(8)));
  check('Calendar: past days are disabled', (await page.locator('.month-cal-day:disabled').count()) >= 1 || vnDate(0).slice(8) === '01');
  await page.locator(`.month-cal-day[aria-label="${tomorrow.split('-').reverse().join('/')}"]`).click();
  check('Calendar: a future date can be chosen and the field shows it dd/mm/yyyy', (await page.locator('.date-field-button span').innerText()) === tomorrow.split('-').reverse().join('/') && (await page.locator('.month-cal').count()) === 0);
  const chips = page.locator('.slot-chip');
  check('Time picker: 30-minute chips 08:00–21:30 in a grid (Figma), the late ones (service must end by 22:00) are disabled for a 90-minute package', (await chips.count()) === 28 && (await chips.first().innerText()) === '08:00' && await chips.filter({ hasText: '21:00' }).isDisabled() && await chips.filter({ hasText: '20:30' }).isEnabled(), `${await chips.count()}`);
  await page.screenshot({ path: path.join(custShots, 'booking-time.png') });
  await chips.filter({ hasText: '10:00' }).click();
  check('Time picker: the chosen chip is filled green (aria-checked) and the summary shows the time range', (await chips.filter({ hasText: '10:00' }).getAttribute('aria-checked')) === 'true' && (await page.locator('aside, .booking-summary, body').first().innerText()).includes('10:00'));
  await submit.click();
  await page.waitForURL(/\/lich-hen-cua-toi|\/dat-lich/, { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  const created = (await db.query('SELECT count(*)::int n FROM dbo.LichHen')).rows[0].n;
  check('Booking submit with a valid date/time creates the booking in SQL (status Chờ xác nhận)', created === 1 && (await db.query("SELECT TrangThaiLichHen s FROM dbo.LichHen")).rows[0].s === 'Chờ xác nhận', String(created));

  // ---------------- my bookings table + fluid layout
  await page.goto(`${origin}/lich-hen-cua-toi`, { waitUntil: 'networkidle' });
  await page.locator('.booking-table tbody tr').first().waitFor({ timeout: 15000 });
  const VPS = [[1366, 768], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440], [3840, 2160], [768, 1024], [390, 844]];
  for (const [w, h] of VPS) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const wrap = document.querySelector('.booking-table-scroll'); const th = document.querySelector('.booking-table th'); const btn = document.querySelector('.booking-table .pill-action-btn');
      const cols = Array.from(document.querySelectorAll('.booking-table th')).map((e) => Math.round(e.getBoundingClientRect().width));
      return { page: document.documentElement.scrollWidth - window.innerWidth, scroll: wrap.scrollWidth - wrap.clientWidth, font: parseFloat(getComputedStyle(th).fontSize), btnH: btn ? Math.round(btn.getBoundingClientRect().height) : 0, cols, cutBtns: Array.from(document.querySelectorAll('.booking-table .pill-action-btn')).some((b) => b.scrollWidth > b.clientWidth + 1) };
    });
    const tableFits = w >= 1280 ? m.scroll <= 1 : true;
    check(`Fluid ${w}x${h}: no page overflow, ${w >= 1280 ? 'the table fits its card without a scrollbar' : 'only the table area may scroll'}, readable text (>=12px), no clipped buttons`, m.page <= 1 && tableFits && m.font >= 12 && !m.cutBtns, JSON.stringify(m));
    if ([1366, 1920, 3840].includes(w)) await page.screenshot({ path: path.join(custShots, `table-${w}.png`) });
  }
  const sizes = await (async () => { const out = []; for (const w of [1366, 1920, 2560, 3840]) { await page.setViewportSize({ width: w, height: Math.round(w * 9 / 16) }); await page.waitForTimeout(200); out.push(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.booking-table td')).fontSize))); } return out; })();
  check('Fluid scaling: table text grows with the viewport within sane limits (non-decreasing, between 13px and 22px)', sizes.every((v, i) => i === 0 || v >= sizes[i - 1]) && sizes[0] >= 13 && sizes.at(-1) <= 22 && sizes.at(-1) > sizes[0], JSON.stringify(sizes));
  await page.setViewportSize({ width: 1440, height: 900 });
  // zoom 125% / 150% = CSS viewport 1152 / 960 wide
  for (const [zoom, w] of [[1.25, 1152], [1.5, 960]]) {
    await page.setViewportSize({ width: w, height: Math.round(900 / zoom) }); await page.waitForTimeout(200);
    check(`Browser zoom ${zoom * 100}% (CSS viewport ${w}px): no page overflow`, (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // ---------------- reschedule modal (Figma 1:19366 etc.)
  const row = page.locator('.booking-table tbody tr').first();
  const bookingId = (await row.locator('td').first().innerText()).trim();
  const cur = (await db.query('SELECT to_char(NgayHen,\'YYYY-MM-DD\') d, to_char(GioHen,\'HH24:MI\') t FROM dbo.LichHen')).rows[0];
  await row.getByRole('button', { name: 'Đổi lịch' }).click();
  const dlg = page.locator('dialog.resch-dialog[open]'); await dlg.waitFor();
  const dt = await dlg.innerText();
  check('Reschedule dialog (Figma): title, subtitle, X, current-booking card (service · package · code · "Lịch hiện tại"), "Ngày hẹn mới", "Giờ hẹn mới (08:00 – 22:00)", note, Hủy + Xác nhận đổi lịch', dt.includes('Đổi lịch hẹn') && dt.includes('Chọn ngày và giờ mới cho lịch hẹn của bạn.') && dt.includes(bookingId) && dt.includes('Lịch hiện tại') && dt.includes('Giờ hẹn mới (08:00 – 22:00)') && dt.includes('Chỉ đổi ngày và giờ hẹn') && (await dlg.getByRole('button', { name: 'Đóng' }).count()) === 1);
  await page.screenshot({ path: path.join(custShots, 'reschedule.png') });
  await dlg.getByRole('button', { name: '✓ Xác nhận đổi lịch' }).click();
  check('Reschedule without changes: "Bạn chưa thay đổi thời gian lịch hẹn!" in the dialog, nothing sent', (await dlg.locator('[data-testid="resch-error"]').innerText()).includes('Bạn chưa thay đổi thời gian lịch hẹn!'));
  await dlg.locator('.date-field-button').click();
  const calMonthOk = await dlg.locator('.month-cal').count();
  check('Reschedule: the date field opens the month calendar (the date CAN be chosen)', calMonthOk === 1);
  const newDay = vnDate(3);
  const moved = page.waitForResponse((r) => /\/api\/me\/bookings\/.+\/time/.test(r.url()) && r.request().method() === 'PATCH', { timeout: 15000 });
  if (newDay.slice(0, 7) !== vnDate(0).slice(0, 7)) await dlg.getByRole('button', { name: 'Tháng sau' }).click();
  await dlg.locator(`.month-cal-day[aria-label="${newDay.split('-').reverse().join('/')}"]`).click();
  check('Reschedule: past days in the calendar are disabled and the chosen date is shown', (await dlg.locator('.date-field-button span').innerText()) === newDay.split('-').reverse().join('/') && (await dlg.locator('.month-cal').count()) === 0);
  await dlg.locator('.slot-chip', { hasText: '14:00' }).click();
  check('Reschedule: slot grid shows the end time hint (90 min -> 15:30)', (await dlg.locator('.resch-info').innerText()).includes('dự kiến kết thúc lúc 15:30'));
  await dlg.getByRole('button', { name: '✓ Xác nhận đổi lịch' }).dblclick();
  await moved;
  await toastC(page, 'success').waitFor();
  const rows2 = (await db.query('SELECT to_char(NgayHen,\'YYYY-MM-DD\') d, to_char(GioHen,\'HH24:MI\') t FROM dbo.LichHen')).rows[0];
  check('Reschedule success: toast "Thành công / Đổi lịch hẹn thành công!" with X, SQL has the new date/time, dialog closed', rows2.d === newDay && rows2.t === '14:00' && (await toastC(page, 'success').innerText()).includes('Đổi lịch hẹn thành công!') && (await toastC(page, 'success').getByRole('button', { name: 'Đóng thông báo' }).count()) === 1 && (await page.locator('dialog.resch-dialog[open]').count()) === 0, JSON.stringify({ cur, rows2 }));
  await toastC(page, 'success').getByRole('button', { name: 'Đóng thông báo' }).click();
  // past is refused client-side and by the backend
  const cookie = (await ctx.cookies(origin)).map((c) => `${c.name}=${c.value}`).join('; ');
  const pastTry = await apiC(cookie, 'PATCH', `/api/me/bookings/${bookingId}/time`, { date: vnDate(-1), time: '10:00' });
  check('Backend refuses rescheduling into the past (4xx) and the booking is unchanged', pastTry.status >= 400 && pastTry.status < 500 && (await db.query('SELECT to_char(NgayHen,\'YYYY-MM-DD\') d FROM dbo.LichHen')).rows[0].d === newDay, String(pastTry.status));
  await page.getByRole('row').filter({ hasText: bookingId }).getByRole('button', { name: 'Đổi lịch' }).click(); await dlg.waitFor();
  await dlg.locator('.date-field-button').click();
  const todayCell = dlg.locator(`.month-cal-day[aria-label="${vnDate(0).split('-').reverse().join('/')}"]`);
  await todayCell.click();
  const disabledNow = await dlg.locator('.slot-chip:disabled').count();
  check('Reschedule to TODAY: slots already in the past (Vietnam time) are disabled (or today has no bookable slot left)', disabledNow >= 1);
  // API failure -> error toast, dialog stays
  await dlg.locator('.date-field-button').click(); await dlg.locator(`.month-cal-day[aria-label="${vnDate(5).split('-').reverse().join('/')}"]`).click().catch(async () => { await dlg.getByRole('button', { name: 'Tháng sau' }).click(); await dlg.locator(`.month-cal-day[aria-label="${vnDate(5).split('-').reverse().join('/')}"]`).click(); });
  await dlg.locator('.slot-chip', { hasText: '15:00' }).click();
  await page.route(/\/api\/me\/bookings\/.+\/time/, (route) => route.abort('failed'));
  await dlg.getByRole('button', { name: '✓ Xác nhận đổi lịch' }).click();
  await toastC(page, 'error').waitFor();
  check('Reschedule API failure: Figma error toast with X, the dialog stays open with the chosen date/time, no raw "Failed to fetch"', (await toastC(page, 'error').innerText()).includes('Không thể đổi lịch hẹn') && (await toastC(page, 'error').getByRole('button', { name: 'Đóng thông báo' }).count()) === 1 && (await dlg.count()) === 1 && !/Failed to fetch/i.test(await page.locator('body').innerText()));
  await page.screenshot({ path: path.join(custShots, 'reschedule-error.png') });
  await page.unroute(/\/api\/me\/bookings\/.+\/time/);
  await toastC(page, 'error').getByRole('button', { name: 'Đóng thông báo' }).click();
  await dlg.getByRole('button', { name: 'Đóng' }).click();
  check('The dialog X closes it without saving', (await page.locator('dialog.resch-dialog[open]').count()) === 0 && (await db.query('SELECT to_char(NgayHen,\'YYYY-MM-DD\') d FROM dbo.LichHen')).rows[0].d === newDay);

  // ---------------- payment QR kept (spec conflict reported, flow untouched)
  check('"Thanh toán QR" is still offered for an unpaid booking (SePay flow kept; the old Figma has no such button — conflict reported, not removed)', (await page.getByRole('row').filter({ hasText: bookingId }).getByRole('button', { name: 'Thanh toán QR' }).count()) === 1);

  // ---------------- header dropdown on this page
  await page.locator('.account-customer-trigger').click();
  check('Header: account icon opens the Figma dropdown with the three items', (await page.locator('.account-dropdown-customer [role="menuitem"]').allInnerTexts()).join('|') === 'Thông tin cá nhân|Lịch hẹn của tôi|Đăng xuất');
  await page.screenshot({ path: path.join(custShots, 'menu.png') });
  await page.keyboard.press('Escape');
  await ctx.close();
  check('no uncaught page errors', errs2.length === 0, errs2.slice(0, 3).join(' | '));
} catch (e) {
  check('browser run completed without an exception', false, String(e?.stack ?? e).slice(0, 1200));
} finally {
  await browser.close(); server.close(); await dbServer.stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\nBROWSER (real stack) ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}\nScreenshots: ${custShots}`);
process.exit(failed ? 1 : 0);
