-- Flower Lantern Spa — DEMO sample catalog for PostgreSQL (5 categories, 8 services, 13 packages).
-- Ported from database/seeds/PROPOSED-010-sample-catalog.sql. PRICES ARE PLACEHOLDERS (whole VND) — the owner must confirm.
-- Idempotent (ON CONFLICT DO NOTHING / WHERE NOT EXISTS), single transaction. NOT EXECUTED anywhere; needs explicit approval.
-- Apply with: node scripts/pg-apply.mjs database/postgres/002-demo-catalog.sql --apply   (see scripts/pg-apply.mjs guards)
BEGIN;

INSERT INTO dbo.DanhMuc (MaDanhMuc, TenDanhMuc, TrangThai)
SELECT c.ma, c.ten, 'Hoạt động' FROM (VALUES
('DM00000001', 'Massage'),
 ('DM00000002', 'Chăm sóc da'),
 ('DM00000003', 'Dưỡng sinh'),
 ('DM00000004', 'Chăm sóc body'),
 ('DM00000005', 'Gội đầu dưỡng sinh')
) AS c(ma, ten)
WHERE NOT EXISTS (SELECT 1 FROM dbo.DanhMuc x WHERE x.MaDanhMuc = c.ma OR lower(x.TenDanhMuc) = lower(c.ten));

INSERT INTO dbo.DichVu (MaDichVu, MaDanhMuc, TenDichVu, HinhAnh, MoTaNgan, MoTaChiTiet, TrangThai)
SELECT s.ma, s.madm, s.ten, s.anh::varchar, s.mota, s.chitiet, 'Hoạt động' FROM (VALUES
('DV00000001', 'DM00000001', 'Massage thư giãn toàn thân', NULL,
   'Liệu trình massage toàn thân giúp giảm căng thẳng và thư giãn sâu.',
   'Kỹ thuật viên sử dụng tinh dầu thiên nhiên kết hợp các động tác xoa bóp nhẹ nhàng, giúp lưu thông khí huyết và giảm mệt mỏi.'),
 ('DV00000002', 'DM00000001', 'Massage đá nóng', NULL,
   'Massage bằng đá bazan nóng giúp làm ấm cơ thể và giãn cơ.',
   'Đá bazan được làm nóng ở nhiệt độ an toàn, đặt và di chuyển trên các huyệt đạo để giảm đau mỏi và cải thiện tuần hoàn.'),
 ('DV00000003', 'DM00000001', 'Massage chân', '/assets/uc7-card-2.png',
   'Massage chân thư giãn, giảm mỏi sau một ngày dài.',
   'Ngâm chân thảo dược ấm, sau đó bấm huyệt và massage bàn chân, bắp chân giúp giảm tê mỏi.'),
 ('DV00000004', 'DM00000001', 'Massage cổ vai gáy', '/assets/uc7-card-3.png',
   'Giảm đau mỏi vùng cổ, vai, gáy do ngồi lâu hoặc căng thẳng.',
   'Tập trung vào vùng cổ, vai và gáy với kỹ thuật bấm huyệt và day ấn, phù hợp người làm việc văn phòng.'),
 ('DV00000005', 'DM00000002', 'Chăm sóc da chuyên sâu', '/assets/uc7-card-5.png',
   'Làm sạch, dưỡng ẩm và phục hồi da mặt chuyên sâu.',
   'Quy trình gồm tẩy trang, làm sạch sâu, massage mặt, đắp mặt nạ dưỡng chất và dưỡng da kết thúc.'),
 ('DV00000006', 'DM00000005', 'Gội đầu dưỡng sinh', '/assets/uc7-card-6.png',
   'Gội đầu kết hợp massage da đầu bằng thảo dược.',
   'Gội đầu bằng thảo dược, massage da đầu và bấm huyệt vùng đầu cổ giúp thư giãn, giảm đau đầu.'),
 ('DV00000007', 'DM00000004', 'Chăm sóc body thảo dược', '/assets/uc7-card-7.png',
   'Chăm sóc toàn thân bằng thảo dược thiên nhiên giúp da mềm mịn.',
   'Đắp và massage body bằng hỗn hợp thảo dược, giúp thải độc, dưỡng ẩm và làm mềm da.'),
 ('DV00000008', 'DM00000004', 'Tẩy tế bào chết', '/assets/uc7-card-8.png',
   'Tẩy tế bào chết toàn thân giúp da sáng và mịn.',
   'Tẩy da chết bằng muối/đường thiên nhiên kết hợp dưỡng ẩm sau liệu trình.')
) AS s(ma, madm, ten, anh, mota, chitiet)
WHERE EXISTS (SELECT 1 FROM dbo.DanhMuc m WHERE m.MaDanhMuc = s.madm)
  AND NOT EXISTS (SELECT 1 FROM dbo.DichVu x WHERE x.MaDichVu = s.ma OR lower(x.TenDichVu) = lower(s.ten));

INSERT INTO dbo.GoiDichVu (MaGoi, MaDichVu, TenGoi, ThoiLuong, Gia)
SELECT p.ma, p.madv, p.ten, p.phut, p.gia FROM (VALUES
('GV00000001', 'DV00000001', 'Gói 60 phút',  60, 350000),
 ('GV00000002', 'DV00000001', 'Gói 90 phút',  90, 500000),
 ('GV00000003', 'DV00000002', 'Gói 75 phút',  75, 550000),
 ('GV00000004', 'DV00000002', 'Gói 90 phút',  90, 650000),
 ('GV00000005', 'DV00000003', 'Gói 45 phút',  45, 200000),
 ('GV00000006', 'DV00000003', 'Gói 60 phút',  60, 260000),
 ('GV00000007', 'DV00000004', 'Gói 30 phút',  30, 180000),
 ('GV00000008', 'DV00000004', 'Gói 45 phút',  45, 250000),
 ('GV00000009', 'DV00000005', 'Gói 75 phút',  75, 450000),
 ('GV00000010', 'DV00000005', 'Gói 90 phút',  90, 550000),
 ('GV00000011', 'DV00000006', 'Gói 45 phút',  45, 220000),
 ('GV00000012', 'DV00000007', 'Gói 90 phút',  90, 480000),
 ('GV00000013', 'DV00000008', 'Gói 60 phút',  60, 320000)
) AS p(ma, madv, ten, phut, gia)
WHERE EXISTS (SELECT 1 FROM dbo.DichVu d WHERE d.MaDichVu = p.madv)
  AND NOT EXISTS (SELECT 1 FROM dbo.GoiDichVu x WHERE x.MaGoi = p.ma);

COMMIT;
