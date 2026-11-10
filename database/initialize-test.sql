:ON ERROR EXIT
-- Dedicated local test database. Never drops or overwrites an existing database.
USE master;
IF DB_ID(N'FlowerLanternSpa_Test') IS NULL
 CREATE DATABASE FlowerLanternSpa_Test;
GO
USE FlowerLanternSpa_Test;
IF EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0)
 THROW 51000, 'Test database is not empty. Refusing to initialize over it.', 1;
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
:r database/migrations/003-auth-lockout.sql
:r database/seeds/001-beds.sql
COMMIT;
GO
IF (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0)<>16
 THROW 51001, 'Expected 16 tables.', 1;
IF (SELECT COUNT(*) FROM dbo.Giuong)<>20
 THROW 51002, 'Expected 20 beds.', 1;
PRINT 'PASS: dedicated test database, 16 tables, 20 beds';
