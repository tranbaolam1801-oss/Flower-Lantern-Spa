import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../contexts/auth-context';
import { ManagementLayout } from '../components/management-layout';
import { Button } from '../components/ui/button';
import { searchAdminBookings, type SearchBookingsParams } from '../lib/booking-api';
import { statusLabel } from '../lib/booking-status';

/** Figma UC_2.4_02 Kết quả tìm kiếm: trang riêng (không còn hiển thị dưới biểu mẫu tìm kiếm). */
export const BOOKING_SEARCH_PATH = '/admin/lich-hen/ket-qua';
const KEYS = ['name', 'phone', 'email', 'code', 'service', 'status', 'source', 'dateFrom', 'dateTo'] as const;
const LABELS: Record<(typeof KEYS)[number], string> = {
  name: 'Tên khách', phone: 'SĐT', email: 'Email', code: 'Mã lịch hẹn', service: 'Dịch vụ/gói', status: 'Trạng thái', source: 'Nguồn', dateFrom: 'Từ ngày', dateTo: 'Đến ngày',
};
const todayLabel = () => new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

export function AdminBookingSearchPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const allowed = user?.role === 'Chủ Spa' || user?.permissions.includes('Q01');
  const applied = Object.fromEntries(KEYS.map((k) => [k, params.get(k) ?? ''])) as Record<(typeof KEYS)[number], string>;
  const query = useQuery({
    queryKey: ['bookings-search', applied],
    queryFn: () => searchAdminBookings(applied as SearchBookingsParams),
    enabled: !!allowed && Object.values(applied).some(Boolean),
  });
  const back = () => navigate('/admin/lich-hen');
  const condition = KEYS.filter((k) => applied[k]).map((k) => (k === 'name' ? `${LABELS[k]} "${applied[k]}"` : `${LABELS[k]}: ${k === 'status' ? statusLabel(applied[k]) : applied[k]}`)).join(' - ');

  return (
    <ManagementLayout active="Q01">
      <div className="calendar-toolbar calendar-toolbar-extended">
        <button type="button" className="calendar-date-picker booking-search-back" onClick={back} aria-label="Quay lại lịch hẹn">
          <img src="/assets/admin-calendar-inactive.svg" alt="" />
          <span>{todayLabel().replace(/^./, (c) => c.toUpperCase())}</span>
          <img className="calendar-date-chevron" src="/assets/admin-imgChevronDown.svg" alt="" />
        </button>
        <Button type="button" size="sm" variant="outline" onClick={back}>Hôm nay</Button>
      </div>
      {!allowed ? (
        <p role="alert">Bạn không có quyền xem lịch hẹn.</p>
      ) : (
        <section className="customer-search-card booking-search-page" aria-labelledby="booking-search-heading">
          <h1 id="booking-search-heading" className="booking-search-heading">Kết quả tìm kiếm</h1>
          {condition && <p className="booking-search-condition" data-testid="search-condition">Điều kiện: {condition}</p>}
          {query.isPending && query.fetchStatus !== 'idle' ? (
            <p role="status">Đang tìm kiếm…</p>
          ) : query.isError ? (
            <p role="alert" className="spa-form-error">⚠ {(query.error as { message?: string })?.message ?? 'Không thể tìm kiếm lịch hẹn. Vui lòng thử lại sau!'}</p>
          ) : !query.data || query.data.items.length === 0 ? (
            <div className="booking-search-empty" role="status">
              <span className="booking-search-empty-icon" aria-hidden="true">?</span>
              <p>Không tìm thấy lịch hẹn phù hợp!</p>
            </div>
          ) : (
            <div className="customer-search-scroll">
              <table className="customer-search-table">
                <thead>
                  <tr><th>Mã</th><th>Khách</th><th>SĐT</th><th>Dịch vụ</th><th>Giường</th><th>Thời gian</th></tr>
                </thead>
                <tbody>
                  {query.data.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.bookingId}</td>
                      <td>{item.customerName}</td>
                      <td>{item.customerPhone ?? '—'}</td>
                      <td>{item.serviceName}</td>
                      <td>{item.bedId ?? '—'}</td>
                      <td>
                        {item.startsAt.slice(8, 10)}/{item.startsAt.slice(5, 7)} · {item.startsAt.slice(11, 16)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </ManagementLayout>
  );
}
