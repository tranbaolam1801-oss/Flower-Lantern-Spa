#!/usr/bin/env node
// REAL browser E2E (headless Chromium) for authentication, role isolation, session restoration and header dropdown behaviour,
// against the built frontend served with the REAL API entry (api/index.js) on a real PostgreSQL engine (PGlite). In-memory only.
// Requires `npm run build` first.   node scripts/e2e-local-auth-browser.mjs
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
const dbServer = new PGLiteSocketServer({ db, port: 54344, host: '127.0.0.1' });
await dbServer.start();
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgres://postgres@127.0.0.1:54344/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
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

// Records whether the CUSTOMER website UI ever appeared in the DOM (it must never flash for a signed-in admin).
const spy = () => { window.__customerUiSeen = false; const look = () => { if (document.querySelector('.customer-header, .customer-hero, .header-book-cta')) window.__customerUiSeen = true; }; new MutationObserver(look).observe(document, { childList: true, subtree: true }); look(); };
const newCtx = async (viewport = { width: 1440, height: 900 }, cookies = [], extra = {}) => {
  const ctx = await browser.newContext({ viewport, ...extra });
  if (cookies.length) await ctx.addCookies(cookies);
  await ctx.addInitScript(spy);
  return ctx;
};
const open = async (ctx, url) => { const page = await ctx.newPage(); page.on('pageerror', (e) => pageErrors.push(e.message)); await page.goto(`${origin}${url}`, { waitUntil: 'networkidle' }); return page; };
async function uiLogin(page, phone) {
  await page.goto(`${origin}/dang-nhap`, { waitUntil: 'networkidle' });
  await page.fill('#phone', phone); await page.fill('#password', PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/dang-nhap'), { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
const where = (page) => new URL(page.url()).pathname;
const apiAs = async (cookie, method, url, body) => { const r = await fetch(`${origin}${url}`, { method, headers: { 'content-type': 'application/json', ...(method !== 'GET' ? { 'x-spa-request': '1' } : {}), ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }); return r.status; };
const cookieHeader = (cookies) => cookies.map((c) => `${c.name}=${c.value}`).join('; ');
const menuButtons = (page) => page.locator('.account-dropdown button').allInnerTexts();

const ROLES = [
  { key: 'owner', phone: '0900000001', name: 'Chủ Spa Demo', label: 'Chủ Spa', canSeeEmployeesApi: 200 },
  { key: 'manager', phone: '0900000002', name: 'Quản Lý Demo', label: 'Quản lý', canSeeEmployeesApi: 403 },
  { key: 'staff', phone: '0900000003', name: 'Nhân Viên Demo', label: 'Nhân viên', canSeeEmployeesApi: 403 },
];

try {
  for (const role of ROLES) {
    const ctx = await newCtx();
    const page = await ctx.newPage(); page.on('pageerror', (e) => pageErrors.push(e.message));
    await uiLogin(page, role.phone);
    check(`${role.label}: login lands in the admin area (/admin/lich-hen), not the customer site`, where(page) === '/admin/lich-hen', where(page));
    const cookies = await ctx.cookies(origin);
    const session = cookies.find((c) => c.name === 'access_token');
    check(`${role.label}: the session cookie is a persistent HttpOnly cookie (survives closing the browser)`, !!session && session.httpOnly && session.expires > Date.now() / 1000 + 3600, JSON.stringify(session && { httpOnly: session.httpOnly, expires: session.expires }));

    // --- refresh keeps the role
    await page.reload({ waitUntil: 'networkidle' });
    check(`${role.label}: refresh keeps the admin area and the role label "${role.label}"`, where(page) === '/admin/lich-hen' && (await page.locator('.account-role-trigger').innerText()).includes(role.name), where(page));

    // --- "close and reopen the website": only persistent cookies survive a browser restart
    const persistent = cookies.filter((c) => c.expires > 0);
    await ctx.close();
    const reopened = await newCtx({ width: 1440, height: 900 }, persistent);
    const home = await reopened.newPage(); home.on('pageerror', (e) => pageErrors.push(e.message));
    await home.goto(`${origin}/`, { waitUntil: 'networkidle' });
    check(`${role.label}: reopening the website at "/" restores the session and goes to the admin area (NOT the customer site)`, where(home) === '/admin/lich-hen', where(home));
    check(`${role.label}: the customer UI never appeared (not even for a moment) while the session was being restored`, (await home.evaluate(() => window.__customerUiSeen)) === false);
    for (const url of ['/dich-vu', '/dat-lich', '/dang-nhap', '/dang-ky']) { await home.goto(`${origin}${url}`, { waitUntil: 'networkidle' }); if (where(home) !== '/admin/lich-hen') check(`${role.label}: ${url} redirects to the admin area`, false, where(home)); }
    check(`${role.label}: public customer pages and the login page all send a signed-in ${role.label} to the admin area`, where(home) === '/admin/lich-hen');
    await home.goto(`${origin}/lich-hen-cua-toi`, { waitUntil: 'networkidle' });
    check(`${role.label}: the customer-only page /lich-hen-cua-toi redirects back to the admin area`, where(home) === '/admin/lich-hen', where(home));

    // --- header account area: avatar = link to the profile page, "Đăng xuất" one click away (no dropdown any more)
    const trigger = home.locator('.account-profile-link');
    check(`${role.label}: the header avatar is a link to the own profile page /admin/ho-so and shows the role "${role.label}"`, (await trigger.getAttribute('href')) === '/admin/ho-so' && (await trigger.locator('img').count()) === 1);
    check(`${role.label}: no standalone "Đăng xuất" button in the header while the dropdown is closed`, (await home.locator('.admin-header >> button:has-text("Đăng xuất")').count()) === 0);
    const rt = home.locator('.account-role-trigger');
    check(`${role.label}: the role name + chevron is a separate trigger`, (await rt.innerText()).includes(role.name) && (await rt.locator('img').count()) === 1 && (await rt.getAttribute('aria-expanded')) === 'false');
    await rt.click();
    const items = await menuButtons(home);
    check(`${role.label}: clicking the role name opens a dropdown with exactly ONE action, "Đăng xuất"`, items.length === 1 && items[0] === 'Đăng xuất' && (await rt.getAttribute('aria-expanded')) === 'true', JSON.stringify(items));
    const tb = await rt.boundingBox(); const db2 = await home.locator('.account-dropdown').boundingBox();
    check(`${role.label}: the dropdown appears right below the account area and inside the screen`, !!tb && !!db2 && db2.y >= tb.y + tb.height - 2 && db2.y < tb.y + tb.height + 30 && db2.x >= 0 && db2.x + db2.width <= 1440, JSON.stringify({ tb, db2 }));
    await rt.click();
    check(`${role.label}: clicking the role name again closes it`, !(await home.locator('.account-dropdown').isVisible()));
    await rt.click(); await home.mouse.click(600, 30);
    check(`${role.label}: click outside closes it`, !(await home.locator('.account-dropdown').isVisible()));
    await rt.click(); await home.keyboard.press('Escape');
    check(`${role.label}: Escape closes it and returns focus to the trigger`, !(await home.locator('.account-dropdown').isVisible()) && (await home.evaluate(() => document.activeElement?.className.includes('account-role-trigger'))));
    await rt.click(); await home.locator('.account-profile-link').click(); await home.waitForURL(/\/admin\/ho-so/); await home.locator('.profile-card').waitFor();
    check(`${role.label}: route change closes the dropdown (avatar opens the profile instead)`, !(await home.locator('.account-dropdown').isVisible()));
    if (role.key === 'owner') await home.screenshot({ path: path.join(shots, 'owner-menu.png'), clip: { x: 900, y: 0, width: 540, height: 220 } });
    await home.locator('.profile-card').waitFor({ timeout: 15000 });
    check(`${role.label}: clicking the avatar opens the profile page inside the admin layout`, where(home) === '/admin/ho-so' && (await home.locator('.admin-shell .profile-card').count()) === 1 && (await home.locator('.customer-header').count()) === 0);

    // --- logout
    const cookie = cookieHeader(await reopened.cookies(origin));
    await home.goto(`${origin}/admin/lich-hen`, { waitUntil: 'networkidle' });
    await home.locator('.account-role-trigger').click();
    await Promise.all([home.waitForURL(/\/dang-nhap/, { timeout: 20000 }), home.getByRole('button', { name: 'Đăng xuất' }).click()]);
    await home.waitForLoadState('networkidle');
    const after = await reopened.cookies(origin);
    check(`${role.label}: logout goes to the login page, clears the cookie and leaves no account data on screen`, where(home) === '/dang-nhap' && !after.some((c) => c.name === 'access_token' && c.value) && !(await home.locator('body').innerText()).includes(role.label), where(home));
    const revoked = (await db.query(`SELECT count(*)::int n FROM dbo.PhienDangNhap p JOIN dbo.TaiKhoan t ON t.MaTaiKhoan=p.MaTaiKhoan WHERE t.SoDienThoai=$1 AND p.ThuHoiLuc IS NULL AND p.HetHanLuc > dbo.utc_now()`, [role.phone])).rows[0].n;
    check(`${role.label}: the server session was revoked (the old cookie no longer works)`, (await apiAs(cookie, 'GET', '/api/auth/me')) === 401, `active sessions: ${revoked}`);
    check('after logout, the browser storage holds no account data', (await home.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }))) === '{"l":{},"s":{}}');
    await home.goto(`${origin}/admin/lich-hen`, { waitUntil: 'networkidle' });
    check('after logout, opening an admin URL goes to the login page', where(home) === '/dang-nhap', where(home));
    await reopened.close();
  }

  // ------------------------------------------------------------------- CUSTOMER
  {
    const ctx = await newCtx();
    const page = await ctx.newPage(); page.on('pageerror', (e) => pageErrors.push(e.message));
    await uiLogin(page, '0900000004');
    check('Customer: login lands on "Lịch hẹn của tôi" (/lich-hen-cua-toi)', where(page) === '/lich-hen-cua-toi', where(page));
    await page.reload({ waitUntil: 'networkidle' });
    check('Customer: refresh keeps the customer area', where(page) === '/lich-hen-cua-toi', where(page));
    const persistent = (await ctx.cookies(origin)).filter((c) => c.expires > 0);
    await ctx.close();
    const re = await newCtx({ width: 1440, height: 900 }, persistent);
    const p2 = await open(re, '/lich-hen-cua-toi');
    check('Customer: reopening the website restores the customer session', where(p2) === '/lich-hen-cua-toi');
    await p2.goto(`${origin}/admin/lich-hen`, { waitUntil: 'networkidle' });
    check('Customer: /admin/lich-hen is not reachable (redirected back to the customer area)', where(p2) === '/lich-hen-cua-toi', where(p2));
    for (const url of ['/admin/khach-hang', '/admin/nhan-vien', '/admin/bao-cao']) { await p2.goto(`${origin}${url}`, { waitUntil: 'networkidle' }); if (where(p2) !== '/lich-hen-cua-toi') check(`Customer: ${url} redirects`, false, where(p2)); }
    check('Customer: direct URLs of the admin screens are all blocked', where(p2) === '/lich-hen-cua-toi');
    await p2.goto(`${origin}/`, { waitUntil: 'networkidle' });
    check('Customer: the public website "/" is still the customer site', where(p2) === '/' && (await p2.locator('.customer-header').count()) === 1);
    const t2 = p2.locator('.account-customer-trigger');
    await t2.click();
    const citems = await p2.locator('.account-dropdown-customer [role="menuitem"]').allInnerTexts();
    check('Customer: the header shows ONLY the account icon; it opens a dropdown with name + phone and exactly 3 items (Thông tin cá nhân, Lịch hẹn của tôi, Đăng xuất) — Figma UC_5.2', citems.join('|') === 'Thông tin cá nhân|Lịch hẹn của tôi|Đăng xuất' && (await p2.locator('.account-dropdown-customer .account-dropdown-card').innerText()).includes('0900000004') && (await p2.locator('.account-menu a.account-text-link, .account-menu button.account-logout').count()) === 0);
    await p2.mouse.click(300, 600);
    check('Customer: the dropdown closes on click outside and on Escape', !(await p2.locator('.account-dropdown-customer').isVisible()) && await (async () => { await t2.click(); await p2.keyboard.press('Escape'); return !(await p2.locator('.account-dropdown-customer').isVisible()); })());
    await t2.click(); await p2.getByRole('menuitem', { name: 'Lịch hẹn của tôi' }).click(); await p2.waitForURL(/lich-hen-cua-toi/); await p2.waitForTimeout(400);
    check('Customer: "Lịch hẹn của tôi" in the dropdown opens the personal bookings and closes the menu', where(p2) === '/lich-hen-cua-toi' && !(await p2.locator('.account-dropdown-customer').isVisible()));
    const ccookie = cookieHeader(await re.cookies(origin));
    check('Customer: backend refuses admin APIs (403)', (await apiAs(ccookie, 'GET', '/api/employees')) === 403 && (await apiAs(ccookie, 'GET', '/api/customers')) === 403);
    await re.close();
  }

  // ------------------------------------------------------------------- SECURITY
  {
    check('unauthenticated /api/auth/me is 401', (await apiAs('', 'GET', '/api/auth/me')) === 401);
    check('unauthenticated admin API is 401', (await apiAs('', 'GET', '/api/employees')) === 401);
    const ctx = await newCtx(); const page = await ctx.newPage(); await uiLogin(page, '0900000003');
    const real = (await ctx.cookies(origin)).find((c) => c.name === 'access_token').value;
    const [h, p, s] = real.split('.');
    const body = JSON.parse(Buffer.from(p, 'base64url').toString()); body.role = 'Chủ Spa'; body.permissions = ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06'];
    const forged = [h, Buffer.from(JSON.stringify(body)).toString('base64url'), s].join('.');
    check('a token with the role edited client-side to "Chủ Spa" is rejected (401): the role cannot be forged', (await apiAs(`access_token=${forged}`, 'GET', '/api/employees')) === 401);
    check('a staff token cannot reach manager APIs (403) even though the UI is not involved', (await apiAs(`access_token=${real}`, 'GET', '/api/reports/services')) === 403);

    // session expired / revoked server-side while the tab is open: goes to login, never to the customer UI
    await db.exec("UPDATE dbo.PhienDangNhap SET ThuHoiLuc = dbo.utc_now() WHERE ThuHoiLuc IS NULL");
    await page.goto(`${origin}/admin/lich-hen`, { waitUntil: 'networkidle' });
    check('expired/revoked session: opening an admin URL goes to the login page', where(page) === '/dang-nhap', where(page));
    check('expired/revoked session never switches the user into the customer UI', (await page.evaluate(() => window.__customerUiSeen)) === false);
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
    check('expired session on "/" shows the public guest site (login icon), never an account menu', (await page.locator('.account-menu').count()) === 0 && (await page.locator('[aria-label="Đăng nhập"]').count()) === 1);
    await ctx.close();
  }

  // ------------------------------------------------------------------- DROPDOWN / POPOVER behaviour on other components
  {
    const ctx = await newCtx(); const page = await ctx.newPage(); page.on('pageerror', (e) => pageErrors.push(e.message));
    await uiLogin(page, '0900000001');
    await page.goto(`${origin}/admin/khach-hang`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.customer-search-table tbody tr');
    const filter = page.locator('.customer-filter-btn');
    await filter.click();
    check('filter popover opens (aria-expanded=true)', (await filter.getAttribute('aria-expanded')) === 'true' && (await page.locator('.customer-filter-popover').isVisible()));
    await filter.click();
    check('filter: clicking the button again closes it', !(await page.locator('.customer-filter-popover').isVisible()));
    await filter.click(); await page.locator('.customer-search-card h1, .customer-search-table').first().click({ position: { x: 5, y: 5 }, force: true });
    check('filter: click outside closes it', !(await page.locator('.customer-filter-popover').isVisible()));
    await filter.click(); await page.keyboard.press('Escape');
    check('filter: Escape closes it and returns focus to the button', !(await page.locator('.customer-filter-popover').isVisible()) && (await page.evaluate(() => document.activeElement?.className.includes('customer-filter-btn'))));
    await filter.click(); await page.locator('.customer-filter-popover button', { hasText: 'Zalo' }).click();
    await page.waitForTimeout(300);
    check('filter: choosing an option applies it and closes the popover (filter still works)', !(await page.locator('.customer-filter-popover').isVisible()) && (await filter.innerText()).includes('Zalo'));
    // modals/forms are NOT dismissed by clicking outside (unsaved data)
    await page.locator('.customer-add-btn').click();
    await page.locator('dialog.customer-form-modal[open]').waitFor();
    await page.locator('.customer-form-modal input').nth(0).fill('Chưa lưu');
    await page.mouse.click(5, 5);
    check('the add-customer form (a modal with unsaved data) is NOT closed by an outside click and keeps its data', (await page.locator('dialog.customer-form-modal').evaluate((d) => d.open)) && (await page.locator('.customer-form-modal input').nth(0).inputValue()) === 'Chưa lưu');
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
    await ctx.close();
  }

  // ------------------------------------------------------------------- MOBILE
  {
    const ctx = await newCtx({ width: 390, height: 844 }, [], { hasTouch: true, isMobile: true }); const page = await ctx.newPage(); page.on('pageerror', (e) => pageErrors.push(e.message));
    await uiLogin(page, '0900000002');
    const link = page.locator('.account-profile-link');
    const box = await link.boundingBox();
    check('mobile: the avatar link is fully on screen and tappable', !!box && box.x >= 0 && box.x + box.width <= 390 && box.width >= 32, JSON.stringify(box));
    await link.tap(); await page.waitForURL(/\/admin\/ho-so/);
    check('mobile: tapping the avatar opens the profile page without horizontal overflow', (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
    await page.screenshot({ path: path.join(shots, 'mobile-admin.png') });
    await ctx.close();
  }
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('browser run completed without an exception', false, String(e?.stack ?? e).slice(0, 700));
} finally {
  await browser.close(); server.close(); await dbServer.stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\nBROWSER (real stack) ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}\nScreenshots: ${shots}`);
process.exit(failed ? 1 : 0);
