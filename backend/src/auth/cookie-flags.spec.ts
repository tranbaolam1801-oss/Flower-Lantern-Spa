import { cookieSecure } from './auth.controller';

describe('cookieSecure', () => {
  it('is always on in production', () => expect(cookieSecure({ NODE_ENV: 'production', COOKIE_SECURE: 'false' } as never)).toBe(true));
  it('can be enabled for HTTPS staging', () => expect(cookieSecure({ NODE_ENV: 'staging', COOKIE_SECURE: 'true' } as never)).toBe(true));
  it('is off for local development by default', () => expect(cookieSecure({ NODE_ENV: 'development' } as never)).toBe(false));
});
