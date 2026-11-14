#!/usr/bin/env node
// REAL browser E2E (headless Chromium) for the in-app notification bell,
// against the built frontend served with the REAL API entry (api/index.js) on a real PostgreSQL engine (PGlite). In-memory only.
// Requires `npm run build` first.   node scripts/e2e-local-notifications-browser.mjs
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
await db.exec(readFileSync(path.join(root, 'database/postgres/005-in-app-notifications.sql'), 'utf8'));
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
const dbServer = new PGLiteSocketServer({ db, port: 54349, host: '127.0.0.1' });
await dbServer.start();
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgres://postgres@127.0.0.1:54349/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
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


const pageErrors2 = [];
const VN = (offsetDays) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() + offsetDays * 86400000));
await db.exec(`
  INSERT INTO dbo.DanhMuc VALUES ('DM00000001','Da','Hoạt động');
  INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV00000001','DM00000001','Chăm sóc da cơ bản','Hoạt động');
  INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES ('GV00000001','DV00000001','Gói 60',60,350000);
  INSERT INTO dbo.TaiKhoanQuyen VALUES ('TK00000002','Q05');`);
const dash2 = path.join(os.tmpdir(), 'spa-bell-shots'); mkdirSync(dash2, { recursive: true });
const loginCookie2 = async (phone) => { const r = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-spa-request': '1' }, body: JSON.stringify({ phone, password: PW }) }); return (r.headers.get('set-cookie') ?? '').split(';')[0]; };
const call = async (cookie, method, url, body) => { const r = await fetch(`${origin}${url}`, { method, headers: { 'content-type': 'application/json', 'x-spa-request': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
const dbUnread = async (phone) => (await db.query("SELECT count(*)::int n FROM dbo.ThongBaoNoiBo n JOIN dbo.TaiKhoan t ON t.MaTaiKhoan=n.MaTaiKhoanNhan WHERE t.SoDienThoai=$1 AND n.DaDocLuc IS NULL", [phone])).rows[0].n;
const dbTotal = async (phone) => (await db.query("SELECT count(*)::int n FROM dbo.ThongBaoNoiBo n JOIN dbo.TaiKhoan t ON t.MaTaiKhoan=n.MaTaiKhoanNhan WHERE t.SoDienThoai=$1", [phone])).rows[0].n;
const where2 = (page) => new URL(page.url()).pathname;
async function uiLogin2(page, phone) {
  await page.goto(`${origin}/dang-nhap`, { waitUntil: 'networkidle' });
  await page.fill('#phone', phone); await page.fill('#password', PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/dang-nhap'), { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
const bell = (page) => page.locator('.notif-button');
const badge = (page) => page.locator('[data-testid="notif-badge"]');
const panel = (page) => page.locator('.notif-panel');
const ready = (page) => page.waitForFunction(() => { const p = document.querySelector('.notif-panel'); return p && !p.textContent.includes('Đang tải thông báo'); }, null, { timeout: 10000 });
const badgeText = async (page) => ((await badge(page).count()) ? (await badge(page).innerText()).trim() : '');

try {
  const custCookie = await loginCookie2('0900000004');
  const managerCookie = await loginCookie2('0900000002');
  const ownerCookie = await loginCookie2('0900000001');

  // ---------- real business events create the notifications
  const date = VN(1);
  const created = await call(custCookie, 'POST', '/api/me/bookings', { fullName: 'Khách Demo', phone: '0900000004', date, time: '10:00', guests: [{ customerName: 'Khách Demo', packageId: 'GV00000001' }] });
  check('Customer booking via the real API succeeds (201) and creates notifications for the Q01 holders only (manager + staff, not owner)', created.status === 201 && (await dbTotal('0900000002')) === 1 && (await dbTotal('0900000003')) === 1 && (await dbTotal('0900000001')) === 0, JSON.stringify(created));
  const bookingId = created.json?.id?.trim();

  // ---------- manager UI
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); page.on('pageerror', (e) => { pageErrors2.push(e.message); });
  const unreadReqs = []; page.on('request', (r) => { if (r.url().includes('/api/notifications/unread-count')) unreadReqs.push(Date.now()); });
  await uiLogin2(page, '0900000002');
  await page.waitForFunction(() => document.querySelector('[data-testid="notif-badge"]'), null, { timeout: 15000 });
  check('Manager: the bell badge shows the exact unread count (1)', (await badgeText(page)) === '1' && (await dbUnread('0900000002')) === 1);
  const ar = await bell(page).getAttribute('aria-label');
  check('Bell: accessible name includes the unread count; it is a button next to the avatar/name in the existing header order', (ar ?? '').includes('1 chưa đọc') && (await page.locator('.admin-header >> .notif-wrap + .account-menu').count()) === 1);

  // open / close behaviours
  await bell(page).click(); await panel(page).waitFor();
  await ready(page);
  const text = await panel(page).innerText();
  check('Opening shows the title "Thông báo", the unread count, the notification (title, short body with booking code, time) and "Đánh dấu tất cả đã đọc"', text.includes('Thông báo') && text.includes('1 chưa đọc') && text.includes('Lịch hẹn mới từ website') && text.includes(bookingId) && /Vừa xong|phút trước/.test(text) && text.includes('Đánh dấu tất cả đã đọc'), text.slice(0, 300));
  check('Opening the dropdown does NOT mark anything as read (DB + badge unchanged)', (await dbUnread('0900000002')) === 1 && (await badgeText(page)) === '1');
  const pb = await panel(page).boundingBox(); const bb = await bell(page).boundingBox();
  check('Desktop: the dropdown is directly below the bell, 340-420px wide, fully inside the viewport', pb.y >= bb.y + bb.height && pb.y < bb.y + bb.height + 24 && pb.width >= 340 && pb.width <= 420 && pb.x >= 0 && pb.x + pb.width <= 1440, JSON.stringify({ pb, bb }));
  await page.screenshot({ path: path.join(dash2, 'bell-open.png') });
  await bell(page).click();
  check('Click the bell again closes it', (await panel(page).count()) === 0 && (await bell(page).getAttribute('aria-expanded')) === 'false');
  await bell(page).click(); await panel(page).waitFor(); await page.mouse.click(500, 30);
  check('Click outside closes it', (await panel(page).count()) === 0);
  await bell(page).click(); await panel(page).waitFor(); await page.keyboard.press('Escape');
  check('Escape closes it and returns focus to the bell', (await panel(page).count()) === 0 && (await page.evaluate(() => document.activeElement?.className.includes('notif-button'))));
  await bell(page).click(); await panel(page).waitFor();
  await page.locator('.account-role-trigger').click();
  check('Opening the account menu closes the bell dropdown (one popover at a time)', (await panel(page).count()) === 0 && (await page.locator('.account-dropdown').isVisible()));
  await page.keyboard.press('Escape');

  // click an item -> read + navigate with permission
  await bell(page).click(); await panel(page).waitFor();
  await page.locator('.notif-item').first().click();
  await page.waitForURL(/\/admin\/lich-hen/);
  await page.waitForTimeout(500);
  check('Clicking a notification marks it read (DB), navigates to Quản lý lịch hẹn and closes the dropdown; the badge disappears', where2(page) === '/admin/lich-hen' && (await dbUnread('0900000002')) === 0 && (await badge(page).count()) === 0 && (await panel(page).count()) === 0);
  await page.reload({ waitUntil: 'networkidle' });
  await bell(page).click(); await panel(page).waitFor();
  await ready(page);
  const afterReload = await page.locator('.notif-item').count();
  check('After a refresh the history is still there (item kept, now read) and no badge', afterReload === 1 && (await page.locator('.notif-item.is-unread').count()) === 0 && (await badge(page).count()) === 0);
  await page.keyboard.press('Escape');

  // customer reschedule + cancel
  await call(custCookie, 'PATCH', `/api/me/bookings/${bookingId}/time`, { date, time: '11:00' });
  await call(custCookie, 'POST', `/api/me/bookings/${bookingId}/cancel`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-testid="notif-badge"]'), null, { timeout: 15000 });
  await bell(page).click(); await panel(page).waitFor();
  await ready(page);
  const t2 = await panel(page).innerText();
  check('Customer reschedule and cancel produce two more notifications for the manager (2 unread), newest first', (await badgeText(page)) === '2' && t2.includes('Khách hàng hủy lịch hẹn') && t2.includes('Khách hàng đổi lịch hẹn') && t2.indexOf('hủy lịch hẹn') < t2.indexOf('đổi lịch hẹn'), t2.slice(0, 300));
  await page.locator('.notif-readall').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="notif-badge"]'), null, { timeout: 8000 });
  await page.waitForFunction(() => document.querySelectorAll('.notif-item').length === 3 && !document.querySelector('.notif-item.is-unread'), null, { timeout: 8000 });
  check('"Đánh dấu tất cả đã đọc" marks all read (DB 0), badge disappears, items stay in the list', (await dbUnread('0900000002')) === 0 && (await page.locator('.notif-item').count()) === 3 && (await page.locator('.notif-item.is-unread').count()) === 0 && (await page.locator('.notif-readall').isDisabled()));
  await page.keyboard.press('Escape');

  // isolation: the staff account has its own copies; the owner has none; nobody sees others'
  const sctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const spage = await sctx.newPage(); await uiLogin2(spage, '0900000003');
  await spage.waitForFunction(() => document.querySelector('[data-testid="notif-badge"]'), null, { timeout: 15000 });
  check('Staff (Q01) has an independent unread count (3) - the manager reading theirs did not change it', (await badgeText(spage)) === '3' && (await dbUnread('0900000003')) === 3);
  const sc = (await sctx.cookies(origin)).map((c) => `${c.name}=${c.value}`).join('; ');
  const mItem = (await call(managerCookie, 'GET', '/api/notifications')).json.items[0];
  const cross = await call(sc, 'PATCH', `/api/notifications/${mItem.id}/read`);
  const own = (await call(sc, 'GET', '/api/notifications')).json;
  check('Account A cannot mark account B\'s notification (404); lists only contain the caller\'s own rows', cross.status === 404 && own.items.every((i) => i.id !== mItem.id) && (await call(custCookie, 'GET', '/api/notifications')).status === 403);

  // permission gating on click: a notification the staff cannot open
  await db.exec(`INSERT INTO dbo.ThongBaoNoiBo(MaTaiKhoanNhan,Loai,TieuDe,NoiDung,KhoaChongTrung) VALUES ('TK00000003','PERMISSION_CHANGED','Thay đổi phân quyền nhân viên','Thử nghiệm quyền','gate1')`);
  await spage.reload({ waitUntil: 'networkidle' });
  await bell(spage).click(); await panel(spage).waitFor();
  await spage.locator('.notif-item', { hasText: 'Thay đổi phân quyền nhân viên' }).click();
  await spage.waitForTimeout(600);
  check('A notification the user lacks permission for: marked read, NO navigation to another role\'s page, a clear note is shown', where2(spage) === '/admin/lich-hen' && (await spage.locator('.notif-note').innerText()).includes('Bạn không có quyền') && (await dbUnread('0900000003')) === 3);
  await sctx.close();

  // permission change by the manager (has Q05) -> owner is notified
  const perm = await call(managerCookie, 'PUT', '/api/employees/NV00000003/permissions', { role: 'Nhân viên', permissions: ['Q01', 'Q02', 'Q03'] });
  check('Manager changes an employee\'s permissions (real API 200) -> exactly one notification for Chủ Spa, none for the actor', perm.status === 200 && (await dbTotal('0900000001')) === 1 && (await dbTotal('0900000002')) === 3, JSON.stringify(perm));
  const lock = await call(managerCookie, 'PATCH', '/api/employees/NV00000003/account-status', { status: 'Đã khóa' });
  check('Locking the account (real API 200) -> a second notification for Chủ Spa', lock.status === 200 && (await dbTotal('0900000001')) === 2);
  // a failing business request creates nothing
  const bad = await call(managerCookie, 'PUT', '/api/employees/NV00000001/permissions', { role: 'Nhân viên', permissions: ['Q01'] });
  check('A rejected business request (unknown employee / forbidden) creates no notification', bad.status >= 400 && (await dbTotal('0900000001')) === 2, String(bad.status));

  const octx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const opage = await octx.newPage(); opage.on('pageerror', (e) => pageErrors2.push(e.message));
  await uiLogin2(opage, '0900000001');
  await opage.waitForFunction(() => document.querySelector('[data-testid="notif-badge"]'), null, { timeout: 15000 });
  await bell(opage).click(); await panel(opage).waitFor();
  await ready(opage);
  const ot = await panel(opage).innerText();
  check('Owner sees who changed whom (names) and the permission summary, without any secret', (await badgeText(opage)) === '2' && ot.includes('Thay đổi phân quyền nhân viên') && /Q01, Q02, Q03/.test(ot) && /Quản Lý Demo/.test(ot) && /Nhân Viên Demo/.test(ot) && !/token|mật khẩu|password|jwt/i.test(ot), ot.slice(0, 400));
  await opage.locator('.notif-item', { hasText: 'Thay đổi phân quyền nhân viên' }).click(); await opage.waitForURL(/\/admin\/nhan-vien/);
  check('Owner clicks it -> Quản lý nhân viên, marked read', where2(opage) === '/admin/nhan-vien' && (await dbUnread('0900000001')) === 1);
  await octx.close();

  // empty / error / retry states + polling + responsive on the manager page
  await db.exec("DELETE FROM dbo.ThongBaoNoiBo WHERE MaTaiKhoanNhan='TK00000002'");
  await page.reload({ waitUntil: 'networkidle' });
  await bell(page).click(); await panel(page).waitFor();
  await ready(page);
  check('Empty state: "Chưa có thông báo nào."', (await panel(page).innerText()).includes('Chưa có thông báo nào.') && (await badge(page).count()) === 0);
  await page.keyboard.press('Escape');
  let fail = true;
  await page.route(/\/api\/notifications\?/, (route) => (fail ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Internal server error"}' }) : route.continue()));
  await bell(page).click(); await panel(page).locator('[role="alert"]').waitFor({ timeout: 10000 });
  check('Error state: friendly message + "Thử lại", no raw text', (await panel(page).innerText()).includes('Không thể tải thông báo. Vui lòng thử lại!') && !/Internal server error|Failed to fetch/i.test(await panel(page).innerText()));
  fail = false;
  await db.exec("INSERT INTO dbo.ThongBaoNoiBo(MaTaiKhoanNhan,Loai,TieuDe,NoiDung,KhoaChongTrung) VALUES ('TK00000002','REVIEW_CREATED','Đánh giá mới','An đã đánh giá 5 sao','retry1')");
  await panel(page).getByRole('button', { name: 'Thử lại' }).click();
  await panel(page).locator('.notif-item').first().waitFor({ timeout: 10000 });
  check('"Thử lại" reloads the list and shows the data', (await panel(page).innerText()).includes('Đánh giá mới'));
  await page.unroute(/\/api\/notifications\?/);
  await page.keyboard.press('Escape');

  // many notifications: scroll inside, pagination
  for (let i = 0; i < 30; i++) await db.exec(`INSERT INTO dbo.ThongBaoNoiBo(MaTaiKhoanNhan,Loai,TieuDe,NoiDung,KhoaChongTrung,TaoLuc) VALUES ('TK00000002','REVIEW_CREATED','Đánh giá số ${i}','Nội dung dài '||repeat('x ', 80),'many${i}', dbo.utc_now() - interval '${i} minutes')`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('[data-testid="notif-badge"]'), null, { timeout: 15000 });
  check('Badge caps at 99+ style and shows the exact number below that (31)', (await badgeText(page)) === '31');
  await bell(page).click(); await panel(page).waitFor(); await page.locator('.notif-item').first().waitFor();
  const body = await page.locator('.notif-body').evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
  check('Many notifications: the list scrolls INSIDE the dropdown (max ~440px) and "Xem thêm" loads the next page', body.sh > body.ch && body.ch <= 441 && (await page.locator('.notif-item').count()) === 15 && (await page.locator('.notif-more').count()) === 1);
  await page.locator('.notif-more').click(); await page.waitForFunction(() => document.querySelectorAll('.notif-item').length === 30, null, { timeout: 8000 });
  check('Pagination: second page appended (30 items)', (await page.locator('.notif-item').count()) === 30);
  await page.keyboard.press('Escape');

  // polling (fake clock) + hidden tab
  await page.clock.install({ time: Date.now() });
  await page.reload({ waitUntil: 'networkidle' });
  unreadReqs.length = 0;
  await db.exec("INSERT INTO dbo.ThongBaoNoiBo(MaTaiKhoanNhan,Loai,TieuDe,NoiDung,KhoaChongTrung) VALUES ('TK00000002','REVIEW_CREATED','Mới nhất','poll','poll1')");
  await page.clock.fastForward(31000); await page.waitForTimeout(800);
  check('Polling: after ~30 s the badge picks up a new notification without any click (31 -> 32)', (await badgeText(page)) === '32', await badgeText(page));
  const n0 = unreadReqs.length;
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.fastForward(95000); await page.waitForTimeout(600);
  check('Hidden tab: polling stops (no unread-count requests while hidden)', unreadReqs.length === n0, `${unreadReqs.length - n0} extra`);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await ctx.close();

  // responsive
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const mp = await mctx.newPage(); mp.on('pageerror', (e) => pageErrors2.push(e.message));
  await uiLogin2(mp, '0900000002');
  await mp.waitForFunction(() => document.querySelector('[data-testid="notif-badge"]'), null, { timeout: 15000 });
  await bell(mp).tap(); await panel(mp).waitFor(); await mp.locator('.notif-item').first().waitFor();
  const mb = await panel(mp).boundingBox(); const ov = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('Mobile 390px: dropdown fits the viewport (no overflow), scrolls inside, header not broken', mb.x >= 0 && mb.x + mb.width <= 390 && mb.y + mb.height <= 844 && ov <= 1, JSON.stringify(mb));
  await mp.screenshot({ path: path.join(dash2, 'bell-mobile.png') });
  await mp.touchscreen.tap(20, 800);
  check('Mobile: tapping outside closes it', (await panel(mp).count()) === 0);
  await mctx.close();

  // customer area has no bell
  const cctx = await browser.newContext(); const cp = await cctx.newPage(); await uiLogin2(cp, '0900000004');
  check('Customer area has no notification bell and the API refuses customers (403)', (await cp.locator('.notif-button').count()) === 0 && (await call(custCookie, 'GET', '/api/notifications/unread-count')).status === 403);
  await cctx.close();
  check('no uncaught page errors', pageErrors2.length === 0, pageErrors2.slice(0, 3).join(' | '));
} catch (e) {
  check('browser run completed without an exception', false, String(e?.stack ?? e).slice(0, 1000));
} finally {
  await browser.close(); server.close(); await dbServer.stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\nBROWSER (real stack) ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}\nScreenshots: ${dash2}`);
process.exit(failed ? 1 : 0);
