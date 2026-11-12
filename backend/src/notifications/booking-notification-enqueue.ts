import { QueryRunner } from 'typeorm';
import { returnedRows } from '../common/pg-result';
import {
  NOTIFY_CONFIRMED_STATUSES, WAS_CONFIRMED_STATUSES, notificationClock, notifyChangesEnabled, parseReminderLeads, utcWallClock, vietnamLocalToMs,
} from './notification-config';

/**
 * Notification job enqueueing. Every function takes the booking transaction's QueryRunner, so a job exists
 * if and only if the booking change committed. Nothing here talks to a provider.
 */
export interface BookingBefore { status: string | null; startsAt: string | null }

interface BookingSnapshot {
  id: string; status: string; phone: string; name: string; startsAt: string | null;
  serviceName: string | null; packageName: string | null; bedId: string | null;
}
type JobKind = 'BOOKING_CONFIRMED' | 'BOOKING_REMINDER' | 'BOOKING_RESCHEDULED' | 'BOOKING_CANCELLED';

const confirmed = (status: string | null) => status !== null && NOTIFY_CONFIRMED_STATUSES.includes(status);
let tablesKnown = false;

/** Migration 004 may not be applied yet: without the tables enqueueing is a no-op and booking writes are unaffected. */
async function tablesPresent(runner: QueryRunner) {
  if (tablesKnown) return true;
  const rows = returnedRows<{ ok: boolean }>(await runner.query("SELECT to_regclass('dbo.ThongBaoCongViec') IS NOT NULL AS ok"));
  tablesKnown = rows[0]?.ok === true;
  return tablesKnown;
}

async function snapshot(runner: QueryRunner, id: string): Promise<BookingSnapshot | undefined> {
  const rows = returnedRows<BookingSnapshot>(await runner.query(
    `SELECT rtrim(l.MaLichHen) AS id, l.TrangThaiLichHen AS status, rtrim(l.SoDienThoaiNguoiDat) AS phone, l.HoTenNguoiDat AS name,
      to_char(c.ThoiDiemBatDau,'YYYY-MM-DD"T"HH24:MI:SS') AS "startsAt", d.TenDichVu AS "serviceName", g.TenGoi AS "packageName", rtrim(c.MaGiuong) AS "bedId"
     FROM dbo.LichHen l LEFT JOIN dbo.KhachSuDungDichVu c ON c.MaLichHen=l.MaLichHen
     LEFT JOIN dbo.GoiDichVu g ON g.MaGoi=c.MaGoi LEFT JOIN dbo.DichVu d ON d.MaDichVu=g.MaDichVu
     WHERE l.MaLichHen=$1 ORDER BY c.ThoiDiemBatDau, c.MaChiTiet LIMIT 1`, [id]));
  return rows[0];
}

/** State of the booking BEFORE the change (call inside the transaction, before writing). */
export async function captureBookingBefore(runner: QueryRunner, id: string): Promise<BookingBefore> {
  const row = await snapshot(runner, id);
  return { status: row?.status ?? null, startsAt: row?.startsAt ?? null };
}

function templateData(b: BookingSnapshot): Record<string, string> {
  const [date, time] = (b.startsAt ?? '').split('T');
  const [y, m, d] = (date ?? '').split('-');
  const data: Record<string, string> = {
    customerName: b.name, bookingId: b.id, date: y ? `${d}/${m}/${y}` : '', time: (time ?? '').slice(0, 5),
    serviceName: b.serviceName ?? '', packageName: b.packageName ?? '',
  };
  if (b.bedId) data.bedId = b.bedId;
  return data;
}

async function insertJob(runner: QueryRunner, kind: JobKind, b: BookingSnapshot, key: string, dueMs: number, reviveCancelled: boolean) {
  const revive = reviveCancelled
    ? `DO UPDATE SET TrangThai='PENDING', LyDoBoQua=NULL, SoLanThu=0, ThuLaiLuc=NULL, KhoaDen=NULL, GuiLuc=EXCLUDED.GuiLuc,
        SoDienThoai=EXCLUDED.SoDienThoai, DuLieuMau=EXCLUDED.DuLieuMau, CapNhatLuc=dbo.utc_now() WHERE ThongBaoCongViec.TrangThai='CANCELLED'`
    : 'DO NOTHING';
  await runner.query(
    `INSERT INTO dbo.ThongBaoCongViec(Loai,MaLichHen,SoDienThoai,KhoaChongTrung,GuiLuc,DuLieuMau) VALUES($1,$2,$3,$4,$5::timestamp,$6::jsonb)
     ON CONFLICT (KhoaChongTrung) ${revive}`,
    [kind, b.id, b.phone, key, utcWallClock(dueMs), JSON.stringify(templateData(b))]);
}

