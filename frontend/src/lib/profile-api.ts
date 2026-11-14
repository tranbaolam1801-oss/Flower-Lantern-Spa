import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL, apiFetch } from './api-client';
import { useAuth } from '../contexts/auth-context';

export interface ProfileData {
  id: string; role: string; status: string; phone: string; entityId: string | null;
  fullName: string; email: string | null; gender: string | null; birthDate: string | null; address: string | null;
  avatarUrl: string | null;
  editable: { fullName: boolean; email: boolean; gender: boolean; birthDate: boolean; address: boolean; avatar: boolean };
}
export interface ProfileInput { fullName?: string; email?: string | null; gender?: string | null; birthDate?: string | null; address?: string | null }

export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const profileKey = (userId?: string) => ['profile', userId] as const;

export const getProfile = () => apiFetch<{ profile: ProfileData }>('me').then((r) => r.profile);
export const updateProfile = (input: ProfileInput) =>
  apiFetch<{ profile: ProfileData }>('me', { method: 'PATCH', body: JSON.stringify(input) }).then((r) => r.profile);

/** Uploads the raw image (no multipart). Resolves to the new private avatar URL. */
export async function uploadAvatar(file: File): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/me/avatar`, {
    method: 'POST', credentials: 'include', headers: { 'X-Spa-Request': '1', 'Content-Type': file.type }, body: file,
  });
  const body = (await response.json().catch(() => null)) as { avatarUrl?: string; message?: string | string[] } | null;
  if (response.status === 401) window.dispatchEvent(new Event('spa-session-expired'));
  if (!response.ok || !body?.avatarUrl) {
    const message = Array.isArray(body?.message) ? body?.message.join(' ') : body?.message;
    throw { status: response.status, message: message || 'Không thể lưu ảnh đại diện. Vui lòng thử lại!' };
  }
  return body.avatarUrl;
}

/** Shared by the header avatar and the profile page so a saved change shows everywhere at once. */
export function useProfile() {
  const { user } = useAuth();
  return useQuery({ queryKey: profileKey(user?.id), queryFn: getProfile, enabled: Boolean(user), staleTime: 60000 });
}
