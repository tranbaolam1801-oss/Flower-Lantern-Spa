-- AZURE DEMO COPY. Generated from database/migrations/006-phan-hoi-ngay-phan-hoi.PROPOSED.sql; the ONLY change is the database guard below, which now
-- allows exactly 'FlowerLanternSpaDemo' (Azure SQL Database free tier, demo) and still refuses every other database,
-- including FlowerLanternSpa_Dev/_Test. NOT EXECUTED. Requires explicit approval of the migration batch.
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
IF DB_NAME() <> N'FlowerLanternSpaDemo'
  THROW 51006, N'Azure demo copy: allowed only on FlowerLanternSpaDemo. Nothing was changed.', 1;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.PhanHoi','NgayPhanHoi') IS NULL
BEGIN
  ALTER TABLE dbo.PhanHoi ADD NgayPhanHoi DATETIME2(0) NULL
    CONSTRAINT DF_PhanHoi_NgayPhanHoi DEFAULT SYSUTCDATETIME();
END;
COMMIT;
