#!/usr/bin/env node
// REAL browser E2E (headless Chromium) for the Tổng quan dashboard,
// against the built frontend served with the REAL API entry (api/index.js) on a real PostgreSQL engine (PGlite). In-memory only.
// Requires `npm run build` first.   node scripts/e2e-local-dashboard-browser.mjs
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
const dbServer = new PGLiteSocketServer({ db, port: 54347, host: '127.0.0.1' });
await dbServer.start();
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: 'postgres://postgres@127.0.0.1:54347/postgres', DB_SSL: 'disable', DB_POOL_MAX: '1',
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


// ---- seed realistic data relative to the Vietnam clock
const vn = (offsetMin = 0, dayOffset = 0) => {
  const d = new Date(Date.now() + offsetMin * 60000 + dayOffset * 86400000);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:00`, ts: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:00` };
};
const t = (o, d = 0) => vn(o, d);
await db.exec(`
  INSERT INTO dbo.DanhMuc VALUES ('DM00000001','Da','Hoạt động');
  INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV00000001','DM00000001','Chăm sóc da cơ bản','Hoạt động');
  INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES ('GV00000001','DV00000001','Gói 60',60,350000);
  INSERT INTO dbo.KhachHang(MaKhachHang,HoTen,SoDienThoai) VALUES ('KH00000003','Võ Thị Seed Một','0911000001'),('KH00000004','Đặng Seed Hai','0911000002'),('KH00000005','Bùi Seed Ba','0911000003'),('KH00000006','Hồ Seed Bốn','0911000004');
  INSERT INTO dbo.LichHen(MaLichHen,MaKhachHang,HoTenNguoiDat,SoDienThoaiNguoiDat,NgayHen,GioHen,TrangThaiLichHen,TrangThaiThanhToan) VALUES
    ('LH00000001','KH00000003','Võ Thị Seed Một','0911000001','${t(-30).date}','${t(-30).time}','Đã đến','Chưa thanh toán'),
    ('LH00000002','KH00000004','Đặng Seed Hai','0911000002','${t(120).date}','${t(120).time}','Chờ xác nhận','Chưa thanh toán'),
    ('LH00000003','KH00000005','Bùi Seed Ba','0911000003','${t(-240).date}','${t(-240).time}','Hoàn thành','Đã thanh toán'),
    ('LH00000004','KH00000006','Hồ Seed Bốn','0911000004','${t(0, 1).date}','10:00:00','Chờ xác nhận','Chưa thanh toán'),
    ('LH00000005','KH00000006','Hồ Seed Bốn','0911000004','${t(-20).date}','${t(-20).time}','Đã hủy','Chưa thanh toán');
  INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet,MaLichHen,MaGoi,MaGiuong,TenKhach,SoDienThoai,ThoiDiemBatDau,ThoiDiemKetThuc) VALUES
    ('CT00000001','LH00000001','GV00000001','G2','Võ Thị Seed Một','0911000001','${t(-30).ts}','${t(30).ts}'),
    ('CT00000002','LH00000002','GV00000001','G4','Đặng Seed Hai','0911000002','${t(120).ts}','${t(180).ts}'),
    ('CT00000003','LH00000003','GV00000001','G5','Bùi Seed Ba','0911000003','${t(-240).ts}','${t(-180).ts}'),
    ('CT00000004','LH00000004','GV00000001','G6','Hồ Seed Bốn','0911000004','${t(0, 1).date} 10:00:00','${t(0, 1).date} 11:00:00'),
    ('CT00000005','LH00000005','GV00000001','G3','Hồ Seed Bốn','0911000004','${t(-20).ts}','${t(40).ts}');
  INSERT INTO dbo.DanhGia(MaDanhGia,MaLichHen,MaKhachHang,MaDichVu,SoSao,NoiDungDanhGia) VALUES
    ('DG00000001','LH00000003','KH00000005','DV00000001',5,'Tốt'),('DG00000002','LH00000001','KH00000003','DV00000001',4,'Ổn'),('DG00000003','LH00000002','KH00000004','DV00000001',3,'Được');
  INSERT INTO dbo.PhanHoi(MaPhanHoi,MaDanhGia,MaNhanVien,NoiDungPhanHoi) VALUES ('PH00000001','DG00000003','NV00000001','Cảm ơn');
  INSERT INTO dbo.NhanVien(MaNhanVien,MaTaiKhoan,HoTen,SoDienThoai,TrangThaiLamViec,TrangThaiHoSo) VALUES ('NV00000004',NULL,'Nghỉ Việc Seed','0900000099','Đã nghỉ việc','Hoạt động');`);

