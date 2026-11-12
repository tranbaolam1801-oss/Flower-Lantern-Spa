import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { MIN_SECRET_LENGTH, PaymentsConfig, mockEnabled, readPaymentsConfig } from './payments.config';
import { buildQrUrl, extractReference } from './payment-rules';

export interface NormalizedPaymentEvent {
  provider: 'SEPAY' | 'MOCK';
  providerTxId: string;
  transferType: string;
  amount: number;
  accountNumber: string;
  reference: string | null;
  content: string;
}

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer | string;
}

export interface PaymentProvider {
  readonly name: 'SEPAY' | 'MOCK';
  buildQrUrl(amount: number, reference: string): string;
  verifyWebhook(req: WebhookRequest): void;
  parseWebhook(body: unknown): NormalizedPaymentEvent;
}

const header = (h: WebhookRequest['headers'], name: string) => {
  const v = h[name];
  return typeof v === 'string' ? v.trim() : undefined;
};

/** Compares fixed-size digests so length differences do not leak and timing is independent of the secret. */
export function safeEqual(a: string, b: string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

const deny = () => new UnauthorizedException('Xác thực webhook không hợp lệ.');
const logger = new Logger('SepayWebhook');

export class SepayProvider implements PaymentProvider {
  readonly name = 'SEPAY' as const;
  constructor(private readonly config: () => PaymentsConfig = readPaymentsConfig, private readonly now: () => number = () => Date.now()) {}

  buildQrUrl(amount: number, reference: string) {
    return buildQrUrl(this.config(), amount, reference);
  }

  /** Documented: `Authorization: Apikey KEY`, or `X-SePay-Signature: sha256=hex` over `{X-SePay-Timestamp}.{raw body}`. */
  verifyWebhook(req: WebhookRequest) {
    const cfg = this.config();
    if (cfg.authMode === 'apikey') {
      if (cfg.apiKey.length < MIN_SECRET_LENGTH) return this.notConfigured('SEPAY_API_KEY');
      const m = /^apikey (\S+)$/i.exec(header(req.headers, 'authorization') ?? '');
      if (!m || !safeEqual(m[1], cfg.apiKey)) throw deny();
      return;
    }
    if (cfg.hmacSecret.length < MIN_SECRET_LENGTH) return this.notConfigured('SEPAY_WEBHOOK_SECRET');
    const ts = header(req.headers, 'x-sepay-timestamp');
    const sig = header(req.headers, 'x-sepay-signature');
    if (!ts || !sig || !/^\d{1,12}$/.test(ts) || req.rawBody === undefined) throw deny();
    if (Math.abs(this.now() / 1000 - Number(ts)) > cfg.hmacToleranceSeconds) throw deny();
    const raw = typeof req.rawBody === 'string' ? Buffer.from(req.rawBody) : req.rawBody;
    const expected = 'sha256=' + createHmac('sha256', cfg.hmacSecret).update(Buffer.concat([Buffer.from(`${ts}.`), raw])).digest('hex');
    if (!safeEqual(sig, expected)) throw deny();
  }

  /** Unauthenticated callers always see the same 401; the misconfiguration is only logged (never the secret). */
  private notConfigured(variable: string): never {
    logger.error(`${variable} is missing or shorter than ${MIN_SECRET_LENGTH} characters; rejecting every webhook until it is configured.`);
    throw deny();
  }

  parseWebhook(body: unknown): NormalizedPaymentEvent {
    const b = body as Record<string, unknown> | null;
    const bad = () => new BadRequestException('Dữ liệu webhook không hợp lệ.');
    if (!b || typeof b !== 'object') throw bad();
    const id = b.id;
    if (!(typeof id === 'number' && Number.isSafeInteger(id) && id > 0) && !(typeof id === 'string' && /^\d{1,20}$/.test(id))) throw bad();
    // JSON sends an integer; the form-encoded data format (also offered by SePay) sends digits as a string.
    const amount = typeof b.transferAmount === 'string' && /^\d{1,12}(\.0+)?$/.test(b.transferAmount) ? Number(b.transferAmount) : b.transferAmount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1e12) throw bad();
    if (typeof b.transferType !== 'string' || typeof b.accountNumber !== 'string') throw bad();
    const content = typeof b.content === 'string' ? b.content : '';
    return {
      provider: 'SEPAY', providerTxId: String(id), transferType: b.transferType, amount,
      accountNumber: b.accountNumber, content, reference: extractReference(this.config().prefix, b.code, content),
    };
  }
}

/** TEST ONLY. Produces simulated events; a result is never a real bank settlement. Refuses to run when NODE_ENV=production. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'MOCK' as const;
  constructor(private readonly env: () => NodeJS.ProcessEnv = () => process.env, private readonly config: () => PaymentsConfig = readPaymentsConfig) {}

  isEnabled() {
    return mockEnabled(this.env());
  }

  assertEnabled() {
    if (!this.isEnabled()) throw new NotFoundException();
  }

  buildQrUrl(amount: number, reference: string) {
    return buildQrUrl(this.config(), amount, reference);
  }

  verifyWebhook(): void {
    throw new ForbiddenException('MockPaymentProvider không nhận webhook HTTP.');
  }

  parseWebhook(): NormalizedPaymentEvent {
    throw new ForbiddenException('MockPaymentProvider không nhận webhook HTTP.');
  }

  simulate(reference: string, amount: number, transferType = 'in'): NormalizedPaymentEvent {
    this.assertEnabled();
    return {
      provider: 'MOCK', providerTxId: `MOCK-${randomUUID()}`, transferType, amount,
      accountNumber: this.config().accountNumber, reference, content: `${reference} MOCK`,
    };
  }
}
