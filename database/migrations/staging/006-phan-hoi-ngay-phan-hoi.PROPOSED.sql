-- STAGING VARIANT of database/migrations/006-phan-hoi-ngay-phan-hoi.PROPOSED.sql. PROPOSED / NOT APPLIED. NOT executed and NOT parse-checked by any SQL Server.
-- Identical to the original except: the hard-coded 'FlowerLanternSpa_Test' guard is replaced by the @AllowedDb guard below
-- (single variable allow-list; refuses while the placeholder is unchanged; refuses Dev/3NF/system databases).
-- Before running: have a verified backup of the staging database; see database/migrations/STAGING_MIGRATION_ORDER.md. Requires explicit user approval.
-- Run: sqlcmd -S <server> -E -C -b -I -f 65001 -d <STAGING_DB_NAME> -i database/migrations/staging/006-phan-hoi-ngay-phan-hoi.PROPOSED.sql
-- PROPOSED / NOT APPLIED. Requires explicit user approval (additive change to the approved baseline).
-- Apply to FlowerLanternSpa_Test first; FlowerLanternSpa_Dev needs separate approval.
--
-- Purpose: UC_4 shows when a review was answered (frontend ReviewItem.reply.repliedAt). The deployed
--          dbo.PhanHoi (001-srs-baseline.sql: MaPhanHoi, MaDanhGia, MaNhanVien, NoiDungPhanHoi) has no
--          timestamp, so the API currently returns repliedAt as an empty string.
--
-- Schema change : dbo.PhanHoi gains NgayPhanHoi DATETIME2(0) NULL (reply time, stored in UTC).
-- Default       : DF_PhanHoi_NgayPhanHoi = SYSUTCDATETIME() applies to NEW rows only.
-- Nullability   : NULL, on purpose. Existing replies have no recorded time and none is invented;
--                 they stay NULL and the API/UI keep showing "no time" for them.
-- Existing data : no row is modified (a nullable column added with ADD ... DEFAULT ... does not backfill
--                 existing rows unless WITH VALUES is used, which this script deliberately omits).
--                 Existing constraints/indexes (PK, FK to DanhGia/NhanVien, UX_PhanHoi_DanhGia) are untouched.
-- Code impact   : none until the backend reads/writes the column. The reviews API must keep working while
--                 the column is absent (current behaviour) and when it is NULL (empty repliedAt).
-- Rollback      : run the ROLLBACK section below. Loses only the stored reply times.
--
-- ROLLBACK (do not run as part of apply):
--   ALTER TABLE dbo.PhanHoi DROP CONSTRAINT DF_PhanHoi_NgayPhanHoi;
--   ALTER TABLE dbo.PhanHoi DROP COLUMN NgayPhanHoi;
SET XACT_ABORT ON;
-- ===== STAGING GUARD (replaces the Test-only guard of the original script) =====
-- The ONLY edit the user must make: replace <STAGING_DB_NAME> with the exact staging database name, nothing else.
DECLARE @AllowedDb sysname = N'<STAGING_DB_NAME>';
IF @AllowedDb LIKE N'<%' OR @AllowedDb = N''
  THROW 51046, N'Staging migration 006: set @AllowedDb to the real staging database name first. Nothing was changed.', 1;
IF @AllowedDb IN (N'FlowerLanternSpa_Dev', N'FlowerLanternSpa_3NF', N'master', N'model', N'msdb', N'tempdb')
  THROW 51066, N'Staging migration 006: this database name is not allowed as a staging target. Nothing was changed.', 1;
IF DB_NAME() <> @AllowedDb
  THROW 51086, N'Staging migration 006: connected database does not equal @AllowedDb. Nothing was changed.', 1;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.PhanHoi','NgayPhanHoi') IS NULL
BEGIN
  ALTER TABLE dbo.PhanHoi ADD NgayPhanHoi DATETIME2(0) NULL
    CONSTRAINT DF_PhanHoi_NgayPhanHoi DEFAULT SYSUTCDATETIME();
END;
COMMIT;
