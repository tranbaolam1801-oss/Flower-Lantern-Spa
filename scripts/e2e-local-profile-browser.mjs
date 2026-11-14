#!/usr/bin/env node
// REAL browser E2E (headless Chromium) for the personal profile (view / edit / avatar) for all 4 roles,
// against the built frontend served with the REAL API entry (api/index.js) on a real PostgreSQL engine (PGlite). In-memory only.
// Requires `npm run build` first.   node scripts/e2e-local-profile-browser.mjs
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
await db.exec(readFileSync(path.join(root, 'database/postgres/006-profile-avatar-email.sql'), 'utf8'));
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
const dbServer = new PGLiteSocketServer({ db, port: 54346, host: '127.0.0.1' });
await dbServer.start();
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgres://postgres@127.0.0.1:54346/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
  JWT_SECRET: 'e2e-local-secret-not-for-production-use-0123456789', AUTH_SESSION_STORE: 'sql', RATE_LIMIT_ENABLED: 'false', UPLOAD_DIR: path.join(os.tmpdir(), 'spa-profile-e2e-uploads'),
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


const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pageErrors = [];
const ROLES = [
  { key: 'owner', phone: '0900000001', label: 'Chủ Spa', admin: true, name: 'Chủ Spa Demo' },
  { key: 'manager', phone: '0900000002', label: 'Quản lý', admin: true, name: 'Quản Lý Demo' },
  { key: 'staff', phone: '0900000003', label: 'Nhân viên', admin: true, name: 'Nhân Viên Demo' },
  { key: 'customer', phone: '0900000004', label: 'Khách hàng', admin: false, name: 'Khách Demo' },
];
const shots = path.join(os.tmpdir(), 'spa-profile-shots'); mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: exe, timeout: 45000 });
const openProfile = async (page, tap = false) => {
  const t = page.locator('.account-profile-link, .account-customer-trigger');
  if (tap) await t.tap(); else await t.click();
  const item = page.getByRole('menuitem', { name: 'Thông tin cá nhân' });
  if (await item.count()) { if (tap) await item.tap(); else await item.click(); }
};
const where = (page) => new URL(page.url()).pathname;
async function uiLogin(page, phone) {
  await page.goto(`${origin}/dang-nhap`, { waitUntil: 'networkidle' });
  await page.fill('#phone', phone); await page.fill('#password', PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/dang-nhap'), { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
const nameOf = async (phone) => (await db.query(`SELECT COALESCE((SELECT HoTen FROM dbo.NhanVien n JOIN dbo.TaiKhoan t ON t.MaTaiKhoan=n.MaTaiKhoan WHERE t.SoDienThoai=$1),(SELECT HoTen FROM dbo.KhachHang k JOIN dbo.TaiKhoan t ON t.MaTaiKhoan=k.MaTaiKhoan WHERE t.SoDienThoai=$1)) AS n`, [phone])).rows[0].n;
try {
  for (const role of ROLES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(); page.on('pageerror', (e) => pageErrors.push(e.message));
    await uiLogin(page, role.phone);
    const L = role.label;
    // 1. click the avatar
    await openProfile(page);
    await page.locator('.profile-card').waitFor({ timeout: 15000 });
    const expectedPath = role.admin ? '/admin/ho-so' : '/ho-so';
    check(`${L}: clicking the header avatar opens ${expectedPath}`, where(page) === expectedPath, where(page));
    check(`${L}: the profile page uses the ${role.admin ? 'admin layout (sidebar + header)' : 'customer website layout (no admin sidebar)'}`,
      role.admin ? (await page.locator('.admin-shell .desktop-sidebar').count()) === 1 && (await page.locator('.customer-header').count()) === 0
                 : (await page.locator('.customer-header').count()) === 1 && (await page.locator('.admin-shell, .admin-sidebar').count()) === 0);
    // 2. shows own data from the backend
    const txt = await page.locator('.profile-card').innerText();
    check(`${L}: shows the own name and phone from the backend`, txt.includes(role.name) && txt.includes(role.phone), txt.slice(0, 200));
    check(`${L}: does NOT show the code, the role or the account status`, !/NV0000|KH0000|TK0000|Hoạt động|Trạng thái|Vai trò|Mã /.test(txt) && !txt.includes(`
${L}
`) && !txt.includes('Chưa hỗ trợ'), txt.slice(0, 300));
    if (role.key === 'owner') await page.screenshot({ path: path.join(shots, 'owner-profile.png') });
    if (role.key === 'customer') await page.screenshot({ path: path.join(shots, 'customer-profile.png') });
    // 3. cancel makes no request and changes nothing
    let patches = 0; const count = (r) => { if (r.method() === 'PATCH' && r.url().includes('/api/me')) patches++; };
    page.on('request', count);
    await page.getByRole('button', { name: 'Chỉnh sửa thông tin' }).click();
    await page.fill('#pf-name', 'Tên Tạm Thời');
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
    await page.waitForTimeout(300);
    check(`${L}: "Hủy" closes the form, sends NO update request and keeps the old data`, patches === 0 && (await page.locator('.profile-card').innerText()).includes(role.name) && (await nameOf(role.phone)) === role.name, `patches=${patches}`);
    // 4. client validation keeps typed data and blocks the call
    await page.getByRole('button', { name: 'Chỉnh sửa thông tin' }).click();
    await page.fill('#pf-name', 'A'); await page.fill('#pf-email', 'khong-hop-le');
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    check(`${L}: invalid name/email show Vietnamese errors, no request is sent and the typed text is kept`, patches === 0 && (await page.locator('#pf-name-err').innerText()).includes('2 đến 50') && (await page.locator('#pf-email-err').innerText()).includes('Email không hợp lệ') && (await page.inputValue('#pf-email')) === 'khong-hop-le');
    // 5. API failure keeps the typed data
    await page.fill('#pf-name', `${role.name} Mới`); await page.fill('#pf-email', `${role.key}.moi@example.com`); await page.selectOption('#pf-gender', 'Nữ'); await page.fill('#pf-address', 'Hội An, Quảng Nam');
    await page.route('**/api/me', (route) => (route.request().method() === 'PATCH' ? route.abort('failed') : route.continue()));
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await page.getByRole('alert').filter({ hasText: 'Không thể cập nhật' }).waitFor({ timeout: 10000 });
    check(`${L}: a failed save shows an error and keeps what the user typed (no data loss)`, (await page.inputValue('#pf-name')) === `${role.name} Mới` && (await page.inputValue('#pf-address')) === 'Hội An, Quảng Nam' && (await nameOf(role.phone)) === role.name);
    const hdrAfterFail = role.admin ? await page.locator('.account-role-trigger .account-name').innerText() : await page.locator('.account-profile-link, .account-customer-trigger').getAttribute('title');
    check(`${L}: after a FAILED save the Header still shows the old name`, hdrAfterFail === role.name, hdrAfterFail);
    await page.unroute('**/api/me');
    // 6. successful save (single request) -> SQL + header sync
    patches = 0;
    await page.getByRole('button', { name: 'Lưu thay đổi' }).dblclick();
    await page.getByText('Cập nhật thông tin thành công!').waitFor({ timeout: 10000 });
    check(`${L}: saving shows the success message, sends ONE request even on double click, and updates the name in SQL`, patches === 1 && (await nameOf(role.phone)) === `${role.name} Mới`, `patches=${patches}`);
    const hdrName = role.admin ? await page.locator('.account-role-trigger .account-name').innerText() : await page.locator('.account-profile-link, .account-customer-trigger').getAttribute('title');
    check(`${L}: the Header shows the NEW full name immediately (no refresh), not the role label`, hdrName === `${role.name} Mới` && (!role.admin || hdrName !== L), hdrName);
    const table = role.admin ? 'NhanVien' : 'KhachHang';
    const row = (await db.query(`SELECT n.Email, n.DiaChi, n.GioiTinh FROM dbo.${table} n JOIN dbo.TaiKhoan t ON t.MaTaiKhoan=n.MaTaiKhoan WHERE t.SoDienThoai=$1`, [role.phone])).rows[0];
    check(`${L}: email, address and gender are stored in SQL`, row.email === `${role.key}.moi@example.com` && row.diachi === 'Hội An, Quảng Nam' && row.gioitinh === 'Nữ', JSON.stringify(row));
    const fallbackSrc0 = await page.locator('.account-profile-link img, .account-customer-trigger img').getAttribute('src');
    // 7. avatar: choose -> preview -> save -> header
    await page.setInputFiles('[data-testid="avatar-input"]', { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(2 * 1024 * 1024 + 5, 1) });
    const bigMsg = await page.getByRole('alert').filter({ hasText: '2MB' }).count();
    await page.setInputFiles('[data-testid="avatar-input"]', { name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
    const svgMsg = await page.getByRole('alert').filter({ hasText: 'JPG, PNG hoặc WebP' }).count();
    check(`${L}: a >2MB file and an SVG are rejected in the UI with a clear message and no preview`, bigMsg === 1 && svgMsg === 1 && (await page.getByRole('button', { name: 'Lưu ảnh' }).count()) === 0);
    // upload failure keeps the old avatar, keeps the chosen image, and "Hủy" restores the saved one
    await page.setInputFiles('[data-testid="avatar-input"]', { name: 'a.png', mimeType: 'image/png', buffer: PNG });
    await page.route('**/api/me/avatar', (route) => route.abort('failed'));
    await page.getByRole('button', { name: 'Lưu ảnh' }).click();
    await page.getByRole('alert').filter({ hasText: 'Không thể lưu ảnh đại diện' }).waitFor({ timeout: 10000 });
    check(`${L}: a failed upload shows a friendly error, keeps the chosen image for retry and leaves the saved avatar unchanged`, (await page.getByRole('button', { name: 'Lưu ảnh' }).isEnabled()) && (await page.locator('.profile-avatar-button img').getAttribute('src')).startsWith('blob:') && (await page.locator('.account-profile-link img, .account-customer-trigger img').getAttribute('src')) === fallbackSrc0);
    await page.unroute('**/api/me/avatar');
    await page.getByRole('button', { name: 'Hủy', exact: true }).first().click();
    check(`${L}: "Hủy" restores the previously saved avatar`, !(await page.locator('.profile-avatar-button img').getAttribute('src')).startsWith('blob:'));
    const fallbackSrc = await page.locator('.account-profile-link img, .account-customer-trigger img').getAttribute('src');
    await page.setInputFiles('[data-testid="avatar-input"]', { name: 'a.png', mimeType: 'image/png', buffer: PNG });
    check(`${L}: choosing an image shows a preview with "Lưu ảnh" / "Hủy" and does not upload yet`, (await page.getByRole('button', { name: 'Lưu ảnh' }).count()) === 1 && (await page.locator('.profile-avatar-button img').getAttribute('src')).startsWith('blob:') && (await db.query('SELECT count(*)::int n FROM dbo.TaiKhoan WHERE AnhDaiDien IS NOT NULL')).rows[0].n === ROLES.indexOf(role));
    await page.getByRole('button', { name: 'Lưu ảnh' }).click();
    await page.getByText('Cập nhật ảnh đại diện thành công!').waitFor({ timeout: 10000 });
    const headerSrc = await page.locator('.account-profile-link img, .account-customer-trigger img').getAttribute('src');
    check(`${L}: after "Lưu ảnh" the HEADER avatar changes immediately to the stored image (/api/uploads/avatars/...)`, /^\/api\/uploads\/avatars\/[a-f0-9]{32}\.png$/.test(headerSrc ?? '') && headerSrc !== fallbackSrc, headerSrc);
    await page.waitForTimeout(300);
    const loaded = await page.evaluate(() => { const i = document.querySelector('.account-profile-link img, .account-customer-trigger img'); return i.complete && i.naturalWidth > 0; });
    check(`${L}: the stored avatar is actually served and rendered (naturalWidth > 0)`, loaded);
    // 8. persistence: refresh, then logout + login again
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.profile-card').waitFor();
    check(`${L}: after refresh the Header still shows the new name`, (role.admin ? await page.locator('.account-role-trigger .account-name').innerText() : await page.locator('.account-profile-link, .account-customer-trigger').getAttribute('title')) === `${role.name} Mới`);
    check(`${L}: after refresh the new name and avatar are still shown`, (await page.locator('.profile-card').innerText()).includes(`${role.name} Mới`) && (await page.locator('.account-profile-link img, .account-customer-trigger img').getAttribute('src')) === headerSrc);
    if (role.admin) await page.locator('.account-role-trigger').click(); else await page.locator('.account-customer-trigger').click();
    await Promise.all([page.waitForURL(/\/dang-nhap/, { timeout: 20000 }), page.getByRole(role.admin ? 'button' : 'menuitem', { name: 'Đăng xuất' }).click()]);
    check(`${L}: logout works from the header`, where(page) === '/dang-nhap');
    await uiLogin(page, role.phone);
    await openProfile(page); await page.locator('.profile-card').waitFor();
    check(`${L}: after logging in again the Header shows the new name`, (role.admin ? await page.locator('.account-role-trigger .account-name').innerText() : await page.locator('.account-profile-link, .account-customer-trigger').getAttribute('title')) === `${role.name} Mới`);
    check(`${L}: after logging in again the saved profile and avatar are still there`, (await page.locator('.profile-card').innerText()).includes(`${role.name} Mới`) && (await page.locator('.account-profile-link img, .account-customer-trigger img').getAttribute('src')) === headerSrc);
    // 9. role isolation
    const other = role.admin ? '/ho-so' : '/admin/ho-so';
    await page.goto(`${origin}${other}`, { waitUntil: 'networkidle' });
    check(`${L}: ${other} is not reachable (redirected to the own area)`, where(page) !== other, where(page));
    if (role.admin) check(`${L}: the customer website UI never replaces the admin area`, (await page.locator('.customer-header').count()) === 0);
    await ctx.close();
  }

  // ----- long name does not break the header (owner)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage(); await uiLogin(page, '0900000001');
    const longName = 'Nguyễn Thị Hoàng Thiên Kim Ngân Phương Anh Thư Đoan Trang';
    await openProfile(page); await page.locator('.profile-card').waitFor();
    await page.getByRole('button', { name: 'Chỉnh sửa thông tin' }).click(); await page.fill('#pf-name', longName.slice(0, 50)); await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await page.getByText('Cập nhật thông tin thành công!').waitFor();
    const nm = page.locator('.account-role-trigger .account-name');
    const ell = await nm.evaluate((e) => ({ over: e.scrollWidth > e.clientWidth, ov: getComputedStyle(e).textOverflow, w: e.getBoundingClientRect().width, title: e.title }));
    const hdrOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('Long name: header truncates with an ellipsis (max 200px), shows the full name in a tooltip, and the page does not overflow', ell.over && ell.ov === 'ellipsis' && ell.w <= 201 && ell.title.length >= 40 && hdrOverflow <= 1, JSON.stringify(ell));
    const roleRow = (await db.query("select t.VaiTro r, (select count(*)::int from dbo.TaiKhoanQuyen q where q.MaTaiKhoan=t.MaTaiKhoan) p from dbo.TaiKhoan t where t.SoDienThoai='0900000001'")).rows[0];
    check('Changing the name does not change the role in SQL', roleRow.r === 'Chủ Spa', JSON.stringify(roleRow));
    await page.screenshot({ path: path.join(shots, 'owner-long-name.png'), clip: { x: 900, y: 0, width: 540, height: 120 } });
    await ctx.close();
  }

  // ----- API-level security against another account (logged in as staff)
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage(); await uiLogin(page, '0900000003');
    const cookie = (await ctx.cookies(origin)).map((c) => `${c.name}=${c.value}`).join('; ');
    const call = async (method, url, body, type = 'application/json') => { const r = await fetch(`${origin}${url}`, { method, headers: { 'content-type': type, 'x-spa-request': '1', cookie }, body }); return r.status; };
    const hash = async () => (await db.query(`SELECT string_agg(md5(t::text),',' ORDER BY MaTaiKhoan) h FROM dbo.TaiKhoan t WHERE MaTaiKhoan<>'TK00000003'`)).rows[0].h;
    const before = await hash();
    const bad = [{ role: 'Chủ Spa' }, { permissions: ['Q05'] }, { status: 'Khóa' }, { id: 'TK00000001' }, { userId: 'TK00000001' }, { phone: '0999999999' }, { passwordHash: 'x' }];
    let allRefused = true;
    for (const extra of bad) if ((await call('PATCH', '/api/me', JSON.stringify({ fullName: 'Nhân Viên Demo Hai', ...extra }))) !== 400) allRefused = false;
    check('Staff: PATCH /api/me with role/permission/status/id/phone/password fields is refused (400)', allRefused);
    check('Staff: other accounts rows (except their own avatar column) and staff permissions are unchanged', (await hash()) === before && (await db.query("SELECT count(*)::int n FROM dbo.TaiKhoanQuyen WHERE MaTaiKhoan='TK00000003'")).rows[0].n === 2);
    check('Staff: avatar upload of a spoofed / oversize file is refused', (await call('POST', '/api/me/avatar', Buffer.from('<script>alert(1)</script>'), 'image/png')) === 400 && (await call('POST', '/api/me/avatar', Buffer.alloc(2 * 1024 * 1024 + 10, 1), 'image/png')) === 413);
    check('Anonymous: GET /api/me is 401', (await fetch(`${origin}/api/me`)).status === 401);
    await ctx.close();
  }

  // ----- mobile (customer + manager) and tablet
  for (const [phone, label] of [['0900000004', 'Customer'], ['0900000002', 'Manager']]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const page = await ctx.newPage(); page.on('pageerror', (e) => pageErrors.push(e.message));
    await uiLogin(page, phone);
    await openProfile(page, true); await page.locator('.profile-card').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const btn = await page.getByRole('button', { name: 'Chỉnh sửa thông tin' }).boundingBox();
    check(`mobile ${label}: no horizontal overflow and the edit button is inside the screen`, overflow <= 1 && !!btn && btn.x >= 0 && btn.x + btn.width <= 390, `overflow=${overflow} btn=${JSON.stringify(btn)}`);
    await page.screenshot({ path: path.join(shots, `mobile-${label.toLowerCase()}.png`), fullPage: true });
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 820, height: 1100 } }); const page = await ctx.newPage(); await uiLogin(page, '0900000001');
    await openProfile(page); await page.locator('.profile-card').waitFor();
    check('tablet: profile has no horizontal overflow', (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
    await page.screenshot({ path: path.join(shots, 'tablet-owner.png') }); await ctx.close();
  }
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('browser run completed without an exception', false, String(e?.stack ?? e).slice(0, 900));
} finally {
  await browser.close(); server.close(); await dbServer.stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\nBROWSER (real stack) ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}\nScreenshots: ${shots}`);
process.exit(failed ? 1 : 0);
