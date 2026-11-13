import {
  BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException,
} from '@nestjs/common';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { QueryRunner } from 'typeorm';
import { DatabaseService } from '../database.service';
import { PasswordService } from '../auth/password.service';
import { isUniqueViolation } from '../common/db-errors';
import { returnedRows } from '../common/pg-result';
import { normalizeVnPhone } from '../common/phone';
import { OTP_SENDER, OtpSender } from '../messaging/message-provider';
import {
  COMPLETION_TOKEN_TTL_SECONDS, MAX_CHALLENGES_PER_IP_PER_HOUR, MAX_CHALLENGES_PER_PHONE_PER_HOUR, MSG_BAD_CODE, MSG_BAD_REQUEST,
  MSG_FULL_NAME, MSG_INVALID_PHONE, MSG_PASSWORD_POLICY, MSG_PHONE_REGISTERED, MSG_REQUEST_ACCEPTED, MSG_SEND_FAILED, MSG_TOO_FAST,
  OTP_MAX_ATTEMPTS, OtpPurposeName, OtpSettings, digestsEqual, ipDigest, isPurpose, otpDigest, passwordMeetsPolicy, readOtpSettings, sha256Hex,
} from './otp.policy';

type Body = Record<string, unknown>;

const STAFF_NOT_ELIGIBLE_ROLE = 'Khách hàng';
const ACTIVE = 'Hoạt động';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
  ) {}

  // ------------------------------------------------------------------ POST /auth/otp/request
  async request(body: Body, ip: string | undefined) {
    const phone = normalizeVnPhone(body?.phone);
    if (!phone) throw new BadRequestException(MSG_INVALID_PHONE);
    if (!isPurpose(body?.purpose)) throw new BadRequestException(MSG_BAD_REQUEST);
    const purpose = body.purpose;
    const settings = this.settings();
    if (!settings) throw this.sendFailed();

    const issued = await this.issueChallenge(phone, purpose, ip ?? 'unknown', settings);

    if (issued.code) {
      try {
        const sent = await this.sender.sendOtp({ phone, code: issued.code, purpose, ttlMinutes: Math.ceil(settings.ttlSeconds / 60) });
        if (sent.providerRef) {
          await this.db.query(`UPDATE dbo.XacThucOtp SET MaThamChieuNhaCungCap = $2 WHERE MaXacThuc = $1::uuid`, [issued.id, sent.providerRef.slice(0, 64)]);
        }
      } catch (error) {
        // Log only the error class/code (never the message, which a provider could fill with request data).
        const code = (error as { code?: unknown })?.code;
        this.logger.warn(`OTP provider send failed (${(error as Error)?.name ?? 'Error'}${typeof code === 'string' ? `:${code}` : ''})`);
        await this.markSendFailed(issued.id);
        throw this.sendFailed();
      }
    }
    return { message: MSG_REQUEST_ACCEPTED, resendAfterSeconds: settings.cooldownSeconds, expiresInSeconds: settings.ttlSeconds };
  }

  private async issueChallenge(phone: string, purpose: OtpPurposeName, ip: string, settings: OtpSettings): Promise<{ id: string; code: string | null }> {
    const ipHash = ipDigest(settings.pepper, ip);
    return await this.db.transaction(async (r) => {
      // Fixed lock order (ip, then phone) so concurrent requests cannot deadlock and the limit checks cannot race.
      await r.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`otp:ip:${ipHash}`]);
      await r.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`otp:phone:${phone}`]);

      const limits = returnedRows<{ phoneCount: number; ipCount: number; cooldownLeft: number | string | null }>(await r.query(
        `SELECT
           (SELECT count(*) FROM dbo.XacThucOtp WHERE SoDienThoai = $1::char(10) AND TaoLuc > dbo.utc_now() - interval '1 hour')::int AS "phoneCount",
           (SELECT count(*) FROM dbo.XacThucOtp WHERE BamIp = $2::char(64) AND TaoLuc > dbo.utc_now() - interval '1 hour')::int AS "ipCount",
           (SELECT CEIL(extract(epoch FROM (max(TaoLuc) + make_interval(secs => $4::double precision) - dbo.utc_now())))
              FROM dbo.XacThucOtp
              WHERE SoDienThoai = $1::char(10) AND MucDich = $3
                AND TaoLuc > dbo.utc_now() - make_interval(secs => $4::double precision)
                AND NOT (MaBamOtp IS NOT NULL AND SoLanGui = 0)) AS "cooldownLeft"`,
        [phone, ipHash, purpose, settings.cooldownSeconds],
      ))[0];
      const cooldownLeft = limits.cooldownLeft === null ? 0 : Number(limits.cooldownLeft);
      if (cooldownLeft > 0) throw this.tooFast(cooldownLeft);
      if (limits.phoneCount >= MAX_CHALLENGES_PER_PHONE_PER_HOUR) throw this.tooFast(await this.hourlyRetry(r, 'SoDienThoai = $1::char(10)', phone));
      if (limits.ipCount >= MAX_CHALLENGES_PER_IP_PER_HOUR) throw this.tooFast(await this.hourlyRetry(r, 'BamIp = $1::char(64)', ipHash));

      const eligible = await this.isEligible(r, phone, purpose);
      const id = randomUUID();
      const code = eligible ? String(randomInt(0, 1_000_000)).padStart(6, '0') : null;
      const digest = code ? otpDigest(settings.pepper, id, purpose, phone, code) : null;

      // A new request supersedes any live challenge for this phone and purpose.
      await r.query(
        `UPDATE dbo.XacThucOtp SET VoHieuLuc = dbo.utc_now()
         WHERE SoDienThoai = $1::char(10) AND MucDich = $2 AND DaXacMinhLuc IS NULL AND VoHieuLuc IS NULL`,
        [phone, purpose],
      );
      try {
        await r.query(
          `INSERT INTO dbo.XacThucOtp (MaXacThuc, MucDich, SoDienThoai, MaBamOtp, HetHanLuc, GuiLanCuoiLuc, SoLanGui, KenhGui, BamIp)
           VALUES ($1::uuid, $2, $3::char(10), $4::char(64), dbo.utc_now() + make_interval(secs => $5::double precision),
                   CASE WHEN $4::char(64) IS NULL THEN NULL ELSE dbo.utc_now() END, CASE WHEN $4::char(64) IS NULL THEN 0 ELSE 1 END, $6, $7::char(64))`,
          [id, purpose, phone, digest, settings.ttlSeconds, code ? this.sender.name : null, ipHash],
        );
      } catch (error) {
        if (isUniqueViolation(error)) throw this.tooFast(settings.cooldownSeconds);
        throw error;
      }
      return { id, code };
    });
  }

  private async hourlyRetry(r: QueryRunner, where: string, value: string): Promise<number> {
    const rows = returnedRows<{ s: number | string | null }>(await r.query(
      `SELECT CEIL(extract(epoch FROM (min(TaoLuc) + interval '1 hour' - dbo.utc_now()))) AS s
       FROM dbo.XacThucOtp WHERE ${where} AND TaoLuc > dbo.utc_now() - interval '1 hour'`, [value]));
    return Math.max(1, Number(rows[0]?.s ?? 1) || 1);
  }

  /** A failed send must not consume the resend budget: the row is invalidated and excluded from the cooldown (SoLanGui = 0 with a digest). */
  private async markSendFailed(id: string) {
    try {
      await this.db.query(
        `UPDATE dbo.XacThucOtp SET SoLanGui = 0, GuiLanCuoiLuc = NULL, VoHieuLuc = COALESCE(VoHieuLuc, dbo.utc_now()) WHERE MaXacThuc = $1::uuid`, [id]);
    } catch (error) {
      this.logger.error(`Could not mark OTP challenge as failed (${(error as Error)?.name ?? 'Error'})`);
    }
  }

  private async isEligible(r: QueryRunner, phone: string, purpose: OtpPurposeName): Promise<boolean> {
    const rows = returnedRows<{ role: string; status: string }>(await r.query(
      `SELECT VaiTro AS "role", TrangThai AS "status" FROM dbo.TaiKhoan WHERE SoDienThoai = $1`, [phone]));
    if (purpose === 'REGISTER') return rows.length === 0;
    // Staff, manager and owner accounts can never be reset by phone OTP (design decision 4).
    return rows.length === 1 && rows[0].role === STAFF_NOT_ELIGIBLE_ROLE && rows[0].status === ACTIVE;
  }

  // ------------------------------------------------------------------ POST /auth/otp/verify
  async verify(body: Body) {
    const phone = normalizeVnPhone(body?.phone);
    const code = body?.code;
    if (!phone || !isPurpose(body?.purpose) || typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) throw new BadRequestException(MSG_BAD_CODE);
    const purpose = body.purpose;
    const settings = this.settings();
    if (!settings) throw this.sendFailed();

    const token = randomBytes(32).toString('base64url');
    const ok = await this.db.transaction(async (r) => {
      await r.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`otp:phone:${phone}`]);
      // FOR UPDATE + the lock above serialise concurrent guesses; the UPDATEs below repeat every liveness condition.
      const live = returnedRows<{ id: string; digest: string }>(await r.query(
        `SELECT MaXacThuc::text AS "id", MaBamOtp AS "digest" FROM dbo.XacThucOtp
         WHERE SoDienThoai = $1::char(10) AND MucDich = $2 AND MaBamOtp IS NOT NULL AND DaXacMinhLuc IS NULL AND VoHieuLuc IS NULL
           AND HetHanLuc > dbo.utc_now() AND SoLanThu < $3 FOR UPDATE`,
        [phone, purpose, OTP_MAX_ATTEMPTS],
      ))[0];
      if (!live) return false;
      if (!(await this.isEligible(r, phone, purpose))) return false;

      const matches = digestsEqual(live.digest.trim(), otpDigest(settings.pepper, live.id, purpose, phone, code));
      if (!matches) {
        await r.query(
          `UPDATE dbo.XacThucOtp SET SoLanThu = SoLanThu + 1,
             VoHieuLuc = CASE WHEN SoLanThu + 1 >= $2 THEN dbo.utc_now() ELSE NULL END
           WHERE MaXacThuc = $1::uuid AND DaXacMinhLuc IS NULL AND VoHieuLuc IS NULL AND HetHanLuc > dbo.utc_now() AND SoLanThu < $2`,
          [live.id, OTP_MAX_ATTEMPTS],
        );
        return false;
      }
      const consumed = returnedRows<{ id: string }>(await r.query(
        `UPDATE dbo.XacThucOtp SET DaXacMinhLuc = dbo.utc_now(), MaBamPhieuHoanTat = $2,
           PhieuHetHanLuc = dbo.utc_now() + make_interval(secs => $3::double precision)
         WHERE MaXacThuc = $1::uuid AND DaXacMinhLuc IS NULL AND VoHieuLuc IS NULL AND HetHanLuc > dbo.utc_now() AND SoLanThu < $4
         RETURNING MaXacThuc::text AS "id"`,
        [live.id, sha256Hex(token), COMPLETION_TOKEN_TTL_SECONDS, OTP_MAX_ATTEMPTS],
      ));
      if (consumed.length !== 1) return false;
      await r.query(
        `INSERT INTO dbo.XacMinhDienThoai (SoDienThoai, XacMinhLuc, MucDich) VALUES ($1::char(10), dbo.utc_now(), $2)
         ON CONFLICT (SoDienThoai) DO UPDATE SET XacMinhLuc = dbo.utc_now(), MucDich = EXCLUDED.MucDich`,
        [phone, purpose],
      );
      return true;
    });
    if (!ok) throw new BadRequestException(MSG_BAD_CODE);
    return { completionToken: token, expiresInSeconds: COMPLETION_TOKEN_TTL_SECONDS };
  }

  // ------------------------------------------------------------------ POST /auth/register
  async register(body: Body) {
    const phone = normalizeVnPhone(body?.phone);
    const token = body?.completionToken;
    if (!phone || typeof token !== 'string' || token.length < 20 || token.length > 128) throw new BadRequestException(MSG_BAD_REQUEST);
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    if (fullName.length < 1 || fullName.length > 50) throw new BadRequestException({ message: MSG_FULL_NAME, fields: { fullName: MSG_FULL_NAME } });
    if (!passwordMeetsPolicy(body.password)) throw new BadRequestException({ message: MSG_PASSWORD_POLICY, fields: { password: MSG_PASSWORD_POLICY } });
    if (body.consentZalo !== undefined && typeof body.consentZalo !== 'boolean') throw new BadRequestException(MSG_BAD_REQUEST);
    const consentZalo = body.consentZalo === true;
    const hash = await this.passwords.hash(body.password);

    try {
      await this.db.transaction(async (r) => {
        await this.consumeCompletionToken(r, token, phone, 'REGISTER');
        await r.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`phone:${phone}`]);
        const taken = returnedRows<{ one: number }>(await r.query(`SELECT 1 AS one FROM dbo.TaiKhoan WHERE SoDienThoai = $1`, [phone]));
        if (taken.length > 0) throw this.phoneRegistered();

        const accountId = await this.nextId(r, 'TaiKhoan', 'MaTaiKhoan', 'TK');
        await r.query(
          `INSERT INTO dbo.TaiKhoan (MaTaiKhoan, TenDangNhap, SoDienThoai, MatKhauBam, VaiTro, TrangThai) VALUES ($1, $2, $3, $4, $5, $6)`,
          [accountId, phone, phone, hash, STAFF_NOT_ELIGIBLE_ROLE, ACTIVE],
        );

        await r.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, ['dbo.KhachHang:id']);
        const existing = returnedRows<{ id: string; account: string | null }>(await r.query(
          `SELECT MaKhachHang AS "id", MaTaiKhoan AS "account" FROM dbo.KhachHang WHERE SoDienThoai = $1::char(10) FOR UPDATE`, [phone]));
        if (existing.length > 0) {
          if (existing[0].account !== null) throw this.phoneRegistered();
          await r.query(`UPDATE dbo.KhachHang SET MaTaiKhoan = $1 WHERE MaKhachHang = $2 AND MaTaiKhoan IS NULL`, [accountId, existing[0].id]);
        } else {
          const customerId = await this.nextId(r, 'KhachHang', 'MaKhachHang', 'KH');
          await r.query(
            `INSERT INTO dbo.KhachHang (MaKhachHang, MaTaiKhoan, HoTen, SoDienThoai) VALUES ($1, $2, $3, $4::char(10))`,
            [customerId, accountId, fullName, phone],
          );
        }
        if (consentZalo) {
          await r.query(
            `INSERT INTO dbo.DongYNhanTin (SoDienThoai, Kenh, DongYLuc, ThuHoiLuc, Nguon) VALUES ($1::char(10), 'ZALO', dbo.utc_now(), NULL, 'REGISTRATION')
             ON CONFLICT (SoDienThoai, Kenh) DO UPDATE SET DongYLuc = dbo.utc_now(), ThuHoiLuc = NULL, Nguon = 'REGISTRATION'`,
            [phone],
          );
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw this.phoneRegistered();
      throw error;
    }
    return { success: true };
  }

  // ------------------------------------------------------------------ POST /auth/password/reset
  async resetPassword(body: Body) {
    const phone = normalizeVnPhone(body?.phone);
    const token = body?.completionToken;
    if (!phone || typeof token !== 'string' || token.length < 20 || token.length > 128) throw new BadRequestException(MSG_BAD_REQUEST);
    if (!passwordMeetsPolicy(body.newPassword)) throw new BadRequestException({ message: MSG_PASSWORD_POLICY, fields: { newPassword: MSG_PASSWORD_POLICY } });
    const hash = await this.passwords.hash(body.newPassword);

    await this.db.transaction(async (r) => {
      await this.consumeCompletionToken(r, token, phone, 'RESET_PASSWORD');
      const account = returnedRows<{ id: string }>(await r.query(
        `SELECT MaTaiKhoan AS "id" FROM dbo.TaiKhoan WHERE SoDienThoai = $1 AND VaiTro = $2 AND TrangThai = $3 FOR UPDATE`,
        [phone, STAFF_NOT_ELIGIBLE_ROLE, ACTIVE],
      ))[0];
      // Throwing rolls the transaction back, so the token is not burnt by an ineligible account.
      if (!account) throw new BadRequestException(MSG_BAD_REQUEST);
      await r.query(`UPDATE dbo.TaiKhoan SET MatKhauBam = $2 WHERE MaTaiKhoan = $1`, [account.id, hash]);
      await r.query(`UPDATE dbo.PhienDangNhap SET ThuHoiLuc = dbo.utc_now() WHERE MaTaiKhoan = $1 AND ThuHoiLuc IS NULL`, [account.id]);
      await r.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`dbo.KhoaDangNhap:${phone}`]);
      await r.query(`DELETE FROM dbo.KhoaDangNhap WHERE SoDienThoai = $1`, [phone]);
    });
    return { success: true };
  }

  // ------------------------------------------------------------------ helpers
  /** Atomic single use: only an unexpired, unused token for this phone and purpose is consumed. */
  private async consumeCompletionToken(r: QueryRunner, token: string, phone: string, purpose: OtpPurposeName) {
    const rows = returnedRows<{ id: string }>(await r.query(
      `UPDATE dbo.XacThucOtp SET PhieuDaDungLuc = dbo.utc_now()
       WHERE MaBamPhieuHoanTat = $1 AND SoDienThoai = $2::char(10) AND MucDich = $3
         AND DaXacMinhLuc IS NOT NULL AND PhieuDaDungLuc IS NULL AND PhieuHetHanLuc > dbo.utc_now()
       RETURNING MaXacThuc::text AS "id"`,
      [sha256Hex(token), phone, purpose],
    ));
    if (rows.length !== 1) throw new BadRequestException(MSG_BAD_REQUEST);
  }

  /** MAX+1 key generation serialised by a transaction-scoped advisory lock (same pattern as the other modules). */
  private async nextId(r: QueryRunner, table: string, column: string, prefix: string): Promise<string> {
    await r.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`dbo.${table}:id`]);
    const rows = returnedRows<{ n: number }>(await r.query(
      `SELECT COALESCE(MAX(substring(${column}, 3, 8)::int), 0) + 1 AS n FROM dbo.${table} WHERE ${column} ~ $1`, [`^${prefix}[0-9]{8}$`]));
    return `${prefix}${String(rows[0].n).padStart(8, '0')}`;
  }

  private settings(): OtpSettings | null {
    const settings = readOtpSettings();
    if (!settings) this.logger.error('OTP_PEPPER is missing or shorter than 32 characters; OTP endpoints are disabled.');
    return settings;
  }

  private tooFast(retryAfterSeconds: number) {
    return new HttpException({ message: MSG_TOO_FAST, retryAfterSeconds }, HttpStatus.TOO_MANY_REQUESTS);
  }
  private sendFailed() { return new ServiceUnavailableException(MSG_SEND_FAILED); }
  private phoneRegistered() { return new ConflictException(MSG_PHONE_REGISTERED); }
}
