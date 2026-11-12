import { API_BASE_URL, apiFetch, type HttpApiError } from './api-client';

export type OtpPurpose = 'REGISTER' | 'RESET_PASSWORD';

export interface OtpRequestResult {
  message: string;
  resendAfterSeconds: number;
  expiresInSeconds: number;
}

export interface OtpVerifyResult {
  completionToken: string;
  expiresInSeconds: number;
}

export interface OtpHttpError extends HttpApiError {
  retryAfterSeconds?: number;
}

/**
 * apiFetch() drops body.retryAfterSeconds of a 429, so the OTP request call performs the same
 * request itself (same CSRF header + credentials) to keep that field for the countdown.
 */
export async function requestOtp(phone: string, purpose: OtpPurpose): Promise<OtpRequestResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/otp/request`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Spa-Request': '1' },
      body: JSON.stringify({ phone, purpose }),
    });
  } catch {
    throw { status: 0, message: 'Không thể kết nối hệ thống. Vui lòng thử lại!' } satisfies OtpHttpError;
  }
  const body = (await response.json().catch(() => null)) as
    | (Partial<OtpRequestResult> & { message?: string | string[]; retryAfterSeconds?: number })
    | null;
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    const err: OtpHttpError = {
      status: response.status,
      message: message || 'Không thể gửi mã xác thực. Vui lòng thử lại sau!',
      retryAfterSeconds: body?.retryAfterSeconds,
    };
    throw err;
  }
  return {
    message: body?.message as string,
    resendAfterSeconds: body?.resendAfterSeconds ?? 60,
    expiresInSeconds: body?.expiresInSeconds ?? 300,
  };
}

export const verifyOtp = (phone: string, purpose: OtpPurpose, code: string) =>
  apiFetch<OtpVerifyResult>('auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, purpose, code }),
  });

export const registerCustomer = (input: {
  phone: string;
  completionToken: string;
  fullName: string;
  password: string;
  consentZalo: boolean;
}) => apiFetch<{ success: true }>('auth/register', { method: 'POST', body: JSON.stringify(input) });

export const resetPassword = (input: { phone: string; completionToken: string; newPassword: string }) =>
  apiFetch<{ success: true }>('auth/password/reset', { method: 'POST', body: JSON.stringify(input) });
