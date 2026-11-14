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
const dbServer = new PGLiteSocketServer({ db, port: 54343, host: '127.0.0.1' });
await dbServer.start();
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgres://postgres@127.0.0.1:54343/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
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
const shots = path.join(os.tmpdir(), 'spa-customer-shots'); mkdirSync(shots, { recursive: true });
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

try {
  // =============================================================== UC_3 — nút Xóa/Hủy (ba nút, quyền, an toàn)
  {
    const { ctx, page, posts } = await newPage('owner');
    const row = page.locator('.customer-search-table tbody tr').first();
    const btns = row.locator('.figma-row-actions button');
    check('owner: the row has exactly 3 action buttons (view, edit, delete)', (await btns.count()) === 3, String(await btns.count()));
    const b = [await box(btns.nth(0)), await box(btns.nth(1)), await box(btns.nth(2))];
    check('the 3 buttons are on one line (same top) and are 44x44 each (Figma 1:32633)', b.every((x) => Math.abs(x.y - b[0].y) < 1 && Math.round(x.width) === 44 && Math.round(x.height) === 44), JSON.stringify(b.map((x) => [x.x, x.y, x.width, x.height])));
    check('spacing between buttons is 8px', Math.abs(b[1].x - (b[0].x + b[0].width) - 8) < 1 && Math.abs(b[2].x - (b[1].x + b[1].width) - 8) < 1, JSON.stringify(b.map((x) => x.x)));
    const del = btns.nth(2);
    const css = await del.evaluate((el) => { const s = getComputedStyle(el); const i = el.querySelector('img'); return { bg: s.backgroundColor, radius: s.borderTopLeftRadius, iw: i?.getBoundingClientRect().width, ih: i?.getBoundingClientRect().height }; });
    check('delete button: soft pink background #fcebf0, radius 10, 20x20 trash icon', css.bg === 'rgb(252, 235, 240)' && css.radius === '10px' && css.iw === 20 && css.ih === 20, JSON.stringify(css));
    const centerY = b.map((x) => x.y + x.height / 2); const rowBox = await box(row); const cellMid = rowBox.y + rowBox.height / 2;
    check('buttons are vertically centred in the row', Math.abs(centerY[0] - cellMid) < 3, `${centerY[0]} vs ${cellMid}`);
    await page.screenshot({ path: path.join(shots, 'actions-owner.png'), clip: { x: 278, y: 90, width: 1160, height: 420 } });

    const before = await dataSnapshot();
    await del.click({ force: true });
    check('clicking Xóa/Hủy shows the "not available" notice and changes nothing', (await bodyText(page)).includes('Chức năng xóa/hủy khách hàng chưa được áp dụng') && (await dataSnapshot()) === before);
    check('clicking Xóa/Hủy sent NO write request to the API', posts.length === 0, posts.join(','));
    await btns.nth(0).click(); await page.waitForSelector('#customer-detail-title');
    check('"Xem chi tiết" still opens the detail drawer with the customer data', (await bodyText(page)).includes((await row.locator('td strong').innerText()).trim()) && (await bodyText(page)).includes('Mã khách hàng'));
    await page.locator('.spa-drawer-footer button').click();
    await btns.nth(1).click(); await page.locator('dialog.customer-form-modal[open]').waitFor();
    const rowName = (await row.locator('td strong').innerText()).trim();
    await page.waitForFunction((n) => document.querySelector('.customer-form-modal input')?.value === n, rowName, { timeout: 5000 }).catch(() => undefined);
    check('"Chỉnh sửa" still opens the edit form prefilled with that row name', (await page.locator('.customer-form-modal input').nth(0).inputValue()) === rowName, rowName);
    await page.getByRole('button', { name: 'Hủy', exact: true }).click();
    await ctx.close();
  }
  {
    const m = await newPage('manager');
    check('manager: sees the delete button too (3 buttons)', (await m.page.locator('.customer-search-table tbody tr').first().locator('.figma-row-actions button').count()) === 3);
    await m.ctx.close();
    const s = await newPage('staff');
    check('staff (Nhân viên): delete button is NOT shown, view/edit remain (2 buttons)', (await s.page.locator('.customer-search-table tbody tr').first().locator('.figma-row-actions button').count()) === 2);
    await s.ctx.close();
  }

  // =============================================================== UC_3.1 — form Thêm khách hàng
  const { ctx, page, posts } = await newPage('owner');
  const base = await customerCount();

  // 1) Hủy: đóng form, không gọi API, không có thông báo nào
  await addButton(page).click(); await fillForm(page, 'Người Hủy', '0933000001');
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await page.waitForTimeout(300);
  check('Hủy closes the form', !(await page.locator('dialog.customer-form-modal').evaluate((d) => d.open)));
  check('Hủy: no request sent, no customer created, no success/error toast, no raw error text', posts.length === 0 && (await customerCount()) === base && (await toastCount(page, 'success')) === 0 && (await toastCount(page, 'error')) === 0 && !/Failed to fetch/i.test(await bodyText(page)), posts.join(','));

  // 2) Lưu hợp lệ -> thành công chỉ sau khi API xác nhận
  await addButton(page).click(); await fillForm(page, 'Phạm Thị Mai', '0933000002');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.locator('[data-testid="customer-toast-success"]').waitFor({ timeout: 15000 });
  const ok = (await page.locator('[data-testid="customer-toast-success"]').innerText()).replace(/\s+/g, ' ');
  check('valid save: success toast "Thành công — Thêm khách hàng thành công!" appears after the API created it (201)', ok.includes('Thành công') && ok.includes('Thêm khách hàng thành công!') && posts.length === 1 && posts[0] === 'POST /api/customers' && (await customerCount()) === base + 1, `${ok} | ${posts}`);
  const t = await page.locator('[data-testid="customer-toast-success"]').evaluate((el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return { bg: s.backgroundColor, border: s.borderTopColor, radius: s.borderTopLeftRadius, w: Math.round(r.width), top: Math.round(r.top), right: Math.round(innerWidth - r.right) }; });
  check('success toast matches Figma: #edf7ef, border #95c4a0, radius 14, 510px wide, top 106 / right 24', t.bg === 'rgb(237, 247, 239)' && t.border === 'rgb(149, 196, 160)' && t.radius === '14px' && t.w === 510 && t.top === 106 && t.right === 24, JSON.stringify(t));
  await page.screenshot({ path: path.join(shots, 'success-toast.png') });
  check('the form closed and the new customer appears in the list', !(await page.locator('dialog.customer-form-modal').evaluate((d) => d.open)) && (await bodyText(page)).includes('Phạm Thị Mai'));

  // 3) mở lại form + Hủy: thông báo thành công cũ KHÔNG còn (nguyên nhân lỗi cũ: notice không bao giờ bị xóa)
  await addButton(page).click();
  check('opening the form again clears the previous success toast', (await toastCount(page, 'success')) === 0);
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  check('Hủy after an earlier success shows no success message', (await toastCount(page, 'success')) === 0);

  // 4) dữ liệu không hợp lệ -> lỗi validation theo trường, không toast, không request
  await addButton(page).click(); const sent0 = posts.length;
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  check('empty name: field error "Vui lòng nhập họ tên khách hàng!", no request, no toast', (await bodyText(page)).includes('Vui lòng nhập họ tên khách hàng!') && posts.length === sent0 && (await toastCount(page, 'success')) === 0 && (await toastCount(page, 'error')) === 0);
  await fillForm(page, 'Có Tên', '12ab');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  check('bad phone: "Số điện thoại không hợp lệ!", no request', (await bodyText(page)).includes('Số điện thoại không hợp lệ!') && posts.length === sent0);
  await fillForm(page, 'Trùng Số', '0912000001');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.waitForSelector('text=Khách hàng đã tồn tại!', { timeout: 15000 });
  check('duplicate phone (real API 409): field message "Khách hàng đã tồn tại!", no success toast, nothing created', (await toastCount(page, 'success')) === 0 && (await customerCount()) === base + 1);

  // 5) footer: vị trí Hủy/Lưu theo Figma, chỉ một bộ nút
  const d = await box(page.locator('dialog.customer-form-modal'));
  const cancel = await box(page.getByRole('button', { name: 'Hủy', exact: true })), save = await box(page.getByRole('button', { name: 'Lưu', exact: true }));
  check('Hủy is on the LEFT and Lưu on the RIGHT of the footer, far apart (not adjacent)', cancel.x < save.x && save.x - (cancel.x + cancel.width) > 100, JSON.stringify({ cancel, save }));
  check('footer paddings: Hủy starts ~32px from the left edge, Lưu ends ~32px from the right edge', Math.abs(cancel.x - d.x - 32) <= 3 && Math.abs(d.x + d.width - (save.x + save.width) - 32) <= 3, `${cancel.x - d.x} / ${d.x + d.width - save.x - save.width}`);
  check('both buttons are 50px high and aligned on one line; sizes 112 / 150', Math.round(cancel.height) === 50 && Math.round(save.height) === 50 && Math.abs(cancel.y - save.y) < 1 && Math.round(cancel.width) === 112 && Math.round(save.width) === 150, JSON.stringify({ cancel, save }));
  check('there is only ONE Hủy and ONE Lưu button in the form', (await page.locator('dialog.customer-form-modal').getByRole('button', { name: 'Hủy', exact: true }).count()) === 1 && (await page.locator('dialog.customer-form-modal').getByRole('button', { name: 'Lưu', exact: true }).count()) === 1);
  check('the footer has a thin top separator line', await page.locator('.customer-form-modal .spa-modal-footer').evaluate((el) => getComputedStyle(el).borderTopWidth === '1px'));
  await page.screenshot({ path: path.join(shots, 'form-desktop.png') });

  // 6) lỗi API (500): toast lỗi đúng Figma, dữ liệu giữ nguyên, không "thành công", không che nút
  await page.route('**/api/customers', async (route) => { if (route.request().method() === 'POST') return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Internal server error' }) }); return route.continue(); });
  await fillForm(page, 'Nguyễn Lỗi Máy Chủ', '0933000003');
  const sentBefore500 = posts.length;
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.locator('[data-testid="customer-toast-error"]').waitFor();
  const err = await page.locator('[data-testid="customer-toast-error"]').innerText();
  check('API 500: error toast titled "Không thể thực hiện" with "Có lỗi khi lưu dữ liệu. Vui lòng thử lại!" and a Thử lại button', err.includes('Không thể thực hiện') && err.includes('Có lỗi khi lưu dữ liệu. Vui lòng thử lại!') && err.includes('Thử lại'), err);
  check('API 500: no success toast, nothing saved', (await toastCount(page, 'success')) === 0 && (await customerCount()) === base + 1);
  const et = await page.locator('[data-testid="customer-toast-error"]').evaluate((el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); const icon = getComputedStyle(el.querySelector('.customer-toast-icon')); return { bg: s.backgroundColor, border: s.borderTopColor, w: Math.round(r.width), top: Math.round(r.top), right: Math.round(innerWidth - r.right), icon: icon.backgroundColor }; });
  check('error toast matches Figma: #fcebf0, border #e9a0b2, 510px, top 106 / right 24, red circle #b73551 with X icon', et.bg === 'rgb(252, 235, 240)' && et.border === 'rgb(233, 160, 178)' && et.w === 510 && et.top === 106 && et.right === 24 && et.icon === 'rgb(183, 53, 81)', JSON.stringify(et));
  check('form data is preserved after the failure', (await page.locator('.customer-form-modal input').nth(0).inputValue()) === 'Nguyễn Lỗi Máy Chủ' && (await page.locator('.customer-form-modal input').nth(1).inputValue()) === '0933000003');
  const toastBox = await box(page.locator('[data-testid="customer-toast-error"]')); const saveBox2 = await box(page.getByRole('button', { name: 'Lưu', exact: true })); const cancelBox2 = await box(page.getByRole('button', { name: 'Hủy', exact: true }));
  const overlaps = (a, c) => !(a.x + a.width <= c.x || c.x + c.width <= a.x || a.y + a.height <= c.y || c.y + c.height <= a.y);
  check('the error toast does not cover the Hủy / Lưu buttons', !overlaps(toastBox, saveBox2) && !overlaps(toastBox, cancelBox2));
  await page.screenshot({ path: path.join(shots, 'error-toast.png') });

  // 7) X đóng toast: chỉ ẩn, không lưu, giữ dữ liệu
  const sentBeforeClose = posts.length;
  await page.getByRole('button', { name: 'Đóng thông báo' }).click();
  check('X hides the toast without saving; form data kept; no new request', (await toastCount(page, 'error')) === 0 && posts.length === sentBeforeClose && (await page.locator('.customer-form-modal input').nth(0).inputValue()) === 'Nguyễn Lỗi Máy Chủ');

  // 8) lỗi mạng thật (fetch bị chặn): thông báo thân thiện, KHÔNG hiện "Failed to fetch"
  await page.unroute('**/api/customers');
  await page.route('**/api/customers', (route) => (route.request().method() === 'POST' ? route.abort('failed') : route.continue()));
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await page.locator('[data-testid="customer-toast-error"]').waitFor();
  const netText = await bodyText(page);
  check('network failure: friendly toast, and the text "Failed to fetch" is nowhere on the page', netText.includes('Có lỗi khi lưu dữ liệu. Vui lòng thử lại!') && !/Failed to fetch/i.test(netText));

  // 9) Thử lại không tạo request trùng: bấm liên tục -> đúng một request, rồi thành công
  await page.unroute('**/api/customers');
  let delivered = 0, release;
  const gate = new Promise((r) => { release = r; });
  await page.route('**/api/customers', async (route) => { if (route.request().method() !== 'POST') return route.continue(); delivered += 1; await gate; return route.continue(); });
  const sentBeforeRetry = posts.length;
  const retry = page.getByRole('button', { name: 'Thử lại' });
  await retry.click(); await retry.click({ force: true, timeout: 2000 }).catch(() => undefined); await retry.click({ force: true, timeout: 2000 }).catch(() => undefined);
  await page.getByRole('button', { name: /Đang lưu/ }).click({ force: true, timeout: 1000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  check('Thử lại pressed repeatedly (and Lưu while saving) sends exactly ONE request', delivered === 1 && posts.length === sentBeforeRetry + 1, `delivered=${delivered} posts=${posts.length - sentBeforeRetry}`);
  check('while saving, Hủy and Lưu are disabled', (await page.getByRole('button', { name: 'Hủy', exact: true }).isDisabled()) && (await page.locator('.customer-form-modal button[type="submit"]').isDisabled()));
  release();
  await page.locator('[data-testid="customer-toast-success"]').waitFor({ timeout: 15000 });
  check('after the retry succeeds: exactly one customer created, success toast, error toast gone', (await customerCount()) === base + 2 && (await toastCount(page, 'error')) === 0);
  await page.unroute('**/api/customers');

  // 10) form cao thấp: footer luôn thấy khi cuộn
  await page.setViewportSize({ width: 1440, height: 520 });
  await addButton(page).click(); await page.waitForTimeout(200);
  const f1 = await box(page.getByRole('button', { name: 'Lưu', exact: true }));
  await page.locator('dialog.customer-form-modal').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const f2 = await box(page.getByRole('button', { name: 'Lưu', exact: true }));
  check('short viewport (520px): Lưu button stays inside the viewport before and after scrolling the form', f1.y + f1.height <= 520 && f2.y + f2.height <= 520 && f2.y >= 0, JSON.stringify({ f1, f2 }));
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await ctx.close();

  // 11) mobile
  {
    const m = await newPage('owner', { width: 390, height: 844 });
    await m.page.getByRole('button', { name: '+ Thêm mới' }).click({ timeout: 10000 }).catch(async () => { await m.page.locator('.customer-add-btn').click(); });
    await m.page.locator('#customer-form-title').waitFor();
    const mc = await box(m.page.getByRole('button', { name: 'Hủy', exact: true })), ms = await box(m.page.getByRole('button', { name: 'Lưu', exact: true }));
    const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
    check('mobile 390x844: Hủy left / Lưu right, both fully on screen and usable, no horizontal overflow', mc.x >= 0 && ms.x + ms.width <= 390 && mc.x < ms.x && ms.y + ms.height <= 844 && !overflow, JSON.stringify({ mc, ms, overflow }));
    await m.page.route('**/api/customers', (route) => (route.request().method() === 'POST' ? route.fulfill({ status: 500, body: '{}' , contentType: 'application/json' }) : route.continue()));
    await fillForm(m.page, 'Mobile Lỗi', '0933000004');
    await m.page.getByRole('button', { name: 'Lưu', exact: true }).click();
    await m.page.locator('[data-testid="customer-toast-error"]').waitFor();
    const tb = await box(m.page.locator('[data-testid="customer-toast-error"]')); const sb = await box(m.page.getByRole('button', { name: 'Lưu', exact: true })); const cb = await box(m.page.getByRole('button', { name: 'Hủy', exact: true }));
    check('mobile: the error toast fits the screen and does not cover Hủy / Lưu', tb.x >= 0 && tb.x + tb.width <= 390 && !overlaps(tb, sb) && !overlaps(tb, cb), JSON.stringify({ tb, sb, cb }));
    await m.page.screenshot({ path: path.join(shots, 'mobile-error.png') });
    await m.ctx.close();
  }

  // 12) Sửa vẫn lưu được (không bị ảnh hưởng)
  {
    const e = await newPage('owner');
    await e.page.locator('.customer-search-table tbody tr').first().locator('.figma-row-actions button').nth(1).click();
    await e.page.locator('#customer-form-title').waitFor();
    await e.page.locator('.customer-form-modal input').nth(0).fill('Nguyễn Minh Anh Đã Sửa');
    await e.page.getByRole('button', { name: 'Cập nhật', exact: true }).click();
    await e.page.locator('[data-testid="customer-toast-success"]').waitFor({ timeout: 15000 });
    check('Edit still saves (PATCH 200) and shows its success toast', (await count("SELECT count(*)::int n FROM dbo.KhachHang WHERE HoTen='Nguyễn Minh Anh Đã Sửa'")) === 1 && e.posts.some((x) => x.startsWith('PATCH')));
    await e.ctx.close();
  }
  check('history untouched by all of the above: bookings, payments and reviews all still present', (await count('SELECT count(*)::int n FROM dbo.LichHen')) === 1 && (await count('SELECT count(*)::int n FROM dbo.ThanhToan')) === 1 && (await count('SELECT count(*)::int n FROM dbo.DanhGia')) === 1);
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('browser run completed without an exception', false, String(e?.stack ?? e).slice(0, 600));
} finally {
  await browser.close(); server.close(); await dbServer.stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\nBROWSER (real stack) ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}\nScreenshots: ${shots}`);
process.exit(failed ? 1 : 0);
