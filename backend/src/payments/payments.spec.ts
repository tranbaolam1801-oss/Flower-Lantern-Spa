import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { JwtPayload } from '../auth/auth.dto';
import { MockPaymentProvider, SepayProvider, safeEqual } from './payment-provider';
import { buildQrUrl, extractReference, generateReference, paymentStatusFor, reconcile } from './payment-rules';
import { mockEnabled, readPaymentsConfig } from './payments.config';
import { CreateSepayIntentDto, MockWebhookDto, RefundPaymentDto } from './payments.dto';
import { PaymentsController } from './payments.controller';
import { NOT_MIGRATED, PaymentsService } from './payments.service';

const KEY = 'test-api-key-0123456789abcdef-0123456789';
const SECRET = 'test-hmac-secret-0123456789abcdef-012345';
const ENV = {
  SEPAY_API_KEY: KEY, SEPAY_WEBHOOK_SECRET: SECRET, SEPAY_ACCOUNT_NUMBER: '0123456789', SEPAY_BANK: 'TestBank',
  SEPAY_ACCOUNT_HOLDER: 'FLOWER LANTERN', SEPAY_PAYMENT_PREFIX: 'FLS', PAYMENT_EXPIRY_MINUTES: '15', PAYMENT_MOCK_ENABLED: 'true',
};
const saved = { ...process.env };
beforeEach(() => { Object.assign(process.env, ENV); delete process.env.SEPAY_WEBHOOK_AUTH; process.env.NODE_ENV = 'test'; });
afterAll(() => { process.env = saved; });

interface Pay { paymentId: string; bookingId: string; reference: string; amount: number; status: string; expiresAt: string; expired: number; account: string; customerId: string; refunded: number; bookingStatus: string; provider?: string }
class FakeDb {
  ready = 1;
  booking = { customerId: 'KH1', status: 'Chưa đến', pay: 'Chưa thanh toán' };
  total = 500000;
  accounts: Record<string, string> = { TK_OWNER: 'KH1' };
  payments: Pay[] = [];
  events: { provider: string; tx: string; outcome: string; paymentId: string | null; raw?: string }[] = [];
  refunds: { paymentId: string; amount: number; reason: string; actor: string }[] = [];
  committed = 0; rolledBack = 0;
  runner = { isTransactionActive: true, connect: async () => undefined, startTransaction: async () => undefined, release: async () => undefined,
    commitTransaction: async () => { this.committed++; }, rollbackTransaction: async () => { this.rolledBack++; }, query: (s: string, p: unknown[] = []) => this.run(s, p) };
  getDataSource = async () => ({ createQueryRunner: () => this.runner });
  query = async (s: string, p: unknown[] = []) => (s.includes('COL_LENGTH') ? [{ ready: this.ready }] : this.run(s, p));
  async run(s: string, p: unknown[]): Promise<Record<string, unknown>[]> {
    const byRef = (r: unknown) => this.payments.find((x) => x.reference === r);
    if (s.includes('AS eventId')) return this.events.filter((e) => e.outcome !== 'CONFIRMED').reverse().slice(p[0] as number, (p[0] as number) + (p[1] as number)).map((e, i) => ({ eventId: i + 1, provider: e.provider, providerTxId: e.tx, paymentId: e.paymentId, amount: 1, outcome: e.outcome }));
    if (s.includes('AS paymentId')) { const x = s.includes('MaThamChieu=@0') ? byRef(p[0]) : this.payments.find((q) => q.paymentId === p[0]); return x ? [{ ...x, bookingStatus: this.booking.status }] : []; }
    if (s.includes('FROM dbo.LichHen WITH(UPDLOCK,HOLDLOCK) WHERE MaLichHen=@0') && s.includes('AS customerId')) return [{ ...this.booking }];
    if (s.includes('SELECT MaLichHen FROM dbo.LichHen WITH')) return [{}];
    if (s.includes('FROM dbo.KhachHang')) return this.accounts[p[1] as string] === p[0] ? [{ ok: 1 }] : [];
    if (s.includes('SUM(g.Gia)')) return [{ v: this.total }];
    if (s.includes('SUM(SoTienThanhToan-')) return [{ v: this.payments.filter((x) => x.status === 'Thành công').reduce((a, x) => a + x.amount - x.refunded, 0) }];
    if (s.includes('TOP(1) RTRIM(MaThanhToan)')) { const x = this.payments.find((q) => q.status === 'Chờ thanh toán' && !q.expired); return x ? [{ id: x.paymentId, amount: x.amount }] : []; }
    if (s.startsWith('UPDATE dbo.ThanhToan SET TrangThaiGiaoDich=@1 WHERE MaLichHen')) { this.payments.filter((x) => x.status === p[2]).forEach((x) => (x.status = p[1] as string)); return []; }
    if (s.includes('SELECT 1 AS found FROM dbo.ThanhToan')) return [];
    if (s.startsWith('INSERT dbo.ThanhToan(')) { this.payments.push({ paymentId: p[0] as string, bookingId: p[1] as string, amount: p[2] as number, status: p[3] as string, reference: p[4] as string, expiresAt: '2026-11-12T10:15:00', expired: 0, account: p[6] as string, customerId: 'KH1', refunded: 0, bookingStatus: '' }); return []; }
    if (s.includes('SELECT RTRIM(MaLichHen) AS bookingId FROM dbo.ThanhToan')) { const x = s.includes('MaThamChieu') ? byRef(p[0]) : this.payments.find((q) => q.paymentId === p[0]); return x ? [{ bookingId: x.bookingId }] : []; }
    if (s.includes('SELECT MaThanhToan FROM dbo.ThanhToan WITH')) return [];
    if (s.startsWith('SELECT COUNT(*) AS v FROM dbo.SePayWebhookEvent')) return [{ v: this.events.filter((e) => e.outcome !== 'CONFIRMED').length }];
    if (s.startsWith('INSERT dbo.ThanhToanHoanTien')) { this.refunds.push({ paymentId: p[0] as string, amount: p[1] as number, reason: p[2] as string, actor: p[3] as string }); return []; }
    if (s.includes('FROM dbo.SePayWebhookEvent')) return this.events.some((e) => e.provider === p[0] && e.tx === p[1]) ? [{ found: 1 }] : [];
    if (s.startsWith('INSERT dbo.SePayWebhookEvent') && s.includes("'INVALID_PAYLOAD'")) { this.events.push({ provider: p[0] as string, tx: p[1] as string, paymentId: null, outcome: 'INVALID_PAYLOAD', raw: p[2] as string }); return []; }
    if (s.startsWith('INSERT dbo.SePayWebhookEvent')) { this.events.push({ provider: p[0] as string, tx: p[1] as string, paymentId: p[2] as string | null, outcome: p[7] as string }); return []; }
    if (s.startsWith('UPDATE dbo.ThanhToan SET TrangThaiGiaoDich=@1,NgayGhiNhan')) { const x = this.payments.find((q) => q.paymentId === p[0] && q.status === p[4]); if (!x) return []; x.status = p[1] as string; x.provider = p[2] as string; return [{ MaThanhToan: x.paymentId }]; }
    if (s.startsWith('UPDATE dbo.LichHen SET TrangThaiThanhToan')) { this.booking.pay = p[1] as string; return []; }
    if (s.startsWith('SELECT TrangThaiGiaoDich AS status,CAST(SoTienThanhToan')) { const x = this.payments.find((q) => q.paymentId === p[0]); return x ? [{ status: x.status, amount: x.amount, refunded: x.refunded }] : []; }
    if (s.startsWith('UPDATE dbo.ThanhToan SET KhoanHoanTien')) { const x = this.payments.find((q) => q.paymentId === p[0])!; x.refunded = p[1] as number; x.status = p[2] as string; return []; }
    throw new Error('unhandled SQL in fake: ' + s.slice(0, 80));
  }
}

