/**
 * Provider boundary for OTP delivery and booking notifications. The application depends only on these interfaces;
 * real adapters (Zalo ZNS, SMS) and the mock are interchangeable. Provider credentials live ONLY in server-side env.
 */
export const OTP_SENDER = 'OTP_SENDER';
export const NOTIFICATION_PROVIDER = 'NOTIFICATION_PROVIDER';

export type OtpPurpose = 'REGISTER' | 'RESET_PASSWORD';
export type NotificationKind = 'BOOKING_CONFIRMED' | 'BOOKING_REMINDER' | 'BOOKING_RESCHEDULED' | 'BOOKING_CANCELLED';

export interface OtpMessage { phone: string; code: string; purpose: OtpPurpose; ttlMinutes: number }
export interface BookingMessage {
  phone: string;
  kind: NotificationKind;
  /** Template parameters, all strings: customerName, bookingId, date (DD/MM/YYYY), time (HH:mm), serviceName, packageName, bedId?. */
  data: Record<string, string>;
}
export interface SendResult { providerRef?: string }

/** Network/5xx/rate-limit: the job is retried with backoff. */
export class ProviderTemporaryError extends Error {
  constructor(readonly code: string, message = code) { super(message); this.name = 'ProviderTemporaryError'; }
}
/** Invalid number, template rejected, user not reachable...: never retried. */
export class ProviderPermanentError extends Error {
  constructor(readonly code: string, message = code) { super(message); this.name = 'ProviderPermanentError'; }
}

export interface OtpSender { readonly name: 'ZALO_ZNS' | 'SMS' | 'MOCK'; sendOtp(message: OtpMessage): Promise<SendResult> }
export interface NotificationProvider { readonly name: 'ZALO_ZNS' | 'MOCK'; send(message: BookingMessage): Promise<SendResult> }

/** Records every message in memory. TEST/DEVELOPMENT ONLY — see mockMessagingAllowed(). Never contacts a phone. */
export class MockMessageProvider implements OtpSender, NotificationProvider {
  readonly name = 'MOCK' as const;
  readonly otps: OtpMessage[] = [];
  readonly notifications: BookingMessage[] = [];
  /** Set by tests to simulate provider failures for the next calls. */
  failNext: ProviderTemporaryError | ProviderPermanentError | null = null;
  private counter = 0;

  async sendOtp(message: OtpMessage): Promise<SendResult> {
    this.throwIfFailing();
    this.otps.push(message);
    return { providerRef: `mock-otp-${++this.counter}` };
  }
  async send(message: BookingMessage): Promise<SendResult> {
    this.throwIfFailing();
    this.notifications.push(message);
    return { providerRef: `mock-msg-${++this.counter}` };
  }
  lastOtp(phone: string): string | undefined { return [...this.otps].reverse().find((m) => m.phone === phone)?.code; }
  clear() { this.otps.length = 0; this.notifications.length = 0; this.failNext = null; }
  private throwIfFailing() { if (this.failNext) { const e = this.failNext; this.failNext = null; throw e; } }
}

/** Positive allow-list: the mock can only run when NODE_ENV is test/development AND MESSAGING_MOCK=true. Never on production. */
export function mockMessagingAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MESSAGING_MOCK === 'true' && (env.NODE_ENV === 'test' || env.NODE_ENV === 'development');
}

/** Used when no real provider is configured in a non-mock environment: every send fails with a generic, non-retryable-looking error. */
export class UnconfiguredMessagingProvider implements OtpSender, NotificationProvider {
  readonly name = 'MOCK' as const; // never used to deliver; name only satisfies the union
  async sendOtp(): Promise<SendResult> { throw new ProviderTemporaryError('PROVIDER_NOT_CONFIGURED'); }
  async send(): Promise<SendResult> { throw new ProviderTemporaryError('PROVIDER_NOT_CONFIGURED'); }
}
