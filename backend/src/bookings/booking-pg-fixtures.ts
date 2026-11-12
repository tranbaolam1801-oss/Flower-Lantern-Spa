/** Shared fixtures for the real-PostgreSQL booking specs (not a spec itself). */
export const FIXTURE_SQL = `
  INSERT INTO dbo.DanhMuc(MaDanhMuc,TenDanhMuc,TrangThai) VALUES ('DM01','Massage','Hoạt động');
  INSERT INTO dbo.DichVu(MaDichVu,MaDanhMuc,TenDichVu,TrangThai) VALUES ('DV01','DM01','Massage thư giãn','Hoạt động'),('DV02','DM01','Dịch vụ ngừng','Ngừng hoạt động');
  INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia) VALUES ('GO60','DV01','Gói 60 phút',60,300000),('GO90','DV01','Gói 90 phút',90,450000),('GOOFF','DV02','Gói ngừng',60,100000);
  INSERT INTO dbo.TaiKhoan(MaTaiKhoan,TenDangNhap,SoDienThoai,MatKhauBam,VaiTro,TrangThai) VALUES
    ('TK01','khach1','0900000001','x','Khách hàng','Hoạt động'),('TK02','khach2','0900000002','x','Khách hàng','Hoạt động');
  INSERT INTO dbo.KhachHang(MaKhachHang,MaTaiKhoan,HoTen,SoDienThoai) VALUES
    ('KH01','TK01','Nguyễn Lan','0900000001'),('KH02','TK02','Trần Mai','0900000002');
`;

export const NOW = '2026-11-12T10:00:00';
export const DAY = '2026-11-13';
export const CONFLICT = 'Giường đã có lịch tại khung giờ này. Vui lòng chọn giường hoặc thời gian khác!';
export const guest = (over: Record<string, unknown> = {}) => ({ customerName: 'Khách A', bedId: 'G1', packageId: 'GO60', startsAt: `${DAY}T09:00:00`, ...over });
export const adminDto = (over: Record<string, unknown> = {}) => ({ bookerName: 'Nguyễn Lan', bookerPhone: '0900000001', date: DAY, guests: [guest()], ...over });
