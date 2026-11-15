#!/usr/bin/env node
// REAL browser E2E (headless Chromium) for customer review (UC_5.5),
// against the built frontend served with the REAL API entry (api/index.js) on a real PostgreSQL engine (PGlite). In-memory only.
// Requires `npm run build` first.   node scripts/e2e-local-customer-review-browser.mjs
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
const dbServer = new PGLiteSocketServer({ db, port: 54372, host: '127.0.0.1' });
await dbServer.start();
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgres://postgres@127.0.0.1:54372/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
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


const vnDate = (d = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() + d * 86400000));
async function loginC(page, phone = '0900000004') {
  await page.goto(`${origin}/dang-nhap`, { waitUntil: 'networkidle' });
  await page.fill('#phone', phone); await page.fill('#password', PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/dang-nhap'), { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
const apiC = async (cookie, method, url, body) => { const r = await fetch(`${origin}${url}`, { method, headers: { 'content-type': 'application/json', 'x-spa-request': '1', cookie }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
const toastC = (page, kind) => page.locator(`[data-testid="notice-toast-${kind}"]`);
const whereC = (page) => new URL(page.url()).pathname;


const shots2 = path.join(os.tmpdir(), 'spa-review-shots'); mkdirSync(shots2, { recursive: true });
await db.exec(`
  INSERT INTO dbo.DanhMuc VALUES ('DM00000001','Massage','Hoạt động');
  INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV00000001','DM00000001','Massage chân','Hoạt động');
  INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES ('GV00000001','DV00000001','Gói chân 60 phút',60,350000);
  INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan) VALUES
   ('LH00000103','KH00000001','Khách Demo','0900000004','2026-10-28','16:00','Hoàn thành','Đã thanh toán'),
   ('LH00000104','KH00000001','Khách Demo','0900000004','2026-10-29','09:00','Hoàn thành','Đã thanh toán'),
   ('LH00000105','KH00000001','Khách Demo','0900000004','2026-12-30','09:00','Chờ xác nhận','Chưa thanh toán');
  INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,SoDienThoai,ThoiDiemBatDau,ThoiDiemKetThuc) VALUES
   ('CT00000103','LH00000103','GV00000001','G1','Khách Demo','0900000004','2026-10-28 16:00','2026-10-28 17:00'),
   ('CT00000104','LH00000104','GV00000001','G2','Khách Demo','0900000004','2026-10-29 09:00','2026-10-29 10:00'),
   ('CT00000105','LH00000105','GV00000001','G3','Khách Demo','0900000004','2026-12-30 09:00','2026-12-30 10:00');
  INSERT INTO dbo.DanhGia(MaDanhGia,MaLichHen,MaKhachHang,MaDichVu,SoSao,NoiDungDanhGia) VALUES ('DG00000001','LH00000104','KH00000001','DV00000001',5,'Cũ');`);
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await loginC(page);
  await page.goto(`${origin}/lich-hen-cua-toi`, { waitUntil: 'networkidle' });
  await page.locator('.booking-table tbody tr').first().waitFor();
  const row = (id) => page.locator('.booking-table tbody tr', { hasText: id });
  check('table has the "Đánh giá" column; completed+unreviewed row is enabled, reviewed and not-completed rows are disabled',
    (await page.locator('.booking-table thead th').last().innerText()) === 'Đánh giá'
    && (await row('LH00000103').locator('.review-pill').isEnabled()) && (await row('LH00000104').locator('.review-pill').isDisabled()) && (await row('LH00000105').locator('.review-pill').isDisabled()));
  await page.screenshot({ path: path.join(shots2, 'list.png') });

  await row('LH00000103').locator('.review-pill').click();
  await page.locator('dialog.rvw-dialog[open]').waitFor();
  await page.screenshot({ path: path.join(shots2, 'form-empty.png') });
  const t = await page.locator('dialog.rvw-dialog').innerText();
  check('form: title, service name, code pill, "Mức đánh giá", hint "Chạm vào sao để chọn", comment field', t.includes('Đánh giá dịch vụ') && t.includes('Massage chân') && t.includes('LH00000103') && t.includes('Chạm vào sao để chọn') && t.includes('Nội dung bình luận'));
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await page.locator('[data-testid="review-toast-info"]').waitFor();
  check('Hủy: closes, info toast "Đã hủy thao tác. Không lưu đánh giá."', (await page.locator('[data-testid="review-toast-info"]').innerText()).includes('Không lưu đánh giá') && !(await page.locator('dialog.rvw-dialog').evaluate((d) => d.open)));

  await row('LH00000103').locator('.review-pill').click();
  await page.getByRole('button', { name: /Gửi đánh giá/ }).click();
  await page.locator('[data-testid="review-toast-error"]').waitFor();
  check('no stars: error toast "Vui lòng chọn số sao đánh giá!" + red star row, form stays open', (await page.locator('[data-testid="review-toast-error"]').innerText()).includes('Vui lòng chọn số sao đánh giá!') && (await page.locator('.rvw-stars.is-invalid').count()) === 1 && (await page.locator('dialog.rvw-dialog').evaluate((d) => d.open)));
  await page.screenshot({ path: path.join(shots2, 'form-error.png') });

  await page.getByRole('radio', { name: '4 sao' }).click();
  await page.locator('.rvw-field textarea').fill('Kỹ thuật viên nhẹ nhàng, không gian thơm và yên tĩnh.');
  check('4 stars: label "Tốt", error state cleared', (await page.locator('.rvw-star-label').innerText()) === 'Tốt' && (await page.locator('.rvw-stars.is-invalid').count()) === 0);
  await page.screenshot({ path: path.join(shots2, 'form-filled.png') });

  let fail = true;
  await page.route('**/api/me/bookings/*/review', (route) => (fail ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }) : route.continue()));
  await page.getByRole('button', { name: /Gửi đánh giá/ }).click();
  await page.locator('dialog.rvw-state-dialog[open]').waitFor();
  const st = await page.locator('dialog.rvw-state-dialog').innerText();
  check('API failure: "Gửi đánh giá chưa thành công" / "Không thể gửi đánh giá. Vui lòng thử lại!" with Đóng + Thử lại, nothing saved', st.includes('Gửi đánh giá chưa thành công') && st.includes('Không thể gửi đánh giá. Vui lòng thử lại!') && st.includes('Thử lại') && !st.includes('boom') && Number((await db.query('SELECT count(*)::int c FROM dbo.DanhGia')).rows[0].c) === 1);
  await page.screenshot({ path: path.join(shots2, 'state-failed.png') });
  fail = false;
  await page.getByRole('button', { name: 'Thử lại' }).click();
  await page.locator('[data-testid="review-toast-success"]').waitFor({ timeout: 15000 });
  const saved = (await db.query(`SELECT SoSao s, NoiDungDanhGia n FROM dbo.DanhGia WHERE MaLichHen='LH00000103'`)).rows[0];
  check('Thử lại: saved with 4 stars + comment; success toast "Gửi đánh giá thành công!"; row now disabled', saved?.s === 4 && saved.n.includes('yên tĩnh') && (await page.locator('[data-testid="review-toast-success"]').innerText()).includes('Gửi đánh giá thành công!') && (await row('LH00000103').locator('.review-pill').isDisabled()));
  await page.screenshot({ path: path.join(shots2, 'success.png') });

  await page.unroute('**/api/me/bookings/*/review');
  const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const r = await fetch(`${origin}/api/me/bookings/LH00000103/review`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-spa-request': '1', cookie }, body: JSON.stringify({ rating: 5, comment: '' }) });
  check('server still refuses a second review (409)', r.status === 409);
} catch (e) { check('review run', false, String(e).slice(0, 400)); }
finally { await browser.close(); server.close(); await dbServer.stop(); }
const passed = results.filter(Boolean).length;
console.log(`\nBROWSER (real stack) ${passed}/${results.length} passed${passed === results.length ? '' : `, ${results.length - passed} FAILED`}`);
console.log('Screenshots:', shots2);
process.exit(passed === results.length ? 0 : 1);
