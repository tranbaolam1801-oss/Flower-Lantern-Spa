-- SRS BR-UC2.1-01: fixed beds G1 through G20, idempotent within a transaction.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @n INT=1;
WHILE @n<=20
BEGIN
 DECLARE @id CHAR(10)=CONCAT('G',@n);
 IF NOT EXISTS(SELECT 1 FROM dbo.Giuong WITH(UPDLOCK,HOLDLOCK) WHERE MaGiuong=@id)
  INSERT INTO dbo.Giuong(MaGiuong) VALUES(@id);
 SET @n+=1;
END;
IF (SELECT COUNT(*) FROM dbo.Giuong)<>20
BEGIN
 ROLLBACK;
 THROW 50001, 'Expected exactly 20 fixed beds; no existing beds removed.', 1;
END;
COMMIT;
