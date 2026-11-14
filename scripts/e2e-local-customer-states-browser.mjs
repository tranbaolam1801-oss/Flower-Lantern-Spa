#!/usr/bin/env node
// REAL browser E2E (headless Chromium) of the "Quản lý khách hàng" screen: Xóa/Hủy button (UC_3) and Thêm khách hàng form (UC_3.1),
// against the built frontend served together with the REAL API entry (api/index.js) on a real PostgreSQL engine (PGlite).
// In-memory only: no production data, no cloud service. Requires `npm run build` first.
//   node scripts/e2e-local-customer-browser.mjs
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

// ------------------------------------------------------------------ database + app
const db = await PGlite.create();
await db.exec(readFileSync(path.join(root, 'database/postgres/001-schema.sql'), 'utf8'));
const PW = 'Browser-pass-1';
const hash = await argon2.hash(PW, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
await db.query(`INSERT INTO dbo.TaiKhoan VALUES ('TK00000001','owner','0900000001',$1,'Chủ Spa','Hoạt động'),('TK00000002','manager','0900000002',$1,'Quản lý','Hoạt động'),('TK00000003','staff','0900000003',$1,'Nhân viên','Hoạt động')`, [hash]);
await db.exec(`INSERT INTO dbo.TaiKhoanQuyen VALUES ('TK00000001','Q02'),('TK00000002','Q02'),('TK00000003','Q02');
  INSERT INTO dbo.DanhMuc VALUES ('DM00000001','Da','Hoạt động');
  INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV00000001','DM00000001','Chăm sóc da','Hoạt động');
  INSERT INTO dbo.GoiDichVu VALUES ('GV00000001','DV00000001','Gói 60',60,350000,'Hoạt động');
  INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai,KenhLienHe) VALUES ('KH00000001','Nguyễn Minh Anh','0912000001','Zalo'),('KH00000002','Trần Bảo Ngọc','0912000002','Trực tiếp'),('KH00000003','Lê Thanh Hà','0912000003','Facebook');
  INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan) VALUES ('LH00000001','KH00000001','Nguyễn Minh Anh','0912000001','2030-01-01','10:00','Hoàn thành','Đã thanh toán');
  INSERT INTO dbo.ThanhToan(MaThanhToan,MaLichHen,SoTienThanhToan,NgayGhiNhan,TrangThaiGiaoDich) VALUES ('TT00000001','LH00000001',350000,dbo.vn_now(),'Thành công');
  INSERT INTO dbo.DanhGia(MaDanhGia,MaLichHen,MaKhachHang,MaDichVu,SoSao) VALUES ('DG00000001','LH00000001','KH00000001','DV00000001',5);`);
await db.query(`INSERT INTO dbo.TaiKhoan VALUES ('TK00000004','customer','0900000004',$1,'Khách hàng','Hoạt động')`, [hash]);
const dbServer = new PGLiteSocketServer({ db, port: 54348, host: '127.0.0.1' });
await dbServer.start();
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgres://postgres@127.0.0.1:54348/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
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

const count = async (sql, p = []) => (await db.query(sql, p)).rows[0].n;
const customerCount = () => count('SELECT count(*)::int n FROM dbo.KhachHang');
const dataSnapshot = async () => JSON.stringify((await db.query(`SELECT (SELECT count(*)::int FROM dbo.KhachHang) c,(SELECT count(*)::int FROM dbo.LichHen) l,(SELECT count(*)::int FROM dbo.ThanhToan) t,(SELECT count(*)::int FROM dbo.DanhGia) d,(SELECT md5(string_agg(k::text,'|' ORDER BY k::text)) FROM dbo.KhachHang k) h`)).rows[0]);

async function loginCookie(phone) {
  const r = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-spa-request': '1' }, body: JSON.stringify({ phone, password: PW }) });
  return (r.headers.get('set-cookie') ?? '').split(';')[0].split('=');
}

const chromeRoot = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
const exe = readdirSync(chromeRoot).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
  .map((d) => path.join(chromeRoot, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')).find(existsSync);
const shots = path.join(os.tmpdir(), 'spa-uc3-states-shots'); mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: exe, timeout: 45000 });
const pageErrors = [];

async function newPage(role, viewport = { width: 1440, height: 900 }) {
  const phone = { owner: '0900000001', manager: '0900000002', staff: '0900000003' }[role];
  const [name, value] = await loginCookie(phone);
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name, value, url: origin }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const posts = [];
  page.on('request', (rq) => { if (rq.url().includes('/api/customers') && rq.method() !== 'GET') posts.push(`${rq.method()} ${new URL(rq.url()).pathname}`); });
  await page.goto(`${origin}/admin/khach-hang`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.customer-search-table tbody tr', { timeout: 20000 });
  return { ctx, page, posts };
}
const box = async (loc) => (await loc.boundingBox());
const bodyText = (page) => page.locator('body').innerText();
const addButton = (page) => page.getByRole('button', { name: '+ Thêm mới' });
const fillForm = async (page, name, phone) => { await page.locator('dialog.customer-form-modal[open]').waitFor(); await page.locator('.customer-form-modal input').nth(0).fill(name); await page.locator('.customer-form-modal input').nth(1).fill(phone); };
const toastCount = (page, kind) => page.locator(`[data-testid="customer-toast-${kind}"]`).count();


const LIST = /\/api\/customers\?/;
const DETAIL = /\/api\/customers\/KH\d+$/;
const input = (page) => page.locator('.customer-search-input input');
const state = (page) => page.locator('[data-testid="customer-search-state"]');
const errToast = (page) => page.locator('[data-testid="customer-toast-error"]');
const customersTotal = async () => (await db.query('SELECT count(*)::int n FROM dbo.KhachHang')).rows[0].n;
const hashAll = async () => (await db.query("SELECT md5(string_agg(k::text,'|' ORDER BY k::text)) h FROM dbo.KhachHang k")).rows[0].h;
const typeSearch = async (page, value) => { const done = page.waitForResponse((r) => LIST.test(r.url()) && r.request().method() === 'GET', { timeout: 15000 }).catch(() => null); await input(page).fill(value); await done; await page.waitForTimeout(150); };
const noRaw = async (page) => !/Failed to fetch|NetworkError|Load failed|HTTP 5\d\d|Internal server error/i.test(await bodyText(page));

try {
  const baseCount = await customersTotal(); const baseHash = await hashAll();
  const { ctx, page, posts } = await newPage('owner');
  const listReqs = []; const detailReqs = [];
  page.on('request', (rq) => { if (rq.method() !== 'GET') return; if (LIST.test(rq.url())) listReqs.push(new URL(rq.url()).searchParams.get('q')); else if (DETAIL.test(rq.url())) detailReqs.push(new URL(rq.url()).pathname); });

  // ============================================ A. search with results
  check('Search UI: placeholder follows Figma ("Tìm theo tên, số điện thoại hoặc mã…")', (await input(page).getAttribute('placeholder')) === 'Tìm theo tên, số điện thoại hoặc mã…');
  await typeSearch(page, 'Ngọc');
  let rows = await page.locator('.customer-search-table tbody tr').allInnerTexts();
  check('Search by name returns the matching customer from the backend', rows.length === 1 && rows[0].includes('Trần Bảo Ngọc'), JSON.stringify(rows));
  await typeSearch(page, '0912000001');
  rows = await page.locator('.customer-search-table tbody tr').allInnerTexts();
  check('Search by phone returns the matching customer', rows.length === 1 && rows[0].includes('Nguyễn Minh Anh'), JSON.stringify(rows));
  await typeSearch(page, 'KH00000002');
  rows = await page.locator('.customer-search-table tbody tr').allInnerTexts();
  check('Search by customer code returns the matching customer', rows.length === 1 && rows[0].includes('Trần Bảo Ngọc'), JSON.stringify(rows));

  // ============================================ B. no result (200 + empty list)
  await typeSearch(page, 'khách hàng xyz');
  await state(page).waitFor();
  const st = await state(page).innerText();
  check('No result: centred magnifier + "Không có kết quả phù hợp" + "Không tìm thấy khách hàng phù hợp!" (8.2.3.17)', st.includes('Không có kết quả phù hợp') && st.includes('Không tìm thấy khách hàng phù hợp!') && (await state(page).locator('img').count()) === 1);
  check('No result: NO error toast, no raw/technical text, the keyword is kept', (await errToast(page).count()) === 0 && (await noRaw(page)) && (await input(page).inputValue()) === 'khách hàng xyz');
  check('No result: toolbar (search, Bộ lọc, + Thêm mới) and the 6-column header row are kept', (await page.locator('.customer-search-table thead th').count()) === 6 && (await page.getByRole('button', { name: '+ Thêm mới' }).isVisible()) && (await page.locator('.customer-filter-btn').isVisible()));
  const sb = await state(page).boundingBox(); const cardBox = await page.locator('.customer-search-card').boundingBox(); const thBox = await page.locator('.customer-search-table thead').boundingBox();
  const titleSize = await state(page).locator('.customer-search-state-title').evaluate((e) => getComputedStyle(e).fontSize);
  check('No result: block sits directly under the header row, is horizontally centred in the card, 271px tall, 25px title, 42px icon (Figma 1:28969)',
    Math.abs(sb.y - (thBox.y + thBox.height)) <= 8 && Math.abs((sb.x + sb.width / 2) - (cardBox.x + cardBox.width / 2)) <= 20 && Math.round(sb.height) === 271 && titleSize === '25px' && Math.round((await state(page).locator('img').boundingBox()).width) === 42, JSON.stringify({ sb, thBox, titleSize }));
  await page.screenshot({ path: path.join(shots, 'search-empty.png') });

  // ============================================ C. search failure (500 / network / 403 / 400)
  await typeSearch(page, 'nguyên');
  let failing = true; let hits = 0;
  await page.route(LIST, (route) => { hits++; if (!failing) return route.continue(); return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Internal server error' }) }); });
  await typeSearch(page, 'nguyễn');
  await state(page).waitFor();
  const es = await state(page).innerText();
  check('Search failure (500): state "Không thể tải kết quả tìm kiếm" + "Không thể tải kết quả tìm kiếm. Vui lòng thử lại!" (8.2.3.18), NOT shown as "no result"', es.includes('Không thể tải kết quả tìm kiếm') && es.includes('Vui lòng thử lại!') && !es.includes('Không có kết quả phù hợp'));
  const tt = errToast(page);
  const tText = await tt.innerText();
  check('Search failure: system toast "Không thể thực hiện" + message + "Thử lại" button + X', tText.includes('Không thể thực hiện') && tText.includes('Không thể tải kết quả tìm kiếm. Vui lòng thử lại!') && (await tt.getByRole('button', { name: 'Thử lại' }).count()) === 1 && (await tt.getByRole('button', { name: 'Đóng thông báo' }).count()) === 1);
  const tb = await tt.boundingBox();
  check('Search failure: toast is fixed top-right (Figma: x≈907, y≈106, w≈510) and is pink', Math.abs(tb.x + tb.width - 1416) <= 12 && Math.abs(tb.y - 106) <= 12 && Math.abs(tb.width - 510) <= 12 && (await tt.evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(252, 235, 240)', JSON.stringify(tb));
  check('Search failure: no raw error text anywhere, keyword and toolbar kept', (await noRaw(page)) && (await input(page).inputValue()) === 'nguyễn' && (await page.locator('.customer-search-table thead th').count()) === 6);
  await page.screenshot({ path: path.join(shots, 'search-error.png') });
  const before = listReqs.length;
  await tt.getByRole('button', { name: 'Thử lại' }).dblclick();
  await page.waitForTimeout(700);
  check('Retry keeps the keyword and sends exactly ONE request (double click does not duplicate)', listReqs.length - before === 1 && listReqs[listReqs.length - 1] === 'nguyễn', `${listReqs.length - before} ${listReqs.at(-1)}`);
  await tt.getByRole('button', { name: 'Đóng thông báo' }).click();
  check('X closes the toast; the error state in the table area stays', (await errToast(page).count()) === 0 && (await state(page).innerText()).includes('Không thể tải kết quả tìm kiếm'));
  failing = false;
  await page.getByRole('button', { name: 'Thử lại' }).count(); // toast is closed: retry by searching again
  await typeSearch(page, 'nguyễn minh');
  rows = await page.locator('.customer-search-table tbody tr').allInnerTexts();
  check('After the backend recovers the same keyword search succeeds, error state and toast are gone', rows.length === 1 && rows[0].includes('Nguyễn Minh Anh') && (await state(page).count()) === 0 && (await errToast(page).count()) === 0, JSON.stringify(rows));
  await page.unroute(LIST);

  // network failure (fetch rejected) + Thử lại recovers
  let down = true;
  await page.route(LIST, (route) => (down ? route.abort('failed') : route.continue()));
  await typeSearch(page, 'ngọc');
  await state(page).waitFor();
  check('Search with the network down: friendly state + toast, never "Failed to fetch"', (await state(page).innerText()).includes('Không thể tải kết quả tìm kiếm') && (await errToast(page).count()) === 1 && (await noRaw(page)));
  down = false;
  await errToast(page).getByRole('button', { name: 'Thử lại' }).click();
  await page.locator('.customer-search-table tbody tr').first().waitFor({ timeout: 10000 });
  check('"Thử lại" after the network is back loads the SAME keyword (ngọc) and clears the error', (await page.locator('.customer-search-table tbody tr').allInnerTexts()).join('').includes('Trần Bảo Ngọc') && (await errToast(page).count()) === 0 && (await input(page).inputValue()) === 'ngọc');
  await page.unroute(LIST);

  // 403 and 400 are not turned into "no result", and are not retryable
  await page.route(LIST, (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Forbidden resource' }) }));
  await typeSearch(page, 'quyền');
  await state(page).waitFor();
  check('403: shows the permission message, no "Thử lại", not "no result", no raw text', (await state(page).innerText()).includes('Bạn không có quyền quản lý khách hàng.') && (await errToast(page).getByRole('button', { name: 'Thử lại' }).count()) === 0 && (await noRaw(page)));
  await page.unroute(LIST);
  await page.route(LIST, (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: ['q must be shorter'] }) }));
  await typeSearch(page, 'quá dài');
  await state(page).waitFor();
  check('400: shows "Từ khóa tìm kiếm không hợp lệ!" (no raw validator text)', (await state(page).innerText()).includes('Từ khóa tìm kiếm không hợp lệ!') && !(await bodyText(page)).includes('must be'));
  await page.unroute(LIST);
  await typeSearch(page, '');
  await page.locator('.customer-search-table tbody tr').first().waitFor();

  // ============================================ D. detail
  const firstRow = page.locator('.customer-search-table tbody tr').first();
  const firstId = (await firstRow.locator('td').first().innerText()).trim();
  const viewBtn = firstRow.locator('.figma-icon-view');
  await viewBtn.click();
  await page.locator('dialog.spa-drawer-right[open] .detail-kv-list').waitFor({ timeout: 10000 });
  const dText = await page.locator('dialog.spa-drawer-right[open]').innerText();
  check('Detail of an existing customer shows the real data from the backend (code, name, phone, channel, booking count)', dText.includes(firstId) && dText.includes('Mã khách hàng') && dText.includes('Tổng số lịch hẹn') && !/Failed to fetch/i.test(dText), dText.slice(0, 200));
  await page.locator('dialog.spa-drawer-right[open] .spa-modal-close').click();

  let detailMode = 'fail500';
  const wantedId = firstId;
  await page.route(DETAIL, (route) => {
    if (detailMode === 'ok') return route.continue();
    if (detailMode === 'abort') return route.abort('failed');
    if (detailMode === 'notfound') return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Không tìm thấy khách hàng.' }) });
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Internal server error' }) });
  });
  detailReqs.length = 0;
  await viewBtn.click();
  await errToast(page).waitFor({ timeout: 10000 });
  const dt = await errToast(page).innerText();
  check('Detail failure (500): error toast "Không thể thực hiện" + "Không thể hiển thị thông tin khách hàng, vui lòng thử lại!" + Thử lại + X; no drawer, no raw text', dt.includes('Không thể thực hiện') && dt.includes('Không thể hiển thị thông tin khách hàng, vui lòng thử lại!') && (await errToast(page).getByRole('button', { name: 'Thử lại' }).count()) === 1 && (await errToast(page).getByRole('button', { name: 'Đóng thông báo' }).count()) === 1 && (await page.locator('dialog.spa-drawer-right[open]').count()) === 0 && (await noRaw(page)));
  const dtb = await errToast(page).boundingBox();
  check('Detail failure: toast position/size/colour as in Figma (top-right, ~510px, pink) and the list stays visible', Math.abs(dtb.x + dtb.width - 1416) <= 12 && Math.abs(dtb.y - 106) <= 12 && Math.abs(dtb.width - 510) <= 12 && (await page.locator('.customer-search-table tbody tr').count()) >= 3);
  await page.screenshot({ path: path.join(shots, 'detail-error.png') });
  const d0 = detailReqs.length;
  await errToast(page).getByRole('button', { name: 'Thử lại' }).dblclick();
  await page.waitForTimeout(600);
  check('Detail retry reloads only the selected customer and sends ONE request (no duplicates)', detailReqs.length - d0 === 1 && detailReqs.at(-1)?.endsWith(`/${wantedId}`), `${detailReqs.length - d0} ${detailReqs.at(-1)}`);
  detailMode = 'ok';
  await errToast(page).getByRole('button', { name: 'Thử lại' }).click();
  await page.locator('dialog.spa-drawer-right[open] .detail-kv-list').waitFor({ timeout: 10000 });
  check('Detail "Thử lại" after recovery opens the drawer with the customer data and removes the toast', (await errToast(page).count()) === 0 && (await page.locator('dialog.spa-drawer-right[open]').innerText()).includes(wantedId));
  await page.locator('dialog.spa-drawer-right[open] .spa-modal-close').click();

  detailMode = 'abort';
  await viewBtn.click();
  await errToast(page).waitFor({ timeout: 10000 });
  check('Detail with the network down: friendly toast, never "Failed to fetch"', (await errToast(page).innerText()).includes('Không thể hiển thị thông tin khách hàng') && (await noRaw(page)));
  await errToast(page).getByRole('button', { name: 'Đóng thông báo' }).click();
  check('Detail toast: X closes it without opening anything', (await errToast(page).count()) === 0 && (await page.locator('dialog.spa-drawer-right[open]').count()) === 0);

  detailMode = 'notfound';
  await viewBtn.click();
  await errToast(page).waitFor({ timeout: 10000 });
  check('Detail of a customer that no longer exists (404): says so precisely, no "Thử lại"', (await errToast(page).innerText()).includes('Không tìm thấy khách hàng.') && (await errToast(page).getByRole('button', { name: 'Thử lại' }).count()) === 0);
  await errToast(page).getByRole('button', { name: 'Đóng thông báo' }).click();
  await page.unroute(DETAIL);

  // real backend 404 / validation for the same endpoints
  const cookie = (await ctx.cookies(origin)).map((c) => `${c.name}=${c.value}`).join('; ');
  const st404 = (await fetch(`${origin}/api/customers/KH99999999`, { headers: { cookie } })).status;
  const stBad = (await fetch(`${origin}/api/customers/not-an-id`, { headers: { cookie } })).status;
  const stNul = (await fetch(`${origin}/api/customers?q=a%00b`, { headers: { cookie } })).status;
  check('Real backend: unknown id -> 404, malformed id -> 404, NUL in keyword -> 400 (no 5xx)', st404 === 404 && stBad === 404 && stNul === 400, `${st404} ${stBad} ${stNul}`);

  // ============================================ E. not affected: add/edit open, no writes, RBAC
  await page.getByRole('button', { name: '+ Thêm mới' }).click();
  await page.locator('dialog.customer-form-modal[open]').waitFor();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await firstRow.locator('.figma-icon-edit').click();
  await page.locator('dialog.customer-form-modal[open]').waitFor();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  check('Add / Edit dialogs still open and cancel normally; delete button still there; no write request was sent and no customer row changed', posts.length === 0 && (await customersTotal()) === baseCount && (await hashAll()) === baseHash && (await firstRow.locator('.figma-icon-delete').count()) === 1, JSON.stringify(posts));
  const custLogin = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-spa-request': '1' }, body: JSON.stringify({ phone: '0900000004', password: PW }) });
  const custCookie = (custLogin.headers.get('set-cookie') ?? '').split(';')[0];
  check('RBAC unchanged: a customer account is refused (403) on list and detail; no cookie is 401', (await fetch(`${origin}/api/customers`, { headers: { cookie: custCookie } })).status === 403 && (await fetch(`${origin}/api/customers/KH00000001`, { headers: { cookie: custCookie } })).status === 403 && (await fetch(`${origin}/api/customers`)).status === 401);
  await ctx.close();

  // ============================================ F. responsive
  for (const [w, h] of [[1024, 768], [390, 844]]) {
    const { ctx: c2, page: p2 } = await newPage('owner', { width: w, height: h });
    await typeSearch(p2, 'khách hàng xyz'); await state(p2).waitFor();
    const ov = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const sb2 = await state(p2).boundingBox();
    check(`${w}x${h}: empty state fits (no horizontal page scroll, block inside the viewport)`, ov <= 1 && sb2.x >= 0 && sb2.x + sb2.width <= w + 1, `overflow=${ov} ${JSON.stringify(sb2)}`);
    await p2.route(LIST, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
    await typeSearch(p2, 'lỗi'); await errToast(p2).waitFor();
    const tb2 = await errToast(p2).boundingBox();
    check(`${w}x${h}: error toast stays inside the viewport`, tb2.x >= 0 && tb2.x + tb2.width <= w + 1 && (await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, JSON.stringify(tb2));
    if (w === 390) await p2.screenshot({ path: path.join(shots, 'mobile-error.png') });
    await c2.close();
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
