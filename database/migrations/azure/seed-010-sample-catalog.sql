-- AZURE DEMO COPY. NOT EXECUTED. Requires explicit approval of the migration/seed batch.
-- Generated from database/seeds/PROPOSED-010-sample-catalog.sql; only the guard changed. Prices are PLACEHOLDERS.
/*
  PROPOSED / NOT APPLIED.  TEST-ONLY SAMPLE DATA.  Requires explicit user approval.
  NOT executed and NOT parse-checked by any SQL Server (static review only).

  Allow-list (edit only by deliberate decision): FlowerLanternSpa_Test
    -> the guard below THROWs for any other DB_NAME(), including FlowerLanternSpa_Dev and Staging.
  Run (UTF-8 required):
    sqlcmd -S localhost -E -C -b -I -f 65001 -d FlowerLanternSpa_Test -i database/seeds/PROPOSED-010-sample-catalog.sql

  What it inserts (only rows that do not already exist):
    dbo.DanhMuc    5 rows  DM00000001..DM00000005  (Massage, Chăm sóc da, Dưỡng sinh, Chăm sóc body, Gội đầu dưỡng sinh)
    dbo.DichVu     8 rows  DV00000001..DV00000008  (the 8 services of the Figma UC_7 list), TrangThai = N'Hoạt động'
    dbo.GoiDichVu 13 rows  GV00000001..GV00000013  (1-2 packages per service)
  ID format = prefix + 8 digits, identical to backend nextId() (admin-services.service.ts: 'DV'/'GV' + padStart(8,'0')).
  DanhMuc ids use the same style 'DM' + 8 digits (no backend generator exists for categories; Figma fixture ids DM01..DM05 are
  frontend mock ids, not DB ids).

  !!! PRICES ARE PLACEHOLDER VALUES !!!  The owner must confirm real prices before any non-test use.
      Gia is MONEY with CHECK(Gia>=0); values here are positive whole VND (business rule: positive integers).
  Durations (ThoiLuong, minutes) are 30..120, so a package fits inside the 08:00-22:00 window.
  Descriptions are plausible Vietnamese sample text, NOT approved marketing copy.

  Images (HinhAnh VARCHAR(255), safe path starting with '/', see isSafeImage): files verified to exist in frontend/public/assets and
  checked visually: uc7-card-2/3/5/7/8 match the frontend fixture names; uc7-card-6 is a hair-wash photo (used for Gội đầu dưỡng sinh).
  uc7-card-1 is a facial and uc7-card-4 is a hair-wash photo: neither fits "Massage thư giãn toàn thân" / "Massage đá nóng", so those two
  services get HinhAnh = NULL rather than a misleading photo (open decision for the owner).
  The category "Dưỡng sinh" is created but has no service in the 8-service list (the Figma list assigns none): it will show empty.

  Existing-data impact: none. Every INSERT is guarded by NOT EXISTS on the id AND on the unique name
    (DichVu.TenDichVu has UX_DichVu_TenDichVu; DanhMuc name checked in code). Nothing is updated or deleted.
    Test currently has 0 rows in DanhMuc/DichVu/GoiDichVu (read-only check 2026-11-12). If a row with the same name but a different id
    exists, that item (and its packages) is skipped, not duplicated.
  Atomicity: single batch (no GO) so a failed THROW guard stops everything; XACT_ABORT ON + one transaction + TRY/CATCH.

  Verification (run after):
    SELECT (SELECT COUNT(*) FROM dbo.DanhMuc) AS DanhMuc, (SELECT COUNT(*) FROM dbo.DichVu) AS DichVu, (SELECT COUNT(*) FROM dbo.GoiDichVu) AS GoiDichVu;  -- 5, 8, 13 on an empty catalog
    SELECT d.MaDichVu, d.TenDichVu, m.TenDanhMuc, d.HinhAnh, g.MaGoi, g.TenGoi, g.ThoiLuong, CAST(g.Gia AS bigint) AS Gia
      FROM dbo.DichVu d JOIN dbo.DanhMuc m ON m.MaDanhMuc=d.MaDanhMuc LEFT JOIN dbo.GoiDichVu g ON g.MaDichVu=d.MaDichVu ORDER BY d.MaDichVu, g.MaGoi;
    Then GET /api/services must list 8 services.

  Rollback (do NOT run as part of apply; only valid while no KhachSuDungDichVu/DanhGia row references these services):
    BEGIN TRAN;
    DELETE FROM dbo.GoiDichVu WHERE MaGoi BETWEEN 'GV00000001' AND 'GV00000013' AND MaDichVu BETWEEN 'DV00000001' AND 'DV00000008';
    DELETE FROM dbo.DichVu   WHERE MaDichVu BETWEEN 'DV00000001' AND 'DV00000008';
    DELETE FROM dbo.DanhMuc  WHERE MaDanhMuc BETWEEN 'DM00000001' AND 'DM00000005';
    COMMIT;
    (If bookings already use these packages the FK blocks the delete: keep the data, or mark DichVu.TrangThai = N'Ngừng hoạt động'.)
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

IF DB_NAME() <> N'FlowerLanternSpaDemo'
  THROW 51010, N'Azure demo copy: allowed only on FlowerLanternSpaDemo. Nothing was changed.', 1;

BEGIN TRY
BEGIN TRANSACTION;

DECLARE @Cat TABLE (Ma CHAR(10) PRIMARY KEY, Ten NVARCHAR(100) NOT NULL);
INSERT @Cat (Ma, Ten) VALUES
 ('DM00000001', N'Massage'),
 ('DM00000002', N'Chăm sóc da'),
 ('DM00000003', N'Dưỡng sinh'),
 ('DM00000004', N'Chăm sóc body'),
 ('DM00000005', N'Gội đầu dưỡng sinh');

INSERT dbo.DanhMuc (MaDanhMuc, TenDanhMuc, TrangThai)
SELECT c.Ma, c.Ten, N'Hoạt động'
FROM @Cat c
WHERE NOT EXISTS (SELECT 1 FROM dbo.DanhMuc x WITH (UPDLOCK, HOLDLOCK) WHERE x.MaDanhMuc = c.Ma OR x.TenDanhMuc = c.Ten);

DECLARE @Svc TABLE (Ma CHAR(10) PRIMARY KEY, MaDM CHAR(10) NOT NULL, Ten NVARCHAR(150) NOT NULL,
  Anh VARCHAR(255) NULL, MoTa NVARCHAR(255) NOT NULL, ChiTiet NVARCHAR(MAX) NOT NULL);
INSERT @Svc (Ma, MaDM, Ten, Anh, MoTa, ChiTiet) VALUES
 ('DV00000001', 'DM00000001', N'Massage thư giãn toàn thân', NULL,
   N'Liệu trình massage toàn thân giúp giảm căng thẳng và thư giãn sâu.',
   N'Kỹ thuật viên sử dụng tinh dầu thiên nhiên kết hợp các động tác xoa bóp nhẹ nhàng, giúp lưu thông khí huyết và giảm mệt mỏi.'),
 ('DV00000002', 'DM00000001', N'Massage đá nóng', NULL,
   N'Massage bằng đá bazan nóng giúp làm ấm cơ thể và giãn cơ.',
   N'Đá bazan được làm nóng ở nhiệt độ an toàn, đặt và di chuyển trên các huyệt đạo để giảm đau mỏi và cải thiện tuần hoàn.'),
 ('DV00000003', 'DM00000001', N'Massage chân', '/assets/uc7-card-2.png',
   N'Massage chân thư giãn, giảm mỏi sau một ngày dài.',
   N'Ngâm chân thảo dược ấm, sau đó bấm huyệt và massage bàn chân, bắp chân giúp giảm tê mỏi.'),
 ('DV00000004', 'DM00000001', N'Massage cổ vai gáy', '/assets/uc7-card-3.png',
   N'Giảm đau mỏi vùng cổ, vai, gáy do ngồi lâu hoặc căng thẳng.',
   N'Tập trung vào vùng cổ, vai và gáy với kỹ thuật bấm huyệt và day ấn, phù hợp người làm việc văn phòng.'),
 ('DV00000005', 'DM00000002', N'Chăm sóc da chuyên sâu', '/assets/uc7-card-5.png',
   N'Làm sạch, dưỡng ẩm và phục hồi da mặt chuyên sâu.',
   N'Quy trình gồm tẩy trang, làm sạch sâu, massage mặt, đắp mặt nạ dưỡng chất và dưỡng da kết thúc.'),
 ('DV00000006', 'DM00000005', N'Gội đầu dưỡng sinh', '/assets/uc7-card-6.png',
   N'Gội đầu kết hợp massage da đầu bằng thảo dược.',
   N'Gội đầu bằng thảo dược, massage da đầu và bấm huyệt vùng đầu cổ giúp thư giãn, giảm đau đầu.'),
 ('DV00000007', 'DM00000004', N'Chăm sóc body thảo dược', '/assets/uc7-card-7.png',
   N'Chăm sóc toàn thân bằng thảo dược thiên nhiên giúp da mềm mịn.',
   N'Đắp và massage body bằng hỗn hợp thảo dược, giúp thải độc, dưỡng ẩm và làm mềm da.'),
 ('DV00000008', 'DM00000004', N'Tẩy tế bào chết', '/assets/uc7-card-8.png',
   N'Tẩy tế bào chết toàn thân giúp da sáng và mịn.',
   N'Tẩy da chết bằng muối/đường thiên nhiên kết hợp dưỡng ẩm sau liệu trình.');

INSERT dbo.DichVu (MaDichVu, MaDanhMuc, TenDichVu, HinhAnh, MoTaNgan, MoTaChiTiet, TrangThai)
SELECT s.Ma, s.MaDM, s.Ten, s.Anh, s.MoTa, s.ChiTiet, N'Hoạt động'
FROM @Svc s
WHERE EXISTS (SELECT 1 FROM dbo.DanhMuc m WHERE m.MaDanhMuc = s.MaDM)
  AND NOT EXISTS (SELECT 1 FROM dbo.DichVu x WITH (UPDLOCK, HOLDLOCK) WHERE x.MaDichVu = s.Ma OR x.TenDichVu = s.Ten);

-- PLACEHOLDER prices (whole VND). Owner must confirm.
DECLARE @Pkg TABLE (Ma CHAR(10) PRIMARY KEY, MaDV CHAR(10) NOT NULL, Ten NVARCHAR(100) NOT NULL, Phut INT NOT NULL, Gia MONEY NOT NULL);
INSERT @Pkg (Ma, MaDV, Ten, Phut, Gia) VALUES
 ('GV00000001', 'DV00000001', N'Gói 60 phút',  60, 350000),
 ('GV00000002', 'DV00000001', N'Gói 90 phút',  90, 500000),
 ('GV00000003', 'DV00000002', N'Gói 75 phút',  75, 550000),
 ('GV00000004', 'DV00000002', N'Gói 90 phút',  90, 650000),
 ('GV00000005', 'DV00000003', N'Gói 45 phút',  45, 200000),
 ('GV00000006', 'DV00000003', N'Gói 60 phút',  60, 260000),
 ('GV00000007', 'DV00000004', N'Gói 30 phút',  30, 180000),
 ('GV00000008', 'DV00000004', N'Gói 45 phút',  45, 250000),
 ('GV00000009', 'DV00000005', N'Gói 75 phút',  75, 450000),
 ('GV00000010', 'DV00000005', N'Gói 90 phút',  90, 550000),
 ('GV00000011', 'DV00000006', N'Gói 45 phút',  45, 220000),
 ('GV00000012', 'DV00000007', N'Gói 90 phút',  90, 480000),
 ('GV00000013', 'DV00000008', N'Gói 60 phút',  60, 320000);

INSERT dbo.GoiDichVu (MaGoi, MaDichVu, TenGoi, ThoiLuong, Gia)
SELECT p.Ma, p.MaDV, p.Ten, p.Phut, p.Gia
FROM @Pkg p
WHERE EXISTS (SELECT 1 FROM dbo.DichVu d WHERE d.MaDichVu = p.MaDV)
  AND NOT EXISTS (SELECT 1 FROM dbo.GoiDichVu x WITH (UPDLOCK, HOLDLOCK) WHERE x.MaGoi = p.Ma);

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
