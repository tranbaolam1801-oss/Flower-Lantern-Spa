import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/auth-context';

const menu = [
  ['Tổng quan', '', 0, '/admin/tong-quan'],
  ['Quản lý lịch hẹn', 'Q01', 1, '/admin/lich-hen'],
  ['Quản lý khách hàng', 'Q02', 2, '/admin/khach-hang'],
  ['Quản lý đánh giá', 'Q03', 3, '/admin/danh-gia'],
  ['Quản lý nhân viên', 'Q05', 4, '/admin/nhan-vien'],
  ['Quản lý dịch vụ', 'Q04', 5, '/admin/dich-vu'],
  ['Báo cáo thống kê', 'Q06', 6, '/admin/bao-cao'],
] as const;

/** Shared approved management sidebar; UC_3.4 and all admin screens use this same component. */
export function ManagementSidebar({
  active = 'Q01',
  onNavigate,
}: {
  active?: string;
  onNavigate?: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="admin-sidebar">
      <img className="sidebar-lotus" src="/assets/admin-imgLotusDecoration.png" alt="" />
      <div className="admin-brand">
        <img src="/assets/admin-imgBrandLotus.png" alt="" />
        <strong>FLOWERLANTERN SPA</strong>
      </div>
      <nav aria-label="Quản lý Spa">
        {menu
          .filter(
            ([, permission]) =>
              !permission || user?.role === 'Chủ Spa' || user?.permissions.includes(permission),
          )
          .map(([label, permission, icon, route]) => {
            const key = permission || 'OVERVIEW';
            const isCurrent = key === active || (active === '' && permission === '');
            return (
              <button
                key={label}
                type="button"
                className={isCurrent ? 'active' : ''}
                aria-current={isCurrent ? 'page' : undefined}
                onClick={() => {
                  navigate(route);
                  onNavigate?.();
                }}
              >
                <img
                  src={
                    permission === 'Q01' && active !== 'Q01'
                      ? '/assets/admin-calendar-inactive.svg'
                      : permission === 'Q02' && active === 'Q02'
                        ? '/assets/admin-customers-active.svg'
                        : `/assets/admin-imgIconsAdminMenu${icon}.svg`
                  }
                  alt=""
                />
                {label}
              </button>
            );
          })}
      </nav>
    </aside>
  );
}
