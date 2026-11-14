import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ManagementLayout } from '../components/management-layout';
import { useAuth } from '../contexts/auth-context';
import { getCalendar, searchAdminBookings, type CalendarItem } from '../lib/booking-api';
import { listEmployees, listReviews } from '../lib/management-api';

/** Asia/Ho_Chi_Minh wall clock as 'YYYY-MM-DDTHH:mm:ss' (same shape as the calendar's startsAt/endsAt, so values compare as strings). */
function vietnamNowIso() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
const todayVn = (nowIso: string) => nowIso.slice(0, 10);
const hhmm = (iso: string) => iso.slice(11, 16);
const REFRESH_MS = 60_000;

const STATUS_CLASS: Record<string, string> = {
  'Chờ xác nhận': 'pending', 'Đã xác nhận': 'confirmed', 'Chưa đến': 'waiting', 'Đã đến': 'arrived', 'Hoàn thành': 'done', 'Đã hủy': 'cancelled',
};

const Icon = ({ children }: { children: ReactNode }) => (
  <svg className="dash-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const CalendarIcon = () => <Icon><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></Icon>;
const BedIcon = () => <Icon><path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" /><circle cx="7" cy="11" r="1.6" /></Icon>;
const TaskIcon = () => <Icon><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></Icon>;
const UsersIcon = () => <Icon><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.6-3 2.7-4.5 5.5-4.5s4.9 1.5 5.5 4.5M16 6.2a3 3 0 0 1 0 5.6M17.5 14.7c1.7.6 2.7 2 3 4.3" /></Icon>;
const ClockIcon = () => <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
const StarIcon = () => <Icon><path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 19l1-5.4-4-3.8 5.4-.7z" /></Icon>;
const ArrowIcon = () => <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;

function Card({ title, icon, action, children, wide = false, label }: { title: string; icon: ReactNode; action?: { to: string; text: string }; children: ReactNode; wide?: boolean; label: string }) {
  return <section className={`dash-card${wide ? ' dash-card-wide' : ''}`} aria-labelledby={`dash-${label}`}>
    <header className="dash-card-head">
      <h2 id={`dash-${label}`}>{icon}<span>{title}</span></h2>
      {action && <Link className="dash-link" to={action.to}>{action.text} <ArrowIcon /></Link>}
    </header>
    {children}
  </section>;
}
const Note = ({ children, error = false }: { children: ReactNode; error?: boolean }) => <p className={`dash-note${error ? ' dash-note-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p>;

export function AdminOverviewPage() {
  const { user } = useAuth();
  const [nowIso, setNowIso] = useState(vietnamNowIso);
  useEffect(() => { const id = window.setInterval(() => setNowIso(vietnamNowIso()), 30_000); return () => window.clearInterval(id); }, []);
  const owner = user?.role === 'Chủ Spa';
  const can = (code: string) => owner || Boolean(user?.permissions.includes(code));
  const canEmployees = owner || (user?.role === 'Quản lý' && can('Q05'));
  const date = todayVn(nowIso);

  const calendar = useQuery({ queryKey: ['dashboard-calendar', date], queryFn: () => getCalendar(date), enabled: can('Q01'), refetchInterval: REFRESH_MS });
  const pending = useQuery({ queryKey: ['dashboard-pending'], queryFn: () => searchAdminBookings({ status: 'Chờ xác nhận' }), enabled: can('Q01'), refetchInterval: REFRESH_MS });
  const reviews = useQuery({ queryKey: ['dashboard-reviews'], queryFn: () => listReviews({ status: 'Chưa phản hồi' }), enabled: can('Q03'), refetchInterval: REFRESH_MS });
  const employees = useQuery({ queryKey: ['dashboard-employees'], queryFn: () => listEmployees({}), enabled: canEmployees, refetchInterval: REFRESH_MS });

  const items: CalendarItem[] = calendar.data?.items.filter((i) => i.startsAt.slice(0, 10) === date) ?? [];
  const now = nowIso.slice(0, 16).replace('T', ' ');
  const inUse = new Set(calendar.data?.items.filter((i) => i.bedId && i.status !== 'Đã hủy' && i.status !== 'Hoàn thành'
    && i.startsAt.slice(0, 16).replace('T', ' ') <= now && i.endsAt.slice(0, 16).replace('T', ' ') > now).map((i) => i.bedId as string));
  const totalBeds = calendar.data?.beds.length ?? 0;
  const working = employees.data?.items.filter((e) => e.workStatus === 'Đang làm việc' && e.accountStatus === 'Hoạt động') ?? [];

  const pendingCount = pending.data?.items.length ?? 0;
  const reviewCount = reviews.data?.items.length ?? 0;
  const tasks = [
    can('Q01') && { key: 'pending', icon: <CalendarIcon />, text: 'Lịch hẹn chờ xác nhận', count: pendingCount, more: false, to: '/admin/lich-hen', state: pending },
    can('Q03') && { key: 'reviews', icon: <StarIcon />, text: 'Đánh giá chưa phản hồi', count: reviewCount, more: Boolean(reviews.data?.hasNext), to: '/admin/danh-gia', state: reviews },
  ].filter(Boolean) as { key: string; icon: ReactNode; text: string; count: number; more: boolean; to: string; state: { isPending: boolean; isError: boolean } }[];

  return <ManagementLayout active="OVERVIEW">
    <div className="dash-grid">
      <Card label="appointments" title="Lịch hẹn hôm nay" icon={<CalendarIcon />} action={can('Q01') ? { to: '/admin/lich-hen', text: 'Xem tất cả' } : undefined}>
        {!can('Q01') ? <Note>Bạn không có quyền xem lịch hẹn.</Note>
          : calendar.isPending ? <Note>Đang tải lịch hẹn…</Note>
          : calendar.isError ? <Note error>Không thể tải lịch hẹn. Vui lòng thử lại!</Note>
          : items.length === 0 ? <Note>Hôm nay chưa có lịch hẹn.</Note>
          : <div className="dash-table-scroll"><table className="dash-table">
            <thead><tr><th>Giờ</th><th>Khách hàng</th><th>Dịch vụ</th><th>Giường</th><th>Trạng thái</th></tr></thead>
            <tbody>{items.slice(0, 6).map((i) => <tr key={i.id} className={i.status === 'Đã hủy' ? 'is-cancelled' : undefined}>
              <td className="dash-time">{hhmm(i.startsAt)} – {hhmm(i.endsAt)}</td>
              <td><strong>{i.customerName}</strong></td>
              <td>{i.serviceName}</td>
              <td>{i.bedId ?? '—'}</td>
              <td><span className={`dash-badge dash-badge-${STATUS_CLASS[i.status] ?? 'pending'}`}>{i.status}</span></td>
            </tr>)}</tbody>
          </table>{items.length > 6 && <p className="dash-more">và {items.length - 6} lịch hẹn khác hôm nay</p>}</div>}
      </Card>

      <Card label="beds" title="Tình trạng giường" icon={<BedIcon />}>
        {!can('Q01') ? <Note>Bạn không có quyền xem tình trạng giường.</Note>
          : calendar.isPending ? <Note>Đang tải tình trạng giường…</Note>
          : calendar.isError ? <Note error>Không thể tải tình trạng giường. Vui lòng thử lại!</Note>
          : <div className="dash-beds">
            <div className="dash-bed dash-bed-use"><span className="dash-bed-icon"><BedIcon /></span><strong>{inUse.size}</strong><span className="dash-pill">Đang sử dụng</span></div>
            <div className="dash-bed dash-bed-free"><span className="dash-bed-icon"><BedIcon /></span><strong>{Math.max(totalBeds - inUse.size, 0)}</strong><span className="dash-pill">Đang trống</span></div>
            <div className="dash-bed dash-bed-total"><span className="dash-bed-icon"><BedIcon /></span><strong>{totalBeds}</strong><span className="dash-pill">Tổng số giường</span></div>
          </div>}
      </Card>

      <Card label="tasks" title="Công việc cần xử lý" icon={<TaskIcon />}>
        {tasks.length === 0 ? <Note>Không có công việc nào thuộc quyền của bạn.</Note>
          : <ul className="dash-tasks">{tasks.map((t) => <li key={t.key}>
            <Link to={t.to} className="dash-task">
              <span className="dash-task-icon">{t.icon}</span>
              <span className="dash-task-text">{t.text}</span>
              <span className="dash-count">{t.state.isPending ? '…' : t.state.isError ? '!' : `${t.count}${t.more ? '+' : ''}`}</span>
              <ArrowIcon />
            </Link>
          </li>)}</ul>}
      </Card>

      <Card label="staff" title="Nhân viên đang làm việc" icon={<UsersIcon />} action={canEmployees ? { to: '/admin/nhan-vien', text: 'Xem tất cả' } : undefined}>
        {!canEmployees ? <Note>Bạn không có quyền xem danh sách nhân viên.</Note>
          : employees.isPending ? <Note>Đang tải nhân viên…</Note>
          : employees.isError ? <Note error>Không thể tải danh sách nhân viên. Vui lòng thử lại!</Note>
          : working.length === 0 ? <Note>Chưa có nhân viên ở trạng thái "Đang làm việc".</Note>
          : <ul className="dash-staff">{working.slice(0, 5).map((e) => <li key={e.id}>
            <img src="/assets/admin-imgAdminAvatar.png" alt="" />
            <strong>{e.fullName}</strong>
            <span>{e.role}</span>
          </li>)}</ul>}
      </Card>

      <Card wide label="activity" title="Hoạt động gần đây" icon={<ClockIcon />}>
        <Note>Hệ thống chưa có nhật ký hoạt động để hiển thị.</Note>
      </Card>
    </div>
  </ManagementLayout>;
}
