import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type OtpPurposeName = 'REGISTER' | 'RESET_PASSWORD';

export const OTP_MAX_ATTEMPTS = 5;
export const MAX_CHALLENGES_PER_PHONE_PER_HOUR = 5;
export const MAX_CHALLENGES_PER_IP_PER_HOUR = 10;
export const COMPLETION_TOKEN_TTL_SECONDS = 600;
export const MIN_PEPPER_LENGTH = 32;

export const MSG_REQUEST_ACCEPTED = 'Nếu số điện thoại hợp lệ, mã xác thực đã được gửi.';
export const MSG_INVALID_PHONE = 'Số điện thoại không hợp lệ!';
export const MSG_TOO_FAST = 'Bạn thao tác quá nhanh. Vui lòng thử lại sau!';
export const MSG_SEND_FAILED = 'Không thể gửi mã xác thực. Vui lòng thử lại sau!';
export const MSG_BAD_CODE = 'Mã xác thực không đúng hoặc đã hết hạn.';
export const MSG_BAD_REQUEST = 'Yêu cầu không hợp lệ hoặc đã hết hạn.';
export const MSG_PASSWORD_POLICY = 'Mật khẩu phải có ít nhất 8 ký tự, gồm chữ và số.';
export const MSG_PHONE_REGISTERED = 'Số điện thoại đã được đăng ký.';
export const MSG_FULL_NAME = 'Họ và tên phải từ 1 đến 50 ký tự.';

export interface OtpSettings { pepper: string; ttlSeconds: number; cooldownSeconds: number }

const positiveInt = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Read at call time so tests and serverless cold starts see the current environment. Returns null when the pepper is unusable. */
export function readOtpSettings(env: NodeJS.ProcessEnv = process.env): OtpSettings | null {
  const pepper = env.OTP_PEPPER;
  if (!pepper || pepper.length < MIN_PEPPER_LENGTH) return null;
  return {
    pepper,
    ttlSeconds: positiveInt(env.OTP_TTL_SECONDS, 300),
    cooldownSeconds: positiveInt(env.OTP_RESEND_COOLDOWN_SECONDS, 60),
  };
}

export const isPurpose = (value: unknown): value is OtpPurposeName => value === 'REGISTER' || value === 'RESET_PASSWORD';

/** >= 8 chars, <= 128, at least one letter and one digit. */
export function passwordMeetsPolicy(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128
    && /\p{L}/u.test(password) && /[0-9]/.test(password);
}

export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

/** HMAC-SHA256(pepper, id|purpose|phone|code) as hex. The code itself is never stored. */
export function otpDigest(pepper: string, id: string, purpose: string, phone: string, code: string): string {
  return createHmac('sha256', pepper).update(`${id}|${purpose}|${phone}|${code}`).digest('hex');
}

export const ipDigest = (pepper: string, ip: string) => sha256Hex(`${pepper}|${ip}`);

/** Constant-time comparison of two hex digests of equal length. */
export function digestsEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
