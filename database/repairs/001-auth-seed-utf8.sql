-- Repair only exact mojibake values from synthetic 002-auth-baseline seed.
-- Run: sqlcmd -b -I -f 65001 -S localhost -E -d FlowerLanternSpa_Dev -i database/repairs/001-auth-seed-utf8.sql
SET NOCOUNT ON; SET XACT_ABORT ON; SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON;
IF DB_NAME() <> 'FlowerLanternSpa_Dev' THROW 51000, 'Development database only', 1;
BEGIN TRY
BEGIN TRANSACTION;
UPDATE dbo.TaiKhoan SET VaiTro=N'Chủ Spa' WHERE MaTaiKhoan='TK00000001' AND VaiTro COLLATE Latin1_General_100_BIN2=N'Chá»§ Spa';
UPDATE dbo.TaiKhoan SET VaiTro=N'Quản lý' WHERE MaTaiKhoan='TK00000002' AND VaiTro COLLATE Latin1_General_100_BIN2=N'Quáº£n lÃ½';
UPDATE dbo.TaiKhoan SET VaiTro=N'Nhân viên' WHERE MaTaiKhoan='TK00000003' AND VaiTro COLLATE Latin1_General_100_BIN2=N'NhÃ¢n viÃªn';
UPDATE dbo.TaiKhoan SET VaiTro=N'Khách hàng' WHERE MaTaiKhoan='TK00000004' AND VaiTro COLLATE Latin1_General_100_BIN2=N'KhÃ¡ch hÃ ng';
UPDATE dbo.TaiKhoan SET VaiTro=N'Nhân viên' WHERE MaTaiKhoan='TK00000005' AND VaiTro COLLATE Latin1_General_100_BIN2=N'NhÃ¢n viÃªn';
UPDATE dbo.NhanVien SET HoTen=N'Nguyễn Văn Chủ' WHERE MaNhanVien='NV00000001' AND HoTen COLLATE Latin1_General_100_BIN2=N'Nguyá»…n VÄƒn Chá»§';
UPDATE dbo.NhanVien SET HoTen=N'Trần Thị Quản Lý' WHERE MaNhanVien='NV00000002' AND HoTen COLLATE Latin1_General_100_BIN2=N'Tráº§n Thá»‹ Quáº£n LÃ½';
UPDATE dbo.NhanVien SET HoTen=N'Lê Thị Nhân Viên' WHERE MaNhanVien='NV00000003' AND HoTen COLLATE Latin1_General_100_BIN2=N'LÃª Thá»‹ NhÃ¢n ViÃªn';
UPDATE dbo.KhachHang SET HoTen=N'Phạm Thị Khách' WHERE MaKhachHang='KH00000001' AND HoTen COLLATE Latin1_General_100_BIN2=N'Pháº¡m Thá»‹ KhÃ¡ch';
UPDATE dbo.Quyen SET TenQuyen=N'Quản lý lịch hẹn' WHERE MaQuyen='Q01' AND TenQuyen COLLATE Latin1_General_100_BIN2=N'Quáº£n lÃ½ lá»‹ch háº¹n';
UPDATE dbo.Quyen SET TenQuyen=N'Quản lý khách hàng' WHERE MaQuyen='Q02' AND TenQuyen COLLATE Latin1_General_100_BIN2=N'Quáº£n lÃ½ khÃ¡ch hÃ ng';
UPDATE dbo.Quyen SET TenQuyen=N'Quản lý đánh giá và phản hồi' WHERE MaQuyen='Q03' AND TenQuyen COLLATE Latin1_General_100_BIN2=N'Quáº£n lÃ½ Ä‘Ã¡nh giÃ¡ vÃ  pháº£n há»“i';
UPDATE dbo.Quyen SET TenQuyen=N'Quản lý dịch vụ' WHERE MaQuyen='Q04' AND TenQuyen COLLATE Latin1_General_100_BIN2=N'Quáº£n lÃ½ dá»‹ch vá»¥';
UPDATE dbo.Quyen SET TenQuyen=N'Quản lý nhân viên' WHERE MaQuyen='Q05' AND TenQuyen COLLATE Latin1_General_100_BIN2=N'Quáº£n lÃ½ nhÃ¢n viÃªn';
UPDATE dbo.Quyen SET TenQuyen=N'Xem báo cáo thống kê' WHERE MaQuyen='Q06' AND TenQuyen COLLATE Latin1_General_100_BIN2=N'Xem bÃ¡o cÃ¡o thá»‘ng kÃª';
UPDATE dbo.TaiKhoan SET TrangThai=N'Hoạt động' WHERE MaTaiKhoan='TK00000001' AND TrangThai COLLATE Latin1_General_100_BIN2=N'Hoáº¡t Ä‘á»™ng';
UPDATE dbo.TaiKhoan SET TrangThai=N'Hoạt động' WHERE MaTaiKhoan='TK00000002' AND TrangThai COLLATE Latin1_General_100_BIN2=N'Hoáº¡t Ä‘á»™ng';
UPDATE dbo.TaiKhoan SET TrangThai=N'Hoạt động' WHERE MaTaiKhoan='TK00000003' AND TrangThai COLLATE Latin1_General_100_BIN2=N'Hoáº¡t Ä‘á»™ng';
UPDATE dbo.TaiKhoan SET TrangThai=N'Hoạt động' WHERE MaTaiKhoan='TK00000004' AND TrangThai COLLATE Latin1_General_100_BIN2=N'Hoáº¡t Ä‘á»™ng';
UPDATE dbo.TaiKhoan SET TrangThai=N'Đã khóa' WHERE MaTaiKhoan='TK00000005' AND TrangThai COLLATE Latin1_General_100_BIN2=N'ÄÃ£ khÃ³a';
UPDATE dbo.NhanVien SET TrangThaiLamViec=N'Đang làm việc' WHERE MaNhanVien='NV00000001' AND TrangThaiLamViec COLLATE Latin1_General_100_BIN2=N'Äang lÃ m viá»‡c';
UPDATE dbo.NhanVien SET TrangThaiHoSo=N'Hoạt động' WHERE MaNhanVien='NV00000001' AND TrangThaiHoSo COLLATE Latin1_General_100_BIN2=N'Hoáº¡t Ä‘á»™ng';
UPDATE dbo.NhanVien SET TrangThaiLamViec=N'Đang làm việc' WHERE MaNhanVien='NV00000002' AND TrangThaiLamViec COLLATE Latin1_General_100_BIN2=N'Äang lÃ m viá»‡c';
UPDATE dbo.NhanVien SET TrangThaiHoSo=N'Hoạt động' WHERE MaNhanVien='NV00000002' AND TrangThaiHoSo COLLATE Latin1_General_100_BIN2=N'Hoáº¡t Ä‘á»™ng';
UPDATE dbo.NhanVien SET TrangThaiLamViec=N'Đang làm việc' WHERE MaNhanVien='NV00000003' AND TrangThaiLamViec COLLATE Latin1_General_100_BIN2=N'Äang lÃ m viá»‡c';
UPDATE dbo.NhanVien SET TrangThaiHoSo=N'Hoạt động' WHERE MaNhanVien='NV00000003' AND TrangThaiHoSo COLLATE Latin1_General_100_BIN2=N'Hoáº¡t Ä‘á»™ng';
COMMIT;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 ROLLBACK;
THROW;
END CATCH;
