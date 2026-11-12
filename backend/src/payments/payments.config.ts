export type WebhookAuthMode = 'apikey' | 'hmac';

export interface PaymentsConfig {
  prefix: string;
  expiryMinutes: number;
  accountNumber: string;
  bank: string;
  accountHolder: string;
  qrBase: string;
  authMode: WebhookAuthMode;
  apiKey: string;
  hmacSecret: string;
  hmacToleranceSeconds: number;
}

/** Secrets come from the environment only. Read at call time so tests and restarts see current values. */
export function readPaymentsConfig(env: NodeJS.ProcessEnv = process.env): PaymentsConfig {
  const prefix = (env.SEPAY_PAYMENT_PREFIX ?? 'FLS').trim().toUpperCase();
  const minutes = Number(env.PAYMENT_EXPIRY_MINUTES ?? 15);
  return {
    prefix: /^[A-Z0-9]{2,8}$/.test(prefix) ? prefix : 'FLS',
    expiryMinutes: Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440 ? minutes : 15,
    accountNumber: (env.SEPAY_ACCOUNT_NUMBER ?? '').trim(),
    bank: (env.SEPAY_BANK ?? '').trim(),
    accountHolder: (env.SEPAY_ACCOUNT_HOLDER ?? '').trim(),
    qrBase: (env.SEPAY_QR_BASE ?? 'https://qr.sepay.vn/img').trim(),
    authMode: env.SEPAY_WEBHOOK_AUTH === 'hmac' ? 'hmac' : 'apikey',
    apiKey: (env.SEPAY_API_KEY ?? '').trim(),
    hmacSecret: (env.SEPAY_WEBHOOK_SECRET ?? '').trim(),
    hmacToleranceSeconds: 300,
  };
}

/** Shorter webhook secrets are treated as not configured. */
export const MIN_SECRET_LENGTH = 32;

/** Positive allow-list: an unset or unknown NODE_ENV never enables the mock. */
export function mockEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.PAYMENT_MOCK_ENABLED === 'true' && (env.NODE_ENV === 'test' || env.NODE_ENV === 'development');
}
