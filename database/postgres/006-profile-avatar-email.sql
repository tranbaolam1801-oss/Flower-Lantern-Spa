-- Flower Lantern Spa — PostgreSQL migration 006: profile avatar + customer email.
-- PROPOSED / NOT APPLIED to Neon. Needs explicit approval. Additive, idempotent: two nullable columns, no row is changed.
--  * dbo.TaiKhoan.AnhDaiDien  : file name only (e.g. 'a1b2…f0.png') of the avatar stored in the private object store (folder 'avatars/').
--                               Never base64, never a URL to a third party.
--  * dbo.KhachHang.Email      : optional contact email a customer may edit. (dbo.NhanVien already has Email.)
-- Until applied, the API reports these two capabilities as unavailable and the rest of the profile keeps working.
BEGIN;
ALTER TABLE dbo.TaiKhoan ADD COLUMN IF NOT EXISTS AnhDaiDien varchar(80) NULL;
ALTER TABLE dbo.KhachHang ADD COLUMN IF NOT EXISTS Email varchar(100) NULL;
COMMIT;
