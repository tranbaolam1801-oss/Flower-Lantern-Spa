# Staging migration order — PROPOSED / NOT APPLIED

Nothing in this document or in `database/migrations/staging/*.PROPOSED.sql` has been executed or parse-checked by a SQL Server. Applying anything needs explicit user approval, a verified backup, and the exact staging database name. Never use `FlowerLanternSpa_Dev` or `FlowerLanternSpa_3NF` as a staging target (the staging guards refuse them).

State observed read-only on `FlowerLanternSpa_Test` (2026-11-12): 17 tables (15 baseline + `KhoaDangNhap` + `PhienDangNhap`), `Giuong` = 20 rows, `PhanHoi.NgayPhanHoi` + `DF_PhanHoi_NgayPhanHoi` already present (006 effectively applied), `GoiDichVu.TrangThai` absent (005 not applied), `ThanhToan` still the 6 baseline columns, no `SePayWebhookEvent`/`ThanhToanHoanTien` (007 not applied), all catalog/account tables empty (`Quyen` empty too: seed 002 was never run on Test).

## Prerequisites for every step
1. Empty-or-known staging database created by the user, collation `Vietnamese_100_CI_AS` is not required (queries cast per column) but the server must be able to store Vietnamese (NVARCHAR).
2. `sqlcmd` run with `-b -I -f 65001` (stop on error, QUOTED_IDENTIFIER ON, UTF-8). Always pass `-d <STAGING_DB_NAME>` explicitly.
3. Backup before the first step and before 007: `BACKUP DATABASE [<STAGING_DB_NAME>] TO DISK = N'<path>' WITH COPY_ONLY, CHECKSUM;` (user-run).

## Ordered plan

| # | Script | Purpose | Prereq | Code that depends on it | Idempotent? | Verify | Rollback |
|---|---|---|---|---|---|---|---|
| 1 | `001-srs-baseline.sql` | 15 SRS tables | empty DB | all entities | **No** (`CREATE TABLE` fails if present). Run only on an empty DB; on an existing DB skip and verify instead | `SELECT COUNT(*) FROM sys.tables;` = 15 | drop the empty DB |
| 2 | `002-business-indexes.sql` | unique/business indexes (phone, TenDichVu, DanhGia/PhanHoi per booking) | 1 | uniqueness rules in customers/employees/reviews/services | **No** (`CREATE UNIQUE INDEX` fails if present) | `SELECT name FROM sys.indexes WHERE name LIKE 'UX[_]%' OR name LIKE 'IX[_]KhachSuDung%';` -> `UX_TaiKhoan_SoDienThoai, UX_KhachHang_SoDienThoai, UX_NhanVien_SoDienThoai, UX_NhanVien_Email, UX_DichVu_TenDichVu, UX_DanhGia_LichHen, UX_PhanHoi_DanhGia, IX_KhachSuDungDichVu_Giuong_ThoiGian` | `DROP INDEX <name> ON <table>` each |
| 3 | `003-auth-lockout.sql` | `KhoaDangNhap`, filtered unique `MaTaiKhoan` on KhachHang/NhanVien | 1 | auth lockout, offline customers (many NULL accounts) | Yes | table `KhoaDangNhap` exists; `UX_KhachHang_MaTaiKhoan`, `UX_NhanVien_MaTaiKhoan` exist; no `UQ` constraint on those columns | not advised (would re-block offline customers); `DROP TABLE dbo.KhoaDangNhap` only if unused |
| 3b | `seeds/001-beds.sql` | beds G1..G20 | 1 | booking. Business override: only G1-G15 are bookable, enforced in code (regex), no schema change | Yes (rolls back if total <> 20) | `SELECT COUNT(*) FROM dbo.Giuong;` = 20 | `DELETE FROM dbo.Giuong` only while unreferenced |
| 4 | `staging/004-auth-sessions.PROPOSED.sql` | `PhienDangNhap` session store | 1 | env `AUTH_SESSION_STORE=sql` (auth guard, logout revoke, employees revoke). Required if staging runs with `sql` | Yes (`OBJECT_ID` guard) | `SELECT 1 FROM sys.tables WHERE name='PhienDangNhap';` + `CK_PhienDangNhap_Expiry` | `DROP TABLE dbo.PhienDangNhap;` (all sessions lost -> users re-login) |
| 5 | `staging/005-goi-dich-vu-status.PROPOSED.sql` | `GoiDichVu.TrangThai` default N'Hoạt động' | 1 | **none today** (no backend or entity reads it; admin-services never deletes packages with history) | Yes (`COL_LENGTH` guard) | `SELECT COL_LENGTH('dbo.GoiDichVu','TrangThai');` | `ALTER TABLE dbo.GoiDichVu DROP CONSTRAINT DF_GoiDichVu_TrangThai; ALTER TABLE dbo.GoiDichVu DROP COLUMN TrangThai;` |
| 6 | `staging/006-phan-hoi-ngay-phan-hoi.PROPOSED.sql` | `PhanHoi.NgayPhanHoi DATETIME2(0) NULL`, default SYSUTCDATETIME for new rows | 1 | `phan-hoi.entity.ts` already declares the column and `reviews.controller.ts` reads it: **apply before running the schema integration spec / reviews with real data** | Yes | `SELECT COL_LENGTH('dbo.PhanHoi','NgayPhanHoi');` | `ALTER TABLE dbo.PhanHoi DROP CONSTRAINT DF_PhanHoi_NgayPhanHoi; ALTER TABLE dbo.PhanHoi DROP COLUMN NgayPhanHoi;` |
| 7 | `staging/007-sepay-payments.PROPOSED.sql` | ThanhToan +5 columns, 3 indexes, `SePayWebhookEvent`, `ThanhToanHoanTien` | 1, 3 (FK to TaiKhoan) | `backend/src/payments/**` (`ensureSchema` answers 503 until all objects exist); revenue report uses `NhaCungCap` when present | Yes (each step guarded) | see queries below | see header of the script (drop the two tables first, then indexes, then columns; export refund audit first) |

