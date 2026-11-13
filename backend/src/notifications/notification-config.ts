/** Booking statuses that count as "confirmed" for notifications (OPEN DECISION 2 in docs-deploy/OTP_NOTIFICATIONS_DESIGN.md). Never 'Chờ xác nhận'. */
export const NOTIFY_CONFIRMED_STATUSES: readonly string[] = ['Đã xác nhận', 'Chưa đến'];
/** The guest has arrived: a cancellation after this point is still a notifiable cancellation of a confirmed booking. */
export const WAS_CONFIRMED_STATUSES: readonly string[] = [...NOTIFY_CONFIRMED_STATUSES, 'Đã đến'];

export const MAX_ATTEMPTS = 5;
/** Delay before retry number n (index n-1), in minutes: 1, 5, 15, 30; the 5th failed attempt is final. */
export const RETRY_BACKOFF_MINUTES: readonly number[] = [1, 5, 15, 30];
export const LEASE_SECONDS = 120;
export const DEFAULT_DISPATCH_LIMIT = 25;
export const MAX_DISPATCH_LIMIT = 100;
export const CONSENT_CHANNEL = 'ZALO';

/** Vietnam is UTC+7 all year (no DST). */
export const VIETNAM_OFFSET = '+07:00';

/** Overridable in tests; production always uses the real clock. */
export const notificationClock = { now: (): Date => new Date() };

/**
 * REMINDER_LEAD_MINUTES, e.g. "1440,120". Unset/empty/invalid entries => no reminder (the interval is an OPEN DECISION: no default).
 * Returns unique positive integers, largest first.
 */
export function parseReminderLeads(raw: string | undefined): number[] {
  if (!raw?.trim()) return [];
  const leads = raw.split(',').map((s) => s.trim()).filter((s) => /^\d{1,7}$/.test(s)).map(Number).filter((n) => n > 0);
  return [...new Set(leads)].sort((a, b) => b - a);
}

export const notifyChangesEnabled = (env: NodeJS.ProcessEnv = process.env) => env.NOTIFY_CHANGES === 'true';

/** Vietnam wall clock 'YYYY-MM-DDTHH:mm:ss' -> epoch milliseconds. */
export const vietnamLocalToMs = (local: string) => Date.parse(local + VIETNAM_OFFSET);
/** UTC wall clock string accepted by `$n::timestamp` (timestamp without time zone, UTC by convention of dbo.utc_now()). */
export const utcWallClock = (ms: number) => new Date(ms).toISOString().slice(0, 23);
