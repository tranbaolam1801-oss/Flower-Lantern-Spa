#!/usr/bin/env node
// REAL browser E2E (headless Chromium) for UC_8 Quản lý nhân viên (list, detail, add/update, permissions, lock/unlock),
// against the built frontend served with the REAL API entry (api/index.js) on a real PostgreSQL engine (PGlite). In-memory only.
// Requires `npm run build` first.   node scripts/e2e-local-employees-browser.mjs
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
const dbServer = new PGLiteSocketServer({ db, port: 54351, host: '127.0.0.1' });
await dbServer.start();
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgres://postgres@127.0.0.1:54351/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
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


const pageErrs = [];
const empShots = path.join(os.tmpdir(), 'spa-uc8-shots'); mkdirSync(empShots, { recursive: true });
await db.exec(`
  INSERT INTO dbo.TaiKhoan VALUES ('TK00000005','hanhi','0912345001','x','Nhân viên','Hoạt động'),('TK00000006','ktv03','0912345002','x','Nhân viên','Đã khóa'),('TK00000007','disabled1','0912345003','x','Nhân viên','Vô hiệu hóa');
  INSERT INTO dbo.NhanVien(MaNhanVien,MaTaiKhoan,HoTen,SoDienThoai,Email,GioiTinh,NgaySinh,DiaChi,GhiChu,TrangThaiLamViec,TrangThaiHoSo) VALUES
    ('NV00000004','TK00000005','Trần Hà Nhi','0912345001','hanhi@example.com','Nữ','2000-08-15','28 Nguyễn Văn Trỗi','Kỹ thuật viên chăm sóc da','Đang làm việc','Hoạt động'),
    ('NV00000005','TK00000006','Nguyễn Hà Linh','0912345002','linh@example.com',NULL,NULL,NULL,NULL,'Đang làm việc','Hoạt động'),
    ('NV00000006','TK00000007','Đã Vô Hiệu','0912345003','dis@example.com',NULL,NULL,NULL,NULL,'Ngừng làm việc','Vô hiệu hóa');
  INSERT INTO dbo.TaiKhoanQuyen VALUES ('TK00000005','Q01'),('TK00000005','Q02');`);
