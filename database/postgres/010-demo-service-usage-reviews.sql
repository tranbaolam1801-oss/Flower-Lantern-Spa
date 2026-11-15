-- Flower Lantern Spa — DEMO data: customers who used services + their reviews (replied and not replied).
-- Additive and idempotent (safe to run twice). Every row is marked "DỮ LIỆU DEMO" in its note field so it can be found and removed.
-- Uses only EXISTING services/packages/beds/employees (GV00000003..12, G1..G8, NV00000005/NV00000006); it never changes existing rows.
--   10 completed + paid bookings of 8 demo customers (KH00000101..108), 8 reviews:
--   5 reviews WITH a staff reply (DG..101-105) and 3 reviews WITHOUT a reply (DG..106-108); 2 completed bookings have no review yet.
-- Remove later: see 010-demo-service-usage-reviews.rollback.sql
BEGIN;

CREATE TEMP TABLE _demo (n int, kh char(10), goi char(10), ngay date, gio time, giuong char(10), sao int, nhanxet text, phanhoi text, nv char(10)) ON COMMIT DROP;
INSERT INTO _demo VALUES
 (1,'KH00000101','GV00000003','2026-11-02','10:00','G1',5,'Massage đá nóng rất thư giãn, kỹ thuật viên nhẹ nhàng và chu đáo.','Cảm ơn chị đã tin tưởng Flower Lantern Spa! Rất mong được đón chị lần sau.','NV00000005'),
 (2,'KH00000102','GV00000005','2026-11-03','14:00','G2',4,'Massage chân dễ chịu, không gian sạch sẽ và thơm dịu.','Cảm ơn anh đã góp ý, chúng tôi sẽ tiếp tục giữ không gian thật thoải mái.','NV00000006'),
 (3,'KH00000103','GV00000009','2026-11-04','09:30','G3',5,'Da mịn hơn rõ rệt sau liệu trình, nhân viên tư vấn rất tận tâm.','Spa rất vui vì chị hài lòng với kết quả. Hẹn gặp lại chị!','NV00000005'),
 (4,'KH00000104','GV00000011','2026-11-05','16:00','G4',3,'Gội đầu dưỡng sinh ổn nhưng mình phải chờ hơi lâu.','Xin lỗi bạn vì thời gian chờ. Chúng tôi đã sắp xếp lại ca làm để phục vụ nhanh hơn.','NV00000006'),
 (5,'KH00000105','GV00000012','2026-11-06','19:00','G5',5,'Body thảo dược thơm, thư giãn tuyệt vời, rất đáng thử.','Cảm ơn bạn! Chúc bạn luôn khỏe và hẹn gặp lại.','NV00000005'),
 (6,'KH00000106','GV00000004','2026-11-08','11:00','G6',4,'Đá nóng ấm vừa phải, nhân viên chu đáo.',NULL,NULL),
 (7,'KH00000107','GV00000006','2026-11-09','15:30','G7',5,'Massage chân tuyệt vời, chắc chắn sẽ quay lại.',NULL,NULL),
 (8,'KH00000108','GV00000010','2026-11-10','10:30','G8',2,'Liệu trình da hơi mạnh tay, mong spa cải thiện.',NULL,NULL),
 (9,'KH00000101','GV00000006','2026-11-11','17:00','G1',NULL,NULL,NULL,NULL),
 (10,'KH00000103','GV00000011','2026-11-12','13:00','G2',NULL,NULL,NULL,NULL);

-- customers (demo phones 09099000xx)
INSERT INTO dbo.KhachHang(MaKhachHang, HoTen, SoDienThoai, KenhLienHe, GhiChu)
SELECT v.id, v.ten, v.sdt, v.kenh, 'DỮ LIỆU DEMO'
FROM (VALUES
 ('KH00000101','Lê Thu Hà','0909900101','Website'),('KH00000102','Phạm Quốc Bảo','0909900102','Zalo'),
 ('KH00000103','Võ Ngọc Lan','0909900103','Facebook'),('KH00000104','Đặng Minh Châu','0909900104','Website'),
 ('KH00000105','Bùi Thanh Tâm','0909900105','Trực tiếp'),('KH00000106','Hồ Gia Linh','0909900106','Website'),
 ('KH00000107','Trương Anh Thư','0909900107','Zalo'),('KH00000108','Ngô Khánh Vy','0909900108','Facebook')) AS v(id, ten, sdt, kenh)
WHERE NOT EXISTS (SELECT 1 FROM dbo.KhachHang k WHERE k.MaKhachHang = v.id OR k.SoDienThoai = v.sdt);

