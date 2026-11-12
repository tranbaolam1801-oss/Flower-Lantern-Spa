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
IF DB_NAME() <> 'FlowerLanternSpa_Test'
  THROW 51005, 'Migration 005 is proposed for Test only. Dev requires separate approval.', 1;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.GoiDichVu','TrangThai') IS NULL
BEGIN
  ALTER TABLE dbo.GoiDichVu ADD TrangThai NVARCHAR(30) NOT NULL
    CONSTRAINT DF_GoiDichVu_TrangThai DEFAULT N'Hoạt động';
END;
COMMIT;