**Step 5 decision: OPTIONAL.** No code path needs it; apply only if the owner wants UC_9 to deactivate (not delete) a package that has booking history. Skipping it has no functional effect now. If applied, it also needs an entity column and code (not done).

007 verification (expect 5 / 2 / 3 rows):
```sql
SELECT name FROM sys.columns WHERE object_id=OBJECT_ID('dbo.ThanhToan') AND name IN ('MaThamChieu','NhaCungCap','MaGiaoDichNhaCungCap','HanThanhToan','SoTaiKhoanNhan');
SELECT name FROM sys.tables WHERE name IN ('SePayWebhookEvent','ThanhToanHoanTien');
SELECT name FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.ThanhToan') AND name IN ('UX_ThanhToan_MaThamChieu','UX_ThanhToan_NhaCungCap_GiaoDich','IX_ThanhToan_MaLichHen_TrangThai');
```

Suggested order for a **fresh** staging DB: 1, 2, 3, 3b, 4, 6, 7 (5 only if approved), then optionally PROPOSED-008 (see below), then reference data. For an **existing** staging DB, first run the read-only detection queries (table count, `sys.indexes`, `COL_LENGTH` checks above) and apply only what is missing; never re-run 001/002.

## Not to be run on Staging
- `seeds/002-auth-baseline.sql`: contains a documented default password hash (`Spa@123456` in a committed file) and fixed accounts. Do not use outside local/test. Staging reference data must be: permissions `Q01..Q06` (the `Quyen` table is empty on Test too) and accounts created with secrets that never enter the repo. `seeds/PROPOSED-011-test-accounts.mjs` is hard-limited to `FlowerLanternSpa_Test`; a staging variant needs its own approval (change `ALLOWED_DB` and the guards deliberately, use strong unique passwords).
- `seeds/PROPOSED-010-sample-catalog.sql` is Test-only sample data with placeholder prices.

## Booking source / prepaid (task 4)
`LichHen` has no column for "Nguồn đặt lịch" and the SRS requires it (L375, L548, BR-UC5.1-03 "ONLINE"): one additive column is proposed in `PROPOSED-008-booking-source-prepaid.md` (`LichHen.NguonDatLich NVARCHAR(50) NULL`). "Thanh toán trả trước" needs **no schema change**: record it as a manual `ThanhToan` row. Until 008 is approved, the booking code cannot persist `source`.

## Backend changes to make atomically when migrations are applied (NOT done here; other agents own backend)
- **007**: `entities/thanh-toan.entity.ts` + `MaThamChieu` varchar(32) null, `NhaCungCap` varchar(20) null, `MaGiaoDichNhaCungCap` varchar(64) null, `HanThanhToan` datetime null, `SoTaiKhoanNhan` varchar(30) null. New `se-pay-webhook-event.entity.ts` (`MaSuKien` bigint identity PK, `NhaCungCap` varchar(20), `MaGiaoDichNhaCungCap` varchar(64), `MaThanhToan` char(10) null FK->ThanhToan NO ACTION, `SoTienNhan` money null, `LoaiGiaoDich` varchar(10) null, `SoTaiKhoanNhan` varchar(30) null, `ThamChieu` varchar(64) null, `KetQuaXuLy` varchar(40), `DuLieuTho` nvarchar(max), `NgayNhan` datetime) and `thanh-toan-hoan-tien.entity.ts` (`MaHoanTien` bigint identity PK, `MaThanhToan` char(10) FK, `SoTien` money, `LyDo` nvarchar(255), `MaTaiKhoanThucHien` char(10) FK->TaiKhoan, `NgayThucHien` datetime). Register both in `entities/index.ts`. `schema.sql.integration.spec.ts`: table count 17 -> **19** (spec title "17" -> "19"). Test the same script on Test first so that spec passes there.
- **006**: entity already has `NgayPhanHoi`; spec expects the column, so any DB the integration spec runs against needs 006 (Test already has it).
- **005** (only if applied): add `TrangThai` nvarchar(30) to `goi-dich-vu.entity.ts`; otherwise leave the entity alone (an unmapped extra DB column is not an error for the entity-driven checks; this was not run to confirm). Table count is unaffected by 005.
- **008** (only if approved): `lich-hen.entity.ts` + `NguonDatLich` nvarchar(50) null.
- Staging env: `AUTH_SESSION_STORE=sql`, SQL authentication (`DB_AUTH` not `windows`; `config.ts` rejects windows auth in production).

## Allow-list mechanism chosen (and why)
New copies under `database/migrations/staging/` with one `DECLARE @AllowedDb sysname = N'<STAGING_DB_NAME>';`. Safest because: originals stay untouched and Test-only; the copy refuses to run while the placeholder is unchanged, refuses Dev/3NF/system DBs, and requires `DB_NAME() = @AllowedDb`, so a wrong `-d` also fails. Exact change versus the original: the two-line block
```sql
IF DB_NAME() <> 'FlowerLanternSpa_Test'
  THROW 5100x, '... Test only ...', 1;
```
is replaced by the `@AllowedDb` guard (three `IF ... THROW` statements with codes 5104x/5106x/5108x). Nothing else differs; THROW stays outside any transaction so the batch aborts before any change.