const customer = (sub = 'TK_OWNER'): JwtPayload => ({ sub, username: 'u', phone: '0900000000', role: 'Khách hàng', fullName: 'KH', permissions: [] });
const staff = (permissions: string[] = ['Q01'], role = 'Nhân viên'): JwtPayload => ({ sub: 'NV', username: 's', phone: '0900000001', role, fullName: 'NV', permissions });
const make = () => { const db = new FakeDb(); return { db, svc: new PaymentsService(db as never) }; };
const sepayBody = (o: Record<string, unknown> = {}) => ({ id: 92704, gateway: 'TestBank', accountNumber: '0123456789', transferType: 'in', transferAmount: 500000, code: null, content: '', ...o });
const apiKeyReq = (key = KEY) => ({ headers: { authorization: `Apikey ${key}` } });

describe('config and rules', () => {
  it('reads env with safe fallbacks', () => {
    expect(readPaymentsConfig({ SEPAY_PAYMENT_PREFIX: 'x!', PAYMENT_EXPIRY_MINUTES: '1' } as never)).toMatchObject({ prefix: 'FLS', expiryMinutes: 15, authMode: 'apikey' });
    expect(readPaymentsConfig({ SEPAY_WEBHOOK_AUTH: 'hmac', PAYMENT_EXPIRY_MINUTES: '30' } as never)).toMatchObject({ authMode: 'hmac', expiryMinutes: 30 });
  });
  it('reference has prefix, fixed alphabet and is unique over many draws', () => {
    const refs = new Set(Array.from({ length: 2000 }, () => generateReference('FLS')));
    expect(refs.size).toBe(2000);
    for (const r of refs) expect(r).toMatch(/^FLS[A-HJ-NP-Z2-9]{10}$/);
  });
  it('builds an amount-specific QR url with documented parameters', () => {
    const url = new URL(buildQrUrl(readPaymentsConfig(), 500000, 'FLSABCDEFGHJK'));
    expect(url.origin + url.pathname).toBe('https://qr.sepay.vn/img');
    expect(Object.fromEntries(url.searchParams)).toEqual({ acc: '0123456789', bank: 'TestBank', amount: '500000', des: 'FLSABCDEFGHJK' });
  });
  it('extracts reference from code first, then memo; ignores foreign text', () => {
    expect(extractReference('FLS', 'FLSABCDEFGHJK', '')).toBe('FLSABCDEFGHJK');
    expect(extractReference('FLS', null, 'chuyen tien flsabcdefghjk cam on')).toBe('FLSABCDEFGHJK');
    expect(extractReference('FLS', null, 'hello')).toBeNull();
    expect(extractReference('FLS', 'XYZ', undefined)).toBeNull();
  });
  it('maps paid amount to booking payment status', () => {
    expect(paymentStatusFor(0, 100)).toBe('Chưa thanh toán');
    expect(paymentStatusFor(50, 100)).toBe('Thanh toán một phần');
    expect(paymentStatusFor(100, 100)).toBe('Đã thanh toán');
  });
});

