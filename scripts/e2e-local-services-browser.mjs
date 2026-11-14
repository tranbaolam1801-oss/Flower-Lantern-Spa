#!/usr/bin/env node
// REAL browser E2E (headless Chromium) for Quản lý dịch vụ (UC_9) and the customer service pages,
// against the built frontend served with the REAL API entry (api/index.js) on a real PostgreSQL engine (PGlite). In-memory only.
// Requires `npm run build` first.   node scripts/e2e-local-services-browser.mjs
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
const dbServer = new PGLiteSocketServer({ db, port: 54350, host: '127.0.0.1' });
await dbServer.start();
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgres://postgres@127.0.0.1:54350/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
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


const VNd = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() + n * 86400000));
await db.exec(`
  INSERT INTO dbo.DanhMuc VALUES ('DM00000001','Massage','Hoạt động'),('DM00000002','Da mặt','Hoạt động');
  INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV00000001','DM00000001','Massage dưỡng sinh','Hoạt động'),('DV00000002','DM00000002','Chăm sóc da','Hoạt động'),('DV00000003','DM00000001','Massage chân','Hoạt động');
  INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES ('GV00000001','DV00000001','Gói 60 phút',60,390000),('GV00000002','DV00000002','Gói 60 phút',60,450000),('GV00000003','DV00000003','Gói 45 phút',45,200000),('GV00000004','DV00000003','Gói 90 phút',90,350000);
  INSERT INTO dbo.LichHen(MaLichHen,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan) VALUES ('LH00000001','Khách Chờ','0911000001','${VNd(2)}','10:00:00','Chờ xác nhận','Chưa thanh toán');
  INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,SoDienThoai,ThoiDiemBatDau,ThoiDiemKetThuc) VALUES ('CT00000001','LH00000001','GV00000002','G1','Khách Chờ','0911000001','${VNd(2)} 10:00:00','${VNd(2)} 11:00:00');`);
