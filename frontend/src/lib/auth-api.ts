/**
 * auth-api.ts — Các hàm gọi API xác thực.
 * Sử dụng cookie HttpOnly được thiết lập bởi server (không lưu token trên client).
 */
import { API_BASE_URL } from './api-client';


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

async function authRequest<T>(path:string,init:RequestInit,timeout:number):Promise<T> {
  const controller=new AbortController();
  const abort=()=>controller.abort();
  if(init.signal?.aborted)controller.abort();
  init.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,timeout);
  try {
    const response=await fetch(`${API_BASE_URL}/api/auth/${path}`,{...init,credentials:'include',signal:controller.signal});
    const result=await handleResponse<T>(response);
    if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
    return result;
  } catch(error) {
    if(controller.signal.aborted&&!init.signal?.aborted)throw {code:'AUTH_TIMEOUT',message:'Yêu cầu xác thực quá thời gian chờ. Vui lòng thử lại!'} satisfies ApiError;
    if(error instanceof TypeError)throw {code:'AUTH_NETWORK_ERROR',message:'Không thể kết nối hệ thống. Vui lòng thử lại!'} satisfies ApiError;
    throw error;
  } finally {clearTimeout(timer);init.signal?.removeEventListener('abort',abort);}
}

function authenticatedUser(data:{success:boolean;user:AuthUser}):AuthUser {
  if(!data?.success||!data.user?.id||!Array.isArray(data.user.permissions)||!['Chủ Spa','Quản lý','Nhân viên','Khách hàng'].includes(data.user.role))
    throw {code:'AUTH_INVALID_RESPONSE',message:'Không thể xác nhận phiên đăng nhập. Vui lòng thử lại!'} satisfies ApiError;
  return data.user;
}

/** POST /api/auth/login — Đăng nhập, server sẽ thiết lập cookie HttpOnly */
export async function loginApi(payload: LoginPayload): Promise<AuthUser> {
  const data = await authRequest<{success:boolean;user:AuthUser}>('login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Spa-Request': '1' },
    body: JSON.stringify(payload),
    credentials: 'include',
  },30000);
  return authenticatedUser(data);
}

/** GET /api/auth/me — Lấy thông tin người dùng hiện tại từ cookie */
export async function getMeApi(signal?:AbortSignal): Promise<AuthUser> {
  const data = await authRequest<{success:boolean;user:AuthUser}>('me', {
    method: 'GET',
    credentials: 'include',
    signal,
  },15000);
  return authenticatedUser(data);
}

/** POST /api/auth/logout — Đăng xuất, server sẽ xóa cookie */
export async function logoutApi(): Promise<void> {
  await authRequest('logout', {
    method: 'POST',
    headers: { 'X-Spa-Request': '1' },
    credentials: 'include',
  },15000);
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
