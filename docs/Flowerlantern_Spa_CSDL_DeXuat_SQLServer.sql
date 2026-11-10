-- FLOWERLANTERN SPA / THIET KE CSDL DE XUAT TREN SQL SERVER
-- Can xac nhan co so du lieu su dung thuc te va mapping NhanVien-QuanLy.
-- QuanLy ke thua NhanVien: table-per-concrete-class => NhanVienThuong + QuanLy, khong co bang cha NhanVien.
-- BaoCao la view/truy van, khong la bang luu tru.

CREATE TABLE [TaiKhoan] (
    [MaTaiKhoan] CHAR(12) NOT NULL PRIMARY KEY,
    [TenDangNhap] VARCHAR(80) NULL,
    [SoDienThoai] VARCHAR(15) NOT NULL UNIQUE,
    [MatKhauBam] VARCHAR(255) NOT NULL,
    [VaiTro] NVARCHAR(30) NOT NULL,
    [QuyenTruyCap] NVARCHAR(500) NULL,
    [TrangThai] NVARCHAR(20) NOT NULL
);
GO

CREATE UNIQUE INDEX [UX_TaiKhoan_TenDangNhap_NotNull] ON [TaiKhoan]([TenDangNhap]) WHERE [TenDangNhap] IS NOT NULL;
GO

CREATE TABLE [KhachHang] (
    [MaKhachHang] CHAR(12) NOT NULL PRIMARY KEY,
    [MaTaiKhoan] CHAR(12) NULL,
    [HoTen] NVARCHAR(100) NOT NULL,
    [SoDienThoai] VARCHAR(15) NOT NULL,
    [NgaySinh] DATE NULL,
    [KenhLienHe] NVARCHAR(40) NULL,
    [GioiTinh] NVARCHAR(20) NULL,
    [DiaChi] NVARCHAR(255) NULL,
    [GhiChu] NVARCHAR(500) NULL,
    [NgayTao] DATETIME2 NOT NULL,
    CONSTRAINT [FK_KhachHang_MaTaiKhoan] FOREIGN KEY ([MaTaiKhoan]) REFERENCES [TaiKhoan]([MaTaiKhoan])
);
GO

CREATE UNIQUE INDEX [UX_KhachHang_MaTaiKhoan_NotNull] ON [KhachHang]([MaTaiKhoan]) WHERE [MaTaiKhoan] IS NOT NULL;
GO

CREATE TABLE [NhanVienThuong] (
    [MaNhanVien] CHAR(12) NOT NULL PRIMARY KEY,
    [MaTaiKhoan] CHAR(12) NOT NULL UNIQUE,
    [HoTen] NVARCHAR(100) NOT NULL,
    [SoDienThoai] VARCHAR(15) NOT NULL,
    [Email] VARCHAR(150) NULL,
    [GioiTinh] NVARCHAR(20) NULL,
    [NgaySinh] DATE NULL,
    [DiaChi] NVARCHAR(255) NULL,
    [GhiChu] NVARCHAR(500) NULL,
    [TrangThaiLamViec] NVARCHAR(30) NULL,
    [TrangThaiHoSo] NVARCHAR(30) NOT NULL,
    CONSTRAINT [FK_NhanVienThuong_MaTaiKhoan] FOREIGN KEY ([MaTaiKhoan]) REFERENCES [TaiKhoan]([MaTaiKhoan])
);
GO

CREATE TABLE [QuanLy] (
    [MaNhanVien] CHAR(12) NOT NULL PRIMARY KEY,
    [MaTaiKhoan] CHAR(12) NOT NULL UNIQUE,
    [HoTen] NVARCHAR(100) NOT NULL,
    [SoDienThoai] VARCHAR(15) NOT NULL,
    [Email] VARCHAR(150) NULL,
    [GioiTinh] NVARCHAR(20) NULL,
    [NgaySinh] DATE NULL,
    [DiaChi] NVARCHAR(255) NULL,
    [GhiChu] NVARCHAR(500) NULL,
    [TrangThaiLamViec] NVARCHAR(30) NULL,
    [TrangThaiHoSo] NVARCHAR(30) NOT NULL,
    CONSTRAINT [FK_QuanLy_MaTaiKhoan] FOREIGN KEY ([MaTaiKhoan]) REFERENCES [TaiKhoan]([MaTaiKhoan])
);
GO

CREATE TABLE [LichSuPhanQuyen] (
    [MaLichSu] CHAR(12) NOT NULL PRIMARY KEY,
    [MaTaiKhoanThucHien] CHAR(12) NOT NULL,
    [ThoiDiem] DATETIME2 NOT NULL,
    [NoiDungThayDoi] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [FK_LichSuPhanQuyen_MaTaiKhoanThucHien] FOREIGN KEY ([MaTaiKhoanThucHien]) REFERENCES [TaiKhoan]([MaTaiKhoan])
);
GO

