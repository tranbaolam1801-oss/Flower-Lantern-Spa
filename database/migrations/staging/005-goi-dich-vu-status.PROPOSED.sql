-- STAGING VARIANT of database/migrations/005-goi-dich-vu-status.PROPOSED.sql. PROPOSED / NOT APPLIED. NOT executed and NOT parse-checked by any SQL Server.
-- Identical to the original except: the hard-coded 'FlowerLanternSpa_Test' guard is replaced by the @AllowedDb guard below
-- (single variable allow-list; refuses while the placeholder is unchanged; refuses Dev/3NF/system databases).
-- Before running: have a verified backup of the staging database; see database/migrations/STAGING_MIGRATION_ORDER.md. Requires explicit user approval.
-- Run: sqlcmd -S <server> -E -C -b -I -f 65001 -d <STAGING_DB_NAME> -i database/migrations/staging/005-goi-dich-vu-status.PROPOSED.sql
-- PROPOSED / NOT APPLIED. Requires explicit user approval (additive change to the approved baseline).
-- Apply to FlowerLanternSpa_Test first; FlowerLanternSpa_Dev needs separate approval.
--
-- Purpose: UC_9 can deactivate a service package that has booking history instead of retaining it.
-- Not required by the current admin-services code (it never deletes packages that have history).
--
-- Schema change : dbo.GoiDichVu gains TrangThai NVARCHAR(30) NOT NULL.
-- Default       : N'Hoạt động' (constraint DF_GoiDichVu_TrangThai).
-- Existing data : every existing row receives the default 'Hoạt động'; no row is deleted or rewritten
--                 otherwise, and no other column or table changes. Run time is a metadata-only add for a
--                 constant default on SQL Server 2012+ (NOT NULL + constant default).
-- Code impact   : none until the backend is changed to read/write the column (not yet done).
-- Rollback      : run the statements in the ROLLBACK section below (safe only before any code writes a
--                 value other than 'Hoạt động'; otherwise that deactivation state is lost).
--
-- ROLLBACK (do not run as part of apply):
--   ALTER TABLE dbo.GoiDichVu DROP CONSTRAINT DF_GoiDichVu_TrangThai;
--   ALTER TABLE dbo.GoiDichVu DROP COLUMN TrangThai;
SET XACT_ABORT ON;
-- ===== STAGING GUARD (replaces the Test-only guard of the original script) =====
-- The ONLY edit the user must make: replace <STAGING_DB_NAME> with the exact staging database name, nothing else.
DECLARE @AllowedDb sysname = N'<STAGING_DB_NAME>';
IF @AllowedDb LIKE N'<%' OR @AllowedDb = N''
  THROW 51045, N'Staging migration 005 (OPTIONAL): set @AllowedDb to the real staging database name first. Nothing was changed.', 1;
IF @AllowedDb IN (N'FlowerLanternSpa_Dev', N'FlowerLanternSpa_3NF', N'master', N'model', N'msdb', N'tempdb')
  THROW 51065, N'Staging migration 005 (OPTIONAL): this database name is not allowed as a staging target. Nothing was changed.', 1;
IF DB_NAME() <> @AllowedDb
  THROW 51085, N'Staging migration 005 (OPTIONAL): connected database does not equal @AllowedDb. Nothing was changed.', 1;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.GoiDichVu','TrangThai') IS NULL
BEGIN
  ALTER TABLE dbo.GoiDichVu ADD TrangThai NVARCHAR(30) NOT NULL
    CONSTRAINT DF_GoiDichVu_TrangThai DEFAULT N'Hoạt động';
END;
COMMIT;
