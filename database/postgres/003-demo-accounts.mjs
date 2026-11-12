#!/usr/bin/env node
// Creates DEMO accounts (owner, manager, staff, customer) in PostgreSQL. NOT RUN anywhere; needs explicit approval.
// Port of database/seeds/PROPOSED-011-test-accounts.mjs. NEVER imports Dev accounts or the default-password hash from
// seeds/002-auth-baseline.sql: every password comes from an environment variable at run time and is hashed with Argon2id
// (m=65536, t=3, p=4, as backend/src/auth/password.service.ts). Passwords are never printed, logged or stored in a file.
//
//   node database/postgres/003-demo-accounts.mjs            -> DRY-RUN: prints the plan, opens NO connection
//   node database/postgres/003-demo-accounts.mjs --apply    -> requires MIGRATION_DATABASE_URL (direct URL), ALLOW_DB_WRITE=yes,
//                                                              SEED_PASSWORD_OWNER / _MANAGER / _STAFF / _CUSTOMER (each >= 12 chars, all different)
// An existing phone or username is skipped, never updated.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../backend/package.json'));

const ACCOUNTS = [
  { env: 'SEED_PASSWORD_OWNER', username: 'admin', phone: '0900000001', role: 'Chủ Spa', perms: ['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06'], profile: 'NhanVien', fullName: 'Chủ Spa demo', email: 'chuspa.demo@example.invalid' },
  { env: 'SEED_PASSWORD_MANAGER', username: 'quanly', phone: '0900000002', role: 'Quản lý', perms: ['Q01', 'Q02', 'Q03', 'Q04', 'Q06'], profile: 'NhanVien', fullName: 'Quản lý demo', email: 'quanly.demo@example.invalid' },
  { env: 'SEED_PASSWORD_STAFF', username: 'nhanvien', phone: '0900000003', role: 'Nhân viên', perms: ['Q01', 'Q02'], profile: 'NhanVien', fullName: 'Nhân viên demo', email: 'nhanvien.demo@example.invalid' },
  { env: 'SEED_PASSWORD_CUSTOMER', username: 'khachhang', phone: '0900000004', role: 'Khách hàng', perms: [], profile: 'KhachHang', fullName: 'Khách hàng demo', email: null },
];

const apply = process.argv.includes('--apply');
const env = process.env;
const fail = (m) => { console.error(`REFUSED: ${m}`); process.exit(1); };

if (!apply) {
  console.log('MODE: DRY-RUN (no connection opened). Hashing: argon2id m=65536 t=3 p=4.');
  for (const a of ACCOUNTS) console.log(`  ${a.role.padEnd(11)} username=${a.username} phone=${a.phone} profile=${a.profile} perms=[${a.perms.join(',') || 'none'}] password env ${a.env}: ${env[a.env] ? 'set' : 'NOT set'}`);
  console.log('To apply: set MIGRATION_DATABASE_URL (direct), ALLOW_DB_WRITE=yes and the four SEED_PASSWORD_* variables, then pass --apply.');
  process.exit(0);
}

if (env.ALLOW_DB_WRITE !== 'yes') fail('ALLOW_DB_WRITE=yes is required.');
const url = env.MIGRATION_DATABASE_URL?.trim();
if (!url) fail('MIGRATION_DATABASE_URL is required.');
if (new URL(url).hostname.includes('-pooler')) fail('use the DIRECT Neon URL (host without "-pooler").');
for (const a of ACCOUNTS) if ((env[a.env] ?? '').length < 12) fail(`${a.env} must be set and at least 12 characters.`);
const passwords = ACCOUNTS.map((a) => env[a.env]);
if (new Set(passwords).size !== passwords.length) fail('each demo account needs a DIFFERENT password.');

const argon2 = require('argon2');
const { Client } = require('pg');
const hashes = [];
for (const p of passwords) hashes.push(await argon2.hash(p, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 }));

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 30000 });
await client.connect();
const nextId = async (table, col, prefix) => {
  const r = await client.query(`SELECT COALESCE(MAX(substring(${col} FROM 3 FOR 8)::int), 0) + 1 AS n FROM dbo.${table} WHERE ${col} ~ '^${prefix}[0-9]{8}$'`);
  return `${prefix}${String(r.rows[0].n).padStart(8, '0')}`;
};
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('demo-accounts'))");
  const q = await client.query('SELECT count(*)::int AS n FROM dbo.Quyen');
  if (q.rows[0].n < 6) throw new Error('permission catalogue Q01-Q06 is missing; apply database/postgres/001-schema.sql first.');
  for (const [i, a] of ACCOUNTS.entries()) {
    const exists = await client.query(
      'SELECT 1 FROM dbo.TaiKhoan WHERE SoDienThoai=$1 OR TenDangNhap=$2 UNION ALL SELECT 1 FROM dbo.NhanVien WHERE SoDienThoai=$1 UNION ALL SELECT 1 FROM dbo.KhachHang WHERE SoDienThoai=$1',
      [a.phone, a.username]);
    if (exists.rowCount) { console.log(`skip   ${a.username} (already exists)`); continue; }
    const id = await nextId('TaiKhoan', 'MaTaiKhoan', 'TK');
    await client.query("INSERT INTO dbo.TaiKhoan (MaTaiKhoan, TenDangNhap, SoDienThoai, MatKhauBam, VaiTro, TrangThai) VALUES ($1,$2,$3,$4,$5,'Hoạt động')", [id, a.username, a.phone, hashes[i], a.role]);
    if (a.profile === 'NhanVien') {
      const pid = await nextId('NhanVien', 'MaNhanVien', 'NV');
      await client.query("INSERT INTO dbo.NhanVien (MaNhanVien, MaTaiKhoan, HoTen, SoDienThoai, Email, TrangThaiLamViec, TrangThaiHoSo) VALUES ($1,$2,$3,$4,$5,'Đang làm việc','Hoạt động')", [pid, id, a.fullName, a.phone, a.email]);
    } else {
      const pid = await nextId('KhachHang', 'MaKhachHang', 'KH');
      await client.query('INSERT INTO dbo.KhachHang (MaKhachHang, MaTaiKhoan, HoTen, SoDienThoai) VALUES ($1,$2,$3,$4)', [pid, id, a.fullName, a.phone]);
    }
    for (const code of a.perms) await client.query('INSERT INTO dbo.TaiKhoanQuyen (MaTaiKhoan, MaQuyen) VALUES ($1,$2)', [id, code]);
    console.log(`create ${a.username} (${a.role})`);
  }
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error('FAILED, rolled back:', e.code ?? e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
