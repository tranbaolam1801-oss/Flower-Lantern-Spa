-- 003-auth-lockout.sql
-- Mục đích: Bổ sung bảng kiểm soát đăng nhập tạm khóa (persistent lockout) và chuyển đổi ràng buộc UNIQUE cho MaTaiKhoan sang filtered unique index (xử lý Q06).
-- Tính tương thích: Giữ nguyên 100% 15 bảng nghiệp vụ gốc của SRS 7.2; không xóa bảng, không đổi tên cột, không xóa dữ liệu.
-- Tính lũy biến (idempotent): An toàn khi chạy lại nhiều lần nhờ kiểm tra tồn tại trước khi thao tác.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

-- 1. Bổ sung bảng kiểm soát tạm khóa đăng nhập persistent (SRS BR-UC1-02, NFR-05, Ngoại lệ 5a.3)
-- Lưu số lần nhập sai liên tiếp và thời điểm tạm khóa 15 phút theo số điện thoại đăng nhập.
IF OBJECT_ID('dbo.KhoaDangNhap', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.KhoaDangNhap (
        SoDienThoai VARCHAR(15) NOT NULL PRIMARY KEY,
        SoLanSai INT NOT NULL DEFAULT 0,
        ThoiDiemKhoaDen DATETIME NULL,
        LanCuoiSai DATETIME NULL
    );
END;

-- 2. Xử lý điểm bất cập Q06 đối với bảng dbo.KhachHang:
-- Ràng buộc UNIQUE chuẩn trên SQL Server chỉ cho phép tối đa một giá trị NULL. Khi khách hàng vãng lai (offline)
-- thứ hai được tạo mà chưa có tài khoản (MaTaiKhoan = NULL), SQL Server sẽ báo lỗi vi phạm UQ.
-- Giải pháp an toàn chuẩn T-SQL: Chuyển sang Filtered Unique Index chỉ áp dụng khi MaTaiKhoan IS NOT NULL.
DECLARE @KhConstraintName NVARCHAR(200);
SELECT @KhConstraintName = kc.name
FROM sys.key_constraints kc
JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE kc.parent_object_id = OBJECT_ID('dbo.KhachHang') 
  AND kc.type = 'UQ' 
  AND c.name = 'MaTaiKhoan';

IF @KhConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE dbo.KhachHang DROP CONSTRAINT [' + @KhConstraintName + '];');
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_KhachHang_MaTaiKhoan' AND object_id = OBJECT_ID('dbo.KhachHang'))
BEGIN
    CREATE UNIQUE INDEX UX_KhachHang_MaTaiKhoan 
    ON dbo.KhachHang(MaTaiKhoan) 
    WHERE MaTaiKhoan IS NOT NULL;
END;

-- 3. Xử lý đồng bộ cho dbo.NhanVien:
-- Cho phép hồ sơ nhân viên được tạo trước khi tài khoản được cấp hoặc kích hoạt (MaTaiKhoan IS NOT NULL).
DECLARE @NvConstraintName NVARCHAR(200);
SELECT @NvConstraintName = kc.name
FROM sys.key_constraints kc
JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE kc.parent_object_id = OBJECT_ID('dbo.NhanVien') 
  AND kc.type = 'UQ' 
  AND c.name = 'MaTaiKhoan';

IF @NvConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE dbo.NhanVien DROP CONSTRAINT [' + @NvConstraintName + '];');
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_NhanVien_MaTaiKhoan' AND object_id = OBJECT_ID('dbo.NhanVien'))
BEGIN
    CREATE UNIQUE INDEX UX_NhanVien_MaTaiKhoan 
    ON dbo.NhanVien(MaTaiKhoan) 
    WHERE MaTaiKhoan IS NOT NULL;
END;
