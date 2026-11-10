/**
 * auth-context.tsx — Context quản lý trạng thái xác thực toàn cục.
 * AuthProvider bọc ứng dụng; useAuth() trả về trạng thái và hành động.
 */

import React, { createContext, useContext, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getMeApi, logoutApi, type AuthUser, type ApiError } from '../lib/auth-api';

interface AuthState {
  user: AuthUser | null;
  /** true khi đang kiểm tra session ban đầu */
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** Cập nhật user sau đăng nhập thành công */
  setUser: (user: AuthUser) => void;
  /** Đăng xuất và xóa state */
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  useEffect(() => {
    const expired = () => { client.clear(); client.setQueryData(['auth','me'],null); };
    window.addEventListener('spa-session-expired',expired);
    return () => window.removeEventListener('spa-session-expired',expired);
  },[client]);
  const session = useQuery<AuthUser | null, ApiError>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try { return await getMeApi(); }
      catch (error) { if ((error as ApiError).status === 401) return null; throw error; }
    },
    retry: false,
    refetchInterval: 60000,
    refetchOnWindowFocus: 'always',
  });

  const setUser = useCallback((u: AuthUser) => {
    void client.cancelQueries({ queryKey: ['auth', 'me'] });
    client.setQueryData(['auth', 'me'], u);
  }, [client]);

  const logout = useCallback(async () => {
    await logoutApi();
    await client.cancelQueries();
    client.clear();
    client.setQueryData(['auth', 'me'], null);
  }, [client]);

  return (
    <AuthContext.Provider value={{ user: session.data ?? null, loading: session.isPending,
      error: session.error ? 'Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại!' : null,
      refresh: () => { void session.refetch(); }, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải được dùng trong AuthProvider');
  return ctx;
}
