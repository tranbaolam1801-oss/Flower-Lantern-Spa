/**
 * auth-context.tsx — Context quản lý trạng thái xác thực toàn cục.
 * AuthProvider bọc ứng dụng; useAuth() trả về trạng thái và hành động.
 */

import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { activityApi, getMeApi, logoutApi, type AuthUser, type ApiError } from '../lib/auth-api';

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
  const channel=useRef<BroadcastChannel|null>(null);
  const refresh=useCallback(()=>{void client.invalidateQueries({queryKey:['auth','me'],exact:true});},[client]);
  useEffect(() => {
    // A delayed 401 from another request must not erase a newer valid login.
    const expired = () => {void client.refetchQueries({queryKey:['auth','me'],exact:true,type:'active'},{cancelRefetch:false});};
    window.addEventListener('spa-session-expired',expired);
    if(typeof BroadcastChannel!=='undefined') {
      const connection=new BroadcastChannel('spa-auth');channel.current=connection;
      connection.onmessage=()=>refresh();
    }
    return () => {window.removeEventListener('spa-session-expired',expired);channel.current?.close();channel.current=null;};
  },[client,refresh]);
  const session = useQuery<AuthUser | null, ApiError>({
    queryKey: ['auth', 'me'],
    queryFn: async ({signal}) => {
      try { return await getMeApi(signal); }
      catch (error) { if ((error as ApiError).status === 401) return null; throw error; }
    },
    retry: false,
    staleTime:30000,
    refetchInterval: 60000,
    refetchOnWindowFocus: 'always',
  });

  const setUser = useCallback((u: AuthUser) => {
    void client.cancelQueries({ queryKey: ['auth', 'me'] });
    const previous=client.getQueryData<AuthUser|null>(['auth','me']);
    if(previous?.id!==u.id){
      const privateQueries={predicate:(query:{queryKey:readonly unknown[]})=>query.queryKey[0]!=='auth'};
      void client.cancelQueries(privateQueries);client.removeQueries(privateQueries);
    }
    client.setQueryData(['auth', 'me'], u);
    channel.current?.postMessage('refresh');
  }, [client]);

  useEffect(()=>{
    if(session.data===null){
      const otherQueries={predicate:(query:{queryKey:readonly unknown[]})=>query.queryKey[0]!=='auth'};
      void client.cancelQueries(otherQueries);client.removeQueries(otherQueries);
    }
  },[client,session.data]);

  // Idle timeout: 5 hours without any real interaction -> signed out. The server enforces it too (the session row
  // expires 5h after the last heartbeat); this timer also covers tabs that stay open and storage shared by several tabs.
  const userId = session.data?.id;
  const loadingRef = useRef(true);
  loadingRef.current = session.isPending;
  const logoutRef = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    const KEY = 'spa:last-activity';
    if (!userId) { if (!loadingRef.current) localStorage.removeItem(KEY); return; }
    const IDLE_MS = 5 * 60 * 60 * 1000;
    const HEARTBEAT_MS = 4 * 60 * 1000;
    const stored = Number(localStorage.getItem(KEY) ?? 0);
    if (stored && Date.now() - stored > IDLE_MS) { void logoutRef.current(); localStorage.removeItem(KEY); return; }
    let lastSeen = Date.now();
    let lastBeat = Date.now();
    localStorage.setItem(KEY, String(lastSeen));
    const mark = () => {
      const now = Date.now();
      if (now - lastSeen < 5000) return; // throttle
      lastSeen = now;
      localStorage.setItem(KEY, String(now));
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true, capture: true }));
    const timer = window.setInterval(() => {
      const latest = Math.max(lastSeen, Number(localStorage.getItem(KEY) ?? 0));
      if (Date.now() - latest > IDLE_MS) { localStorage.removeItem(KEY); void logoutRef.current(); return; }
      if (latest > lastBeat && Date.now() - lastBeat >= HEARTBEAT_MS) { lastBeat = Date.now(); void activityApi().catch(() => undefined); }
    }, 60000);
    return () => { events.forEach((e) => window.removeEventListener(e, mark, { capture: true })); window.clearInterval(timer); };
  }, [userId]);

  const logout = useCallback(async () => {
    await logoutApi();
    await client.cancelQueries();
    client.setQueryData(['auth', 'me'], null);
    client.removeQueries({predicate:query=>!(query.queryKey[0]==='auth'&&query.queryKey[1]==='me')});
    channel.current?.postMessage('refresh');
  }, [client]);

  logoutRef.current = logout;
  return (
    <AuthContext.Provider value={{ user: session.data ?? null, loading: session.isPending,
      error: session.error && !session.data ? (session.error.message || 'Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại!') : null,
      refresh, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải được dùng trong AuthProvider');
  return ctx;
}
