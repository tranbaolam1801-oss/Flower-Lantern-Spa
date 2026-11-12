-- STAGING VARIANT of database/migrations/004-auth-sessions.sql. PROPOSED / NOT APPLIED. NOT executed and NOT parse-checked by any SQL Server.
-- Identical to the original except: the hard-coded 'FlowerLanternSpa_Test' guard is replaced by the @AllowedDb guard below
-- (single variable allow-list; refuses while the placeholder is unchanged; refuses Dev/3NF/system databases).
-- Before running: have a verified backup of the staging database; see database/migrations/STAGING_MIGRATION_ORDER.md. Requires explicit user approval.
-- Run: sqlcmd -S <server> -E -C -b -I -f 65001 -d <STAGING_DB_NAME> -i database/migrations/staging/004-auth-sessions.PROPOSED.sql
-- PROPOSED ONLY. User approval required before applying.
-- Additive technical table; no change to the approved 15 business tables.
-- Store session identifiers, never passwords, JWT values or token secrets.
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
-- ===== STAGING GUARD (replaces the Test-only guard of the original script) =====
-- The ONLY edit the user must make: replace <STAGING_DB_NAME> with the exact staging database name, nothing else.
DECLARE @AllowedDb sysname = N'<STAGING_DB_NAME>';
IF @AllowedDb LIKE N'<%' OR @AllowedDb = N''
  THROW 51044, N'Staging migration 004: set @AllowedDb to the real staging database name first. Nothing was changed.', 1;
IF @AllowedDb IN (N'FlowerLanternSpa_Dev', N'FlowerLanternSpa_3NF', N'master', N'model', N'msdb', N'tempdb')
  THROW 51064, N'Staging migration 004: this database name is not allowed as a staging target. Nothing was changed.', 1;
IF DB_NAME() <> @AllowedDb
  THROW 51084, N'Staging migration 004: connected database does not equal @AllowedDb. Nothing was changed.', 1;
BEGIN TRY
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.PhienDangNhap','U') IS NULL
BEGIN
  CREATE TABLE dbo.PhienDangNhap (
    MaPhien UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_PhienDangNhap PRIMARY KEY,
    MaTaiKhoan CHAR(10) NOT NULL,
    TaoLuc DATETIME2(3) NOT NULL CONSTRAINT DF_PhienDangNhap_TaoLuc DEFAULT SYSUTCDATETIME(),
    HetHanLuc DATETIME2(3) NOT NULL,
    ThuHoiLuc DATETIME2(3) NULL,
    CONSTRAINT FK_PhienDangNhap_TaiKhoan FOREIGN KEY(MaTaiKhoan) REFERENCES dbo.TaiKhoan(MaTaiKhoan),
    CONSTRAINT CK_PhienDangNhap_Expiry CHECK(HetHanLuc > TaoLuc)
  );
  CREATE INDEX IX_PhienDangNhap_TaiKhoan ON dbo.PhienDangNhap(MaTaiKhoan,HetHanLuc) INCLUDE(ThuHoiLuc);
END;
COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
