-- STAGING VARIANT of database/migrations/007-sepay-payments.PROPOSED.sql. PROPOSED / NOT APPLIED. NOT executed and NOT parse-checked by any SQL Server.
-- Identical to the original except: the hard-coded 'FlowerLanternSpa_Test' guard is replaced by the @AllowedDb guard below
-- (single variable allow-list; refuses while the placeholder is unchanged; refuses Dev/3NF/system databases).
-- Before running: have a verified backup of the staging database; see database/migrations/STAGING_MIGRATION_ORDER.md. Requires explicit user approval.
-- Run: sqlcmd -S <server> -E -C -b -I -f 65001 -d <STAGING_DB_NAME> -i database/migrations/staging/007-sepay-payments.PROPOSED.sql
-- PROPOSED / NOT APPLIED. Requires explicit user approval (additive change to the approved baseline).
-- Apply to FlowerLanternSpa_Test only; FlowerLanternSpa_Dev needs separate approval. Never executed by the assistant.
--
-- Purpose: SePay Test Mode payments (backend/src/payments). Endpoints /api/payments/* answer 503
--          "cần áp dụng migration 007" until every object below exists (ensureSchema checks the ThanhToan columns, SePayWebhookEvent and ThanhToanHoanTien).
--
-- Schema changes (all additive, all nullable, no default needed):
--   dbo.ThanhToan.MaThamChieu          VARCHAR(32)  NULL  unique payment reference / transfer content (prefix + 10 chars)
--   dbo.ThanhToan.NhaCungCap           VARCHAR(20)  NULL  'SEPAY' or 'MOCK' (test simulation, never a real settlement)
--   dbo.ThanhToan.MaGiaoDichNhaCungCap VARCHAR(64)  NULL  provider transaction id (SePay payload "id")
--   dbo.ThanhToan.HanThanhToan         DATETIME     NULL  payment expiry
--   dbo.ThanhToan.SoTaiKhoanNhan       VARCHAR(30)  NULL  receiving account the QR was issued for
--   UX_ThanhToan_MaThamChieu           unique filtered index (MaThamChieu IS NOT NULL)
--   UX_ThanhToan_NhaCungCap_GiaoDich   unique filtered index (NhaCungCap, MaGiaoDichNhaCungCap) WHERE MaGiaoDichNhaCungCap IS NOT NULL
--   IX_ThanhToan_MaLichHen_TrangThai   non-unique index (MaLichHen, TrangThaiGiaoDich)
--   dbo.SePayWebhookEvent (new table)  raw webhook audit; UNIQUE (NhaCungCap, MaGiaoDichNhaCungCap) = idempotency key.
--                                      MaThanhToan FK to ThanhToan (nullable: unknown references are still recorded).
--   dbo.ThanhToanHoanTien (new table)  refund audit: one row per refund recorded by management, written in the same transaction as the
--                                      KhoanHoanTien update. MaThanhToan FK->ThanhToan, SoTien MONEY CHECK > 0, LyDo NVARCHAR(255) NOT NULL (reason),
--                                      MaTaiKhoanThucHien CHAR(10) FK->TaiKhoan (actor), NgayThucHien DATETIME DEFAULT GETDATE().
--   SePayWebhookEvent.KetQuaXuLy also stores 'INVALID_PAYLOAD' (authenticated but structurally invalid payload; MaGiaoDichNhaCungCap is the SePay id when valid,
--                                      otherwise 'INVALID-' + 32 hex of SHA-256 of the raw body; both fit the VARCHAR(64) key).
-- Existing data: dbo.ThanhToan has 0 rows in Test at time of writing; existing rows (if any) keep NULLs and are unaffected.
-- No baseline column, constraint or table is altered or dropped. TrangThaiGiaoDich keeps NVARCHAR(30); new values used by code:
--   N'Chờ thanh toán', N'Hết hạn' (in addition to SRS values Thành công / Thất bại / Đã hoàn tiền). Reports only count 'Thành công'.
--
-- ROLLBACK (do not run as part of apply; safe only while no SePay data must be kept):
--   DROP TABLE dbo.ThanhToanHoanTien;   -- loses the refund audit trail; export it first
--   DROP TABLE dbo.SePayWebhookEvent;
--   DROP INDEX UX_ThanhToan_MaThamChieu ON dbo.ThanhToan;
--   DROP INDEX UX_ThanhToan_NhaCungCap_GiaoDich ON dbo.ThanhToan;
--   DROP INDEX IX_ThanhToan_MaLichHen_TrangThai ON dbo.ThanhToan;
--   ALTER TABLE dbo.ThanhToan DROP COLUMN MaThamChieu, NhaCungCap, MaGiaoDichNhaCungCap, HanThanhToan, SoTaiKhoanNhan;
-- Review notes (2026-11-12, read-only check against FlowerLanternSpa_Test): ThanhToan has 0 rows and columns MaThanhToan CHAR(10), MaLichHen CHAR(10),
--   SoTienThanhToan MONEY, NgayGhiNhan DATETIME (CHECK <= GETDATE()), TrangThaiGiaoDich NVARCHAR(30), KhoanHoanTien MONEY NULL DEFAULT 0 (CHECK >= 0).
--   The code inserts NgayGhiNhan=GETDATE() and re-sets it to GETDATE() on confirmation, so CK NgayGhiNhan<=GETDATE() always holds; KhoanHoanTien is written as 0 / a
--   running total <= SoTienThanhToan. NgayGhiNhan therefore means "created" while Chờ thanh toán and "confirmed" after Thành công.
--   Webhook audit columns are sized for the code's writes: LoaiGiaoDich(10), SoTaiKhoanNhan(30) are truncated by the service; SoTienNhan MONEY is bounded to <= 1e12 by the parser.
-- Idempotent: every step is guarded, so a second run is a no-op. Filtered indexes need these session options (sqlcmd default is ON; stated explicitly):
SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON;
SET XACT_ABORT ON;
-- ===== STAGING GUARD (replaces the Test-only guard of the original script) =====
-- The ONLY edit the user must make: replace <STAGING_DB_NAME> with the exact staging database name, nothing else.
DECLARE @AllowedDb sysname = N'<STAGING_DB_NAME>';
IF @AllowedDb LIKE N'<%' OR @AllowedDb = N''
  THROW 51047, N'Staging migration 007: set @AllowedDb to the real staging database name first. Nothing was changed.', 1;
IF @AllowedDb IN (N'FlowerLanternSpa_Dev', N'FlowerLanternSpa_3NF', N'master', N'model', N'msdb', N'tempdb')
  THROW 51067, N'Staging migration 007: this database name is not allowed as a staging target. Nothing was changed.', 1;
IF DB_NAME() <> @AllowedDb
  THROW 51087, N'Staging migration 007: connected database does not equal @AllowedDb. Nothing was changed.', 1;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.ThanhToan','MaThamChieu') IS NULL ALTER TABLE dbo.ThanhToan ADD MaThamChieu VARCHAR(32) NULL;
IF COL_LENGTH('dbo.ThanhToan','NhaCungCap') IS NULL ALTER TABLE dbo.ThanhToan ADD NhaCungCap VARCHAR(20) NULL;
IF COL_LENGTH('dbo.ThanhToan','MaGiaoDichNhaCungCap') IS NULL ALTER TABLE dbo.ThanhToan ADD MaGiaoDichNhaCungCap VARCHAR(64) NULL;
IF COL_LENGTH('dbo.ThanhToan','HanThanhToan') IS NULL ALTER TABLE dbo.ThanhToan ADD HanThanhToan DATETIME NULL;
IF COL_LENGTH('dbo.ThanhToan','SoTaiKhoanNhan') IS NULL ALTER TABLE dbo.ThanhToan ADD SoTaiKhoanNhan VARCHAR(30) NULL;

-- Dynamic SQL so the batch compiles before the new columns exist.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_ThanhToan_MaThamChieu' AND object_id=OBJECT_ID('dbo.ThanhToan'))
  EXEC('CREATE UNIQUE INDEX UX_ThanhToan_MaThamChieu ON dbo.ThanhToan(MaThamChieu) WHERE MaThamChieu IS NOT NULL');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='UX_ThanhToan_NhaCungCap_GiaoDich' AND object_id=OBJECT_ID('dbo.ThanhToan'))
  EXEC('CREATE UNIQUE INDEX UX_ThanhToan_NhaCungCap_GiaoDich ON dbo.ThanhToan(NhaCungCap,MaGiaoDichNhaCungCap) WHERE MaGiaoDichNhaCungCap IS NOT NULL');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_ThanhToan_MaLichHen_TrangThai' AND object_id=OBJECT_ID('dbo.ThanhToan'))
  EXEC('CREATE INDEX IX_ThanhToan_MaLichHen_TrangThai ON dbo.ThanhToan(MaLichHen,TrangThaiGiaoDich)');

IF OBJECT_ID('dbo.SePayWebhookEvent','U') IS NULL
BEGIN
  CREATE TABLE dbo.SePayWebhookEvent (
    MaSuKien BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SePayWebhookEvent PRIMARY KEY,
    NhaCungCap VARCHAR(20) NOT NULL,
    MaGiaoDichNhaCungCap VARCHAR(64) NOT NULL,
    MaThanhToan CHAR(10) NULL CONSTRAINT FK_SePayWebhookEvent_ThanhToan REFERENCES dbo.ThanhToan(MaThanhToan),
    SoTienNhan MONEY NULL,
    LoaiGiaoDich VARCHAR(10) NULL,
    SoTaiKhoanNhan VARCHAR(30) NULL,
    ThamChieu VARCHAR(64) NULL,
    KetQuaXuLy VARCHAR(40) NOT NULL,
    DuLieuTho NVARCHAR(MAX) NOT NULL,
    NgayNhan DATETIME NOT NULL CONSTRAINT DF_SePayWebhookEvent_NgayNhan DEFAULT GETDATE(),
    CONSTRAINT UQ_SePayWebhookEvent_GiaoDich UNIQUE (NhaCungCap, MaGiaoDichNhaCungCap)
  );
END;

IF OBJECT_ID('dbo.ThanhToanHoanTien','U') IS NULL
BEGIN
  CREATE TABLE dbo.ThanhToanHoanTien (
    MaHoanTien BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ThanhToanHoanTien PRIMARY KEY,
    MaThanhToan CHAR(10) NOT NULL CONSTRAINT FK_ThanhToanHoanTien_ThanhToan REFERENCES dbo.ThanhToan(MaThanhToan),
    SoTien MONEY NOT NULL CONSTRAINT CK_ThanhToanHoanTien_SoTien CHECK (SoTien > 0),
    LyDo NVARCHAR(255) NOT NULL,
    MaTaiKhoanThucHien CHAR(10) NOT NULL CONSTRAINT FK_ThanhToanHoanTien_TaiKhoan REFERENCES dbo.TaiKhoan(MaTaiKhoan),
    NgayThucHien DATETIME NOT NULL CONSTRAINT DF_ThanhToanHoanTien_NgayThucHien DEFAULT GETDATE()
  );
  EXEC('CREATE INDEX IX_ThanhToanHoanTien_MaThanhToan ON dbo.ThanhToanHoanTien(MaThanhToan)');
END;

COMMIT TRANSACTION;
