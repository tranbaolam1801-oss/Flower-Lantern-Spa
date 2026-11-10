/**
 * auth-api.ts — Các hàm gọi API xác thực.
 * Sử dụng cookie HttpOnly được thiết lập bởi server (không lưu token trên client).
 */

export interface AuthUser {
  id: string;
  username: string;
  phone: string;
  role: 'Chủ Spa' | 'Quản lý' | 'Nhân viên' | 'Khách hàng';
  fullName: string;
  permissions: string[];
  entityId?: string;
}

export interface LoginPayload {
  phone: string;
  password: string;
}

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  unlockAt?: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err: ApiError = { ...body, status: res.status, message: Array.isArray(body?.message) ? body.message.join(' ') : body?.message ?? 'Không thể kết nối hệ thống. Vui lòng thử lại!' };
    throw err;
  }
  return body as T;
}

/** POST /api/auth/login — Đăng nhập, server sẽ thiết lập cookie HttpOnly */
export async function loginApi(payload: LoginPayload): Promise<AuthUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Spa-Request': '1' },
    body: JSON.stringify(payload),
    credentials: 'include',
  });
  const data = await handleResponse<{ success: boolean; user: AuthUser }>(res);
  return data.user;
}

/** GET /api/auth/me — Lấy thông tin người dùng hiện tại từ cookie */
export async function getMeApi(): Promise<AuthUser> {
  const res = await fetch('/api/auth/me', {
    method: 'GET',
    credentials: 'include',
  });
  const data = await handleResponse<{ success: boolean; user: AuthUser }>(res);
  return data.user;
}

/** POST /api/auth/logout — Đăng xuất, server sẽ xóa cookie */
export async function logoutApi(): Promise<void> {
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'X-Spa-Request': '1' },
    credentials: 'include',
  });
  await handleResponse(res);
}

/** Trả về route mặc định sau đăng nhập dựa trên vai trò */
export function getDefaultRoute(role: AuthUser['role']): string {
  switch (role) {
    case 'Khách hàng':
      return '/lich-hen-cua-toi';
    case 'Chủ Spa':
    case 'Quản lý':
    case 'Nhân viên':
      return '/admin/lich-hen';
    default:
      return '/dang-nhap';
  }
}