const PNG_ALL = [];
const VIEWPORTS = [[1920, 1080], [1440, 900], [1366, 768], [1024, 768], [390, 844]];
const box = async (l) => l.boundingBox();
const where = (page) => new URL(page.url()).pathname;
async function uiLogin(page, phone) {
  await page.goto(`${origin}/dang-nhap`, { waitUntil: 'networkidle' });
  await page.fill('#phone', phone); await page.fill('#password', PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/dang-nhap'), { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
  await page.waitForLoadState('networkidle').catch(() => undefined);
}
const dash = path.join(os.tmpdir(), 'spa-dash-shots'); mkdirSync(dash, { recursive: true });
try {
  // ---------------- OWNER: content, data, geometry per viewport
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); page.on('pageerror', (e) => pageErrors.push(e.message));
  await uiLogin(page, '0900000001');
  await page.goto(`${origin}/admin/tong-quan`, { waitUntil: 'networkidle' });
  await page.locator('.dash-grid').waitFor();
  await page.waitForFunction(() => !document.querySelector('.dash-note')?.textContent?.includes('Đang tải'), null, { timeout: 15000 });
  const text = await page.locator('.dash-grid').innerText();
  const pageText = await page.locator('.admin-content').innerText();
  check('Dashboard shows the 5 cards with the required titles', ['Lịch hẹn hôm nay', 'Tình trạng giường', 'Công việc cần xử lý', 'Nhân viên đang làm việc', 'Hoạt động gần đây'].every((x) => text.includes(x)));
  check('Today table: columns Giờ / Khách hàng / Dịch vụ / Giường / Trạng thái', ['Giờ', 'Khách hàng', 'Dịch vụ', 'Giường', 'Trạng thái'].every((h) => text.includes(h)));
  check('Today table shows REAL bookings from the API (seeded names, beds, status badges), and tomorrow\'s booking is not listed', text.includes('Võ Thị Seed Một') && text.includes('G2') && text.includes('Đặng Seed Hai') && text.includes('Đã đến') && !text.includes('Hồ Seed Bốn Mai') && (await page.locator('.dash-table tbody tr').count()) === 4, text.slice(0, 400));
  const bedNums = await page.locator('.dash-bed strong').allInnerTexts();
  check('Beds card is computed from real data: 1 in use now (the Đã đến booking), 14 free, 15 total (cancelled/completed/future do not count)', bedNums.join(',') === '1,14,15', bedNums.join(','));
  const tasks = await page.locator('.dash-task').allInnerTexts();
  check('Tasks: 2 pending bookings (today + tomorrow, all dates) and 2 unanswered reviews', tasks.length === 2 && /Lịch hẹn chờ xác nhận[\s\S]*2/.test(tasks[0]) && /Đánh giá chưa phản hồi[\s\S]*2/.test(tasks[1]), JSON.stringify(tasks));
  const staff = await page.locator('.dash-staff li strong').allInnerTexts();
  check('Staff card lists only employees whose work status is "Đang làm việc" (not the one marked as left), no hard-coded sample names', staff.length === 3 && !staff.includes('Nghỉ Việc Seed') && !/\b(Lan|Hương|Mai|Linh|Trang)\b/.test(await page.locator('.dash-staff').innerText()), JSON.stringify(staff));
  check('Recent activity card is full width and honest (no invented history)', (await page.locator('.dash-card-wide').count()) === 1 && text.includes('chưa có nhật ký hoạt động'));
  check('Removed: welcome banner, "Tổng quan vận hành" title, summary bar, date picker and big shortcut buttons', !/Xin chào|Chào mừng|Tổng quan vận hành|Giờ hoạt động|15 giường/.test(pageText) && (await page.locator('.calendar-date-picker, .overview-card, .overview-grid, .admin-panel-card').count()) === 0);

  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const cards = await page.locator('.dash-card').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }));
    let ok = true; let detail = '';
    if (w >= 1200) {
      const [a, b, c, d, e] = cards;
      ok = Math.abs(a.w - b.w) <= 1 && Math.abs(c.w - d.w) <= 1 && a.x === c.x && b.x === d.x && Math.abs(a.y - b.y) <= 1 && Math.abs(c.y - d.y) <= 1 && Math.abs(a.h - b.h) <= 1 && Math.abs(c.h - d.h) <= 1 && e.x === a.x && Math.abs((e.x + e.w) - (b.x + b.w)) <= 1 && e.y > c.y + c.h - 1 && Math.abs(a.x + a.w + 20 - b.x) <= 30;
      detail = JSON.stringify(cards);
    } else {
      ok = cards.every((c) => c.x === cards[0].x && c.w === cards[0].w);
      detail = JSON.stringify(cards.map((c) => c.w));
    }
    check(`${w}x${h}: ${w >= 1200 ? '2x2 grid is balanced (equal widths/heights per row, aligned edges) and the activity card spans both columns' : 'single column, every card the same width'}; no horizontal page scroll (overflow ${overflow})`, ok && overflow <= 1, detail);
    await page.screenshot({ path: path.join(dash, `dashboard-${w}x${h}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // ---------------- Sidebar / Header identical to another admin page
  const grab = async (p) => {
    await p.waitForTimeout(300);
    const sb = await p.locator('.desktop-sidebar').boundingBox(); const hd = await p.locator('.admin-header').boundingBox();
    const hdHtml = await p.locator('.admin-header').evaluate((e) => e.outerHTML.replace(/_r_[0-9a-z]+_/g, 'ID'));
    const sbItems = await p.locator('.desktop-sidebar nav button').allInnerTexts();
    const bg = await p.evaluate(() => getComputedStyle(document.querySelector('.admin-shell')).backgroundImage);
    return { sb, hd, hdHtml, sbItems, bg };
  };
  const onDash = await grab(page);
  await page.goto(`${origin}/admin/khach-hang`, { waitUntil: 'networkidle' });
  const onOther = await grab(page);
  check('Sidebar (box + menu items) and Header (box + markup) are identical to another admin page; shared background unchanged', JSON.stringify(onDash.sb) === JSON.stringify(onOther.sb) && JSON.stringify(onDash.hd) === JSON.stringify(onOther.hd) && onDash.hdHtml === onOther.hdHtml && onDash.sbItems.join('|') === onOther.sbItems.join('|') && onDash.bg === onOther.bg, JSON.stringify({ a: onDash.sb, b: onOther.sb }));

  // ---------------- navigation
  await page.goto(`${origin}/admin/tong-quan`, { waitUntil: 'networkidle' }); await page.locator('.dash-table').waitFor();
  await page.locator('.dash-card', { hasText: 'Lịch hẹn hôm nay' }).locator('.dash-link').click(); await page.waitForURL(/\/admin\/lich-hen/); await page.locator('.calendar-date-picker').first().waitFor({ timeout: 15000 });
  check('"Xem tất cả" (appointments) goes to Quản lý lịch hẹn, whose date picker is still there', where(page) === '/admin/lich-hen' && (await page.locator('.calendar-date-picker').count()) >= 1);
  await page.goto(`${origin}/admin/tong-quan`, { waitUntil: 'networkidle' }); await page.locator('.dash-task').first().waitFor();
  await page.locator('.dash-task', { hasText: 'Lịch hẹn chờ xác nhận' }).click(); await page.waitForURL(/\/admin\/lich-hen/);
  const t1 = where(page);
  await page.goto(`${origin}/admin/tong-quan`, { waitUntil: 'networkidle' }); await page.locator('.dash-task').first().waitFor();
  await page.locator('.dash-task', { hasText: 'Đánh giá chưa phản hồi' }).click(); await page.waitForURL(/\/admin\/danh-gia/);
  const t2 = where(page);
  await page.goto(`${origin}/admin/tong-quan`, { waitUntil: 'networkidle' }); await page.locator('.dash-staff').waitFor();
  await page.locator('.dash-card', { hasText: 'Nhân viên đang làm việc' }).locator('.dash-link').click(); await page.waitForURL(/\/admin\/nhan-vien/);
  check('Task rows and the staff "Xem tất cả" navigate to lịch hẹn / đánh giá / nhân viên', t1 === '/admin/lich-hen' && t2 === '/admin/danh-gia' && where(page) === '/admin/nhan-vien', `${t1} ${t2} ${where(page)}`);

  // ---------------- permissions (manager without Q05, staff with Q01+Q02 only)
  for (const [phone, label, expect] of [['0900000002', 'Quản lý (no Q05)', { staffNote: true, tasks: 2 }], ['0900000003', 'Nhân viên (Q01, Q02)', { staffNote: true, tasks: 1 }]]) {
    const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p2 = await c2.newPage(); p2.on('pageerror', (e) => pageErrors.push(e.message));
    await uiLogin(p2, phone);
    await p2.goto(`${origin}/admin/tong-quan`, { waitUntil: 'networkidle' }); await p2.locator('.dash-grid').waitFor(); await p2.waitForTimeout(800);
    const txt = await p2.locator('.dash-grid').innerText();
    const calls = [];
    check(`${label}: cards the account may not read show a permission note instead of data; allowed ones still load (${expect.tasks} task row(s))`, txt.includes('Bạn không có quyền xem danh sách nhân viên') && (await p2.locator('.dash-task').count()) === expect.tasks && txt.includes('Võ Thị Seed Một'), txt.slice(0, 300));
    await c2.close();
  }

  // ---------------- customer cannot open it
  { const c3 = await browser.newContext(); const p3 = await c3.newPage(); await uiLogin(p3, '0900000004'); await p3.goto(`${origin}/admin/tong-quan`, { waitUntil: 'networkidle' });
    check('Customer cannot open the dashboard (redirected to the customer area)', where(p3) === '/lich-hen-cua-toi', where(p3)); await c3.close(); }

  // ---------------- empty state: wipe bookings
  await db.exec('DELETE FROM dbo.KhachSuDungDichVu; DELETE FROM dbo.PhanHoi; DELETE FROM dbo.DanhGia; DELETE FROM dbo.LichHen;');
  await page.goto(`${origin}/admin/tong-quan`, { waitUntil: 'networkidle' }); await page.locator('.dash-grid').waitFor(); await page.waitForTimeout(800);
  const empty = await page.locator('.dash-grid').innerText();
  check('Empty data: "Hôm nay chưa có lịch hẹn.", 0 beds in use, task counts 0 — no fake rows', empty.includes('Hôm nay chưa có lịch hẹn') && (await page.locator('.dash-bed strong').allInnerTexts()).join(',') === '0,15,15' && (await page.locator('.dash-count').allInnerTexts()).join(',') === '0,0', empty.slice(0, 200));
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('browser run completed without an exception', false, String(e?.stack ?? e).slice(0, 900));
} finally {
  await browser.close(); server.close(); await dbServer.stop();
}
const failed = results.filter((x) => !x).length;
console.log(`\nBROWSER (real stack) ${results.length - failed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}\nScreenshots: ${dash}`);
process.exit(failed ? 1 : 0);
