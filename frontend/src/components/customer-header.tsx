import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { AccountMenu } from './account-menu';
import { BrandLogo } from './brand-logo';
import { Button } from './ui/button';
import { useAuth } from '../contexts/auth-context';

const links = [
  { label: 'Trang chủ', to: '/' },
  { label: 'Giới thiệu', to: '/#gioi-thieu' },
  { label: 'Dịch vụ', to: '/dich-vu' },
  { label: 'Đặt lịch', to: '/dat-lich' },
  { label: 'Liên hệ', to: '/#lien-he' },
] as const;

export function CustomerHeader() {
  const drawer = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    if (to.startsWith('/#')) return false;
    return location.pathname.startsWith(to);
  };

  const handleNavClick = (to: string) => {
    drawer.current?.close();
    if (to.startsWith('/#')) {
      const id = to.slice(2);
      if (location.pathname !== '/') {
        navigate('/');
        setTimeout(() => {
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
        }, 120);
      } else {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }
    navigate(to);
  };

  return (
    <header className="customer-header">
      <Link to="/" aria-label="Về trang chủ Flower Lantern Spa" className="brand-home-link">
        <BrandLogo className="customer-logo" />
      </Link>
      <nav aria-label="Điều hướng khách hàng">
        {links.map((item) => (
          <button
            key={item.label}
            type="button"
            className={isActive(item.to) ? 'nav-link-active' : undefined}
            aria-current={isActive(item.to) ? 'page' : undefined}
            onClick={() => handleNavClick(item.to)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="customer-header-actions">
        <button
          type="button"
          className="header-icon-btn"
          aria-label="Tìm kiếm dịch vụ"
          title="Tìm kiếm dịch vụ"
          onClick={() => navigate('/dich-vu')}
        >
          <img src="/assets/customer-imgGroup.svg" alt="" />
        </button>
        <button
          type="button"
          className="customer-navigation-toggle"
          aria-label="Mở menu"
          aria-expanded={open}
          aria-controls="customer-navigation"
          onClick={() => {
            drawer.current?.showModal();
            setOpen(true);
          }}
        >
          Menu
        </button>
        {user ? (
          <AccountMenu customer />
        ) : (
          <button
            type="button"
            className="header-account-icon-btn"
            aria-label="Đăng nhập"
            title="Đăng nhập tài khoản"
            onClick={() => navigate('/dang-nhap')}
          >
            <img src="/assets/customer-imgGroup1.svg" alt="" />
          </button>
        )}
        <Button type="button" className="header-book-cta" onClick={() => navigate('/dat-lich')}>
          <img src="/assets/customer-imgGroup2.svg" alt="" />
          Đặt lịch ngay
        </Button>
      </div>
      <dialog
        id="customer-navigation"
        className="customer-drawer"
        ref={drawer}
        onClose={() => setOpen(false)}
        aria-label="Điều hướng khách hàng"
      >
        <button type="button" className="drawer-close" onClick={() => drawer.current?.close()}>
          Đóng menu
        </button>
        <Link to="/" onClick={() => drawer.current?.close()}>
          <BrandLogo />
        </Link>
        <nav aria-label="Menu khách hàng">
          {user && (
            <Link
              to="/lich-hen-cua-toi"
              aria-current={location.pathname === '/lich-hen-cua-toi' ? 'page' : undefined}
              onClick={() => drawer.current?.close()}
            >
              Lịch hẹn của tôi
            </Link>
          )}
          {links.map((item) => (
            <button key={item.label} type="button" onClick={() => handleNavClick(item.to)}>
              {item.label}
            </button>
          ))}
          {!user && (
            <Link to="/dang-nhap" onClick={() => drawer.current?.close()}>
              Đăng nhập
            </Link>
          )}
        </nav>
      </dialog>
    </header>
  );
}
