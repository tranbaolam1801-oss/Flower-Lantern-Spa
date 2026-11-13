-- Flower Lantern Spa — PostgreSQL migration 004: phone OTP, phone verification, notification jobs and delivery records.
-- PROPOSED / NOT APPLIED to Neon. Needs explicit approval (additive; no existing table, column or row is altered or dropped).
-- Idempotent (IF NOT EXISTS), single transaction. Apply on the DIRECT Neon URL: node scripts/pg-apply.mjs database/postgres/004-otp-notifications.sql --apply
--
-- Design notes
--  * OTP codes are NEVER stored: MaBamOtp = hex(HMAC-SHA256(OTP_PEPPER, id|purpose|phone|code)). Single use is enforced by
--    DaDungLuc IS NULL in the UPDATE that consumes it (atomic); attempts and resends are counted in the row.
--  * At most ONE live challenge per (phone, purpose): partial unique index on rows that are not consumed/invalidated.
--  * Notification jobs are rows (not in-memory timers): Vercel Functions cannot run background workers. n8n (or any scheduler)
--    only calls the protected dispatch endpoint; due jobs are claimed with FOR UPDATE SKIP LOCKED.
--  * KhoaChongTrung (dedupe key) is UNIQUE: the same logical notification can be enqueued many times but exists once.
--  * No provider token, OTP code, password or reset token is ever written to these tables (reset/registration tokens are
--    stored only as SHA-256 hashes).
BEGIN;

-- ---------------------------------------------------------------- OTP challenges
CREATE TABLE IF NOT EXISTS dbo.XacThucOtp (
  MaXacThuc uuid NOT NULL CONSTRAINT PK_XacThucOtp PRIMARY KEY DEFAULT gen_random_uuid(),
  MucDich varchar(20) NOT NULL CONSTRAINT CK_XacThucOtp_MucDich CHECK (MucDich IN ('REGISTER', 'RESET_PASSWORD')),
  SoDienThoai char(10) NOT NULL CONSTRAINT CK_XacThucOtp_Sdt CHECK (SoDienThoai ~ '^[0-9]*$'),
  MaBamOtp char(64) NULL,                      -- NULL when no code was issued (unknown/ineligible phone: generic path, nothing sent)
  TaoLuc timestamp(3) NOT NULL DEFAULT dbo.utc_now(),
  HetHanLuc timestamp(3) NOT NULL,
  GuiLanCuoiLuc timestamp(3) NULL,
  SoLanGui integer NOT NULL DEFAULT 0,
  SoLanThu integer NOT NULL DEFAULT 0,
  DaXacMinhLuc timestamp(3) NULL,              -- set atomically on the first successful verification (single use)
  VoHieuLuc timestamp(3) NULL,                 -- invalidated (too many attempts / superseded)
  MaBamPhieuHoanTat char(64) NULL,             -- SHA-256 of the one-time completion token handed out after verification
  PhieuHetHanLuc timestamp(3) NULL,
  PhieuDaDungLuc timestamp(3) NULL,            -- completion token consumed (registration / password reset done)
  KenhGui varchar(20) NULL,                    -- 'ZALO_ZNS' | 'SMS' | 'MOCK'
  MaThamChieuNhaCungCap varchar(64) NULL,      -- provider message id (no secrets)
  BamIp char(64) NULL,                         -- SHA-256(OTP_PEPPER|ip): abuse limiting without storing raw IPs
  CONSTRAINT CK_XacThucOtp_Han CHECK (HetHanLuc > TaoLuc)
);
-- one live challenge per phone and purpose
CREATE UNIQUE INDEX IF NOT EXISTS UX_XacThucOtp_Live ON dbo.XacThucOtp(SoDienThoai, MucDich)
  WHERE DaXacMinhLuc IS NULL AND VoHieuLuc IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS UX_XacThucOtp_PhieuHoanTat ON dbo.XacThucOtp(MaBamPhieuHoanTat) WHERE MaBamPhieuHoanTat IS NOT NULL;
CREATE INDEX IF NOT EXISTS IX_XacThucOtp_Sdt_Tao ON dbo.XacThucOtp(SoDienThoai, TaoLuc);
CREATE INDEX IF NOT EXISTS IX_XacThucOtp_Ip_Tao ON dbo.XacThucOtp(BamIp, TaoLuc) WHERE BamIp IS NOT NULL;

-- ---------------------------------------------------------------- phone verification state
CREATE TABLE IF NOT EXISTS dbo.XacMinhDienThoai (
  SoDienThoai char(10) NOT NULL CONSTRAINT PK_XacMinhDienThoai PRIMARY KEY CONSTRAINT CK_XacMinhDienThoai_Sdt CHECK (SoDienThoai ~ '^[0-9]*$'),
  XacMinhLuc timestamp(3) NOT NULL DEFAULT dbo.utc_now(),
  MucDich varchar(20) NOT NULL
);