-- completed bookings (+ one service line each) and their payments
INSERT INTO dbo.LichHen(MaLichHen, MaKhachHang, HoTenNguoiDat, SoDienThoaiNguoiDat, GhiChu, NgayHen, GioHen, ThoiGianDat, TrangThaiLichHen, TrangThaiThanhToan)
SELECT 'LH9000' || lpad(d.n::text, 4, '0'), d.kh, k.HoTen, k.SoDienThoai, 'DỮ LIỆU DEMO', d.ngay, d.gio, (d.ngay - 1)::timestamp + time '20:00', 'Hoàn thành', 'Đã thanh toán'
FROM _demo d JOIN dbo.KhachHang k ON k.MaKhachHang = d.kh
WHERE EXISTS (SELECT 1 FROM dbo.GoiDichVu g WHERE g.MaGoi = d.goi) AND EXISTS (SELECT 1 FROM dbo.Giuong b WHERE b.MaGiuong = d.giuong)
  AND NOT EXISTS (SELECT 1 FROM dbo.LichHen l WHERE l.MaLichHen = 'LH9000' || lpad(d.n::text, 4, '0'));

INSERT INTO dbo.KhachSuDungDichVu(MaChiTiet, MaLichHen, MaGoi, MaGiuong, TenKhach, SoDienThoai, ThoiDiemBatDau, ThoiDiemKetThuc)
SELECT 'CT9000' || lpad(d.n::text, 4, '0'), 'LH9000' || lpad(d.n::text, 4, '0'), d.goi, d.giuong, k.HoTen, k.SoDienThoai,
       d.ngay + d.gio, d.ngay + d.gio + make_interval(mins => g.ThoiLuong)
FROM _demo d JOIN dbo.KhachHang k ON k.MaKhachHang = d.kh JOIN dbo.GoiDichVu g ON g.MaGoi = d.goi
WHERE EXISTS (SELECT 1 FROM dbo.LichHen l WHERE l.MaLichHen = 'LH9000' || lpad(d.n::text, 4, '0'))
  AND NOT EXISTS (SELECT 1 FROM dbo.KhachSuDungDichVu c WHERE c.MaChiTiet = 'CT9000' || lpad(d.n::text, 4, '0'));

INSERT INTO dbo.ThanhToan(MaThanhToan, MaLichHen, SoTienThanhToan, NgayGhiNhan, TrangThaiGiaoDich)
SELECT 'TT9000' || lpad(d.n::text, 4, '0'), 'LH9000' || lpad(d.n::text, 4, '0'), g.Gia, d.ngay + d.gio + make_interval(mins => g.ThoiLuong), 'Thành công'
FROM _demo d JOIN dbo.GoiDichVu g ON g.MaGoi = d.goi
WHERE EXISTS (SELECT 1 FROM dbo.LichHen l WHERE l.MaLichHen = 'LH9000' || lpad(d.n::text, 4, '0'))
  AND NOT EXISTS (SELECT 1 FROM dbo.ThanhToan t WHERE t.MaThanhToan = 'TT9000' || lpad(d.n::text, 4, '0'));

-- reviews (customer-side) and staff replies
INSERT INTO dbo.DanhGia(MaDanhGia, MaLichHen, MaKhachHang, MaDichVu, SoSao, NoiDungDanhGia, NgayDanhGia)
SELECT 'DG9000' || lpad(d.n::text, 4, '0'), 'LH9000' || lpad(d.n::text, 4, '0'), d.kh, g.MaDichVu, d.sao, d.nhanxet,
       d.ngay + d.gio + make_interval(mins => g.ThoiLuong + 60)
FROM _demo d JOIN dbo.GoiDichVu g ON g.MaGoi = d.goi
WHERE d.sao IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.LichHen l WHERE l.MaLichHen = 'LH9000' || lpad(d.n::text, 4, '0'))
  AND NOT EXISTS (SELECT 1 FROM dbo.DanhGia x WHERE x.MaLichHen = 'LH9000' || lpad(d.n::text, 4, '0'));

INSERT INTO dbo.PhanHoi(MaPhanHoi, MaDanhGia, MaNhanVien, NoiDungPhanHoi, NgayPhanHoi)
SELECT 'PH9000' || lpad(d.n::text, 4, '0'), x.MaDanhGia, d.nv, d.phanhoi, (d.ngay + 1)::timestamp + time '09:00'
FROM _demo d JOIN dbo.DanhGia x ON x.MaLichHen = 'LH9000' || lpad(d.n::text, 4, '0')
WHERE d.phanhoi IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.NhanVien n WHERE n.MaNhanVien = d.nv)
  AND NOT EXISTS (SELECT 1 FROM dbo.PhanHoi p WHERE p.MaDanhGia = x.MaDanhGia);

COMMIT;
