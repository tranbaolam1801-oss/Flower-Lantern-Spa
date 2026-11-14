import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import type { KeyboardEvent } from 'react';
import { useAuth } from '../contexts/auth-context';
import { useDismissable } from '../lib/use-dismissable';
import { useProfile } from '../lib/profile-api';

/**
 * Header account area.
 *  - Chủ Spa / Quản lý / Nhân viên: [avatar → profile page /admin/ho-so] [full name ▾ → dropdown with ONE action: "Đăng xuất"].
 *    The dropdown closes on a second click, outside press, Escape, route change and logout.
 *  - Khách hàng: avatar toggles the profile / appointments / logout menu.
 */
export function AccountMenu({ customer = false }: { customer?: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useProfile();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [broken, setBroken] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const customerPanel = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);

  useDismissable({ id: 'account-menu', open, onClose: () => setOpen(false), containerRef: root, onEscape: () => trigger.current?.focus() });
  useEffect(() => { setOpen(false); }, [location.pathname, user?.id]);
  useEffect(() => { if (customer) setOpen(false); }, [customer, location.key]);
  useEffect(() => {
    if (!customer || !open) return;
    const items = customerPanel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    (focusLast.current ? items?.[items.length - 1] : items?.[0])?.focus();
    focusLast.current = false;
  }, [customer, open]);

  function customerMenuKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') {
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(customerPanel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  async function leave() {
    setOpen(false);
    setPending(true); setError('');
    try { await logout(); navigate('/dang-nhap', { replace: true }); }
    catch { setError('Không thể đăng xuất. Vui lòng thử lại!'); }
    finally { setPending(false); }
  }

  // One source of truth: the profile query (set by PATCH /api/me right after the backend confirms) -> auth user -> never the role label.
  const displayName = (profile.data?.fullName || user?.fullName || '').trim();
  const avatar = profile.data?.avatarUrl && broken !== profile.data.avatarUrl ? profile.data.avatarUrl : null;
  const fallback = customer ? '/assets/customer-imgGroup1.svg' : '/assets/admin-imgAdminAvatar.png';
  const image = <img src={avatar ?? fallback} className={avatar || !customer ? 'account-avatar' : ''} alt="" onError={() => avatar && setBroken(avatar)} />;

  if (customer) {
    // Figma UC_5.2 00_MenuTaiKhoan: only the account icon in the header; it opens a card with the name + phone and 3 items.
    return <div className="account-menu account-menu-customer" ref={root}>
      <button ref={trigger} type="button" className="account-customer-trigger" aria-label="Tài khoản" aria-haspopup="true" aria-expanded={open} aria-controls={panelId} title={displayName || undefined} onClick={() => setOpen((value) => !value)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); focusLast.current = e.key === 'ArrowUp'; setOpen(true); } }}>
        {image}
      </button>
      {open && <div className="account-dropdown account-dropdown-customer" id={panelId} role="menu" ref={customerPanel} onKeyDown={customerMenuKeys}>
        <div className="account-dropdown-card">
          <span className="account-dropdown-avatar" aria-hidden="true">{(displayName || '?').trim().charAt(0).toUpperCase()}</span>
          <div><strong>{displayName}</strong><small>{profile.data?.phone ?? user?.phone}</small></div>
        </div>
        <Link role="menuitem" to="/ho-so" className="account-dropdown-item">Thông tin cá nhân</Link>
        <Link role="menuitem" to="/lich-hen-cua-toi" className="account-dropdown-item">Lịch hẹn của tôi</Link>
        <button role="menuitem" type="button" className="account-dropdown-item" onClick={() => void leave()} disabled={pending}>{pending ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
      </div>}
      {error && <p role="alert">{error}</p>}
    </div>;
  }

  return <div className="account-menu account-menu-admin" ref={root}>
    <Link className="account-profile-link" to="/admin/ho-so" aria-label="Thông tin cá nhân" title="Thông tin cá nhân">{image}</Link>
    <button ref={trigger} type="button" className="account-role-trigger" aria-label="Tài khoản" aria-haspopup="true" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
      <span className="account-name" title={displayName || user?.role}>{displayName || user?.role}</span><img src="/assets/admin-imgChevronDown.svg" alt="" />
    </button>
    {open && <div className="account-dropdown" id={panelId}>
      <button type="button" onClick={() => void leave()} disabled={pending}>{pending ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
    </div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