CREATE TABLE [DanhMuc] (
    [MaDanhMuc] CHAR(12) NOT NULL PRIMARY KEY,
    [TenDanhMuc] NVARCHAR(100) NOT NULL UNIQUE,
    [TrangThai] NVARCHAR(30) NOT NULL
);
GO

CREATE TABLE [DichVu] (
    [MaDichVu] CHAR(12) NOT NULL PRIMARY KEY,
    [MaDanhMuc] CHAR(12) NOT NULL,
    [TenDichVu] NVARCHAR(150) NOT NULL UNIQUE,
    [HinhAnh] NVARCHAR(500) NULL,
    [MoTaNgan] NVARCHAR(500) NULL,
    [MoTaChiTiet] NVARCHAR(MAX) NULL,
    [LoiIch] NVARCHAR(MAX) NULL,
    [QuyTrinhThucHien] NVARCHAR(MAX) NULL,
    [DoiTuongPhuHop] NVARCHAR(MAX) NULL,
    [ThongTinLieuTrinhVaLuuY] NVARCHAR(MAX) NULL,
    [TrangThai] NVARCHAR(30) NOT NULL,
    CONSTRAINT [FK_DichVu_MaDanhMuc] FOREIGN KEY ([MaDanhMuc]) REFERENCES [DanhMuc]([MaDanhMuc])
);
GO

CREATE TABLE [GoiDichVu] (
    [MaGoi] CHAR(12) NOT NULL PRIMARY KEY,
    [MaDichVu] CHAR(12) NOT NULL,
    [TenGoi] NVARCHAR(100) NOT NULL,
    [ThoiLuong] INT NOT NULL CHECK ([ThoiLuong] > 0),
    [Gia] DECIMAL(18,0) NOT NULL CHECK ([Gia] > 0),
    CONSTRAINT [FK_GoiDichVu_MaDichVu] FOREIGN KEY ([MaDichVu]) REFERENCES [DichVu]([MaDichVu])
);
GO

CREATE TABLE [Giuong] (
    [MaGiuong] CHAR(8) NOT NULL PRIMARY KEY
);
GO

CREATE TABLE [LichHen] (
    [MaLichHen] CHAR(12) NOT NULL PRIMARY KEY,
    [MaKhachHang] CHAR(12) NULL,
    [HoTenNguoiDat] NVARCHAR(100) NOT NULL,
    [SoDienThoaiNguoiDat] VARCHAR(15) NOT NULL,
    [EmailNguoiDat] VARCHAR(150) NULL,
    [NguonDatLich] NVARCHAR(50) NULL,
    [GhiChu] NVARCHAR(500) NULL,
    [NgayHen] DATE NOT NULL,
    [GioHen] TIME(0) NOT NULL,
    [SoLuongKhach] INT NOT NULL CHECK ([SoLuongKhach] > 0),
    [ThoiGianDat] DATETIME2 NOT NULL,
    [TrangThaiLichHen] NVARCHAR(40) NOT NULL,
    [TrangThaiThanhToan] NVARCHAR(40) NOT NULL,
    CONSTRAINT [FK_LichHen_MaKhachHang] FOREIGN KEY ([MaKhachHang]) REFERENCES [KhachHang]([MaKhachHang])
);
GO

CREATE TABLE [KhachSuDungDichVu] (
    [MaChiTiet] CHAR(12) NOT NULL PRIMARY KEY,
    [MaLichHen] CHAR(12) NOT NULL,
    [MaGoi] CHAR(12) NOT NULL,
    [MaGiuong] CHAR(8) NULL,
    [TenKhach] NVARCHAR(100) NOT NULL,
    [SoDienThoai] VARCHAR(15) NULL,
    [KhungGio] NVARCHAR(60) NOT NULL,
    [ThoiDiemBatDau] DATETIME2 NOT NULL,
    [ThoiDiemKetThuc] DATETIME2 NOT NULL,
    CONSTRAINT [FK_KhachSuDungDichVu_MaLichHen] FOREIGN KEY ([MaLichHen]) REFERENCES [LichHen]([MaLichHen]),
    CONSTRAINT [FK_KhachSuDungDichVu_MaGoi] FOREIGN KEY ([MaGoi]) REFERENCES [GoiDichVu]([MaGoi]),
    CONSTRAINT [FK_KhachSuDungDichVu_MaGiuong] FOREIGN KEY ([MaGiuong]) REFERENCES [Giuong]([MaGiuong])
);
GO

