// AZURE DEMO COPY of database/seeds/PROPOSED-011-test-accounts.mjs. Changes: ALLOWED_DB -> FlowerLanternSpaDemo, connect timeout 60s (serverless resume). NOT EXECUTED.
// PROPOSED / NOT APPLIED. TEST-ONLY. NOT executed and NOT parse-checked by the assistant (static review only).
//
// Seeds one account per role (Chủ Spa, Quản lý, Nhân viên, Khách hàng) with matching NhanVien/KhachHang profile rows,
// the six permissions Q01..Q06 (if missing) and the TaiKhoanQuyen assignments, into FlowerLanternSpa_Test ONLY.
//
// Safety model
//   * DEFAULT = DRY-RUN: prints the SQL it WOULD run (hashes redacted) and the account list. Opens NO database connection.
//   * Writes only when ALL are true: argument --apply, env ALLOW_TEST_SEED=yes, env DB_NAME=FlowerLanternSpa_Test,
//     and the connected database name (DB_NAME()) is again checked inside the transaction.
//   * Passwords are read ONLY from env (never from this file, never printed, never logged). Hashed with the project's Argon2id
//     parameters (backend/src/auth/password.service.ts: argon2id, memoryCost 65536, timeCost 3, parallelism 4).
//   * Idempotent: an account whose phone (TaiKhoan.SoDienThoai) OR username already exists is SKIPPED entirely
//     (nothing is updated, no password is overwritten). Quyen rows are inserted only if the MaQuyen is missing.
//   * One transaction (XACT_ABORT ON); any error rolls everything back.
//
// Env vars (names follow backend/src/config.ts for the connection)
//   DB_HOST, DB_PORT (default 1433), DB_NAME (must be FlowerLanternSpa_Test), DB_USER, DB_PASSWORD   -> SQL authentication (tedious)
//   ALLOW_TEST_SEED=yes
//   SEED_PASSWORD_OWNER, SEED_PASSWORD_MANAGER, SEED_PASSWORD_STAFF, SEED_PASSWORD_CUSTOMER   (each >= 12 chars, all required for --apply)
//   DB_USER may be the login from database/setup/001-test-sql-login.MANUAL.sql (role spa_test_app has SELECT/INSERT/UPDATE/DELETE on dbo,
//   which is sufficient: this script only runs SELECT and INSERT). That login must already exist; this script never creates logins.
//
// Usage (PowerShell example; passwords are placeholders you type yourself, never commit them):
//   node database/seeds/PROPOSED-011-test-accounts.mjs                    # dry-run
//   $env:ALLOW_TEST_SEED='yes'; $env:DB_NAME='FlowerLanternSpa_Test'; ...; node database/seeds/PROPOSED-011-test-accounts.mjs --apply
//
// Existing-data impact: Test currently has 0 rows in TaiKhoan/NhanVien/KhachHang/Quyen (read-only check 2026-11-12), so it only adds rows.
// Verification (after --apply):
//   SELECT RTRIM(MaTaiKhoan) id, TenDangNhap, SoDienThoai, VaiTro, TrangThai FROM dbo.TaiKhoan ORDER BY MaTaiKhoan;
//   SELECT RTRIM(MaTaiKhoan) tk, RTRIM(MaQuyen) q FROM dbo.TaiKhoanQuyen ORDER BY 1,2;
//   SELECT RTRIM(MaNhanVien), RTRIM(MaTaiKhoan), HoTen FROM dbo.NhanVien; SELECT RTRIM(MaKhachHang), RTRIM(MaTaiKhoan), HoTen FROM dbo.KhachHang;
//   Then POST /api/auth/login { phone, password } for each account.
// Rollback (do NOT run as part of apply; only while no booking/review/history references these accounts):
//   DELETE FROM dbo.TaiKhoanQuyen WHERE MaTaiKhoan IN (SELECT MaTaiKhoan FROM dbo.TaiKhoan WHERE SoDienThoai IN ('0900000001','0900000002','0900000003','0900000004'));
//   DELETE FROM dbo.KhachHang WHERE SoDienThoai='0900000004' AND HoTen=N'Khách hàng thử nghiệm';
//   DELETE FROM dbo.NhanVien  WHERE SoDienThoai IN ('0900000001','0900000002','0900000003');
//   DELETE FROM dbo.PhienDangNhap WHERE MaTaiKhoan IN (...same accounts...);  -- if migration 004 applied
//   DELETE FROM dbo.TaiKhoan  WHERE SoDienThoai IN ('0900000001','0900000002','0900000003','0900000004');
//   (Quyen Q01..Q06 may stay; they are reference data.)

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ALLOWED_DB = 'FlowerLanternSpaDemo';
const here = path.dirname(fileURLToPath(import.meta.url));
// Resolve already-installed packages through the backend workspace (hoisted to the repo root node_modules). No new dependency.
const requireFromBackend = createRequire(path.resolve(here, '../../backend/package.json'));