-- ---------------------------------------------------------------- consent per phone and channel
-- A notification is only sent while an active consent row exists (DongYLuc set, ThuHoiLuc NULL).
CREATE TABLE IF NOT EXISTS dbo.DongYNhanTin (
  SoDienThoai char(10) NOT NULL CONSTRAINT CK_DongYNhanTin_Sdt CHECK (SoDienThoai ~ '^[0-9]*$'),
  Kenh varchar(20) NOT NULL CONSTRAINT CK_DongYNhanTin_Kenh CHECK (Kenh IN ('ZALO', 'SMS')),
  DongYLuc timestamp(3) NOT NULL DEFAULT dbo.utc_now(),
  ThuHoiLuc timestamp(3) NULL,
  Nguon varchar(30) NOT NULL,                  -- e.g. 'REGISTRATION'
  CONSTRAINT PK_DongYNhanTin PRIMARY KEY (SoDienThoai, Kenh)
);

-- ---------------------------------------------------------------- notification jobs
CREATE TABLE IF NOT EXISTS dbo.ThongBaoCongViec (
  MaCongViec uuid NOT NULL CONSTRAINT PK_ThongBaoCongViec PRIMARY KEY DEFAULT gen_random_uuid(),
  Loai varchar(30) NOT NULL CONSTRAINT CK_ThongBaoCongViec_Loai CHECK (Loai IN ('BOOKING_CONFIRMED', 'BOOKING_REMINDER', 'BOOKING_RESCHEDULED', 'BOOKING_CANCELLED')),
  MaLichHen char(10) NOT NULL CONSTRAINT FK_ThongBaoCongViec_LichHen REFERENCES dbo.LichHen(MaLichHen),
  SoDienThoai char(10) NOT NULL,
  KhoaChongTrung varchar(120) NOT NULL CONSTRAINT UQ_ThongBaoCongViec_Khoa UNIQUE,
  GuiLuc timestamp(3) NOT NULL,                -- due time (UTC wall clock); jobs are claimed when GuiLuc <= now
  TrangThai varchar(12) NOT NULL DEFAULT 'PENDING'
    CONSTRAINT CK_ThongBaoCongViec_TrangThai CHECK (TrangThai IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED', 'SKIPPED')),
  SoLanThu integer NOT NULL DEFAULT 0,
  ThuLaiLuc timestamp(3) NULL,                 -- next retry time after a temporary failure
  KhoaDen timestamp(3) NULL,                   -- claim lease: a crashed dispatcher's claim expires and the job is retried
  LyDoBoQua varchar(60) NULL,                  -- why SKIPPED/CANCELLED (no consent, booking changed, ...)
  DuLieuMau jsonb NOT NULL DEFAULT '{}'::jsonb, -- template parameters (name, date, time, service...) — no secrets
  TaoLuc timestamp(3) NOT NULL DEFAULT dbo.utc_now(),
  CapNhatLuc timestamp(3) NOT NULL DEFAULT dbo.utc_now()
);
CREATE INDEX IF NOT EXISTS IX_ThongBaoCongViec_Due ON dbo.ThongBaoCongViec(GuiLuc) WHERE TrangThai IN ('PENDING', 'SENDING');
CREATE INDEX IF NOT EXISTS IX_ThongBaoCongViec_LichHen ON dbo.ThongBaoCongViec(MaLichHen, Loai);

-- ---------------------------------------------------------------- delivery attempts (audit)
CREATE TABLE IF NOT EXISTS dbo.ThongBaoGiaoNhan (
  MaGiaoNhan bigint GENERATED BY DEFAULT AS IDENTITY CONSTRAINT PK_ThongBaoGiaoNhan PRIMARY KEY,
  MaCongViec uuid NOT NULL CONSTRAINT FK_ThongBaoGiaoNhan_CongViec REFERENCES dbo.ThongBaoCongViec(MaCongViec),
  NhaCungCap varchar(20) NOT NULL,             -- 'ZALO_ZNS' | 'MOCK'
  TrangThai varchar(12) NOT NULL CONSTRAINT CK_ThongBaoGiaoNhan_TrangThai CHECK (TrangThai IN ('SENT', 'RETRY', 'FAILED')),
  MaThamChieuNhaCungCap varchar(64) NULL,      -- provider message id
  MaLoi varchar(40) NULL,                      -- provider/HTTP error code (never a token or full payload)
  ThoiDiem timestamp(3) NOT NULL DEFAULT dbo.utc_now()
);
CREATE INDEX IF NOT EXISTS IX_ThongBaoGiaoNhan_CongViec ON dbo.ThongBaoGiaoNhan(MaCongViec);

COMMIT;
