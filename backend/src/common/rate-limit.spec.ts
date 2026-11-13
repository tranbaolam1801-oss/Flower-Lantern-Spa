import { RateLimiter, rateLimitMiddleware, readRateLimitSettings, sessionKey } from './rate-limit';
import { Request, Response } from 'express';

describe('RateLimiter', () => {
  it('allows up to max then blocks, and resets after the window', () => {
    let t = 1000;
    const l = new RateLimiter({ windowMs: 60_000, max: 2, now: () => t });
    expect(l.check('a').allowed).toBe(true);
    expect(l.check('a').allowed).toBe(true);
    const blocked = l.check('a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
    t += 60_001;
    expect(l.check('a').allowed).toBe(true);
  });
  it('isolates keys', () => {
    const l = new RateLimiter({ windowMs: 1000, max: 1 });
    expect(l.check('a').allowed).toBe(true);
    expect(l.check('a').allowed).toBe(false);
    expect(l.check('b').allowed).toBe(true);
  });
  it('stays bounded: evicts expired keys and caps live keys', () => {
    let t = 0;
    const l = new RateLimiter({ windowMs: 1000, max: 5, maxKeys: 50, now: () => t });
    for (let i = 0; i < 40; i++) l.check(`k${i}`);
    t += 2000;
    l.check('fresh');
    expect(l.size).toBe(1);
    for (let i = 0; i < 500; i++) l.check(`flood${i}`);
    expect(l.size).toBeLessThanOrEqual(50);
  });
  it('middleware answers 429 with Retry-After and Vietnamese message', () => {
    const mw = rateLimitMiddleware(new RateLimiter({ windowMs: 60_000, max: 1 }));
    const req = { ip: '1.2.3.4', headers: {} } as unknown as Request;
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn();
    mw(req, res, next); mw(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
    expect(res.json).toHaveBeenCalledWith({ message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau!' });
  });
  it('sessionKey hashes the credential and falls back to IP', () => {
    const k = sessionKey({ cookies: { access_token: 'secret-token' }, headers: {}, ip: '9.9.9.9' } as unknown as Request);
    expect(k.startsWith('u:')).toBe(true);
    expect(k).not.toContain('secret-token');
    expect(sessionKey({ cookies: {}, headers: {}, ip: '9.9.9.9' } as unknown as Request)).toBe('ip:9.9.9.9');
  });
  it('reads env settings with sane defaults', () => {
    expect(readRateLimitSettings({})).toEqual({ enabled: true, windowMs: 60_000, webhook: 300, intent: 20, login: 20, upload: 30, otp: 10, dispatch: 30 });
    expect(readRateLimitSettings({ RATE_LIMIT_ENABLED: 'false', RATE_LIMIT_LOGIN_PER_WINDOW: '5', RATE_LIMIT_INTENT_PER_WINDOW: 'x' })).toMatchObject({ enabled: false, login: 5, intent: 20 });
  });
});
