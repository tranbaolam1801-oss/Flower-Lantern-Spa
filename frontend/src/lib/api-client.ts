/**
 * api-client.ts — Helper gọi REST API thống nhất cho toàn bộ Frontend.
 * Tự động gửi HttpOnly cookie, CSRF header X-Spa-Request và chuẩn hóa lỗi.
 */

export interface HttpApiError {
  status: number;
  message: string;
  code?: string;
  fields?: Record<string, string>;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('X-Spa-Request', '1');
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api/${path.replace(/^\/+/, '')}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    window.dispatchEvent(new Event('spa-session-expired'));
  }

  const body = await response.json().catch(() => null) as { message?: string | string[]; code?: string; fields?: Record<string, string> } | null;
  if (!response.ok) {
    const rawMsg = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    const err: HttpApiError = {
      status: response.status,
      code: body?.code,
      fields: body?.fields,
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

export function formatVnd(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return 'Liên hệ';
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(Number(amount)))}đ`;
}
