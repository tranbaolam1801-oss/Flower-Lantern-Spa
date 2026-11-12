import { randomInt } from 'node:crypto';
import { PaymentsConfig } from './payments.config';

export const PENDING = 'Chờ thanh toán';
export const SUCCESS = 'Thành công';
export const EXPIRED = 'Hết hạn';
export const FAILED = 'Thất bại';
export const REFUNDED = 'Đã hoàn tiền';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SUFFIX_LENGTH = 10;

export function generateReference(prefix: string, rand: (max: number) => number = (m) => randomInt(0, m)) {
  let out = prefix;
  for (let i = 0; i < SUFFIX_LENGTH; i++) out += ALPHABET[rand(ALPHABET.length)];
  return out;
}

export function buildQrUrl(cfg: Pick<PaymentsConfig, 'qrBase' | 'accountNumber' | 'bank'>, amount: number, reference: string) {
  const q = new URLSearchParams({ acc: cfg.accountNumber, bank: cfg.bank, amount: String(Math.round(amount)), des: reference });
  return `${cfg.qrBase}?${q.toString()}`;
}

/** SePay's `code` is the documented source; the memo scan is only a lookup key that must still match a stored reference. */
export function extractReference(prefix: string, code: unknown, content: unknown): string | null {
  const re = new RegExp(`${prefix}[${ALPHABET}]{${SUFFIX_LENGTH}}`);
  for (const v of [code, content]) {
    if (typeof v !== 'string') continue;
    const m = re.exec(v.toUpperCase());
    if (m) return m[0];
  }
  return null;
}

export type Outcome =
  | 'CONFIRMED' | 'IGNORED_OUT' | 'UNKNOWN_REFERENCE' | 'ACCOUNT_MISMATCH' | 'UNDERPAID' | 'OVERPAID'
  | 'EXPIRED' | 'DUPLICATE_PAYMENT' | 'BOOKING_CANCELLED';

export interface ReconcileInput {
  transferType: string;
  eventAccount: string;
  expectedAccount: string;
  eventAmount: number;
  payment?: { status: string; amount: number; expired: boolean };
  bookingStatus?: string;
}

/** Pure decision table. Only CONFIRMED changes payment state; every other outcome is audited for manual reconciliation. */
export function reconcile(i: ReconcileInput): Outcome {
  if (i.transferType !== 'in') return 'IGNORED_OUT';
  if (!i.expectedAccount || i.eventAccount !== i.expectedAccount) return 'ACCOUNT_MISMATCH';
  if (!i.payment) return 'UNKNOWN_REFERENCE';
  if (i.payment.status === SUCCESS || i.payment.status === REFUNDED) return 'DUPLICATE_PAYMENT';
  if (i.payment.status !== PENDING || i.payment.expired) return 'EXPIRED';
  if (i.bookingStatus === 'Đã hủy') return 'BOOKING_CANCELLED';
  if (!Number.isFinite(i.eventAmount) || i.eventAmount < i.payment.amount) return 'UNDERPAID';
  if (i.eventAmount > i.payment.amount) return 'OVERPAID';
  return 'CONFIRMED';
}

export function paymentStatusFor(paid: number, total: number) {
  return paid >= total && total > 0 ? 'Đã thanh toán' : paid > 0 ? 'Thanh toán một phần' : 'Chưa thanh toán';
}
