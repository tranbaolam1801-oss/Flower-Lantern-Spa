import http from 'node:http';
import { AddressInfo } from 'node:net';
import { ProviderPermanentError, ProviderTemporaryError } from './message-provider';
import { createMessagingProviders } from './messaging.module';
import { ZaloZnsConfig, ZaloZnsProvider, readZaloZnsConfig, toZaloPhone } from './zalo-zns.provider';

const TOKEN = 'zalo-test-access-token-0123456789-abcdef';
type Reply = { status: number; body: unknown } | 'hang';

/** Real local HTTP server standing in for Zalo; records what the adapter sent. */
async function fakeZalo(reply: () => Reply) {
  const seen: Array<{ headers: http.IncomingHttpHeaders; body: Record<string, unknown> }> = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      seen.push({ headers: req.headers, body: JSON.parse(raw || '{}') });
      const r = reply();
      if (r === 'hang') return; // never answer: the adapter must time out
      res.writeHead(r.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/message/template`;
  return { seen, url, close: () => { server.closeAllConnections?.(); return new Promise<void>((r) => server.close(() => r())); } };
}

const cfg = (endpoint: string, extra: Partial<ZaloZnsConfig> = {}): ZaloZnsConfig => ({
  endpoint, accessToken: TOKEN, timeoutMs: 1500,
  templates: { otp: 'T_OTP', BOOKING_CONFIRMED: 'T_CONF', BOOKING_REMINDER: 'T_REM', BOOKING_RESCHEDULED: '', BOOKING_CANCELLED: '' }, ...extra,
});
const booking = { phone: '0911222333', kind: 'BOOKING_CONFIRMED' as const, data: { customerName: 'Lê Văn A', bookingId: 'LH00000007', date: '20/11/2026', time: '14:30', serviceName: 'Massage', packageName: 'Gói 60 phút' } };

describe('ZaloZnsProvider (against a local HTTP server; never contacts Zalo)', () => {
  it('sends the template with 84-format phone, string template_data, token header, and returns the message id', async () => {
    const z = await fakeZalo(() => ({ status: 200, body: { error: 0, message: 'Success', data: { msg_id: 'm-123', sent_time: 'x' } } }));
    try {
      const r = await new ZaloZnsProvider(cfg(z.url)).send(booking);
      expect(r.providerRef).toBe('m-123');
      expect(z.seen[0].headers.access_token).toBe(TOKEN);
      expect(z.seen[0].body).toMatchObject({ phone: '84911222333', template_id: 'T_CONF', template_data: booking.data });
      expect(Object.values(z.seen[0].body.template_data as object).every((v) => typeof v === 'string')).toBe(true);
      expect(z.seen[0].body).not.toHaveProperty('mode');
    } finally { await z.close(); }
  });

  it('sends OTP through the OTP template as {otp}, and passes mode=development when configured', async () => {
    const z = await fakeZalo(() => ({ status: 200, body: { error: 0, data: { msg_id: 'o-1' } } }));
    try {
      await new ZaloZnsProvider(cfg(z.url, { mode: 'development' })).sendOtp({ phone: '0911222333', code: '482913', purpose: 'REGISTER', ttlMinutes: 5 });
      expect(z.seen[0].body).toMatchObject({ phone: '84911222333', template_id: 'T_OTP', template_data: { otp: '482913' }, mode: 'development' });
    } finally { await z.close(); }
  });

  it('classifies failures: 5xx/429/timeout/network -> temporary; provider error code -> permanent; missing template -> permanent', async () => {
    let reply: Reply = { status: 503, body: {} };
    const z = await fakeZalo(() => reply);
    try {
      const p = new ZaloZnsProvider(cfg(z.url));
      await expect(p.send(booking)).rejects.toMatchObject({ name: 'ProviderTemporaryError', code: 'HTTP_503' });
      reply = { status: 429, body: {} };
      await expect(p.send(booking)).rejects.toBeInstanceOf(ProviderTemporaryError);
      reply = { status: 200, body: { error: -118, message: 'User not found' } };
      await expect(p.send(booking)).rejects.toMatchObject({ name: 'ProviderPermanentError', code: 'ZALO_-118' });
      reply = { status: 401, body: { error: -124, message: 'Invalid token' } };
      await expect(p.send(booking)).rejects.toMatchObject({ name: 'ProviderTemporaryError', code: 'ZALO_-124' });
      reply = 'hang';
      await expect(p.send(booking)).rejects.toMatchObject({ name: 'ProviderTemporaryError', code: 'NETWORK_ERROR' });
      await expect(p.send({ ...booking, kind: 'BOOKING_CANCELLED' })).rejects.toMatchObject({ name: 'ProviderPermanentError', code: 'TEMPLATE_NOT_CONFIGURED' });
    } finally { await z.close(); }
    await expect(new ZaloZnsProvider(cfg('http://127.0.0.1:1/x')).send(booking)).rejects.toMatchObject({ name: 'ProviderTemporaryError', code: 'NETWORK_ERROR' });
  });

  it('never leaks the access token, message text or payload in errors', async () => {
    const z = await fakeZalo(() => ({ status: 200, body: { error: -1, message: `bad token ${TOKEN}`, data: { echoed: TOKEN } } }));
    try {
      const err = await new ZaloZnsProvider(cfg(z.url)).send(booking).catch((e) => e as Error);
      expect(err).toBeInstanceOf(ProviderPermanentError);
      expect(JSON.stringify({ m: (err as Error).message, c: (err as ProviderPermanentError).code, s: (err as Error).stack })).not.toContain(TOKEN);
    } finally { await z.close(); }
  });

  it('rejects malformed phone numbers before any request', () => {
    expect(toZaloPhone('0911222333')).toBe('84911222333');
    for (const bad of ['911222333', '+84911222333', '091122233', '0911abc333']) expect(() => toZaloPhone(bad)).toThrow(ProviderPermanentError);
  });
});

describe('provider selection', () => {
  const tokenEnv = { ZALO_ACCESS_TOKEN: TOKEN, ZALO_TEMPLATE_OTP: 'x', ZALO_TEMPLATE_BOOKING_CONFIRMED: 'y' };
  it('uses Zalo only when explicitly selected and a token is present', () => {
    expect(createMessagingProviders({ MESSAGING_PROVIDER: 'zalo_zns', ...tokenEnv }).notifications.name).toBe('ZALO_ZNS');
    expect(createMessagingProviders({ ...tokenEnv }).otp.constructor.name).toBe('UnconfiguredMessagingProvider');
    expect(createMessagingProviders({ MESSAGING_PROVIDER: 'zalo_zns' }).otp.constructor.name).toBe('UnconfiguredMessagingProvider');
    expect(readZaloZnsConfig({ ZALO_ACCESS_TOKEN: 'short' })).toBeNull();
  });
  it('the mock is only available in test/development, never production', () => {
    expect(createMessagingProviders({ NODE_ENV: 'test', MESSAGING_MOCK: 'true' }).otp.name).toBe('MOCK');
    expect(createMessagingProviders({ NODE_ENV: 'production', MESSAGING_MOCK: 'true' }).otp.constructor.name).toBe('UnconfiguredMessagingProvider');
    expect(createMessagingProviders({ MESSAGING_MOCK: 'true' }).otp.constructor.name).toBe('UnconfiguredMessagingProvider');
  });
  it('an unconfigured provider fails generically instead of pretending to send', async () => {
    const p = createMessagingProviders({ NODE_ENV: 'production' }).otp;
    await expect(p.sendOtp({ phone: '0911222333', code: '123456', purpose: 'REGISTER', ttlMinutes: 5 })).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
  });
});
