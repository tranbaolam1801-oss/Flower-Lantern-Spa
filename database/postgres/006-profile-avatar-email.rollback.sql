-- Rollback of 006-profile-avatar-email.sql (PROPOSED, not applied anywhere automatically).
-- WARNING: dropping the columns DELETES the avatar file names and customer emails stored in them.
-- Avatar image files in object storage (folder 'avatars/') are NOT touched. Take a Neon branch/backup first.
-- Apply with: node scripts/pg-apply.mjs database/postgres/006-profile-avatar-email.rollback.sql --apply
BEGIN;
ALTER TABLE dbo.TaiKhoan DROP COLUMN IF EXISTS AnhDaiDien;
ALTER TABLE dbo.KhachHang DROP COLUMN IF EXISTS Email;
COMMIT;
