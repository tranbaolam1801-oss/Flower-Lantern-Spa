-- Removes ONLY the demo rows created by 010-demo-service-usage-reviews.sql (ids LH9000xxxx/CT/TT/DG/PH9000xxxx and KH00000101..108 marked "DỮ LIỆU DEMO").
BEGIN;
DELETE FROM dbo.PhanHoi WHERE MaPhanHoi LIKE 'PH9000____';
DELETE FROM dbo.DanhGia WHERE MaDanhGia LIKE 'DG9000____';
DELETE FROM dbo.ThanhToan WHERE MaThanhToan LIKE 'TT9000____' AND MaLichHen LIKE 'LH9000____';
DELETE FROM dbo.KhachSuDungDichVu WHERE MaChiTiet LIKE 'CT9000____' AND MaLichHen LIKE 'LH9000____';
DELETE FROM dbo.LichHen WHERE MaLichHen LIKE 'LH9000____' AND GhiChu = 'DỮ LIỆU DEMO';
DELETE FROM dbo.KhachHang WHERE MaKhachHang BETWEEN 'KH00000101' AND 'KH00000108' AND GhiChu = 'DỮ LIỆU DEMO';
COMMIT;