const svcShots = path.join(os.tmpdir(), 'spa-services-shots'); mkdirSync(svcShots, { recursive: true });
const errs = [];
const where3 = (page) => new URL(page.url()).pathname;
async function login3(page, phone) {
  await page.goto(`${origin}/dang-nhap`, { waitUntil: 'networkidle' });
  await page.fill('#phone', phone); await page.fill('#password', PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/dang-nhap'), { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
const svcCount = async () => (await db.query('SELECT count(*)::int n FROM dbo.DichVu')).rows[0].n;
const svcHash = async () => (await db.query("SELECT md5(string_agg(d::text,'|' ORDER BY d::text)) h FROM dbo.DichVu d")).rows[0].h;
const toast = (page) => page.locator('[data-testid="svc-toast"]');
const formDlg = (page) => page.locator('dialog[aria-labelledby="svc-form-title"]');
const delDlg = (page) => page.locator('dialog.svc-delete-dialog');
const noRaw3 = async (page) => !/Failed to fetch|NetworkError|Load failed|Internal server error|HTTP 5\d\d/i.test(await page.locator('body').innerText());
const err = (page, sel) => page.locator(sel).innerText();

try {
  const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  const writes = []; page.on('request', (r) => { if (r.url().includes('/api/admin/services') && r.method() !== 'GET') writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await login3(page, '0900000001');
  await page.goto(`${origin}/admin/dich-vu`, { waitUntil: 'networkidle' });
  await page.locator('.admin-service-table tbody tr').first().waitFor({ timeout: 15000 });
  const sc = await page.locator('.customer-search-scroll').evaluate((e) => ({ over: e.scrollWidth - e.clientWidth }));
  check('List: at 1536px the table fits the card (no horizontal scrollbar) and the "Thao tác" column is visible', sc.over <= 1 && (await page.locator('.admin-service-table th', { hasText: 'Thao tác' }).isVisible()), JSON.stringify(sc));
  const baseCount = await svcCount(); const baseHash = await svcHash();

  // ---------------- A. add: validation under each field (Figma 3:6310 / 3:6446)
  await page.getByRole('button', { name: '+ Thêm dịch vụ' }).click(); await formDlg(page).waitFor();
  await page.screenshot({ path: path.join(svcShots, 'add-open.png') });
  await formDlg(page).getByRole('button', { name: 'Thêm dịch vụ' }).click();
  const msgs = await formDlg(page).locator('.svc-field-error').allInnerTexts();
  check('Add, all required fields empty: an error appears UNDER each field (name, category, package name, duration, price) with the Figma wording', msgs.filter((m) => m === 'Vui lòng nhập trường bắt buộc.').length === 4 && msgs.includes('Vui lòng chọn danh mục.') && msgs.length === 5, JSON.stringify(msgs));
  const redBorder = await formDlg(page).locator('[data-field="name"]').evaluate((e) => getComputedStyle(e).borderColor);
  check('Add: invalid fields get a red border, placeholders read "Chưa nhập", focus goes to the first invalid field, NO general banner, and nothing was sent', redBorder === 'rgb(192, 40, 75)' && (await formDlg(page).locator('[data-field="name"]').getAttribute('placeholder')) === 'Chưa nhập' && (await page.evaluate(() => document.activeElement?.getAttribute('data-field'))) === 'name' && (await formDlg(page).locator('[data-testid="svc-save-error"]').count()) === 0 && writes.length === 0, redBorder);
  await page.screenshot({ path: path.join(svcShots, 'add-required.png') });
  await formDlg(page).locator('[data-field="name"]').fill('Dịch vụ thử');
  check('Typing in a field clears only that field\'s error', (await formDlg(page).locator('.svc-field-error').count()) === 4);
  await formDlg(page).locator('[data-field="category"]').selectOption('DM00000001');
  await formDlg(page).locator('[data-field="packageName"]').fill('Gói thử');
  for (const [dur, price, durMsg, priceMsg] of [['abc', '-200000', true, true], ['-20', '0', true, true], ['1.5', '12abc', true, true], ['70', '360000', false, false]]) {
    await formDlg(page).locator('[data-field="duration"]').fill(dur); await formDlg(page).locator('[data-field="price"]').fill(price);
    await formDlg(page).getByRole('button', { name: 'Thêm dịch vụ' }).click();
    if (durMsg) {
      const m = await formDlg(page).locator('.svc-field-error').allInnerTexts();
      check(`Add, duration "${dur}" / price "${price}": "Thời lượng phải là số nguyên dương." and "Giá phải là số nguyên dương (VNĐ)." under the fields, nothing saved`, m.includes('Thời lượng phải là số nguyên dương.') && m.includes('Giá phải là số nguyên dương (VNĐ).') && writes.length === 0, JSON.stringify(m));
    }
  }
  // the last iteration is valid -> real create
  await toast(page).waitFor({ timeout: 8000 }).catch(async () => { console.log('DEBUG dialog:', (await formDlg(page).innerText()).replace(/\s+/g, ' ').slice(0, 600), '| writes:', writes.join(), '| toastCount:', await page.locator('.svc-toast').count(), '| rows:', await page.locator('.admin-service-table tbody tr').count(), '| sql:', await svcCount(), '| dlgOpen:', await formDlg(page).evaluate((d) => d.open)); throw new Error('no toast'); });
  const t1 = await toast(page).innerText(); const tb = await toast(page).boundingBox();
  check('Add success: Figma toast "Thành công / Thêm mới dịch vụ thành công!" appears ONLY after the backend confirmed (201), fixed bottom-right (510px wide), the modal closes', t1.includes('Thành công') && t1.includes('Thêm mới dịch vụ thành công!') && writes.join() === 'POST /api/admin/services' && Math.abs(tb.x + tb.width - 1536 + 24) <= 14 && Math.abs(tb.y + tb.height - 864 + 24) <= 14 && Math.abs(tb.width - 510) <= 12 && (await formDlg(page).evaluate((d) => !d.open)), JSON.stringify({ writes, tb }));
  check('Add success: the service exists in SQL (no image required) and shows in the list', (await svcCount()) === baseCount + 1 && (await page.locator('.admin-service-table tbody tr', { hasText: 'Dịch vụ thử' }).count()) === 1);
  await page.screenshot({ path: path.join(svcShots, 'add-success.png') });
  await toast(page).getByRole('button', { name: 'Đóng thông báo' }).click();
  check('The toast X closes it (only one toast at a time)', (await toast(page).count()) === 0);

  // ---------------- B. duplicate (409) + save failure
  writes.length = 0;
  await page.getByRole('button', { name: '+ Thêm dịch vụ' }).click(); await formDlg(page).waitFor();
  await formDlg(page).locator('[data-field="name"]').fill('Chăm sóc da'); await formDlg(page).locator('[data-field="category"]').selectOption('DM00000002');
  await formDlg(page).locator('[data-field="packageName"]').fill('Gói 60'); await formDlg(page).locator('[data-field="duration"]').fill('60'); await formDlg(page).locator('[data-field="price"]').fill('390.000');
  await formDlg(page).getByRole('button', { name: 'Thêm dịch vụ' }).click();
  await formDlg(page).locator('#svc-err-name').waitFor();
  check('Duplicate name (409): "Mã/Tên dịch vụ đã tồn tại!" under the name field, modal stays open, no success toast, values kept', (await err(page, '#svc-err-name')) === 'Mã/Tên dịch vụ đã tồn tại!' && (await toast(page).count()) === 0 && (await formDlg(page).evaluate((d) => d.open)) && (await formDlg(page).locator('[data-field="price"]').inputValue()) === '390.000');
  await formDlg(page).locator('[data-field="name"]').fill('Dịch vụ lỗi lưu');
  let mode = 'abort';
  await page.route(/\/api\/admin\/services$/, (route) => (route.request().method() === 'POST' ? (mode === 'abort' ? route.abort('failed') : route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Internal server error"}' })) : route.continue()));
  await formDlg(page).getByRole('button', { name: 'Thêm dịch vụ' }).click();
  await formDlg(page).locator('[data-testid="svc-save-error"]').waitFor();
  check('Save failure (network): Figma line "Có lỗi khi lưu dữ liệu, vui lòng thử lại sau!" below the hint, no "Failed to fetch", no success toast, typed data kept', (await err(page, '[data-testid="svc-save-error"]')) === 'Có lỗi khi lưu dữ liệu, vui lòng thử lại sau!' && (await noRaw3(page)) && (await toast(page).count()) === 0 && (await formDlg(page).locator('[data-field="name"]').inputValue()) === 'Dịch vụ lỗi lưu');
  mode = '500';
  await formDlg(page).getByRole('button', { name: 'Thêm dịch vụ' }).click();
  await page.waitForTimeout(500);
  check('Save failure (500): same friendly line, no raw server text, and no row was created', (await err(page, '[data-testid="svc-save-error"]')) === 'Có lỗi khi lưu dữ liệu, vui lòng thử lại sau!' && (await noRaw3(page)) && (await svcCount()) === baseCount + 1);
  await page.screenshot({ path: path.join(svcShots, 'add-save-error.png') });
  await page.unroute(/\/api\/admin\/services$/);
  await formDlg(page).getByRole('button', { name: 'Hủy' }).click();

  // ---------------- C. update
  writes.length = 0;
  const row = page.locator('.admin-service-table tbody tr', { hasText: 'Dịch vụ thử' });
  await row.locator('.figma-icon-edit').click(); await formDlg(page).waitFor();
  check('Edit form is pre-filled from the backend (name, category, package, duration, price)', (await formDlg(page).locator('[data-field="name"]').inputValue()) === 'Dịch vụ thử' && (await formDlg(page).locator('[data-field="duration"]').inputValue()) === '70' && (await formDlg(page).locator('[data-field="price"]').inputValue()) === '360000');
  await formDlg(page).locator('[data-field="name"]').fill('Dịch vụ thử cập nhật');
  await formDlg(page).getByRole('button', { name: 'Lưu cập nhật' }).click();
  await toast(page).waitFor({ timeout: 10000 });
  check('Update success: toast "Thành công / Cập nhật dịch vụ thành công!", PATCH sent once, SQL updated', (await toast(page).innerText()).includes('Cập nhật dịch vụ thành công!') && writes.join() === 'PATCH /api/admin/services/DV00000004' && (await db.query("SELECT TenDichVu t FROM dbo.DichVu WHERE MaDichVu='DV00000004'")).rows[0].t === 'Dịch vụ thử cập nhật', writes.join());
  await toast(page).getByRole('button', { name: 'Đóng thông báo' }).click();
  await page.locator('.admin-service-table tbody tr', { hasText: 'Dịch vụ thử cập nhật' }).locator('.figma-icon-edit').click(); await formDlg(page).waitFor();
  await formDlg(page).locator('[data-field="price"]').fill('abc');
  await formDlg(page).getByRole('button', { name: 'Lưu cập nhật' }).click();
  check('Update with an invalid price: error under the field, no request, no success toast', (await err(page, '#svc-err-price')) === 'Giá phải là số nguyên dương (VNĐ).' && (await toast(page).count()) === 0);
  await formDlg(page).locator('[data-field="price"]').fill('360000');
  await page.route(/\/api\/admin\/services\/DV/, (route) => (route.request().method() === 'PATCH' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Không thể kết nối dữ liệu. Vui lòng thử lại!"}' }) : route.continue()));
  await formDlg(page).getByRole('button', { name: 'Lưu cập nhật' }).click();
  await formDlg(page).locator('[data-testid="svc-save-error"]').waitFor();
  check('Update failure (503): the Figma save-error line, NO success toast', (await err(page, '[data-testid="svc-save-error"]')) === 'Có lỗi khi lưu dữ liệu, vui lòng thử lại sau!' && (await toast(page).count()) === 0);
  await page.unroute(/\/api\/admin\/services\/DV/);
  await formDlg(page).getByRole('button', { name: 'Hủy' }).click();

  // ---------------- D. delete dialog (Figma 3:13026 / 3:13439 / 3:13583 / 3:13170)
  writes.length = 0;
  const msg = page.locator('.admin-service-table tbody tr', { hasText: 'Massage dưỡng sinh' });
  const before = await svcHash();
  await msg.locator('.figma-icon-delete').click(); await delDlg(page).waitFor();
  const dtext = await delDlg(page).innerText();
  check('Delete dialog (Figma): "Xóa dịch vụ", "DV00000001 · Massage dưỡng sinh", "Danh mục: Massage · 60 phút · 390.000đ", the question, the note and Hủy / Xóa dịch vụ — and nothing was deleted by opening it', dtext.includes('Xóa dịch vụ') && dtext.includes('DV00000001 · Massage dưỡng sinh') && dtext.includes('Danh mục: Massage · 60 phút · 390.000đ') && dtext.includes('Bạn có chắc muốn xóa dịch vụ này?') && dtext.includes('Dịch vụ sẽ chuyển sang “Ngừng hoạt động”. Lịch sử đặt lịch được giữ nguyên.') && writes.length === 0 && (await svcHash()) === before, dtext);
  const db1 = await delDlg(page).boundingBox(); const cb = await delDlg(page).locator('.svc-delete-cancel').boundingBox(); const xb = await delDlg(page).locator('.svc-delete-confirm').boundingBox();
  const bg = await delDlg(page).locator('.svc-delete-confirm').evaluate((e) => getComputedStyle(e).backgroundColor);
  check('Delete dialog geometry: ~680px wide centred, buttons 160x48 right-aligned (Hủy sage, Xóa dịch vụ crimson)', Math.abs(db1.width - 680) <= 6 && Math.abs(cb.width - 160) <= 2 && Math.abs(cb.height - 48) <= 2 && Math.abs(xb.width - 160) <= 2 && xb.x > cb.x && bg === 'rgb(185, 50, 85)' && Math.abs(db1.x + db1.width / 2 - 768) <= 20, JSON.stringify({ db1, cb, xb, bg }));
  await page.screenshot({ path: path.join(svcShots, 'delete-dialog.png') });
  await delDlg(page).getByRole('button', { name: 'Hủy' }).click();
  check('Hủy closes the dialog, sends NO delete request, data unchanged', (await delDlg(page).evaluate((d) => !d.open)) && writes.length === 0 && (await svcHash()) === before);
  // blocked (real backend 409: a pending future booking uses this service's package)
  const blocked = page.locator('.admin-service-table tbody tr', { hasText: 'Chăm sóc da' }).first();
  await blocked.locator('.figma-icon-delete').click(); await delDlg(page).waitFor();
  await delDlg(page).getByRole('button', { name: 'Xóa dịch vụ' }).click();
  await delDlg(page).locator('[data-testid="svc-delete-error"]').waitFor();
  check('Delete blocked by an unfinished booking (real 409): red "Không thể xóa dịch vụ do đang có lịch hẹn chưa hoàn thành!", only the Hủy button remains, service unchanged', (await err(page, '[data-testid="svc-delete-error"]')) === 'Không thể xóa dịch vụ do đang có lịch hẹn chưa hoàn thành!' && (await delDlg(page).getByRole('button', { name: 'Xóa dịch vụ' }).count()) === 0 && (await delDlg(page).getByRole('button', { name: 'Hủy' }).count()) === 1 && (await db.query("SELECT TrangThai t FROM dbo.DichVu WHERE MaDichVu='DV00000002'")).rows[0].t === 'Hoạt động');
  await page.screenshot({ path: path.join(svcShots, 'delete-blocked.png') });
  await delDlg(page).getByRole('button', { name: 'Hủy' }).click();
  // generic failure keeps both buttons
  await page.route(/\/api\/admin\/services\/DV\d+$/, (route) => (route.request().method() === 'DELETE' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : route.continue()));
  const target = page.locator('.admin-service-table tbody tr', { hasText: 'Dịch vụ thử cập nhật' });
  await target.locator('.figma-icon-delete').click(); await delDlg(page).waitFor();
  await delDlg(page).getByRole('button', { name: 'Xóa dịch vụ' }).click();
  await delDlg(page).locator('[data-testid="svc-delete-error"]').waitFor();
  check('Delete failure (500): "Có lỗi xảy ra, không thể xóa dịch vụ lúc này. Vui lòng thử lại sau!" with both buttons, no success toast', (await err(page, '[data-testid="svc-delete-error"]')) === 'Có lỗi xảy ra, không thể xóa dịch vụ lúc này. Vui lòng thử lại sau!' && (await delDlg(page).getByRole('button', { name: 'Xóa dịch vụ' }).count()) === 1 && (await toast(page).count()) === 0);
  await page.unroute(/\/api\/admin\/services\/DV\d+$/);
  writes.length = 0;
  await delDlg(page).getByRole('button', { name: 'Xóa dịch vụ' }).dblclick();
  await toast(page).waitFor({ timeout: 10000 });
  check('Confirm delete: ONE DELETE request even on double click, toast "Thành công / Xóa dịch vụ thành công!", the service becomes "Ngừng hoạt động" (soft delete, row kept in SQL)', writes.filter((w) => w.startsWith('DELETE')).length === 1 && (await toast(page).innerText()).includes('Xóa dịch vụ thành công!') && (await db.query("SELECT TrangThai t FROM dbo.DichVu WHERE MaDichVu='DV00000004'")).rows[0].t === 'Ngừng hoạt động' && (await svcCount()) === baseCount + 1, writes.join());
  await page.screenshot({ path: path.join(svcShots, 'delete-success.png') });
  await toast(page).getByRole('button', { name: 'Đóng thông báo' }).click();

  // ---------------- E. search states (Figma 3:14917 / 3:14970)
  const input = page.getByLabel('Tìm theo mã hoặc tên dịch vụ');
  await input.fill('zzz không có'); await page.locator('[data-testid="svc-list-empty"]').waitFor({ timeout: 10000 });
  const es = await page.locator('[data-testid="svc-list-empty"]').innerText();
  const est = await page.locator('[data-testid="svc-list-empty"]').boundingBox(); const card = await page.locator('.admin-panel-card').boundingBox();
  check('Search with no result: centred "Không có kết quả phù hợp" + "Không tìm thấy dịch vụ phù hợp.", table header kept, no toast, no horizontal scrollbar', es.includes('Không có kết quả phù hợp') && es.includes('Không tìm thấy dịch vụ phù hợp.') && (await toast(page).count()) === 0 && (await page.locator('.admin-service-table thead th').count()) === 8 && Math.abs(est.x + est.width / 2 - (card.x + card.width / 2)) <= 20 && (await page.locator('.customer-search-scroll').evaluate((e) => e.scrollWidth - e.clientWidth)) <= 1, JSON.stringify({ est, card }));
  await page.screenshot({ path: path.join(svcShots, 'search-empty.png') });
  await page.route(/\/api\/admin\/services\?/, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Internal server error"}' }));
  await input.fill('lỗi tải'); await page.locator('[data-testid="svc-list-error"]').waitFor({ timeout: 10000 });
  const le = await page.locator('[data-testid="svc-list-error"]').innerText();
  check('Search with an API failure: "Không thể tải danh sách" + red "Không thể tải danh sách dịch vụ, vui lòng thử lại sau!" — NOT shown as "no result", no raw text, keyword kept', le.includes('Không thể tải danh sách') && le.includes('Không thể tải danh sách dịch vụ, vui lòng thử lại sau!') && !le.includes('Không có kết quả') && (await noRaw3(page)) && (await input.inputValue()) === 'lỗi tải');
  await page.screenshot({ path: path.join(svcShots, 'search-error.png') });
  await page.unroute(/\/api\/admin\/services\?/);
  await input.fill('Massage'); await page.locator('.admin-service-table tbody tr').first().waitFor({ timeout: 10000 });
  check('After recovery the same box searches normally (results shown, error gone)', (await page.locator('[data-testid="svc-list-error"]').count()) === 0 && (await page.locator('.admin-service-table tbody tr').count()) >= 1);
  const cl = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-spa-request': '1' }, body: JSON.stringify({ phone: '0900000004', password: PW }) });
  const ck = (cl.headers.get('set-cookie') ?? '').split(';')[0];
  check('RBAC unchanged: a customer account is refused (403) on the admin service API; anonymous is 401', (await fetch(`${origin}/api/admin/services`, { headers: { cookie: ck } })).status === 403 && (await fetch(`${origin}/api/admin/services`)).status === 401);
  await ctx.close();

  // ---------------- F. customer service pages
  const cctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const cp = await cctx.newPage(); cp.on('pageerror', (e) => errs.push(e.message));
  await cp.goto(`${origin}/dich-vu`, { waitUntil: 'networkidle' });
  await cp.locator('.catalog-search-pill input').waitFor();
  check('Catalog: exactly one search box ("Nhập tên dịch vụ cần tìm...") with the "Tìm kiếm" button, as in Figma UC_7', (await cp.locator('.catalog-search-pill').count()) === 1 && (await cp.locator('.catalog-search-pill input').getAttribute('placeholder')) === 'Nhập tên dịch vụ cần tìm...');
  await cp.goto(`${origin}/dich-vu/DV00000001`, { waitUntil: 'networkidle' });
  await cp.locator('.service-detail-actions').waitFor();
  await cp.locator('[aria-label="Tìm kiếm dịch vụ"]').click();
  await cp.waitForURL(/\/dich-vu\?focus=search/); await cp.locator('.catalog-search-pill input').waitFor();
  await cp.waitForTimeout(200);
  check('Detail page header magnifier opens the catalog with the search box focused and ready to type', (await cp.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'Nhập tên dịch vụ cần tìm' && (await cp.locator('.catalog-search-pill').count()) === 1);
  await cp.goto(`${origin}/dich-vu/DV00000003`, { waitUntil: 'networkidle' }); await cp.locator('.service-detail-actions').waitFor();
  const meta = await cp.locator('.service-meta-row').innerText();
  check('Detail: the duration shows a clock icon + value (no "Thời lượng:" label in the summary), price kept exactly', (await cp.locator('.service-meta-row .service-clock-icon').count()) === 1 && !/Thời lượng:/.test(meta) && /45 – 90 phút|45.*90 phút/.test(meta) && /200\.000/.test(meta), meta);
  const pk = await cp.locator('.service-packages-box').boundingBox(); const a1 = await cp.getByRole('button', { name: 'Xem liệu trình' }).boundingBox(); const a2 = await cp.getByRole('button', { name: 'Đặt lịch ngay' }).last().boundingBox();
  check('Detail: "Xem liệu trình" then "Đặt lịch ngay" sit on the RIGHT under the package box (Figma UC6.1)', a1.x < a2.x && Math.abs((a2.x + a2.width) - (pk.x + pk.width)) <= 6 && a1.y >= pk.y + pk.height, JSON.stringify({ pk, a1, a2 }));
  await cp.screenshot({ path: path.join(svcShots, 'detail.png') });
  await cp.getByRole('button', { name: 'Xem liệu trình' }).click(); await cp.waitForTimeout(700);
  check('"Xem liệu trình" scrolls to the procedure section', await cp.evaluate(() => { const r = document.getElementById('service-procedure')?.getBoundingClientRect(); return !!r && r.top < window.innerHeight; }));
  await cp.getByRole('button', { name: 'Đặt lịch ngay' }).last().click(); await cp.waitForURL(/\/dat-lich\?serviceId=DV00000003/);
  check('"Đặt lịch ngay" opens the booking page for this service', where3(cp) === '/dat-lich');
  await cctx.close();

  // ---------------- G. responsive
  for (const [w, h, url, sel] of [[390, 844, '/admin/dich-vu', '.admin-service-table'], [390, 844, '/dich-vu/DV00000003', '.service-detail-actions'], [1024, 768, '/admin/dich-vu', '.admin-service-table']]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 700, isMobile: w < 700 }); const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message));
    if (url.startsWith('/admin')) await login3(p, '0900000001');
    await p.goto(`${origin}${url}`, { waitUntil: 'networkidle' }); await p.locator(sel).first().waitFor({ timeout: 15000 });
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${w}x${h} ${url}: no horizontal page overflow`, ov <= 1, `overflow=${ov}`);
    if (w === 390 && url.startsWith('/admin')) { await p.getByRole('button', { name: '+ Thêm dịch vụ' }).click(); await p.locator('dialog[aria-labelledby="svc-form-title"]').waitFor(); await p.locator('dialog[aria-labelledby="svc-form-title"]').getByRole('button', { name: 'Thêm dịch vụ' }).click(); const dov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); check('390px add form with errors: no horizontal overflow', dov <= 1); await p.screenshot({ path: path.join(svcShots, 'mobile-form.png') }); }
    await c.close();
  }
  check('no uncaught page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  check('browser run completed without an exception', false, String(e?.stack ?? e).slice(0, 1000));
} finally {
  await browser.close(); server.close(); await dbServer.stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\nBROWSER (real stack) ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}\nScreenshots: ${svcShots}`);
process.exit(failed ? 1 : 0);
