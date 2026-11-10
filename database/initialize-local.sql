:ON ERROR EXIT
USE master;
IF DB_ID(N'FlowerLanternSpa_Dev') IS NULL
 CREATE DATABASE FlowerLanternSpa_Dev;
GO
USE FlowerLanternSpa_Dev;
IF EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0)
 THROW 50000, 'FlowerLanternSpa_Dev is not empty. Refusing to initialize over it.', 1;
GO
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
BEGIN TRANSACTION;
:r database/migrations/001-srs-baseline.sql
:r database/migrations/002-business-indexes.sql
:r database/seeds/001-beds.sql
COMMIT;
GO
IF (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0)<>15
 THROW 50002, 'Expected 15 baseline tables.', 1;
IF (SELECT COUNT(*) FROM dbo.Giuong)<>20
 THROW 50003, 'Expected 20 beds.', 1;
PRINT 'PASS: 15 baseline tables and 20 fixed beds';
