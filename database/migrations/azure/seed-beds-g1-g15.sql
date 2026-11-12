-- AZURE DEMO COPY. NOT EXECUTED. Requires explicit approval of the migration/seed batch.
-- Beds for a NEW database: G1-G15 only (user override 2026-11-11: default 15 active beds G1-G15;
-- the 20-row history rule applies to existing databases, and this database has none). Idempotent.
SET XACT_ABORT ON;
IF DB_NAME() <> N'FlowerLanternSpaDemo'
  THROW 51020, N'Azure demo copy: allowed only on FlowerLanternSpaDemo. Nothing was changed.', 1;
BEGIN TRANSACTION;
DECLARE @n INT = 1;
WHILE @n <= 15
BEGIN
  DECLARE @id CHAR(10) = CONCAT('G', @n);
  IF NOT EXISTS (SELECT 1 FROM dbo.Giuong WITH (UPDLOCK, HOLDLOCK) WHERE MaGiuong = @id)
    INSERT INTO dbo.Giuong(MaGiuong) VALUES (@id);
  SET @n += 1;
END;
COMMIT;
SELECT COUNT(*) AS bed_count FROM dbo.Giuong;