describe('reconcile decision table', () => {
  const base = { transferType: 'in', eventAccount: '0123456789', expectedAccount: '0123456789', eventAmount: 1000, payment: { status: 'Chờ thanh toán', amount: 1000, expired: false }, bookingStatus: 'Chưa đến' };
  it.each([
    ['exact', {}, 'CONFIRMED'],
    ['outgoing transfer', { transferType: 'out' }, 'IGNORED_OUT'],
    ['wrong account', { eventAccount: '999' }, 'ACCOUNT_MISMATCH'],
    ['unknown reference', { payment: undefined }, 'UNKNOWN_REFERENCE'],
    ['underpaid', { eventAmount: 999 }, 'UNDERPAID'],
    ['overpaid', { eventAmount: 1001 }, 'OVERPAID'],
    ['expired by time', { payment: { status: 'Chờ thanh toán', amount: 1000, expired: true } }, 'EXPIRED'],
    ['expired status', { payment: { status: 'Hết hạn', amount: 1000, expired: false } }, 'EXPIRED'],
    ['already paid (second transfer)', { payment: { status: 'Thành công', amount: 1000, expired: false } }, 'DUPLICATE_PAYMENT'],
    ['refunded then paid again', { payment: { status: 'Đã hoàn tiền', amount: 1000, expired: false } }, 'DUPLICATE_PAYMENT'],
    ['cancelled booking', { bookingStatus: 'Đã hủy' }, 'BOOKING_CANCELLED'],
    ['NaN amount', { eventAmount: NaN }, 'UNDERPAID'],
    ['empty configured account', { expectedAccount: '', eventAccount: '' }, 'ACCOUNT_MISMATCH'],
  ])('%s', (_n, over, expected) => expect(reconcile({ ...base, ...over } as never)).toBe(expected));
  it('completed booking can still be paid (payment status is separate)', () => expect(reconcile({ ...base, bookingStatus: 'Hoàn thành' })).toBe('CONFIRMED'));
});

