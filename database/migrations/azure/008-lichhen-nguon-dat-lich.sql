-- AZURE DEMO COPY. Generated from database/migrations/PROPOSED-008-booking-source-prepaid.md (inline SQL); the ONLY change is the database guard below, which now
-- allows exactly 'FlowerLanternSpaDemo' (Azure SQL Database free tier, demo) and still refuses every other database,
-- including FlowerLanternSpa_Dev/_Test. NOT EXECUTED. Requires explicit approval of the migration batch.
-- Optional: adds dbo.LichHen.NguonDatLich (booking source, 'ONLINE' for online bookings). Additive, nullable, no backfill.
SET XACT_ABORT ON; SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON;
IF DB_NAME() <> N'FlowerLanternSpaDemo'
  THROW 51008, N'Azure demo copy: allowed only on FlowerLanternSpaDemo. Nothing was changed.', 1;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.LichHen','NguonDatLich') IS NULL
  ALTER TABLE dbo.LichHen ADD NguonDatLich NVARCHAR(50) NULL;
COMMIT TRANSACTION;
