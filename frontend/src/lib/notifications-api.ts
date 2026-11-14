import { apiFetch } from './api-client';

export interface NotificationItem {
  id: string; type: string; title: string; body: string; objectType: string | null; objectId: string | null; createdAt: string; read: boolean;
}
export interface NotificationPage { available: boolean; items: NotificationItem[]; unread: number; page: number; hasNext: boolean }

export const NOTIFICATION_POLL_MS = 30_000;
export const notificationKeys = { unread: ['notifications', 'unread'] as const, list: ['notifications', 'list'] as const };

export const getNotifications = (page: number, limit = 15) => apiFetch<NotificationPage>(`notifications?page=${page}&limit=${limit}`);
export const getUnreadCount = () => apiFetch<{ unread: number }>('notifications/unread-count').then((r) => r.unread);
export const markNotificationRead = (id: string) => apiFetch<{ unread: number }>(`notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
export const markAllNotificationsRead = () => apiFetch<{ updated: number; unread: number }>('notifications/read-all', { method: 'PATCH' });

/** Where a notification leads and who may open it. The backend still enforces every permission; this only avoids sending a user to a page they cannot use. */
export function notificationTarget(type: string, user: { role: string; permissions: string[] } | null): { to: string; allowed: boolean } {
  const owner = user?.role === 'Chủ Spa';
  const has = (code: string) => owner || Boolean(user?.permissions.includes(code));
  if (type.startsWith('BOOKING_')) return { to: '/admin/lich-hen', allowed: has('Q01') };
  if (type === 'REVIEW_CREATED') return { to: '/admin/danh-gia', allowed: has('Q03') };
  return { to: '/admin/nhan-vien', allowed: owner || (user?.role === 'Quản lý' && has('Q05')) };
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}