describe('webhook authentication', () => {
  const p = () => new SepayProvider();
  it('accepts the documented Apikey header', () => expect(() => p().verifyWebhook(apiKeyReq())).not.toThrow());
  it.each([['missing', {}], ['wrong key', { authorization: 'Apikey nope' }], ['bearer', { authorization: `Bearer ${KEY}` }], ['no scheme', { authorization: KEY }], ['extra token', { authorization: `Apikey ${KEY} x` }]])('rejects %s', (_n, headers) => {
    expect(() => p().verifyWebhook({ headers })).toThrow(UnauthorizedException);
  });
  it('fails closed with the same 401 when the key is missing, too short or blank (never 503, never accepts)', () => {
    for (const key of ['', '   ', 'short-key-123', 'x'.repeat(31)]) {
      process.env.SEPAY_API_KEY = key;
      expect(() => p().verifyWebhook(apiKeyReq(key.trim()))).toThrow(UnauthorizedException);
      expect(() => p().verifyWebhook({ headers: {} })).toThrow(UnauthorizedException);
    }
  });
  it('a 32-character key is accepted and surrounding whitespace in the env value is trimmed', () => {
    process.env.SEPAY_API_KEY = `  ${'a'.repeat(32)}\n`;
    expect(() => p().verifyWebhook(apiKeyReq('a'.repeat(32)))).not.toThrow();
  });
  it('scheme is case-insensitive and surrounding whitespace is tolerated; key itself is exact', () => {
    expect(() => p().verifyWebhook({ headers: { authorization: ` apikey ${KEY} ` } })).not.toThrow();
    expect(() => p().verifyWebhook({ headers: { authorization: `Apikey ${KEY.toUpperCase()}` } })).toThrow(UnauthorizedException);
  });
  it('safeEqual compares in constant-size digests', () => {
    expect(safeEqual('a', 'a')).toBe(true);
    expect(safeEqual('a', 'aa')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
  });
  describe('hmac mode', () => {
    const now = 1_800_000_000_000;
    const sign = (ts: string, raw: string, secret = SECRET) => 'sha256=' + createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
    const hp = () => { process.env.SEPAY_WEBHOOK_AUTH = 'hmac'; return new SepayProvider(readPaymentsConfig, () => now); };
    const ts = String(now / 1000);
    const raw = '{"id":1}';
    it('accepts a valid signature over timestamp.rawBody', () => expect(() => hp().verifyWebhook({ headers: { 'x-sepay-signature': sign(ts, raw), 'x-sepay-timestamp': ts }, rawBody: Buffer.from(raw) })).not.toThrow());
    it.each([
      ['wrong secret', () => ({ 'x-sepay-signature': sign(ts, raw, 'x'), 'x-sepay-timestamp': ts })],
      ['tampered body', () => ({ 'x-sepay-signature': sign(ts, '{"id":2}'), 'x-sepay-timestamp': ts })],
      ['stale timestamp', () => ({ 'x-sepay-signature': sign('1', raw), 'x-sepay-timestamp': '1' })],
      ['missing timestamp', () => ({ 'x-sepay-signature': sign(ts, raw) })],
      ['missing signature', () => ({ 'x-sepay-timestamp': ts })],
      ['no sha256 prefix', () => ({ 'x-sepay-signature': sign(ts, raw).slice(7), 'x-sepay-timestamp': ts })],
    ])('rejects %s', (_n, headers) => expect(() => hp().verifyWebhook({ headers: headers(), rawBody: Buffer.from(raw) })).toThrow(UnauthorizedException));
    it('short or empty hmac secret is treated as not configured (401)', () => {
      process.env.SEPAY_WEBHOOK_SECRET = 'short';
      expect(() => hp().verifyWebhook({ headers: { 'x-sepay-signature': sign(ts, raw, 'short'), 'x-sepay-timestamp': ts }, rawBody: Buffer.from(raw) })).toThrow(UnauthorizedException);
    });
    it('rejects when raw body is unavailable (main.ts rawBody not enabled)', () => expect(() => hp().verifyWebhook({ headers: { 'x-sepay-signature': sign(ts, raw), 'x-sepay-timestamp': ts } })).toThrow(UnauthorizedException));
  });
  it('parseWebhook accepts digit strings, optionally with a .0 fraction', () => {
    expect(p().parseWebhook(sepayBody({ transferAmount: '500000' })).amount).toBe(500000);
    expect(p().parseWebhook(sepayBody({ transferAmount: '500000.00' })).amount).toBe(500000);
  });
  it('parseWebhook validates required fields', () => {
    expect(p().parseWebhook(sepayBody({ code: 'FLSABCDEFGHJK' }))).toMatchObject({ providerTxId: '92704', amount: 500000, reference: 'FLSABCDEFGHJK', transferType: 'in' });
    for (const bad of [null, {}, sepayBody({ id: 0 }), sepayBody({ id: 'x' }), sepayBody({ transferAmount: '5.5' }), sepayBody({ transferAmount: '5.1' }), sepayBody({ transferAmount: '1234567890123' }), sepayBody({ transferAmount: 'abc' }), sepayBody({ transferAmount: '' }), sepayBody({ transferAmount: -1 }), sepayBody({ transferAmount: 1e13 }), sepayBody({ transferType: 1 }), sepayBody({ accountNumber: undefined })]) {
      expect(() => p().parseWebhook(bad)).toThrow('Dữ liệu webhook');
    }
  });
});

describe('mock provider guard', () => {
  it('enabled only with flag and non-production', () => {
    expect(mockEnabled({ PAYMENT_MOCK_ENABLED: 'true', NODE_ENV: 'test' } as never)).toBe(true);
    expect(mockEnabled({ PAYMENT_MOCK_ENABLED: 'true', NODE_ENV: 'production' } as never)).toBe(false);
    expect(mockEnabled({ NODE_ENV: 'test' } as never)).toBe(false);
    expect(mockEnabled({ PAYMENT_MOCK_ENABLED: 'true', NODE_ENV: 'development' } as never)).toBe(true);
    for (const env of [undefined, '', 'staging', 'prod', 'Production']) expect(mockEnabled({ PAYMENT_MOCK_ENABLED: 'true', NODE_ENV: env } as never)).toBe(false);
  });
  it('simulate throws NotFound when NODE_ENV is unset even when the flag is set', () => {
    delete process.env.NODE_ENV;
    expect(() => new MockPaymentProvider().simulate('FLSX', 1)).toThrow(NotFoundException);
  });
  it('simulate throws NotFound in production even when flag set', () => {
    process.env.NODE_ENV = 'production';
    expect(() => new MockPaymentProvider().simulate('FLSX', 1)).toThrow(NotFoundException);
  });
  it('produces MOCK-labelled events and never accepts HTTP webhooks', () => {
    const m = new MockPaymentProvider();
    expect(m.simulate('FLSX', 5).providerTxId).toMatch(/^MOCK-/);
    expect(() => m.verifyWebhook()).toThrow(ForbiddenException);
  });
  it('mockSettle answers 404 when disabled', async () => {
    process.env.PAYMENT_MOCK_ENABLED = 'false';
    await expect(make().svc.mockSettle({ paymentId: 'TT1' })).rejects.toThrow(NotFoundException);
  });
});

describe('intent', () => {
  it('computes payable amount from SQL, never from the client', async () => {
    const { svc, db } = make();
    const dto = await svc.createIntent(customer(), 'LH00000001');
    expect(dto).toMatchObject({ bookingId: 'LH00000001', amount: 500000, status: 'Chờ thanh toán', accountNumber: '0123456789', bankName: 'TestBank' });
    expect(dto.reference).toMatch(/^FLS[A-HJ-NP-Z2-9]{10}$/);
    expect(dto.qrUrl).toContain('amount=500000');
    expect(db.payments).toHaveLength(1);
    expect(db.committed).toBe(1);
  });
  it('subtracts confirmed payments from the payable amount', async () => {
    const { svc, db } = make();
    db.payments.push({ paymentId: 'TT0', bookingId: 'LH1', reference: 'FLSOLD', amount: 200000, status: 'Thành công', expiresAt: '', expired: 0, account: 'a', customerId: 'KH1', refunded: 0, bookingStatus: '' });
    expect((await svc.createIntent(customer(), 'LH1')).amount).toBe(300000);
  });
  it('reuses an open intent with the same amount and replaces one with a stale amount', async () => {
    const { svc, db } = make();
    const a = await svc.createIntent(customer(), 'LH1');
    expect((await svc.createIntent(customer(), 'LH1')).paymentId).toBe(a.paymentId);
    db.total = 600000;
    const c = await svc.createIntent(customer(), 'LH1');
    expect(c.paymentId).not.toBe(a.paymentId);
    expect(db.payments.find((x) => x.paymentId === a.paymentId)!.status).toBe('Hết hạn');
  });
  it('customer cannot pay or read another customer booking (404, no leak)', async () => {
    const { svc } = make();
    await expect(svc.createIntent(customer('TK_OTHER'), 'LH1')).rejects.toThrow(NotFoundException);
    const own = await svc.createIntent(customer(), 'LH1');
    await expect(svc.status(customer('TK_OTHER'), own.paymentId)).rejects.toThrow(NotFoundException);
    expect((await svc.status(customer(), own.paymentId)).paymentId).toBe(own.paymentId);
  });
  it('staff need Q01; owner role bypasses', async () => {
    const { svc } = make();
    await expect(svc.createIntent(staff([]), 'LH1')).rejects.toThrow(ForbiddenException);
    await expect(svc.createIntent(staff(['Q01']), 'LH1')).resolves.toBeDefined();
    await expect(svc.createIntent(staff([], 'Chủ Spa'), 'LH1')).resolves.toBeDefined();
  });
  it('rejects cancelled, already paid, zero-total and unconfigured', async () => {
    const { svc, db } = make();
    db.booking.status = 'Đã hủy';
    await expect(svc.createIntent(customer(), 'LH1')).rejects.toThrow(ConflictException);
    db.booking.status = 'Chưa đến'; db.booking.pay = 'Đã thanh toán';
    await expect(svc.createIntent(customer(), 'LH1')).rejects.toThrow(ConflictException);
    db.booking.pay = 'Chưa thanh toán'; db.total = 0;
    await expect(svc.createIntent(customer(), 'LH1')).rejects.toThrow(ConflictException);
    process.env.SEPAY_ACCOUNT_NUMBER = '';
    await expect(svc.createIntent(customer(), 'LH1')).rejects.toThrow(ServiceUnavailableException);
  });
  it('allows paying a completed booking (only payment status changes)', async () => {
    const { svc, db } = make();
    db.booking.status = 'Hoàn thành';
    await expect(svc.createIntent(customer(), 'LH1')).resolves.toBeDefined();
  });
  it('reports expired pending payments as Hết hạn without writing', async () => {
    const { svc, db } = make();
    const a = await svc.createIntent(customer(), 'LH1');
    db.payments[0].expired = 1;
    expect((await svc.status(customer(), a.paymentId)).status).toBe('Hết hạn');
    expect(db.payments[0].status).toBe('Chờ thanh toán');
  });
});

describe('schema not migrated', () => {
  it('every payment endpoint fails safe with 503 and a clear message', async () => {
    const { svc, db } = make();
    db.ready = 0;
    await expect(svc.createIntent(customer(), 'LH1')).rejects.toThrow(NOT_MIGRATED);
    await expect(svc.status(customer(), 'TT1')).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.handleSepayWebhook(apiKeyReq(), sepayBody())).rejects.toThrow(ServiceUnavailableException);
    await expect(svc.refund('TT1', { amount: 1, reason: 'Khách hủy dịch vụ' }, 'TKQL')).rejects.toThrow(ServiceUnavailableException);
  });
  it('bad auth is rejected before the schema is even consulted', async () => {
    const { svc, db } = make();
    db.ready = 0;
    await expect(svc.handleSepayWebhook(apiKeyReq('bad'), sepayBody())).rejects.toThrow(UnauthorizedException);
  });
});

