:ON ERROR EXIT
USE FlowerLanternSpa_Dev;
SET NOCOUNT ON;
IF (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0)<>15 THROW 50002,'Expected 15 tables.',1;
IF (SELECT COUNT(*) FROM dbo.Giuong)<>20 THROW 50003,'Expected 20 beds.',1;
-- A second seed run must leave the same 20 beds.
:r database/seeds/001-beds.sql
IF (SELECT COUNT(*) FROM dbo.Giuong)<>20 THROW 50004,'Seed is not idempotent.',1;
BEGIN TRY
 INSERT INTO dbo.Giuong(MaGiuong) VALUES('G1');
 THROW 50005,'Duplicate primary key unexpectedly accepted.',1;
END TRY
BEGIN CATCH
 IF ERROR_NUMBER() NOT IN (2627,2601) THROW;
END CATCH;
BEGIN TRY
 INSERT INTO dbo.GoiDichVu(MaGoi,MaDichVu,TenGoi,ThoiLuong,Gia)
 VALUES('TESTONLY','MISSING',N'Test only',60,100000);
 THROW 50006,'Missing service foreign key unexpectedly accepted.',1;
END TRY
BEGIN CATCH
 IF ERROR_NUMBER()<>547 THROW;
END CATCH;
PRINT 'PASS: baseline count, fixed beds, repeat seed, PK and FK constraints';
