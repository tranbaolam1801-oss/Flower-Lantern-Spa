-- 002-auth-baseline.sql
-- Seed initial permissions and accounts for development and testing.
-- Idempotent: checks for existence before inserting.
-- UTF-8 REQUIRED: sqlcmd -b -I -f 65001 -S localhost -E -d FlowerLanternSpa_Dev -i database/seeds/002-auth-baseline.sql

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;

-- 1. Permissions (dbo.Quyen)
IF NOT EXISTS (SELECT 1 FROM dbo.Quyen WHERE MaQuyen = 'Q01')
    INSERT dbo.Quyen (MaQuyen, TenQuyen) VALUES ('Q01', N'Quản lý lịch hẹn');

IF NOT EXISTS (SELECT 1 FROM dbo.Quyen WHERE MaQuyen = 'Q02')
    INSERT dbo.Quyen (MaQuyen, TenQuyen) VALUES ('Q02', N'Quản lý khách hàng');

IF NOT EXISTS (SELECT 1 FROM dbo.Quyen WHERE MaQuyen = 'Q03')
    INSERT dbo.Quyen (MaQuyen, TenQuyen) VALUES ('Q03', N'Quản lý đánh giá và phản hồi');

IF NOT EXISTS (SELECT 1 FROM dbo.Quyen WHERE MaQuyen = 'Q04')
    INSERT dbo.Quyen (MaQuyen, TenQuyen) VALUES ('Q04', N'Quản lý dịch vụ');

IF NOT EXISTS (SELECT 1 FROM dbo.Quyen WHERE MaQuyen = 'Q05')
    INSERT dbo.Quyen (MaQuyen, TenQuyen) VALUES ('Q05', N'Quản lý nhân viên');

IF NOT EXISTS (SELECT 1 FROM dbo.Quyen WHERE MaQuyen = 'Q06')
    INSERT dbo.Quyen (MaQuyen, TenQuyen) VALUES ('Q06', N'Xem báo cáo thống kê');

-- Default dev password: 'Spa@123456'
-- Argon2id hash: $argon2id$v=19$m=65536,t=3,p=4$PnHHRiht30GW/eOzd80+Og$dQ8yIi/VLnX/3J4hEwSvktt0dyZcx0s4ioxU89oTeig

-- 2. Accounts (dbo.TaiKhoan)
IF NOT EXISTS (SELECT 1 FROM dbo.TaiKhoan WHERE MaTaiKhoan = 'TK00000001')
    INSERT dbo.TaiKhoan (MaTaiKhoan, TenDangNhap, SoDienThoai, MatKhauBam, VaiTro, TrangThai)
    VALUES ('TK00000001', 'admin', '0900000001', '$argon2id$v=19$m=65536,t=3,p=4$PnHHRiht30GW/eOzd80+Og$dQ8yIi/VLnX/3J4hEwSvktt0dyZcx0s4ioxU89oTeig', N'Chủ Spa', N'Hoạt động');

IF NOT EXISTS (SELECT 1 FROM dbo.TaiKhoan WHERE MaTaiKhoan = 'TK00000002')
    INSERT dbo.TaiKhoan (MaTaiKhoan, TenDangNhap, SoDienThoai, MatKhauBam, VaiTro, TrangThai)
    VALUES ('TK00000002', 'quanly', '0900000002', '$argon2id$v=19$m=65536,t=3,p=4$PnHHRiht30GW/eOzd80+Og$dQ8yIi/VLnX/3J4hEwSvktt0dyZcx0s4ioxU89oTeig', N'Quản lý', N'Hoạt động');

IF NOT EXISTS (SELECT 1 FROM dbo.TaiKhoan WHERE MaTaiKhoan = 'TK00000003')
    INSERT dbo.TaiKhoan (MaTaiKhoan, TenDangNhap, SoDienThoai, MatKhauBam, VaiTro, TrangThai)
    VALUES ('TK00000003', 'nhanvien', '0900000003', '$argon2id$v=19$m=65536,t=3,p=4$PnHHRiht30GW/eOzd80+Og$dQ8yIi/VLnX/3J4hEwSvktt0dyZcx0s4ioxU89oTeig', N'Nhân viên', N'Hoạt động');

IF NOT EXISTS (SELECT 1 FROM dbo.TaiKhoan WHERE MaTaiKhoan = 'TK00000004')
    INSERT dbo.TaiKhoan (MaTaiKhoan, TenDangNhap, SoDienThoai, MatKhauBam, VaiTro, TrangThai)
    VALUES ('TK00000004', 'khachhang', '0900000004', '$argon2id$v=19$m=65536,t=3,p=4$PnHHRiht30GW/eOzd80+Og$dQ8yIi/VLnX/3J4hEwSvktt0dyZcx0s4ioxU89oTeig', N'Khách hàng', N'Hoạt động');

