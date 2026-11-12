import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import { returnedRows } from '../common/pg-result';
import {
  BookingMessage, NOTIFICATION_PROVIDER, NotificationKind, NotificationProvider, ProviderPermanentError, ProviderTemporaryError,
} from '../messaging/message-provider';
import {
  CONSENT_CHANNEL, DEFAULT_DISPATCH_LIMIT, LEASE_SECONDS, MAX_ATTEMPTS, MAX_DISPATCH_LIMIT, NOTIFY_CONFIRMED_STATUSES, RETRY_BACKOFF_MINUTES,
  notificationClock, vietnamLocalToMs,
} from './notification-config';

export interface DispatchSummary { claimed: number; sent: number; retried: number; failed: number; skipped: number }
interface ClaimedJob { id: string; kind: NotificationKind; bookingId: string; phone: string; attempts: number; data: Record<string, unknown> | string }
type Outcome = 'sent' | 'retried' | 'failed' | 'skipped';

/** Only the code is stored (delivery column is 40 chars; never a message, token or payload). */
export function safeErrorCode(code: unknown): string {
  return String(code ?? 'UNKNOWN').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 40) || 'UNKNOWN';
}

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(NOTIFICATION_PROVIDER) private readonly provider: NotificationProvider,
  ) {}

  async dispatch(limit = DEFAULT_DISPATCH_LIMIT): Promise<DispatchSummary> {
    const size = Math.min(MAX_DISPATCH_LIMIT, Math.max(1, Math.trunc(limit) || DEFAULT_DISPATCH_LIMIT));
    const summary: DispatchSummary = { claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0 };
    const { jobs, exhausted } = await this.claim(size);
    summary.claimed = jobs.length + exhausted;
    summary.failed += exhausted;
    for (const job of jobs) {
      try {
        summary[await this.process(job)] += 1;
      } catch (error) {
        // One failing job (e.g. a database hiccup while recording) never aborts the others; its lease expires and it is retried.
        summary.retried += 1;
        this.logger.error(`notification job ${job.id} could not be completed: ${error instanceof Error ? error.name : 'error'}`);
      }
    }
    return summary;
  }

  /**
   * One transaction: lock due rows with SKIP LOCKED (concurrent dispatchers get disjoint sets), mark them SENDING with a lease
   * and count the attempt. A crashed dispatcher's rows become claimable again when the lease (KhoaDen) expires.
   */
  private async claim(limit: number): Promise<{ jobs: ClaimedJob[]; exhausted: number }> {
    return await this.database.transaction(async (runner) => {
      const rows = returnedRows<{ id: string; kind: NotificationKind; bookingId: string; phone: string; attempts: number; data: ClaimedJob['data'] }>(await runner.query(
        `SELECT MaCongViec AS id, Loai AS kind, rtrim(MaLichHen) AS "bookingId", rtrim(SoDienThoai) AS phone, SoLanThu AS attempts, DuLieuMau AS data
         FROM dbo.ThongBaoCongViec
         WHERE TrangThai IN ('PENDING','SENDING') AND GuiLuc <= dbo.utc_now()
           AND (ThuLaiLuc IS NULL OR ThuLaiLuc <= dbo.utc_now()) AND (KhoaDen IS NULL OR KhoaDen <= dbo.utc_now())
         ORDER BY GuiLuc LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit]));
      const dead = rows.filter((r) => Number(r.attempts) >= MAX_ATTEMPTS);
      const live = rows.filter((r) => Number(r.attempts) < MAX_ATTEMPTS);
      if (dead.length) {
        await runner.query(`UPDATE dbo.ThongBaoCongViec SET TrangThai='FAILED', LyDoBoQua='MAX_ATTEMPTS', KhoaDen=NULL, CapNhatLuc=dbo.utc_now() WHERE MaCongViec = ANY($1::uuid[])`, [dead.map((r) => r.id)]);
      }
      if (live.length) {
        await runner.query(
          `UPDATE dbo.ThongBaoCongViec SET TrangThai='SENDING', SoLanThu=SoLanThu+1, KhoaDen=dbo.utc_now() + make_interval(secs => $2::int), CapNhatLuc=dbo.utc_now()
           WHERE MaCongViec = ANY($1::uuid[])`, [live.map((r) => r.id), LEASE_SECONDS]);
      }
      return { jobs: live.map((r) => ({ ...r, attempts: Number(r.attempts) + 1 })), exhausted: dead.length };
    });
  }

  private async process(job: ClaimedJob): Promise<Outcome> {
    const data = (typeof job.data === 'string' ? JSON.parse(job.data) : job.data) as Record<string, unknown>;
    const skip = await this.eligibility(job, data);
    if (skip) return await this.skip(job, skip);

    const message: BookingMessage = { phone: job.phone, kind: job.kind, data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) };
    let ref: string | undefined;
    try {
      ref = (await this.provider.send(message)).providerRef;
    } catch (error) {
      if (error instanceof ProviderPermanentError) return await this.fail(job, error.code, 'FAILED');
      const code = error instanceof ProviderTemporaryError ? error.code : 'UNKNOWN_ERROR';
      return await this.fail(job, code, job.attempts >= MAX_ATTEMPTS ? 'FAILED' : 'RETRY');
    }
    await this.database.transaction(async (runner) => {
      await runner.query(`INSERT INTO dbo.ThongBaoGiaoNhan(MaCongViec,NhaCungCap,TrangThai,MaThamChieuNhaCungCap) VALUES($1,$2,'SENT',$3)`,
        [job.id, this.provider.name, ref?.slice(0, 64) ?? null]);
      await runner.query(`UPDATE dbo.ThongBaoCongViec SET TrangThai='SENT', KhoaDen=NULL, ThuLaiLuc=NULL, CapNhatLuc=dbo.utc_now() WHERE MaCongViec=$1 AND TrangThai='SENDING'`, [job.id]);
    });
    return 'sent';
  }

  /** Re-validation at send time (the booking may have changed since the job was enqueued). Returns a skip reason or null. */
  private async eligibility(job: ClaimedJob, data: Record<string, unknown>): Promise<string | null> {
    const booking = returnedRows<{ status: string; startsAt: string | null }>(await this.database.query(
      `SELECT l.TrangThaiLichHen AS status, (SELECT to_char(min(c.ThoiDiemBatDau),'DD/MM/YYYY HH24:MI') FROM dbo.KhachSuDungDichVu c WHERE c.MaLichHen=l.MaLichHen) AS "startsAt"
       FROM dbo.LichHen l WHERE l.MaLichHen=$1`, [job.bookingId]))[0];
    if (!booking) return 'BOOKING_NOT_ELIGIBLE';
    const eligible = job.kind === 'BOOKING_CANCELLED' ? booking.status === 'Đã hủy' : NOTIFY_CONFIRMED_STATUSES.includes(booking.status);
    if (!eligible) return 'BOOKING_NOT_ELIGIBLE';
    const consent = returnedRows(await this.database.query(
      'SELECT 1 AS ok FROM dbo.DongYNhanTin WHERE SoDienThoai=$1 AND Kenh=$2 AND ThuHoiLuc IS NULL', [job.phone, CONSENT_CHANNEL]));
    if (!consent.length) return 'NO_CONSENT';
    if (job.kind === 'BOOKING_REMINDER') {
      const label = `${String(data.date ?? '')} ${String(data.time ?? '')}`;
      if (booking.startsAt && booking.startsAt !== label) return 'BOOKING_CHANGED';
      const [d, m, y] = String(data.date ?? '').split('/');
      const startMs = vietnamLocalToMs(`${y}-${m}-${d}T${String(data.time ?? '')}:00`);
      if (!Number.isFinite(startMs) || startMs <= notificationClock.now().getTime()) return 'EXPIRED';
    }
    return null;
  }

  private async skip(job: ClaimedJob, reason: string): Promise<Outcome> {
    await this.database.query(`UPDATE dbo.ThongBaoCongViec SET TrangThai='SKIPPED', LyDoBoQua=$2, KhoaDen=NULL, CapNhatLuc=dbo.utc_now() WHERE MaCongViec=$1 AND TrangThai='SENDING'`, [job.id, reason]);
    return 'skipped';
  }

  private async fail(job: ClaimedJob, code: string, kind: 'RETRY' | 'FAILED'): Promise<Outcome> {
    const safe = safeErrorCode(code);
    await this.database.transaction(async (runner) => {
      await runner.query(`INSERT INTO dbo.ThongBaoGiaoNhan(MaCongViec,NhaCungCap,TrangThai,MaLoi) VALUES($1,$2,$3,$4)`, [job.id, this.provider.name, kind, safe]);
      if (kind === 'FAILED') {
        await runner.query(`UPDATE dbo.ThongBaoCongViec SET TrangThai='FAILED', KhoaDen=NULL, ThuLaiLuc=NULL, LyDoBoQua=$2, CapNhatLuc=dbo.utc_now() WHERE MaCongViec=$1 AND TrangThai='SENDING'`, [job.id, safe]);
      } else {
        const delay = RETRY_BACKOFF_MINUTES[Math.min(job.attempts, RETRY_BACKOFF_MINUTES.length) - 1];
        await runner.query(`UPDATE dbo.ThongBaoCongViec SET TrangThai='PENDING', KhoaDen=NULL, ThuLaiLuc=dbo.utc_now() + make_interval(mins => $2::int), CapNhatLuc=dbo.utc_now() WHERE MaCongViec=$1 AND TrangThai='SENDING'`, [job.id, delay]);
      }
    });
    return kind === 'RETRY' ? 'retried' : 'failed';
  }
}