CREATE TABLE [ThanhToan] (
    [MaThanhToan] CHAR(12) NOT NULL PRIMARY KEY,
    [MaLichHen] CHAR(12) NOT NULL,
    [SoTienThanhToan] DECIMAL(18,0) NOT NULL CHECK ([SoTienThanhToan] >= 0),
    [NgayGhiNhan] DATETIME2 NOT NULL,
    [TrangThaiGiaoDich] NVARCHAR(40) NOT NULL,
    [KhoanHoanTien] DECIMAL(18,0) NOT NULL CHECK ([KhoanHoanTien] >= 0),
    [PhuongThucThanhToan] NVARCHAR(30) NULL,
    CONSTRAINT [FK_ThanhToan_MaLichHen] FOREIGN KEY ([MaLichHen]) REFERENCES [LichHen]([MaLichHen])
);
GO

CREATE TABLE [DanhGia] (
    [MaDanhGia] CHAR(12) NOT NULL PRIMARY KEY,
    [MaLichHen] CHAR(12) NOT NULL UNIQUE,
    [MaKhachHang] CHAR(12) NOT NULL,
    [MaDichVu] CHAR(12) NOT NULL,
    [SoSao] TINYINT NOT NULL CHECK ([SoSao] BETWEEN 1 AND 5),
    [NoiDungDanhGia] NVARCHAR(1000) NULL,
    [NgayDanhGia] DATETIME2 NOT NULL,
    [TrangThaiPhanHoi] NVARCHAR(30) NOT NULL,
    CONSTRAINT [FK_DanhGia_MaLichHen] FOREIGN KEY ([MaLichHen]) REFERENCES [LichHen]([MaLichHen]),
    CONSTRAINT [FK_DanhGia_MaKhachHang] FOREIGN KEY ([MaKhachHang]) REFERENCES [KhachHang]([MaKhachHang]),
    CONSTRAINT [FK_DanhGia_MaDichVu] FOREIGN KEY ([MaDichVu]) REFERENCES [DichVu]([MaDichVu])
);
GO

CREATE TABLE [PhanHoi] (
    [MaPhanHoi] CHAR(12) NOT NULL PRIMARY KEY,
    [MaDanhGia] CHAR(12) NOT NULL UNIQUE,
    [MaTaiKhoanThucHien] CHAR(12) NOT NULL,
    [NoiDungPhanHoi] NVARCHAR(1000) NOT NULL,
    [NgayPhanHoi] DATETIME2 NOT NULL,
    CONSTRAINT [FK_PhanHoi_MaDanhGia] FOREIGN KEY ([MaDanhGia]) REFERENCES [DanhGia]([MaDanhGia]),
    CONSTRAINT [FK_PhanHoi_MaTaiKhoanThucHien] FOREIGN KEY ([MaTaiKhoanThucHien]) REFERENCES [TaiKhoan]([MaTaiKhoan])
);
GO

-- Kiểm tra trùng giường theo khoảng [ThoiDiemBatDau, ThoiDiemKetThuc) phải thực hiện trong transaction có khóa.
CREATE INDEX [IX_KhachSuDungDichVu_Giuong_ThoiGian] ON [KhachSuDungDichVu]([MaGiuong],[ThoiDiemBatDau],[ThoiDiemKetThuc]);
GO
-- Báo cáo được tính động theo BR-UC10.3-01/02/03.
CREATE VIEW [BaoCaoDoanhThuTheoNgay] AS
SELECT CAST(NgayGhiNhan AS DATE) AS Ngay,
       SUM(SoTienThanhToan - KhoanHoanTien) AS DoanhThuThuan
FROM ThanhToan
WHERE TrangThaiGiaoDich = N'Thành công'
GROUP BY CAST(NgayGhiNhan AS DATE);
GO
CREATE VIEW [BaoCaoLuotDatDichVu] AS
SELECT d.MaDichVu, d.TenDichVu, COUNT_BIG(*) AS SoLuotDat
FROM KhachSuDungDichVu ct
JOIN GoiDichVu g ON ct.MaGoi = g.MaGoi
JOIN DichVu d ON g.MaDichVu = d.MaDichVu
JOIN LichHen l ON ct.MaLichHen = l.MaLichHen
GROUP BY d.MaDichVu, d.TenDichVu;
GO
CREATE VIEW [BaoCaoKhachHang] AS
SELECT k.MaKhachHang, k.HoTen, COUNT_BIG(l.MaLichHen) AS SoLanDat
FROM KhachHang k LEFT JOIN LichHen l ON k.MaKhachHang = l.MaKhachHang
GROUP BY k.MaKhachHang, k.HoTen;
GO
-- Chú ý: giới hạn khoảng ngày, trạng thái đơn và điều kiện không trùng giường phải áp dụng ở tầng nghiệp vụ.