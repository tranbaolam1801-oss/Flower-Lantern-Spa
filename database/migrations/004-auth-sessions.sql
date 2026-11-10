-- PROPOSED ONLY. User approval required before applying.
-- Additive technical table; no change to the approved 15 business tables.
-- Store session identifiers, never passwords, JWT values or token secrets.
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
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