const E = (n) => n; // eslint-friendly alias
const where4 = (page) => new URL(page.url()).pathname;
async function login4(page, phone) {
  await page.goto(`${origin}/dang-nhap`, { waitUntil: 'networkidle' });
  await page.fill('#phone', phone); await page.fill('#password', PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/dang-nhap'), { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
const toastEl = (page, kind) => page.locator(`[data-testid="notice-toast-${kind}"]`);
const rowOf = (page, id) => page.locator('.admin-service-table, .customer-search-table').first().locator('tbody tr', { hasText: id });
const noRaw4 = async (page) => !/Failed to fetch|NetworkError|Load failed|Internal server error/i.test(await page.locator('body').innerText());
const acct = async (id) => (await db.query('SELECT TrangThai t, VaiTro r FROM dbo.TaiKhoan WHERE MaTaiKhoan=$1', [id])).rows[0];

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); page.on('pageerror', (e) => pageErrs.push(e.message));
  const writes = []; page.on('request', (r) => { if (/\/api\/employees/.test(r.url()) && r.method() !== 'GET') writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await login4(page, '0900000001');
  await page.goto(`${origin}/admin/nhan-vien`, { waitUntil: 'networkidle' });
  await page.locator('.customer-search-table tbody tr').first().waitFor({ timeout: 15000 });

  // ---------- list: lock/unlock buttons only where they can work
  const hanhi = rowOf(page, 'NV00000004'); const ktv = rowOf(page, 'NV00000005'); const dis = rowOf(page, 'NV00000006');
  check('List: "Khóa" on an active account, "Mở khóa" on a locked one, and NO lock/unlock button on a disabled account (was the unusable "Mở khóa")', (await hanhi.getByRole('button', { name: 'Khóa', exact: true }).count()) === 1 && (await ktv.getByRole('button', { name: 'Mở khóa' }).count()) === 1 && (await dis.getByRole('button', { name: /khóa/i }).count()) === 0, '');

  // ---------- detail (doc p.4 / Figma 5:7224)
  await hanhi.locator('.figma-icon-view').click();
  const drawer = page.locator('dialog.spa-drawer-right[open]'); await drawer.locator('.emp-identity-card').waitFor();
  const nameBox = await drawer.locator('.emp-identity-card > strong').boundingBox(); const stBox = await drawer.locator('.emp-identity-card .pill-status').boundingBox();
  const dtext = await drawer.innerText();
  check('Detail: the work status chip sits UNDER the employee name and reads "Đang hoạt động" (not "Đang làm việc")', stBox.y > nameBox.y + nameBox.height - 2 && Math.abs(stBox.x - nameBox.x) < 30 && /Đang hoạt động/.test(await drawer.locator('.emp-identity-card .pill-status').innerText()) && !/Đang làm việc/.test(dtext), JSON.stringify({ nameBox, stBox }));
  check('Detail: real data from the backend (code, username, phone, email, gender, birth date, address, note) and an X + "Đóng" that close it', ['NV00000004', 'hanhi', '0912345001', 'hanhi@example.com', 'Nữ', '15/08/2000', '28 Nguyễn Văn Trỗi', 'Kỹ thuật viên chăm sóc da'].every((x) => dtext.includes(x)) && (await drawer.getByRole('button', { name: 'Đóng', exact: true }).count()) >= 1);
  await page.screenshot({ path: path.join(empShots, 'detail.png') });
  await drawer.locator('.spa-modal-close').click();
  check('Detail X closes the drawer', (await page.locator('dialog.spa-drawer-right[open]').count()) === 0);

  // ---------- add: banner right under the title (doc p.5 / Figma 5:7905)
  await page.getByRole('button', { name: '+ Thêm mới' }).click();
  const form = page.locator('dialog[aria-labelledby="emp-form-title"]'); await form.waitFor();
  await form.getByRole('button', { name: 'Lưu' }).click();
  const banner = form.locator('[data-testid="emp-form-banner"]'); await banner.waitFor();
  const hb = await form.locator('.spa-modal-header').boundingBox(); const bb = await banner.boundingBox(); const fb = await form.locator('.spa-field').first().boundingBox();
  check('Add, missing data: the banner "Vui lòng nhập đầy đủ các thông tin bắt buộc!" is at the TOP (directly under "Thêm nhân viên mới", above all fields), not at the bottom', (await banner.innerText()).includes('Vui lòng nhập đầy đủ các thông tin bắt buộc!') && bb.y >= hb.y + hb.height - 2 && bb.y + bb.height <= fb.y + 2, JSON.stringify({ hb, bb, fb }));
  const fieldMsgs = await form.locator('.spa-field-error-text').allInnerTexts();
  check('Add, missing data: field messages under each empty field and nothing was saved', fieldMsgs.length === 6 && fieldMsgs.includes('Vui lòng nhập tên đăng nhập.') && fieldMsgs.includes('Vui lòng nhập số điện thoại.') && writes.length === 0, JSON.stringify(fieldMsgs));
  await page.screenshot({ path: path.join(empShots, 'add-missing.png') });
  await form.getByRole('button', { name: 'Hủy' }).click();

  // ---------- update (doc p.5-6 / Figma 5:8562, 5:8882)
  await hanhi.locator('.figma-icon-edit').click(); await form.waitFor();
  const labels = await form.locator('.spa-field > span:first-child').allInnerTexts();
  const order = labels.map((l) => l.replace(/\s*\*/, '').trim()).filter((l) => ['Mã nhân viên', 'Tên đăng nhập', 'Họ tên', 'Số điện thoại', 'Email', 'Trạng thái', 'Giới tính', 'Ngày sinh', 'Địa chỉ', 'Ghi chú'].includes(l));
  check('Update form field order follows Figma: Mã NV | Tên đăng nhập, Họ tên | Số điện thoại, Email | Trạng thái, Giới tính | Ngày sinh, Địa chỉ, Ghi chú', order.join(',') === 'Mã nhân viên,Tên đăng nhập,Họ tên,Số điện thoại,Email,Trạng thái,Giới tính,Ngày sinh,Địa chỉ,Ghi chú', order.join(','));
  const pBox = await form.locator('[data-fieldname], input').nth(0).boundingBox();
  const phoneIn = form.locator('label', { hasText: 'Số điện thoại' }).locator('input'); const nameIn = form.locator('label', { hasText: 'Họ tên' }).locator('input');
  const pb = await phoneIn.boundingBox(); const nb = await nameIn.boundingBox();
  check('Update: "Số điện thoại" is on the same row as "Họ tên" (to its right)', Math.abs(pb.y - nb.y) < 4 && pb.x > nb.x + nb.width - 4);
  await phoneIn.fill('1234567890'); await form.getByRole('button', { name: 'Cập nhật' }).click();
  check('Update, invalid phone: "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0." under the field, nothing saved', (await form.locator('.spa-field-error-text').first().innerText()) === 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.' && writes.length === 0);
  await phoneIn.fill('0912345002');
  await form.getByRole('button', { name: 'Cập nhật' }).click();
  await form.locator('[data-testid="emp-form-banner"]').waitFor();
  const bn = await form.locator('[data-testid="emp-form-banner"]').innerText(); const msgPhone = await form.locator('.spa-field-error-text').first().innerText();
  const idBox = await form.locator('.emp-identity-card').boundingBox(); const bBox = await form.locator('[data-testid="emp-form-banner"]').boundingBox();
  check('Update, duplicate phone: banner under the employee name card "Thông tin đã tồn tại trong hệ thống!" + "…trùng với nhân viên NV00000005…", field text "Số điện thoại đã được sử dụng bởi nhân viên NV00000005." (Figma wording)', bn.includes('Thông tin đã tồn tại trong hệ thống!') && bn.includes('NV00000005') && msgPhone === 'Số điện thoại đã được sử dụng bởi nhân viên NV00000005.' && bBox.y >= idBox.y + idBox.height - 2, `${bn} | ${msgPhone}`);
  check('Update, duplicate: the banner X closes it without losing the typed data', await (async () => { await form.getByRole('button', { name: 'Đóng thông báo' }).click(); return (await form.locator('[data-testid="emp-form-banner"]').count()) === 0 && (await phoneIn.inputValue()) === '0912345002'; })());
  await page.screenshot({ path: path.join(empShots, 'update-duplicate.png') });
  await form.getByRole('button', { name: 'Hủy' }).click();
  check('Nothing changed in SQL after the failed updates', (await db.query("SELECT SoDienThoai p FROM dbo.NhanVien WHERE MaNhanVien='NV00000004'")).rows[0].p.trim() === '0912345001');

  // ---------- permissions (doc p.7-9 / Figma 6:13745, 6:13858, 6:13971, 6:14082, 8a)
  writes.length = 0;
  await hanhi.getByRole('button', { name: 'Phân quyền' }).click();
  const perm = page.locator('dialog.emp-perm-dialog[aria-labelledby="emp-perm-title"]'); await perm.waitFor();
  const cancelB = await perm.getByRole('button', { name: 'Hủy', exact: true }).boundingBox(); const saveB = await perm.getByRole('button', { name: 'Lưu phân quyền' }).boundingBox(); const dlgB = await perm.boundingBox();
  check('Permission form: "Hủy" is at the LEFT and "Lưu phân quyền" at the RIGHT of the footer (Figma), dialog ~820px, header with X', Math.abs(cancelB.x - (dlgB.x + 32)) <= 6 && Math.abs(saveB.x + saveB.width - (dlgB.x + dlgB.width - 32)) <= 6 && Math.abs(dlgB.width - 820) <= 8 && (await perm.getByRole('button', { name: 'Đóng' }).count()) === 1, JSON.stringify({ cancelB, saveB, dlgB }));
  await page.screenshot({ path: path.join(empShots, 'perm-form.png') });
  await perm.locator('label', { hasText: 'Báo cáo thống kê' }).locator('input').check();
  await perm.getByRole('button', { name: 'Hủy', exact: true }).click();
  await toastEl(page, 'info').waitFor();
  const it = await toastEl(page, 'info').innerText();
  check('Cancel permission: blue info toast "Đã hủy thao tác / Đã hủy thao tác. Không lưu thay đổi." with an X; nothing sent or saved', it.includes('Đã hủy thao tác') && it.includes('Không lưu thay đổi') && (await toastEl(page, 'info').getByRole('button', { name: 'Đóng thông báo' }).count()) === 1 && writes.length === 0);
  const tb4 = await toastEl(page, 'info').boundingBox();
  check('Toast geometry (Figma 6:14082): top-right, ~510px wide, top ≈106px', Math.abs(tb4.x + tb4.width - 1416) <= 12 && Math.abs(tb4.y - 106) <= 12 && Math.abs(tb4.width - 510) <= 12, JSON.stringify(tb4));
  await page.screenshot({ path: path.join(empShots, 'perm-cancel-toast.png') });
  await toastEl(page, 'info').getByRole('button', { name: 'Đóng thông báo' }).click();
  check('The info toast X closes it', (await toastEl(page, 'info').count()) === 0);
  await hanhi.getByRole('button', { name: 'Phân quyền' }).click(); await perm.waitFor();
  await perm.locator('label', { hasText: 'Quản lý đánh giá' }).locator('input').check().catch(() => undefined);
  await perm.getByRole('button', { name: 'Lưu phân quyền' }).click();
  const conf = page.locator('dialog.emp-confirm-dialog[aria-labelledby="emp-perm-confirm-title"]'); await conf.waitFor();
  const qB = await conf.getByRole('button', { name: 'Quay lại' }).boundingBox(); const xB = await conf.getByRole('button', { name: 'Xác nhận lưu' }).boundingBox(); const cB = await conf.boundingBox();
  check('Confirm dialog (Figma 6:13858): pink alert-circle icon + title, "Quay lại" LEFT and "Xác nhận lưu" RIGHT, 660px wide', (await conf.locator('.emp-confirm-icon img').getAttribute('src')) === '/assets/uc8-alert-circle.svg' && Math.abs(qB.x - (cB.x + 32)) <= 6 && Math.abs(xB.x + xB.width - (cB.x + cB.width - 32)) <= 6 && Math.abs(cB.width - 660) <= 6 && Math.abs(xB.width - 212) <= 4 && Math.abs(qB.width - 125) <= 4 && /Quyền sau khi lưu/.test(await conf.innerText()), JSON.stringify({ qB, xB, cB }));
  await page.screenshot({ path: path.join(empShots, 'perm-confirm.png') });
  // error: network down -> toast with Thử lại + X, no raw text
  let down = true;
  await page.route(/\/api\/employees\/NV00000004\/permissions/, (route) => (down ? route.abort('failed') : route.continue()));
  await conf.getByRole('button', { name: 'Xác nhận lưu' }).click();
  await toastEl(page, 'error').waitFor();
  const et = await toastEl(page, 'error').innerText();
  check('Permission save fails (network): error toast "Không thể thực hiện" with "Thử lại" and X — no "Failed to fetch" anywhere', et.includes('Không thể thực hiện') && et.includes('Vui lòng thử lại') && (await toastEl(page, 'error').getByRole('button', { name: 'Thử lại' }).count()) === 1 && (await toastEl(page, 'error').getByRole('button', { name: 'Đóng thông báo' }).count()) === 1 && (await noRaw4(page)));
  await page.screenshot({ path: path.join(empShots, 'perm-error.png') });
  check('Permission failure left SQL untouched', (await db.query("SELECT count(*)::int n FROM dbo.TaiKhoanQuyen WHERE MaTaiKhoan='TK00000005'")).rows[0].n === 2);
  down = false;
  await toastEl(page, 'error').getByRole('button', { name: 'Thử lại' }).click();
  await toastEl(page, 'success').waitFor({ timeout: 10000 });
  const st4 = await toastEl(page, 'success').innerText();
  check('"Thử lại" really re-sends the save: success toast "Thành công / Phân quyền nhân viên thành công!" with an X; SQL now holds the new permissions', st4.includes('Thành công') && st4.includes('Phân quyền nhân viên thành công!') && (await toastEl(page, 'success').getByRole('button', { name: 'Đóng thông báo' }).count()) === 1 && writes.filter((w) => w.includes('permissions')).length === 2, writes.join());
  await page.screenshot({ path: path.join(empShots, 'perm-success.png') });
  await toastEl(page, 'success').getByRole('button', { name: 'Đóng thông báo' }).click();
  await page.unroute(/\/api\/employees\/NV00000004\/permissions/);

  // ---------- lock / unlock (doc p.5, 10 / Figma 5:24733, 5:24613, 5:25451)
  writes.length = 0;
  await ktv.getByRole('button', { name: 'Mở khóa' }).click();
  const lock = page.locator('dialog.emp-lock-dialog'); await lock.waitFor();
  const lt = await lock.innerText();
  check('Unlock dialog (Figma 5:24613): "Xác nhận mở khóa tài khoản", NV00000005 · name · username · phone, "Đã khóa → Hoạt động", Hủy + Xác nhận on the right', lt.includes('Xác nhận mở khóa tài khoản') && lt.includes('NV00000005 · Nguyễn Hà Linh · ktv03 · 0912345002') && /Đã khóa[\s\S]*Hoạt động/.test(lt) && (await lock.locator('.emp-confirm-icon img').getAttribute('src')) === '/assets/uc8-alert-circle.svg');
  const lb = await lock.boundingBox(); const hb2 = await lock.getByRole('button', { name: 'Hủy' }).boundingBox(); const xb2 = await lock.getByRole('button', { name: 'Xác nhận' }).boundingBox();
  check('Unlock dialog buttons: right-aligned Hủy (125px) then Xác nhận (212px), 776px wide', Math.abs(lb.width - 776) <= 8 && xb2.x > hb2.x && Math.abs(xb2.x + xb2.width - (lb.x + lb.width - 32)) <= 6 && Math.abs(xb2.width - 212) <= 4, JSON.stringify({ lb, hb2, xb2 }));
  await page.screenshot({ path: path.join(empShots, 'unlock-dialog.png') });
  await lock.getByRole('button', { name: 'Hủy' }).click();
  await toastEl(page, 'info').waitFor(); await toastEl(page, 'info').getByRole('button', { name: 'Đóng thông báo' }).click();
  check('Unlock cancelled: info toast, account still locked, no request', (await acct('TK00000006')).t === 'Đã khóa' && writes.length === 0);
  await ktv.getByRole('button', { name: 'Mở khóa' }).click(); await lock.waitFor();
  await lock.getByRole('button', { name: 'Xác nhận' }).click();
  await toastEl(page, 'success').waitFor({ timeout: 10000 });
  await ktv.getByRole('button', { name: 'Khóa', exact: true }).waitFor({ timeout: 10000 });
  check('OWNER can UNLOCK a locked account: API 200, SQL status "Hoạt động", success toast "Mở khóa tài khoản thành công!", row now shows "Khóa"', (await acct('TK00000006')).t === 'Hoạt động' && (await toastEl(page, 'success').innerText()).includes('Mở khóa tài khoản thành công!') && (await ktv.getByRole('button', { name: 'Khóa', exact: true }).count()) === 1, writes.join());
  await toastEl(page, 'success').getByRole('button', { name: 'Đóng thông báo' }).click();
  await hanhi.getByRole('button', { name: 'Khóa', exact: true }).click(); await lock.waitFor();
  check('Lock dialog says "Xác nhận khóa tài khoản" and "Hoạt động → Đã khóa"', (await lock.innerText()).includes('Xác nhận khóa tài khoản') && /Hoạt động[\s\S]*Đã khóa/.test(await lock.innerText()));
  await page.route(/\/api\/employees\/NV00000004\/account-status/, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Internal server error"}' }));
  await lock.getByRole('button', { name: 'Xác nhận' }).click();
  await toastEl(page, 'error').waitFor();
  const lt2 = await toastEl(page, 'error').innerText();
  check('Lock fails (500): error toast "Không thể cập nhật trạng thái tài khoản. Vui lòng thử lại!" + Thử lại + X, no raw text, SQL unchanged', lt2.includes('Không thể cập nhật trạng thái tài khoản. Vui lòng thử lại!') && (await toastEl(page, 'error').getByRole('button', { name: 'Thử lại' }).count()) === 1 && (await noRaw4(page)) && (await acct('TK00000005')).t === 'Hoạt động');
  await page.screenshot({ path: path.join(empShots, 'lock-error.png') });
  await page.unroute(/\/api\/employees\/NV00000004\/account-status/);
  await toastEl(page, 'error').getByRole('button', { name: 'Thử lại' }).click();
  await toastEl(page, 'success').waitFor({ timeout: 10000 });
  check('Lock "Thử lại" works: account locked, success toast "Khóa tài khoản thành công!"', (await acct('TK00000005')).t === 'Đã khóa' && (await toastEl(page, 'success').innerText()).includes('Khóa tài khoản thành công!'));
  await toastEl(page, 'success').getByRole('button', { name: 'Đóng thông báo' }).click();
  // 4b: not permitted (403) -> no retry
  await ktv.getByRole('button', { name: 'Khóa', exact: true }).click(); await lock.waitFor();
  await page.route(/\/api\/employees\/NV00000005\/account-status/, (route) => route.fulfill({ status: 409, contentType: 'application/json', body: '{"message":"Tài khoản đã bị vô hiệu hóa!"}' }));
  await lock.getByRole('button', { name: 'Xác nhận' }).click(); await toastEl(page, 'error').waitFor();
  check('Lock refused by the business rule (409): "Không thể thay đổi trạng thái tài khoản này!" with an X and NO "Thử lại"', (await toastEl(page, 'error').innerText()).includes('Không thể thay đổi trạng thái tài khoản này!') && (await toastEl(page, 'error').getByRole('button', { name: 'Thử lại' }).count()) === 0 && (await toastEl(page, 'error').getByRole('button', { name: 'Đóng thông báo' }).count()) === 1);
  await page.unroute(/\/api\/employees\/NV00000005\/account-status/);
  await toastEl(page, 'error').getByRole('button', { name: 'Đóng thông báo' }).click();
  await ctx.close();

  // ---------- RBAC
  const mctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const mp = await mctx.newPage();
  await login4(mp, '0900000002'); await mp.goto(`${origin}/admin/nhan-vien`, { waitUntil: 'networkidle' });
  check('RBAC: a Quản lý without Q05 cannot open the employee screen (403 message) and the API refuses permission/lock calls', (await mp.locator('body').innerText()).includes('Bạn không có quyền quản lý nhân viên.'));
  const mc = (await mctx.cookies(origin)).map((c) => `${c.name}=${c.value}`).join('; ');
  const api4 = async (m, u, b) => (await fetch(`${origin}${u}`, { method: m, headers: { 'content-type': 'application/json', 'x-spa-request': '1', cookie: mc }, body: b ? JSON.stringify(b) : undefined })).status;
  check('RBAC: manager PUT permissions / PATCH account-status -> 403', (await api4('PUT', '/api/employees/NV00000004/permissions', { role: 'Quản lý', permissions: ['Q01'] })) === 403 && (await api4('PATCH', '/api/employees/NV00000004/account-status', { status: 'Hoạt động' })) === 403);
  const oc = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-spa-request': '1' }, body: JSON.stringify({ phone: '0900000001', password: PW }) });
  const ock = (oc.headers.get('set-cookie') ?? '').split(';')[0];
  const selfLock = await fetch(`${origin}/api/employees/NV00000001/account-status`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-spa-request': '1', cookie: ock }, body: JSON.stringify({ status: 'Đã khóa' }) });
  check('The OWNER account cannot be locked (not even by the owner): 403 and still active', selfLock.status === 403 && (await acct('TK00000001')).t === 'Hoạt động');
  await mctx.close();

  // ---------- responsive
  for (const [w, h] of [[1024, 768], [390, 844]]) {
    const c = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 700, isMobile: w < 700 }); const p = await c.newPage(); p.on('pageerror', (e) => pageErrs.push(e.message));
    await login4(p, '0900000001'); await p.goto(`${origin}/admin/nhan-vien`, { waitUntil: 'networkidle' }); await p.locator('.customer-search-table tbody tr').first().waitFor();
    const row = p.locator('.customer-search-table tbody tr', { hasText: 'NV00000004' });
    await row.getByRole('button', { name: 'Phân quyền' }).click();
    const d = p.locator('dialog.emp-perm-dialog[open]'); await d.waitFor();
    const db3 = await d.boundingBox(); const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${w}x${h}: permission dialog fits the viewport (no overflow), buttons reachable`, db3.x >= 0 && db3.x + db3.width <= w + 1 && ov <= 1 && (await d.getByRole('button', { name: 'Lưu phân quyền' }).isVisible()), JSON.stringify(db3));
    if (w === 390) await p.screenshot({ path: path.join(empShots, 'mobile-perm.png') });
    await c.close();
  }
  check('no uncaught page errors', pageErrs.length === 0, pageErrs.slice(0, 3).join(' | '));
} catch (e) {
  check('browser run completed without an exception', false, String(e?.stack ?? e).slice(0, 1200));
} finally {
  await browser.close(); server.close(); await dbServer.stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\nBROWSER (real stack) ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}\nScreenshots: ${empShots}`);
process.exit(failed ? 1 : 0);
