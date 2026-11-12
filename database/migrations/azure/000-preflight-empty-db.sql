-- AZURE DEMO COPY. NOT EXECUTED. Requires explicit approval of the migration/seed batch.
-- 000 preflight for 001-003 (which have no database guard of their own): read-only, writes nothing.
SET NOCOUNT ON;
IF DB_NAME() <> N'FlowerLanternSpaDemo'
  THROW 51000, N'Preflight: not the Azure demo database. Stop.', 1;
IF EXISTS (SELECT 1 FROM sys.tables WHERE is_ms_shipped = 0)
  THROW 51001, N'Preflight: database already has user tables; 001-003 must only run on an empty database. Stop.', 1;
SELECT DB_NAME() AS database_name, @@VERSION AS server_version, 'EMPTY - OK to run 001-003' AS preflight;