describe('webhook processing', () => {
  async function pending() {
    const ctx = make();
    const dto = await ctx.svc.createIntent(customer(), 'LH1');
    return { ...ctx, dto };
  }
  const hook = (svc: PaymentsService, ref: string, o: Record<string, unknown> = {}) => svc.handleSepayWebhook(apiKeyReq(), sepayBody({ code: ref, content: `${ref} chuyen tien`, ...o }));

  it('exact payment confirms atomically, returns {success:true}, booking becomes Đã thanh toán, booking status untouched', async () => {
    const { svc, db, dto } = await pending();
    expect(await hook(svc, dto.reference)).toEqual({ success: true });
    expect(db.payments[0].status).toBe('Thành công');
    expect(db.booking.pay).toBe('Đã thanh toán');
    expect(db.booking.status).toBe('Chưa đến');
    expect(db.events).toEqual([{ provider: 'SEPAY', tx: '92704', outcome: 'CONFIRMED', paymentId: dto.paymentId }]);
    expect((await svc.status(customer(), dto.paymentId)).status).toBe('Đã thanh toán');
  });
  it('replay of the same provider transaction id returns success without double applying', async () => {
    const { svc, db, dto } = await pending();
    await hook(svc, dto.reference);
    db.booking.pay = 'Chưa thanh toán';
    expect(await hook(svc, dto.reference)).toEqual({ success: true });
    expect(db.events).toHaveLength(1);
    expect(db.booking.pay).toBe('Chưa thanh toán');
  });
  it('unique-violation race on the event row is treated as a replay', async () => {
    const { svc, db, dto } = await pending();
    const original = db.run.bind(db);
    db.run = async (s, p) => { if (s.startsWith('INSERT dbo.SePayWebhookEvent')) throw Object.assign(new Error('dup'), { driverError: { number: 2627 } }); return original(s, p); };
    expect(await hook(svc, dto.reference)).toEqual({ success: true });
    expect(db.payments[0].status).toBe('Chờ thanh toán');
    expect(db.rolledBack).toBe(1);
  });
  it.each([
    ['underpayment', { transferAmount: 499999 }, 'UNDERPAID'],
    ['overpayment', { transferAmount: 500001 }, 'OVERPAID'],
    ['wrong receiving account', { accountNumber: '111' }, 'ACCOUNT_MISMATCH'],
    ['outgoing transfer', { transferType: 'out' }, 'IGNORED_OUT'],
  ])('%s is audited, acknowledged and does not confirm', async (_n, over, outcome) => {
    const { svc, db, dto } = await pending();
    expect(await hook(svc, dto.reference, over)).toEqual({ success: true });
    expect(db.events[0].outcome).toBe(outcome);
    expect(db.payments[0].status).toBe('Chờ thanh toán');
    expect(db.booking.pay).toBe('Chưa thanh toán');
  });
  it('code=null with the reference only in content (padded, lowercase) still confirms; amount may be a digit string (form-encoded)', async () => {
    const { svc, db, dto } = await pending();
    const memo = `  chuyen tien ${dto.reference.toLowerCase()}  
`;
    expect(await svc.handleSepayWebhook(apiKeyReq(), sepayBody({ code: null, content: memo, transferAmount: '500000' }))).toEqual({ success: true });
    expect(db.events[0].outcome).toBe('CONFIRMED');
    expect(db.payments[0].status).toBe('Thành công');
  });
  it('empty-string code falls back to the memo; id may arrive as a numeric string', async () => {
    const { svc, db, dto } = await pending();
    await svc.handleSepayWebhook(apiKeyReq(), sepayBody({ id: '777', code: '', content: `ck ${dto.reference}` }));
    expect(db.events).toEqual([{ provider: 'SEPAY', tx: '777', outcome: 'CONFIRMED', paymentId: dto.paymentId }]);
  });
  it('amount sent as a string that is too small is still underpaid', async () => {
    const { svc, db, dto } = await pending();
    await hook(svc, dto.reference, { transferAmount: '1000' });
    expect(db.events[0].outcome).toBe('UNDERPAID');
  });
  it('unknown reference and missing code are audited without a payment', async () => {
    const { svc, db } = await pending();
    await hook(svc, 'FLSZZZZZZZZZZ');
    await svc.handleSepayWebhook(apiKeyReq(), sepayBody({ id: 2, code: null, content: 'khong co ma' }));
    expect(db.events.map((e) => [e.outcome, e.paymentId])).toEqual([['UNKNOWN_REFERENCE', null], ['UNKNOWN_REFERENCE', null]]);
    expect(db.payments[0].status).toBe('Chờ thanh toán');
  });
  it('expired payment is not confirmed (money flagged for manual reconciliation)', async () => {
    const { svc, db, dto } = await pending();
    db.payments[0].expired = 1;
    await hook(svc, dto.reference);
    expect(db.events[0].outcome).toBe('EXPIRED');
    expect(db.payments[0].status).toBe('Chờ thanh toán');
  });
  it('second transfer with a new tx id to an already paid reference is flagged, not applied twice', async () => {
    const { svc, db, dto } = await pending();
    await hook(svc, dto.reference);
    await hook(svc, dto.reference, { id: 555 });
    expect(db.events.map((e) => e.outcome)).toEqual(['CONFIRMED', 'DUPLICATE_PAYMENT']);
  });
  it('cancelled booking is not confirmed', async () => {
    const { svc, db, dto } = await pending();
    db.booking.status = 'Đã hủy';
    await hook(svc, dto.reference);
    expect(db.events[0].outcome).toBe('BOOKING_CANCELLED');
    expect(db.payments[0].status).toBe('Chờ thanh toán');
  });
  it('invalid auth or payload changes nothing', async () => {
    const { svc, db, dto } = await pending();
    await expect(svc.handleSepayWebhook(apiKeyReq('bad'), sepayBody({ code: dto.reference }))).rejects.toThrow(UnauthorizedException);
    expect(db.events).toHaveLength(0);
    expect(db.payments[0].status).toBe('Chờ thanh toán');
  });
  it('authenticated but invalid payload is audited as INVALID_PAYLOAD, acknowledged, and idempotent', async () => {
    const { svc, db } = await pending();
    expect(await svc.handleSepayWebhook({ ...apiKeyReq(), rawBody: Buffer.from('{"id":1}') }, { id: 1 })).toEqual({ success: true });
    expect(await svc.handleSepayWebhook({ ...apiKeyReq(), rawBody: Buffer.from('{"id":1}') }, { id: 1 })).toEqual({ success: true });
    expect(await svc.handleSepayWebhook(apiKeyReq(), null as never)).toEqual({ success: true });
    expect(db.events.map((e) => [e.tx, e.outcome])).toEqual([['1', 'INVALID_PAYLOAD'], [expect.stringMatching(/^INVALID-[0-9a-f]{32}$/), 'INVALID_PAYLOAD']]);
    expect(db.events[0].raw).toBe('{"id":1}');
    expect(db.payments[0].status).toBe('Chờ thanh toán');
  });
  it('invalid auth is rejected before anything is audited even for a malformed payload', async () => {
    const { svc, db } = await pending();
    await expect(svc.handleSepayWebhook(apiKeyReq('bad'), { id: 1 })).rejects.toThrow(UnauthorizedException);
    expect(db.events).toHaveLength(0);
  });
  it('reconciles against the account stored on the payment, even if the configured account changed or is blank', async () => {
    const { svc, db, dto } = await pending();
    process.env.SEPAY_ACCOUNT_NUMBER = '';
    expect(await hook(svc, dto.reference)).toEqual({ success: true });
    expect(db.events[0].outcome).toBe('CONFIRMED');
  });
  it('a transfer to the configured account is still rejected when the payment was issued for a different account', async () => {
    const { svc, db, dto } = await pending();
    process.env.SEPAY_ACCOUNT_NUMBER = '9999999999';
    await hook(svc, dto.reference, { accountNumber: '9999999999' });
    expect(db.events[0].outcome).toBe('ACCOUNT_MISMATCH');
    expect(db.payments[0].status).toBe('Chờ thanh toán');
  });
  it('falls back to the configured account only when the payment has none stored', async () => {
    const { svc, db, dto } = await pending();
    db.payments[0].account = '';
    await hook(svc, dto.reference);
    expect(db.events[0].outcome).toBe('CONFIRMED');
  });
  it('unreconciled lists non-confirmed events newest first, paged, without raw payload (staff view)', async () => {
    const { svc, db, dto } = await pending();
    await hook(svc, dto.reference, { id: 11, transferAmount: 1 });
    await hook(svc, dto.reference, { id: 12, accountNumber: '111' });
    await hook(svc, 'FLSZZZZZZZZZZ', { id: 13 });
    await hook(svc, dto.reference, { id: 10 });
    const all = await svc.unreconciled({});
    expect(all.total).toBe(3);
    expect(all.items.map((i) => i.providerTxId)).toEqual(['13', '12', '11']);
    expect(JSON.stringify(all)).not.toContain('DuLieuTho');
    expect((await svc.unreconciled({ page: 2, pageSize: 1 })).items.map((i) => i.providerTxId)).toEqual(['12']);
    expect(db.events.some((e) => e.outcome === 'CONFIRMED')).toBe(true);
  });
  it('unexpected SQL failure rolls back and surfaces 503 so SePay retries', async () => {
    const { svc, db, dto } = await pending();
    const original = db.run.bind(db);
    db.run = async (s, p) => { if (s.startsWith('UPDATE dbo.LichHen SET TrangThaiThanhToan')) throw new Error('boom'); return original(s, p); };
    await expect(hook(svc, dto.reference)).rejects.toThrow(ServiceUnavailableException);
    expect(db.rolledBack).toBe(1);
  });
  it('mock settle marks events as MOCK and reports a simulation notice', async () => {
    const { svc, db, dto } = await pending();
    const res = await svc.mockSettle({ paymentId: dto.paymentId });
    expect(res).toMatchObject({ simulated: true, outcome: 'CONFIRMED' });
    expect(res.notice).toContain('không phải giao dịch ngân hàng thật');
    expect(db.events[0].provider).toBe('MOCK');
    expect(await svc.status(customer(), dto.paymentId)).toMatchObject({ provider: 'MOCK', simulated: true });
    const under = make();
    const d2 = await under.svc.createIntent(customer(), 'LH1');
    expect((await under.svc.mockSettle({ paymentId: d2.paymentId, amount: 1 })).outcome).toBe('UNDERPAID');
  });
});

