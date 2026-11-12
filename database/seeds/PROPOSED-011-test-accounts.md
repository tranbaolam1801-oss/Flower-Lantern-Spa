# PROPOSED-011 — test accounts (Test DB only) — NOT APPLIED

Script: `database/seeds/PROPOSED-011-test-accounts.mjs` (Node, uses the already-installed `argon2` and `tedious` via the repo root `node_modules`; no new dependency). Not run against any database; only the default dry-run and `node --check` were executed (no DB connection, no writes).

## Modes
- Default (no flag): DRY-RUN. Prints accounts and the SQL (hash redacted). Opens no connection.
- `--apply`: requires ALL of `ALLOW_TEST_SEED=yes`, `DB_NAME=FlowerLanternSpa_Test`, `DB_HOST`, `DB_USER`, `DB_PASSWORD` (SQL auth, same names as `backend/src/config.ts`; optional `DB_PORT`, `DB_TRUST_CERTIFICATE`), and the four password variables. The SQL also re-checks `DB_NAME()` inside the transaction.

## Environment variables for the test passwords (each >= 12 characters, never stored in a file)
| Role (`TaiKhoan.VaiTro`) | Env var | Username | Phone (login) | Profile | Permissions |
|---|---|---|---|---|---|
| Chủ Spa | `SEED_PASSWORD_OWNER` | `admin` | 0900000001 | NhanVien | Q01-Q06 |
| Quản lý | `SEED_PASSWORD_MANAGER` | `quanly` | 0900000002 | NhanVien | Q01, Q02, Q03, Q04, Q06 |
| Nhân viên | `SEED_PASSWORD_STAFF` | `nhanvien` | 0900000003 | NhanVien | Q01, Q02 |
| Khách hàng | `SEED_PASSWORD_CUSTOMER` | `khachhang` | 0900000004 | KhachHang | none |

Permission model copied from `seeds/002-auth-baseline.sql`; Q01..Q06 rows are inserted when missing (Test's `Quyen` table is empty). Login is by phone (`auth.service.ts` selects by `SoDienThoai`). Phones are the same test values as seed 002 (fake `0900000xxx`); emails use `example.invalid`.

## Behaviour
Argon2id m=65536, t=3, p=4 (as `password.service.ts`). One transaction; an account whose phone or username already exists in TaiKhoan/NhanVien/KhachHang is skipped and never updated (no password overwrite). IDs `TK/NV/KH` + 8 digits via MAX+1 under UPDLOCK/HOLDLOCK (same as `employees.service.ts`).

## Risk / rollback
Adds rows only (Test has 0 rows in these tables). Rollback SQL is in the script header. Test accounts have known roles; do not reuse the passwords anywhere else and do not copy this script to another database without a new approval.
