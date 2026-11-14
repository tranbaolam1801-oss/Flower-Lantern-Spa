import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/auth-context';
import { useDismissable } from '../lib/use-dismissable';
import {
  NOTIFICATION_POLL_MS, getNotifications, getUnreadCount, markAllNotificationsRead, markNotificationRead, notificationKeys, notificationTarget, timeAgo,
  type NotificationItem, type NotificationPage,
} from '../lib/notifications-api';

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
function TypeIcon({ type }: { type: string }) {
  if (type.startsWith('BOOKING_')) return svg(<><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>);
  if (type === 'REVIEW_CREATED') return svg(<path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 19l1-5.4-4-3.8 5.4-.7z" />);
  if (type === 'ACCOUNT_LOCKED' || type === 'ACCOUNT_UNLOCKED') return svg(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
  return svg(<path d="M12 3 4.5 6v5.5c0 4.4 3 7.6 7.5 9 4.5-1.4 7.5-4.6 7.5-9V6z" />);
}

/**
 * Header bell. Count = one light query polled every 30 s only while the tab is visible (no WebSocket on Vercel); the list is fetched when the
 * dropdown opens (and kept fresh while open). Opening or closing the dropdown NEVER marks anything as read: only an explicit click on a
 * notification or on "Đánh dấu tất cả đã đọc" does. Uses the shared dismiss hook (outside press, Escape, one popover at a time).
 */
export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const userKey = user?.id;

  useDismissable({ id: 'notifications', open, onClose: () => setOpen(false), containerRef: root, onEscape: () => trigger.current?.focus() });
  useEffect(() => { setOpen(false); setNotice(''); }, [location.pathname, userKey]);

  const unread = useQuery({
    queryKey: [...notificationKeys.unread, userKey], queryFn: getUnreadCount, enabled: Boolean(userKey), staleTime: 10_000,
    refetchInterval: () => (typeof document !== 'undefined' && document.visibilityState === 'hidden' ? false : NOTIFICATION_POLL_MS),
    refetchOnWindowFocus: true,
  });
  const list = useInfiniteQuery({
    queryKey: [...notificationKeys.list, userKey], enabled: Boolean(userKey) && open, initialPageParam: 1, staleTime: 0,
    queryFn: ({ pageParam }) => getNotifications(pageParam),
    getNextPageParam: (last: NotificationPage) => (last.hasNext ? last.page + 1 : undefined),
    refetchInterval: () => (document.visibilityState === 'hidden' ? false : NOTIFICATION_POLL_MS),
  });
  const count = list.data?.pages[0]?.unread ?? unread.data ?? 0;
  const badge = unread.data ?? 0;
  const items: NotificationItem[] = list.data?.pages.flatMap((p) => p.items) ?? [];

  const setCount = (n: number) => { client.setQueryData([...notificationKeys.unread, userKey], n); };
  const refresh = async () => { await client.invalidateQueries({ queryKey: notificationKeys.list }); };
  const readOne = useMutation({ mutationFn: markNotificationRead, onSuccess: (r) => { setCount(r.unread); void refresh(); } });
  const readAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: (r) => { setCount(r.unread); void refresh(); } });

  function toggle() {
    setNotice('');
    if (!open) void client.invalidateQueries({ queryKey: [...notificationKeys.unread, userKey] });
    setOpen(!open);
  }

  async function choose(item: NotificationItem) {
    setNotice('');
    const target = notificationTarget(item.type, user);
    if (!item.read) { try { await readOne.mutateAsync(item.id); } catch { /* navigating must not depend on the read mark */ } }
    if (!target.allowed) { setNotice('Bạn không có quyền mở chức năng liên quan.'); return; }
    setOpen(false);
    navigate(target.to);
  }

  if (!user) return null;
  return <div className="notif-wrap" ref={root}>
    <button ref={trigger} type="button" className="notif-button" aria-label={badge > 0 ? `Thông báo, ${badge} chưa đọc` : 'Thông báo'} aria-haspopup="true" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
      <img src="/assets/admin-imgNotificationIcon.svg" alt="" />
      {badge > 0 && <span className="notif-badge" data-testid="notif-badge">{badge > 99 ? '99+' : badge}</span>}
    </button>
    {open && <section className="notif-panel" id={panelId} aria-label="Thông báo">
      <header className="notif-head">
        <h2>Thông báo{count > 0 && <span className="notif-count">{count} chưa đọc</span>}</h2>
        <button type="button" className="notif-readall" disabled={count === 0 || readAll.isPending} onClick={() => readAll.mutate()}>Đánh dấu tất cả đã đọc</button>
      </header>
      {notice && <p className="notif-note" role="status">{notice}</p>}
      <div className="notif-body">
        {list.isPending ? <p className="notif-state" role="status">Đang tải thông báo…</p>
          : list.isError ? <div className="notif-state" role="alert"><p>Không thể tải thông báo. Vui lòng thử lại!</p><button type="button" className="notif-retry" onClick={() => void list.refetch()}>Thử lại</button></div>
          : items.length === 0 ? <p className="notif-state" role="status">Chưa có thông báo nào.</p>
          : <ul className="notif-list">{items.map((n) => <li key={n.id}>
            <button type="button" className={`notif-item${n.read ? '' : ' is-unread'}`} onClick={() => void choose(n)}>
              <span className="notif-icon"><TypeIcon type={n.type} /></span>
              <span className="notif-text"><strong>{n.title}</strong><span>{n.body}</span><time dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}>{timeAgo(n.createdAt)}</time></span>
              {!n.read && <span className="notif-dot" aria-label="Chưa đọc" />}
            </button>
          </li>)}</ul>}
        {list.hasNextPage && <button type="button" className="notif-more" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}</button>}
      </div>
    </section>}
  </div>;
}