describe('refund', () => {
  async function paid() {
    const ctx = make();
    const dto = await ctx.svc.createIntent(customer(), 'LH1');
    await ctx.svc.handleSepayWebhook(apiKeyReq(), sepayBody({ code: dto.reference }));
    return { ...ctx, dto };
  }
  it('full refund sets Đã hoàn tiền and recomputes booking payment status', async () => {
    const { svc, db, dto } = await paid();
    const out = await svc.refund(dto.paymentId, { amount: 500000, reason: 'Khách hủy dịch vụ' }, 'TKQL');
    expect(db.payments[0].status).toBe('Đã hoàn tiền');
    expect(db.booking.pay).toBe('Chưa thanh toán');
    expect(out.refundedAmount).toBe(500000);
  });
  it('refund writes the audit row (reason + actor) in the same transaction', async () => {
    const { svc, db, dto } = await paid();
    const committedBefore = db.committed;
    await svc.refund(dto.paymentId, { amount: 100000, reason: '  Khách hủy dịch vụ  ' }, 'TKQL00001');
    expect(db.refunds).toEqual([{ paymentId: dto.paymentId, amount: 100000, reason: 'Khách hủy dịch vụ', actor: 'TKQL00001' }]);
    expect(db.committed).toBe(committedBefore + 1);
  });
  it('a failing audit insert rolls the refund back', async () => {
    const { svc, db, dto } = await paid();
    const original = db.run.bind(db);
    db.run = async (q, a) => { if (q.startsWith('INSERT dbo.ThanhToanHoanTien')) throw new Error('boom'); return original(q, a); };
    await expect(svc.refund(dto.paymentId, { amount: 1, reason: 'x' }, 'TK')).rejects.toThrow(ServiceUnavailableException);
    expect(db.rolledBack).toBe(1);
  });
  it('refund requires Quản lý with Q01; unreconciled requires staff with Q01', () => {
    const meta = (name: 'refund' | 'unreconciled', key: string) => Reflect.getMetadata(key, PaymentsController.prototype[name]);
    expect(meta('refund', 'roles')).toEqual(['Quản lý']);
    expect(meta('refund', 'permissions')).toEqual(['Q01']);
    expect(meta('unreconciled', 'roles')).toEqual(['Nhân viên', 'Quản lý']);
    expect(meta('unreconciled', 'permissions')).toEqual(['Q01']);
  });
  it('partial refund keeps Thành công and marks partial payment', async () => {
    const { svc, db, dto } = await paid();
    await svc.refund(dto.paymentId, { amount: 100000, reason: 'Khách hủy dịch vụ' }, 'TKQL');
    expect(db.payments[0].status).toBe('Thành công');
    expect(db.booking.pay).toBe('Thanh toán một phần');
  });
  it('rejects over-refund, unpaid payment and unknown id', async () => {
    const { svc, dto } = await paid();
    await expect(svc.refund(dto.paymentId, { amount: 500001, reason: 'Khách hủy dịch vụ' }, 'TKQL')).rejects.toThrow(ConflictException);
    await expect(svc.refund('TTNONE', { amount: 1, reason: 'Khách hủy dịch vụ' }, 'TKQL')).rejects.toThrow(NotFoundException);
    const fresh = make();
    const d = await fresh.svc.createIntent(customer(), 'LH1');
    await expect(fresh.svc.refund(d.paymentId, { amount: 1, reason: 'Khách hủy dịch vụ' }, 'TKQL')).rejects.toThrow(ConflictException);
  });
});

