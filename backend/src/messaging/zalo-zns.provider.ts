import {
  BookingMessage, NotificationKind, NotificationProvider, OtpMessage, OtpSender, ProviderPermanentError, ProviderTemporaryError, SendResult,
} from './message-provider';

/**
 * Zalo ZNS (ZBS Template Message) adapter.
 *
 * STATUS: written from third-party documentation (RedAI SDK, eSMS, community guides) because Zalo's official API
 * reference (developers.zalo.me) renders client-side and could not be fetched when this was built. It is covered by
 * tests against a LOCAL mock server only. It has NEVER sent a real message. Before real use:
 *   1. a verified Official Account + ZBS account with prepaid balance + approved templates are required (owner action);
 *   2. confirm endpoint, header name, phone format, error codes and template variable names against the official docs;
 *   3. templates must use exactly the variable names in BookingMessage.data / below (customerName, bookingId, date, time,
 *      serviceName, packageName) and `otp` for the OTP template.
 * The OA access token is supplied by the environment (ZALO_ACCESS_TOKEN). Automatic refresh-token rotation is NOT
 * implemented (refresh tokens rotate and would have to be persisted encrypted) — see docs-deploy/ZALO_N8N_PROVIDER_SETUP.md.
 * Tokens are never logged and never placed in error objects.
 */
export interface ZaloZnsConfig {
  endpoint: string;
  accessToken: string;
  /** 'development' asks Zalo for test mode (documented by third parties as: not charged, test only). */
  mode?: 'development';
  templates: { otp: string } & Record<NotificationKind, string>;
  timeoutMs: number;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const DEFAULT_ENDPOINT = 'https://business.openapi.zalo.me/message/template';

export function readZaloZnsConfig(env: NodeJS.ProcessEnv = process.env): ZaloZnsConfig | null {
  const accessToken = env.ZALO_ACCESS_TOKEN?.trim();
  const t = (k: string) => env[k]?.trim() ?? '';
  const templates = {
    otp: t('ZALO_TEMPLATE_OTP'),
    BOOKING_CONFIRMED: t('ZALO_TEMPLATE_BOOKING_CONFIRMED'),
    BOOKING_REMINDER: t('ZALO_TEMPLATE_BOOKING_REMINDER'),
    BOOKING_RESCHEDULED: t('ZALO_TEMPLATE_BOOKING_RESCHEDULED'),
    BOOKING_CANCELLED: t('ZALO_TEMPLATE_BOOKING_CANCELLED'),
  };
  if (!accessToken || accessToken.length < 20) return null;
  const timeout = Number(env.ZALO_TIMEOUT_MS ?? 8000);
  return {
    endpoint: env.ZALO_ZNS_ENDPOINT?.trim() || DEFAULT_ENDPOINT,
    accessToken,
    mode: env.ZALO_ZNS_MODE === 'development' ? 'development' : undefined,
    templates,
    timeoutMs: Number.isInteger(timeout) && timeout >= 1000 && timeout <= 30000 ? timeout : 8000,
  };
}

/** 0xxxxxxxxx (stored form) -> 84xxxxxxxxx as Zalo expects (third-party documented). */
export function toZaloPhone(stored: string): string {
  if (!/^0[0-9]{9}$/.test(stored)) throw new ProviderPermanentError('INVALID_PHONE');
  return `84${stored.slice(1)}`;
}

export class ZaloZnsProvider implements OtpSender, NotificationProvider {
  readonly name = 'ZALO_ZNS' as const;

  constructor(private readonly config: ZaloZnsConfig, private readonly doFetch: FetchLike = fetch as unknown as FetchLike) {}

  async sendOtp(message: OtpMessage): Promise<SendResult> {
    const template = this.config.templates.otp;
    if (!template) throw new ProviderPermanentError('TEMPLATE_NOT_CONFIGURED');
    return this.post(toZaloPhone(message.phone), template, { otp: message.code }, `otp-${message.purpose}`);
  }

  async send(message: BookingMessage): Promise<SendResult> {
    const template = this.config.templates[message.kind];
    if (!template) throw new ProviderPermanentError('TEMPLATE_NOT_CONFIGURED');
    // All template_data values must be strings.
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(message.data)) data[k] = String(v);
    return this.post(toZaloPhone(message.phone), template, data, message.data.bookingId ? `${message.kind}-${message.data.bookingId}` : message.kind);
  }

  private async post(phone: string, templateId: string, templateData: Record<string, string>, trackingPrefix: string): Promise<SendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await this.doFetch(this.config.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', access_token: this.config.accessToken },
        body: JSON.stringify({
          phone, template_id: templateId, template_data: templateData,
          tracking_id: `${trackingPrefix}-${Date.now().toString(36)}`.slice(0, 48),
          ...(this.config.mode ? { mode: this.config.mode } : {}),
        }),
        signal: controller.signal,
      });
    } catch {
      throw new ProviderTemporaryError('NETWORK_ERROR'); // timeout / DNS / connection reset: retry later
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429 || res.status >= 500) throw new ProviderTemporaryError(`HTTP_${res.status}`);
    type ZaloBody = { error?: number; message?: string; data?: { msg_id?: string } };
    let body = null as ZaloBody | null;
    try { body = (await res.json()) as ZaloBody; } catch { /* non-JSON body */ }
    if (res.ok && body && body.error === 0) return { providerRef: body.data?.msg_id ? String(body.data.msg_id).slice(0, 64) : undefined };
    // Only the numeric provider code is kept; the message text and any echoed payload are discarded.
    const code = body && typeof body.error === 'number' ? `ZALO_${body.error}` : `HTTP_${res.status}`;
    if (res.status === 401 || res.status === 403) throw new ProviderTemporaryError(code); // expired token: operator fixes config; retried meanwhile
    throw new ProviderPermanentError(code);
  }
}
