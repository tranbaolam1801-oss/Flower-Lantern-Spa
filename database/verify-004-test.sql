SET NOCOUNT ON;
IF DB_NAME()<>'FlowerLanternSpa_Test' THROW 51004,'Test only',1;
SELECT t.name AS TableName,c.name AS ColumnName,c.system_type_id,c.max_length,c.precision,c.scale,c.is_nullable
INTO #BeforeColumns FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id WHERE t.is_ms_shipped=0;
SELECT t.name AS TableName,SUM(p.rows) AS ExistingRows INTO #BeforeRows
FROM sys.tables t JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN(0,1) WHERE t.is_ms_shipped=0 GROUP BY t.name;
IF OBJECT_ID('dbo.PhienDangNhap','U') IS NOT NULL THROW 51004,'Already present: inspect, do not rerun.',1;
:r database/migrations/004-auth-sessions.sql
IF EXISTS(SELECT * FROM #BeforeColumns EXCEPT SELECT t.name,c.name,c.system_type_id,c.max_length,c.precision,c.scale,c.is_nullable FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id) THROW 51004,'Baseline column change detected',1;
IF EXISTS(SELECT * FROM #BeforeRows EXCEPT SELECT t.name,SUM(p.rows) FROM sys.tables t JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN(0,1) GROUP BY t.name) THROW 51004,'Existing row counts changed',1;
IF (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.PhienDangNhap'))<>5 THROW 51004,'Session column count wrong',1;
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name='FK_PhienDangNhap_TaiKhoan' AND referenced_object_id=OBJECT_ID('dbo.TaiKhoan') AND is_disabled=0 AND delete_referential_action=0) THROW 51004,'Session FK wrong',1;
IF NOT EXISTS(SELECT 1 FROM sys.check_constraints WHERE name='CK_PhienDangNhap_Expiry' AND is_disabled=0 AND is_not_trusted=0) THROW 51004,'Expiry check missing',1;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.PhienDangNhap') AND name='IX_PhienDangNhap_TaiKhoan') THROW 51004,'Session index missing',1;
SELECT 'PASS: migration 004 Test; existing columns and row counts preserved' AS Verification;
SELECT DB_NAME() AS DatabaseName,COUNT(*) AS TableCount FROM sys.tables WHERE is_ms_shipped=0;
SELECT COUNT(*) AS PreservedBeds FROM dbo.Giuong;

