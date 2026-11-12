import { cookiePartitioned, cookieSameSite, cookieSecure } from './auth.controller';

describe('cookieSecure', () => {
  it('is always on in production', () => expect(cookieSecure({ NODE_ENV: 'production', COOKIE_SECURE: 'false' } as never)).toBe(true));
  it('can be enabled for HTTPS staging', () => expect(cookieSecure({ NODE_ENV: 'staging', COOKIE_SECURE: 'true' } as never)).toBe(true));
  it('is off for local development by default', () => expect(cookieSecure({ NODE_ENV: 'development' } as never)).toBe(false));
});

describe('cookieSameSite (cross-domain frontend/backend, e.g. Static Web Apps + App Service)', () => {
  it('defaults to lax when COOKIE_SAMESITE is unset', () => expect(cookieSameSite({ NODE_ENV: 'production' } as never)).toBe('lax'));
  it('stays lax even when requested, if the cookie is not Secure (browsers reject None without Secure)', () =>
    expect(cookieSameSite({ NODE_ENV: 'development', COOKIE_SAMESITE: 'none' } as never)).toBe('lax'));
  it('switches to none only when both requested and Secure', () =>
    expect(cookieSameSite({ NODE_ENV: 'production', COOKIE_SAMESITE: 'none' } as never)).toBe('none'));
  it('switches to none on staging when COOKIE_SECURE and COOKIE_SAMESITE are both set', () =>
    expect(cookieSameSite({ NODE_ENV: 'staging', COOKIE_SECURE: 'true', COOKIE_SAMESITE: 'none' } as never)).toBe('none'));
});

describe('cookiePartitioned (CHIPS — tied to SameSite=None, no separate flag)', () => {
  it('is false by default (same-site deployment)', () => expect(cookiePartitioned({ NODE_ENV: 'production' } as never)).toBe(false));
  it('is true exactly when cookieSameSite resolves to none', () =>
    expect(cookiePartitioned({ NODE_ENV: 'production', COOKIE_SAMESITE: 'none' } as never)).toBe(true));
  it('stays false if SameSite=None was requested but Secure is not on (would have stayed lax)', () =>
    expect(cookiePartitioned({ NODE_ENV: 'development', COOKIE_SAMESITE: 'none' } as never)).toBe(false));
});