const PERMISSIONS = [
  ['Q01', 'Quản lý lịch hẹn'], ['Q02', 'Quản lý khách hàng'], ['Q03', 'Quản lý đánh giá và phản hồi'],
  ['Q04', 'Quản lý dịch vụ'], ['Q05', 'Quản lý nhân viên'], ['Q06', 'Xem báo cáo thống kê'],
];

// Same permission model as database/seeds/002-auth-baseline.sql. Phones are test values; change them here before approving if desired.
const ACCOUNTS = [
  { env: 'SEED_PASSWORD_OWNER', username: 'admin', phone: '0900000001', role: 'Chủ Spa', perms: ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06'],
    profile: 'NhanVien', fullName: 'Chủ Spa thử nghiệm', email: 'chuspa.test@example.invalid' },
  { env: 'SEED_PASSWORD_MANAGER', username: 'quanly', phone: '0900000002', role: 'Quản lý', perms: ['Q01', 'Q02', 'Q03', 'Q04', 'Q06'],
    profile: 'NhanVien', fullName: 'Quản lý thử nghiệm', email: 'quanly.test@example.invalid' },
  { env: 'SEED_PASSWORD_STAFF', username: 'nhanvien', phone: '0900000003', role: 'Nhân viên', perms: ['Q01', 'Q02'],
    profile: 'NhanVien', fullName: 'Nhân viên thử nghiệm', email: 'nhanvien.test@example.invalid' },
  { env: 'SEED_PASSWORD_CUSTOMER', username: 'khachhang', phone: '0900000004', role: 'Khách hàng', perms: [],
    profile: 'KhachHang', fullName: 'Khách hàng thử nghiệm', email: null },
];

const apply = process.argv.includes('--apply');
const env = process.env;

function fail(msg) { console.error(`REFUSED: ${msg}`); process.exit(1); }

// ---- SQL (identical text is printed in dry-run and executed with --apply; parameters shown as @name) ----
const SQL_GUARD = `SET XACT_ABORT ON; IF DB_NAME() <> N'${ALLOWED_DB}' THROW 51011, N'PROPOSED-011 is for ${ALLOWED_DB} only.', 1;`;
const SQL_QUYEN = `IF NOT EXISTS (SELECT 1 FROM dbo.Quyen WHERE MaQuyen=@code) INSERT dbo.Quyen (MaQuyen, TenQuyen) VALUES (@code, @name);`;
const SQL_EXISTS = `SELECT 1 AS x FROM dbo.TaiKhoan WITH (UPDLOCK, HOLDLOCK) WHERE SoDienThoai=@phone OR TenDangNhap=@username
  UNION ALL SELECT 1 FROM dbo.NhanVien WITH (UPDLOCK, HOLDLOCK) WHERE SoDienThoai=@phone
  UNION ALL SELECT 1 FROM dbo.KhachHang WITH (UPDLOCK, HOLDLOCK) WHERE SoDienThoai=@phone;`;
const nextId = (table, col, prefix) => `SELECT ISNULL(MAX(CAST(SUBSTRING(${col},3,8) AS INT)),0)+1 AS n FROM dbo.${table} WITH (UPDLOCK, HOLDLOCK)
  WHERE ${col} LIKE '${prefix}[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]';`;
const SQL_TK = `INSERT dbo.TaiKhoan (MaTaiKhoan, TenDangNhap, SoDienThoai, MatKhauBam, VaiTro, TrangThai) VALUES (@id, @username, @phone, @hash, @role, N'Hoạt động');`;
const SQL_NV = `INSERT dbo.NhanVien (MaNhanVien, MaTaiKhoan, HoTen, SoDienThoai, Email, TrangThaiLamViec, TrangThaiHoSo) VALUES (@pid, @id, @fullName, @phone, @email, N'Đang làm việc', N'Hoạt động');`;
const SQL_KH = `INSERT dbo.KhachHang (MaKhachHang, MaTaiKhoan, HoTen, SoDienThoai) VALUES (@pid, @id, @fullName, @phone);`;
const SQL_TKQ = `INSERT dbo.TaiKhoanQuyen (MaTaiKhoan, MaQuyen) VALUES (@id, @code);`;

function printPlan() {
  console.log('MODE: DRY-RUN (no database connection is opened)');
  console.log(`Target database: ${ALLOWED_DB} only. Hashing: argon2id m=65536 t=3 p=4 (hash shown as <REDACTED>).`);
  console.log('\nAccounts (skipped if phone/username already exists):');
  for (const a of ACCOUNTS) {
    console.log(`  ${a.role.padEnd(11)} username=${a.username} phone=${a.phone} profile=${a.profile} permissions=[${a.perms.join(',') || 'none'}] password env=${a.env} (${env[a.env] ? 'set' : 'NOT set'})`);
  }
  console.log('\nSQL that would run in ONE transaction:');
  for (const s of [SQL_GUARD, SQL_QUYEN, SQL_EXISTS, nextId('TaiKhoan', 'MaTaiKhoan', 'TK'), SQL_TK, nextId('NhanVien', 'MaNhanVien', 'NV'), SQL_NV, nextId('KhachHang', 'MaKhachHang', 'KH'), SQL_KH, SQL_TKQ]) {
    console.log(`  ${s.replace(/\s+/g, ' ')}`);
  }
  console.log('\n  -- parameter @hash = <REDACTED argon2id hash>; @email for Khách hàng is not used.');
  console.log('\nTo apply: set ALLOW_TEST_SEED=yes, DB_NAME, DB_HOST, DB_USER, DB_PASSWORD and the four SEED_PASSWORD_* variables, then pass --apply.');
}

