import { digestsEqual, ipDigest, otpDigest, passwordMeetsPolicy, readOtpSettings } from './otp.policy';

const pepper = 'p'.repeat(40);

describe('OTP policy helpers', () => {
  it('password policy: 8-128 chars with a letter and a digit', () => {
    expect(passwordMeetsPolicy('abcdefg1')).toBe(true);
    expect(passwordMeetsPolicy('Mật khẩu 1 dài')).toBe(true);
    for (const bad of ['abcdefg', '12345678', 'abcdefgh', 'a1', `${'a'.repeat(128)}1`, '', null, undefined, 12345678]) expect(passwordMeetsPolicy(bad)).toBe(false);
    expect(passwordMeetsPolicy(`${'a'.repeat(127)}1`)).toBe(true);
  });

  it('settings: pepper must be >= 32 chars, numeric env falls back to defaults', () => {
    expect(readOtpSettings({})).toBeNull();
    expect(readOtpSettings({ OTP_PEPPER: 'x'.repeat(31) })).toBeNull();
    expect(readOtpSettings({ OTP_PEPPER: pepper })).toEqual({ pepper, ttlSeconds: 300, cooldownSeconds: 60 });
    expect(readOtpSettings({ OTP_PEPPER: pepper, OTP_TTL_SECONDS: '90', OTP_RESEND_COOLDOWN_SECONDS: '-5' })).toEqual({ pepper, ttlSeconds: 90, cooldownSeconds: 60 });
    expect(readOtpSettings({ OTP_PEPPER: pepper, OTP_TTL_SECONDS: 'abc' })?.ttlSeconds).toBe(300);
  });

  it('digest binds id, purpose, phone and code and is compared in constant time', () => {
    const base = otpDigest(pepper, 'id1', 'REGISTER', '0900000001', '123456');
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(digestsEqual(base, otpDigest(pepper, 'id1', 'REGISTER', '0900000001', '123456'))).toBe(true);
    for (const other of [
      otpDigest(pepper, 'id2', 'REGISTER', '0900000001', '123456'),
      otpDigest(pepper, 'id1', 'RESET_PASSWORD', '0900000001', '123456'),
      otpDigest(pepper, 'id1', 'REGISTER', '0900000002', '123456'),
      otpDigest(pepper, 'id1', 'REGISTER', '0900000001', '123457'),
      otpDigest('q'.repeat(40), 'id1', 'REGISTER', '0900000001', '123456'),
    ]) expect(digestsEqual(base, other)).toBe(false);
    expect(digestsEqual(base, '')).toBe(false);
    expect(digestsEqual(base, 'zz')).toBe(false);
  });

  it('ip digest is peppered and does not contain the address', () => {
    expect(ipDigest(pepper, '1.2.3.4')).toMatch(/^[0-9a-f]{64}$/);
    expect(ipDigest(pepper, '1.2.3.4')).not.toBe(ipDigest('q'.repeat(40), '1.2.3.4'));
  });
});