describe('DTO validation', () => {
  const errors = (cls: new () => object, plain: object) => validate(plainToInstance(cls, plain), { whitelist: true, forbidNonWhitelisted: true });
  it('intent requires a well-formed booking id and ignores no client amount', async () => {
    expect(await errors(CreateSepayIntentDto, { bookingId: 'LH00000001' })).toHaveLength(0);
    expect(await errors(CreateSepayIntentDto, { bookingId: 'x y' })).not.toHaveLength(0);
    expect(await errors(CreateSepayIntentDto, { bookingId: 'LH1', amount: 1 })).not.toHaveLength(0);
  });
  it('refund and mock dto bounds', async () => {
    expect(await errors(RefundPaymentDto, { amount: 0 })).not.toHaveLength(0);
    expect(await errors(RefundPaymentDto, { amount: 10 })).not.toHaveLength(0);
    expect(await errors(RefundPaymentDto, { amount: 10, reason: '   ' })).not.toHaveLength(0);
    expect(await errors(RefundPaymentDto, { amount: 10, reason: 'x'.repeat(256) })).not.toHaveLength(0);
    expect(await errors(RefundPaymentDto, { amount: 10, reason: 'x'.repeat(255) })).toHaveLength(0);
    expect(await errors(MockWebhookDto, { paymentId: 'TT1', amount: -1 })).not.toHaveLength(0);
    expect(await errors(MockWebhookDto, { paymentId: 'TT1', transferType: 'in' })).toHaveLength(0);
  });
});