if (!apply) { printPlan(); process.exit(0); }

// ---- apply-mode gates ----
if (env.ALLOW_TEST_SEED !== 'yes') fail('ALLOW_TEST_SEED=yes is required.');
if (env.DB_NAME !== ALLOWED_DB) fail(`DB_NAME must be exactly ${ALLOWED_DB}.`);
for (const k of ['DB_HOST', 'DB_USER', 'DB_PASSWORD']) if (!env[k]) fail(`${k} is required (SQL authentication).`);
for (const a of ACCOUNTS) {
  const p = env[a.env];
  if (!p || p.length < 12) fail(`${a.env} must be set to a password of at least 12 characters.`);
}
const port = Number(env.DB_PORT ?? 1433);
if (!Number.isInteger(port) || port < 1 || port > 65535) fail('DB_PORT is invalid.');

const argon2 = requireFromBackend('argon2');
const { Connection, Request, TYPES } = requireFromBackend('tedious');

const hashes = new Map();
for (const a of ACCOUNTS) {
  hashes.set(a.username, await argon2.hash(env[a.env], { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 }));
}

const conn = new Connection({
  server: env.DB_HOST,
  authentication: { type: 'default', options: { userName: env.DB_USER, password: env.DB_PASSWORD } },
  options: { port, database: env.DB_NAME, encrypt: true, trustServerCertificate: env.NODE_ENV !== 'production' && env.DB_TRUST_CERTIFICATE === 'true', rowCollectionOnRequestCompletion: true, connectTimeout: 60000, requestTimeout: 30000 },
});

const connect = () => new Promise((res, rej) => { conn.on('connect', (e) => (e ? rej(e) : res())); conn.connect(); });
const exec = (sql, params = []) => new Promise((res, rej) => {
  const rq = new Request(sql, (e, _n, rows) => (e ? rej(e) : res(rows ?? [])));
  for (const [name, type, value] of params) rq.addParameter(name, type, value);
  conn.execSql(rq);
});
const begin = () => new Promise((res, rej) => conn.beginTransaction((e) => (e ? rej(e) : res())));
const commit = () => new Promise((res, rej) => conn.commitTransaction((e) => (e ? rej(e) : res())));
const rollback = () => new Promise((res) => conn.rollbackTransaction(() => res()));
const pad = (prefix, n) => `${prefix}${String(n).padStart(8, '0')}`;

await connect();
let began = false;
try {
  await begin(); began = true;
  await exec(SQL_GUARD);
  for (const [code, name] of PERMISSIONS) {
    await exec(SQL_QUYEN, [['code', TYPES.VarChar, code], ['name', TYPES.NVarChar, name]]);
  }
  for (const a of ACCOUNTS) {
    const existing = await exec(SQL_EXISTS, [['phone', TYPES.VarChar, a.phone], ['username', TYPES.VarChar, a.username]]);
    if (existing.length) { console.log(`SKIP  ${a.role} (${a.username}): phone or username already exists`); continue; }
    const id = pad('TK', (await exec(nextId('TaiKhoan', 'MaTaiKhoan', 'TK')))[0][0].value);
    await exec(SQL_TK, [['id', TYPES.Char, id], ['username', TYPES.VarChar, a.username], ['phone', TYPES.VarChar, a.phone],
      ['hash', TYPES.VarChar, hashes.get(a.username)], ['role', TYPES.NVarChar, a.role]]);
    if (a.profile === 'NhanVien') {
      const pid = pad('NV', (await exec(nextId('NhanVien', 'MaNhanVien', 'NV')))[0][0].value);
      await exec(SQL_NV, [['pid', TYPES.Char, pid], ['id', TYPES.Char, id], ['fullName', TYPES.NVarChar, a.fullName],
        ['phone', TYPES.Char, a.phone], ['email', TYPES.VarChar, a.email]]);
    } else {
      const pid = pad('KH', (await exec(nextId('KhachHang', 'MaKhachHang', 'KH')))[0][0].value);
      await exec(SQL_KH, [['pid', TYPES.Char, pid], ['id', TYPES.Char, id], ['fullName', TYPES.NVarChar, a.fullName], ['phone', TYPES.Char, a.phone]]);
    }
    for (const code of a.perms) await exec(SQL_TKQ, [['id', TYPES.Char, id], ['code', TYPES.Char, code]]);
    console.log(`ADD   ${a.role} (${a.username}) -> ${id}`);
  }
  await commit();
  console.log('Committed.');
} catch (e) {
  if (began) await rollback();
  console.error(`FAILED, rolled back: ${e.message}`);
  process.exitCode = 1;
} finally {
  conn.close();
}