IF NOT EXISTS (SELECT 1 FROM dbo.TaiKhoan WHERE MaTaiKhoan = 'TK00000005')
    INSERT dbo.TaiKhoan (MaTaiKhoan, TenDangNhap, SoDienThoai, MatKhauBam, VaiTro, TrangThai)
    VALUES ('TK00000005', 'khoa', '0900000005', '$argon2id$v=19$m=65536,t=3,p=4$PnHHRiht30GW/eOzd80+Og$dQ8yIi/VLnX/3J4hEwSvktt0dyZcx0s4ioxU89oTeig', N'Nhân viên', N'Đã khóa');

-- 3. Staff records (dbo.NhanVien)
IF NOT EXISTS (SELECT 1 FROM dbo.NhanVien WHERE MaNhanVien = 'NV00000001')
    INSERT dbo.NhanVien (MaNhanVien, MaTaiKhoan, HoTen, SoDienThoai, Email, TrangThaiLamViec, TrangThaiHoSo)
    VALUES ('NV00000001', 'TK00000001', N'Nguyễn Văn Chủ', '0900000001', 'admin@flowerlanternspa.vn', N'Đang làm việc', N'Hoạt động');

IF NOT EXISTS (SELECT 1 FROM dbo.NhanVien WHERE MaNhanVien = 'NV00000002')
    INSERT dbo.NhanVien (MaNhanVien, MaTaiKhoan, HoTen, SoDienThoai, Email, TrangThaiLamViec, TrangThaiHoSo)
    VALUES ('NV00000002', 'TK00000002', N'Trần Thị Quản Lý', '0900000002', 'quanly@flowerlanternspa.vn', N'Đang làm việc', N'Hoạt động');

IF NOT EXISTS (SELECT 1 FROM dbo.NhanVien WHERE MaNhanVien = 'NV00000003')
    INSERT dbo.NhanVien (MaNhanVien, MaTaiKhoan, HoTen, SoDienThoai, Email, TrangThaiLamViec, TrangThaiHoSo)
    VALUES ('NV00000003', 'TK00000003', N'Lê Thị Nhân Viên', '0900000003', 'nhanvien@flowerlanternspa.vn', N'Đang làm việc', N'Hoạt động');

-- 4. Customer records (dbo.KhachHang)
IF NOT EXISTS (SELECT 1 FROM dbo.KhachHang WHERE MaKhachHang = 'KH00000001')
    INSERT dbo.KhachHang (MaKhachHang, MaTaiKhoan, HoTen, SoDienThoai)
    VALUES ('KH00000001', 'TK00000004', N'Phạm Thị Khách', '0900000004');

-- 5. Permission assignments (dbo.TaiKhoanQuyen)
-- Admin: all permissions Q01..Q06
INSERT INTO dbo.TaiKhoanQuyen (MaTaiKhoan, MaQuyen)
SELECT 'TK00000001', q.MaQuyen FROM dbo.Quyen q
WHERE NOT EXISTS (SELECT 1 FROM dbo.TaiKhoanQuyen tq WHERE tq.MaTaiKhoan = 'TK00000001' AND tq.MaQuyen = q.MaQuyen);

-- Manager: Q01, Q02, Q03, Q04, Q06
INSERT INTO dbo.TaiKhoanQuyen (MaTaiKhoan, MaQuyen)
SELECT 'TK00000002', q.MaQuyen FROM dbo.Quyen q
WHERE q.MaQuyen IN ('Q01', 'Q02', 'Q03', 'Q04', 'Q06')
  AND NOT EXISTS (SELECT 1 FROM dbo.TaiKhoanQuyen tq WHERE tq.MaTaiKhoan = 'TK00000002' AND tq.MaQuyen = q.MaQuyen);

-- Staff: Q01, Q02
INSERT INTO dbo.TaiKhoanQuyen (MaTaiKhoan, MaQuyen)
SELECT 'TK00000003', q.MaQuyen FROM dbo.Quyen q
WHERE q.MaQuyen IN ('Q01', 'Q02')
  AND NOT EXISTS (SELECT 1 FROM dbo.TaiKhoanQuyen tq WHERE tq.MaTaiKhoan = 'TK00000003' AND tq.MaQuyen = q.MaQuyen);
