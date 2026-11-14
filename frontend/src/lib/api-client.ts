/**
 * api-client.ts — Helper gọi REST API thống nhất cho toàn bộ Frontend.
 * Tự động gửi HttpOnly cookie, CSRF header X-Spa-Request và chuẩn hóa lỗi.
 */

export interface HttpApiError {
  status: number;
  message: string;
  code?: string;
  /** Employee code that already owns a duplicated phone/email (409). */
  conflictWith?: string;
  fields?: Record<string, string>;
}

// Empty/unset (default, local dev and same-origin deployments): relative '/api/...', same origin as the page.
// Set VITE_API_BASE_URL at build time only when the frontend and backend are deployed on different domains
// (e.g. Azure Static Web Apps + a separate App Service) — must then be paired with backend COOKIE_SAMESITE=none.
// Exported so every direct fetch('/api/...') call outside apiFetch() prefixes the same way.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('X-Spa-Request', '1');
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/${path.replace(/^\/+/, '')}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch (cause) {
    // fetch() rejects with the browser's raw text ("Failed to fetch") when offline / unreachable: never let that reach the UI.
    // No HTTP status => callers treat it as a network failure (friendly message, retry allowed). Aborts keep their own type.
    if ((cause as { name?: string } | null)?.name === 'AbortError') throw cause;
    const networkError: Partial<HttpApiError> = { code: 'NETWORK_ERROR', message: 'Không thể kết nối hệ thống. Vui lòng thử lại sau!' };
    throw networkError;
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event('spa-session-expired'));
  }

  const body = await response.json().catch(() => null) as { message?: string | string[]; code?: string; fields?: Record<string, string>; field?: string; conflictWith?: string } | null;
  if (!response.ok) {
    const rawMsg = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    const err: HttpApiError = {
      status: response.status,
      code: body?.code,
      conflictWith: body?.conflictWith,
      // Some endpoints (employees 409) answer {message, field}; expose it in the same shape as {fields}.
      fields: body?.fields ?? (body?.field && rawMsg ? { [body.field]: String(rawMsg) } : undefined),
      message: rawMsg || defaultErrorMessage(response.status),
    };
    throw err;
  }

  return (body ?? {}) as T;
}

function defaultErrorMessage(status: number): string {
  if (status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại!';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return 'Không tìm thấy dữ liệu hoặc chức năng Backend chưa sẵn sàng.';
  if (status === 409) return 'Dữ liệu xung đột với trạng thái hiện tại.';
  return 'Không thể kết nối hệ thống. Vui lòng thử lại sau!';
}

/** Backend returns image/upload paths as '/api/...' relative to itself. Prefix with API_BASE_URL so an
 * <img> on a different origin (e.g. Static Web Apps frontend + App Service backend) loads correctly.
 * Leaves '/assets/...' (bundled with the frontend itself) and absolute http(s) URLs unchanged. */
export function resolveApiUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || !path.startsWith('/api/')) return path;
  return `${API_BASE_URL}${path}`;
}

export function formatVnd(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return 'Liên hệ';
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(amount)))}đ`;
}