async function cancelPending(runner: QueryRunner, id: string, reason: string, extra = '', params: unknown[] = []) {
  await runner.query(
    `UPDATE dbo.ThongBaoCongViec SET TrangThai='CANCELLED', LyDoBoQua=$2::text, CapNhatLuc=dbo.utc_now()
     WHERE MaLichHen=$1 AND TrangThai='PENDING' ${extra}`, [id, reason, ...params]);
}

/**
 * Brings the booking's notification jobs in line with its current state. Call inside the booking transaction after the
 * write; `before` is null for a newly created booking. Idempotent: dedupe keys make repeated calls harmless.
 */
export async function syncBookingNotifications(runner: QueryRunner, id: string, before: BookingBefore | null, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!(await tablesPresent(runner))) return;
  const b = await snapshot(runner, id);
  if (!b) return;
  const nowMs = notificationClock.now().getTime();
  const changes = notifyChangesEnabled(env);
  const wasConfirmed = confirmed(before?.status ?? null);

  if (!confirmed(b.status)) {
    // Cancelled / arrived / completed (or not confirmed yet): nothing pending may still be sent.
    await cancelPending(runner, id, 'BOOKING_CLOSED');
    if (b.status === 'Đã hủy' && changes && before?.status && WAS_CONFIRMED_STATUSES.includes(before.status)) {
      await insertJob(runner, 'BOOKING_CANCELLED', b, `BOOKING_CANCELLED:${b.id}`, nowMs, false);
    }
    return;
  }

  const startMs = b.startsAt ? vietnamLocalToMs(b.startsAt) : NaN;
  const startsAtIso = Number.isFinite(startMs) ? new Date(startMs).toISOString() : null;
  const rescheduled = !!before?.startsAt && before.startsAt !== b.startsAt;

  if (!wasConfirmed) await insertJob(runner, 'BOOKING_CONFIRMED', b, `BOOKING_CONFIRMED:${b.id}`, nowMs, false);
  // A confirmation that has not been sent yet carries the current time and recipient.
  await runner.query(
    `UPDATE dbo.ThongBaoCongViec SET SoDienThoai=$2, DuLieuMau=$3::jsonb, CapNhatLuc=dbo.utc_now()
     WHERE MaLichHen=$1 AND Loai='BOOKING_CONFIRMED' AND TrangThai='PENDING'`, [id, b.phone, JSON.stringify(templateData(b))]);

  if (startsAtIso) {
    // Reminders of an older start time are obsolete (BOOKING_CHANGED); same-start reminders are kept (not due-but-unsent ones either).
    await cancelPending(runner, id, 'BOOKING_CHANGED', `AND Loai='BOOKING_REMINDER' AND KhoaChongTrung NOT LIKE $3`, [`BOOKING_REMINDER:${b.id}:%:${startsAtIso}`]);
    for (const lead of parseReminderLeads(env.REMINDER_LEAD_MINUTES)) {
      const dueMs = startMs - lead * 60_000;
      if (dueMs <= nowMs) continue; // never send "2 hours before" for a booking created 30 minutes ahead
      await insertJob(runner, 'BOOKING_REMINDER', b, `BOOKING_REMINDER:${b.id}:${lead}:${startsAtIso}`, dueMs, true);
    }
    if (changes && wasConfirmed && rescheduled) {
      const key = `BOOKING_RESCHEDULED:${b.id}:${startsAtIso}`;
      await cancelPending(runner, id, 'SUPERSEDED', `AND Loai='BOOKING_RESCHEDULED' AND KhoaChongTrung<>$3`, [key]);
      await insertJob(runner, 'BOOKING_RESCHEDULED', b, key, nowMs, true);
    }
  }
}
