-- Flower Lantern Spa — PostgreSQL migration 005: IN-APP notifications for management users (the bell in the admin header).
-- PROPOSED / NOT APPLIED to Neon. Needs explicit approval. Additive: no existing table, column or row is altered or dropped.
-- Idempotent, single transaction. Apply on the DIRECT Neon URL: node scripts/pg-apply.mjs database/postgres/005-in-app-notifications.sql --apply
--
-- This is separate from migration 004 on purpose: 004 holds OUTBOUND messages to customers (Zalo/SMS jobs). This table holds notifications
-- shown INSIDE the app to Chủ Spa / Quản lý / Nhân viên accounts.
--
--  * One row per (recipient account, event): KhoaChongTrung is unique per recipient, so a retried request or replayed webhook can never
--    create the same notification twice for the same account.
--  * The recipient is always taken from the server (never from the client); every read/update filters on MaTaiKhoanNhan = the caller.
--  * No password, token, session id or phone number is stored. NoiDung is a short human sentence; the permission audit stays in
--    dbo.LichSuPhanQuyen (a notification is NOT a substitute for the audit log).
BEGIN;

CREATE TABLE IF NOT EXISTS dbo.ThongBaoNoiBo (
  MaThongBao uuid NOT NULL CONSTRAINT PK_ThongBaoNoiBo PRIMARY KEY DEFAULT gen_random_uuid(),
  MaTaiKhoanNhan char(10) NOT NULL CONSTRAINT FK_ThongBaoNoiBo_TaiKhoan REFERENCES dbo.TaiKhoan(MaTaiKhoan),
  Loai varchar(40) NOT NULL CONSTRAINT CK_ThongBaoNoiBo_Loai CHECK (Loai IN (
    'BOOKING_CREATED_ONLINE', 'BOOKING_RESCHEDULED_BY_CUSTOMER', 'BOOKING_CANCELLED_BY_CUSTOMER',
    'REVIEW_CREATED', 'PERMISSION_CHANGED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED')),
  TieuDe varchar(150) NOT NULL,
  NoiDung varchar(500) NOT NULL,
  LoaiDoiTuong varchar(20) NULL CONSTRAINT CK_ThongBaoNoiBo_LoaiDoiTuong CHECK (LoaiDoiTuong IN ('booking', 'review', 'employee')),
  MaDoiTuong varchar(40) NULL,                 -- related business object id (booking / review / employee id)
  KhoaChongTrung varchar(160) NOT NULL,        -- event identity, e.g. 'BOOKING_CREATED_ONLINE:LH00000012'
  TaoLuc timestamp(3) NOT NULL DEFAULT dbo.utc_now(),
  DaDocLuc timestamp(3) NULL,
  CONSTRAINT UQ_ThongBaoNoiBo_NguoiNhan_Khoa UNIQUE (MaTaiKhoanNhan, KhoaChongTrung)
);
-- newest first for one recipient (list + pagination)
CREATE INDEX IF NOT EXISTS IX_ThongBaoNoiBo_NguoiNhan_Tao ON dbo.ThongBaoNoiBo(MaTaiKhoanNhan, TaoLuc DESC, MaThongBao);
-- cheap unread badge
CREATE INDEX IF NOT EXISTS IX_ThongBaoNoiBo_ChuaDoc ON dbo.ThongBaoNoiBo(MaTaiKhoanNhan) WHERE DaDocLuc IS NULL;

COMMIT;
