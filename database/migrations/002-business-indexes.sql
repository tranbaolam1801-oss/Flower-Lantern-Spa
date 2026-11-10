-- Existing columns only; SRS BR-UC3.1-03, BR-UC8.2-01, BR-UC9.1, BR-UC5.5-03.
CREATE UNIQUE INDEX UX_TaiKhoan_SoDienThoai ON dbo.TaiKhoan(SoDienThoai);
CREATE UNIQUE INDEX UX_KhachHang_SoDienThoai ON dbo.KhachHang(SoDienThoai);
CREATE UNIQUE INDEX UX_NhanVien_SoDienThoai ON dbo.NhanVien(SoDienThoai);
CREATE UNIQUE INDEX UX_NhanVien_Email ON dbo.NhanVien(Email) WHERE Email IS NOT NULL;
CREATE UNIQUE INDEX UX_DichVu_TenDichVu ON dbo.DichVu(TenDichVu);
CREATE UNIQUE INDEX UX_DanhGia_LichHen ON dbo.DanhGia(MaLichHen);
CREATE UNIQUE INDEX UX_PhanHoi_DanhGia ON dbo.PhanHoi(MaDanhGia);
-- This index is NOT an overlap constraint. Booking transaction locking is milestone 4.
CREATE INDEX IX_KhachSuDungDichVu_Giuong_ThoiGian
 ON dbo.KhachSuDungDichVu(MaGiuong,ThoiDiemBatDau,ThoiDiemKetThuc) INCLUDE(MaLichHen);
