import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ManagementLayout } from '../components/management-layout';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/auth-context';
import {
  getCustomerReport,
  getRevenueReport,
  getServiceReport,
} from '../lib/management-api';
import { formatVnd } from '../lib/api-client';

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` };
}

/** Figma UC_10.2: area/line chart with a VND y-axis, dotted points and sparse x labels (not bars). */
function RevenueLine({ series }: { series: { label: string; amount: number }[] }) {
  const W = 1000, H = 230, L = 74, R = 16, T = 28, B = 34;
  const max = Math.max(...series.map((p) => p.amount), 1);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const unit = [1, 2, 2.5, 5, 10].map((m) => m * step / 1).find((u) => max / u <= 5) ?? step * 10;
  const top = Math.ceil(max / unit) * unit;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += unit) ticks.push(v);
  const x = (i: number) => L + (series.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (series.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.amount).toFixed(1)}`);
  const every = Math.max(1, Math.ceil(series.length / 7));
  const num = (v: number) => v.toLocaleString('vi-VN');
  return (
    <svg className="reports-line" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Biểu đồ doanh thu">
      <text x={L - 12} y={12} textAnchor="end" className="rl-axis">VND</text>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="rl-grid" />
          <text x={L - 12} y={y(v) + 4} textAnchor="end" className="rl-axis">{num(v)}</text>
        </g>
      ))}
      <polygon points={`${x(0)},${y(0)} ${pts.join(' ')} ${x(series.length - 1)},${y(0)}`} className="rl-area" />
      <polyline points={pts.join(' ')} className="rl-line" />
      {series.map((p, i) => (
        <circle key={p.label + i} cx={x(i)} cy={y(p.amount)} r={3.2} className="rl-dot"><title>{`${p.label}: ${formatVnd(p.amount)}`}</title></circle>
      ))}
      {series.map((p, i) => (i % every === 0 ? <text key={'l' + i} x={x(i)} y={H - 10} textAnchor="middle" className="rl-axis">{p.label}</text> : null))}
    </svg>
  );
}

export function AdminReportsPage() {
  const { user } = useAuth();
  const initial = currentMonthRange();
  const [fromInput, setFromInput] = useState(initial.from);
  const [toInput, setToInput] = useState(initial.to);
  const [range, setRange] = useState(initial);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [dateError, setDateError] = useState('');

  const allowed = user?.role === 'Chủ Spa' || (user?.role === 'Quản lý' && !!user.permissions.includes('Q06')); // mirrors backend @Roles('Quản lý') @Permissions('Q06')

  const svcQuery = useQuery({
    queryKey: ['report-services', range.from, range.to],
    queryFn: () => getServiceReport(range.from, range.to),
    enabled: !!allowed,
  });

  const custQuery = useQuery({
    queryKey: ['report-customers', range.from, range.to],
    queryFn: () => getCustomerReport(range.from, range.to),
    enabled: !!allowed,
  });

  const revQuery = useQuery({
    queryKey: ['report-revenue', range.from, range.to, groupBy],
    queryFn: () => getRevenueReport(range.from, range.to, groupBy),
    enabled: !!allowed,
  });

  const applyFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromInput || !toInput || fromInput > toInput) {
      setDateError('Khoảng thời gian không hợp lệ. Vui lòng chọn lại!');
      return;
    }
    setDateError('');
    setRange({ from: fromInput, to: toInput });
  };

  const series = revQuery.data?.series ?? [];

  return (
    <ManagementLayout active="Q06">
      <div className="reports-stack">

        {!allowed ? (
          <p role="alert">Bạn không có quyền xem báo cáo thống kê.</p>
        ) : (
          <>
            <form className="reports-filter-card" onSubmit={applyFilter}>
              <label className={`spa-field${dateError ? ' spa-field-invalid' : ''}`}>
                <span>Từ ngày</span>
                <input
                  type="date"
                  value={fromInput}
                  onChange={(e) => setFromInput(e.target.value)}
                  aria-invalid={!!dateError}
                />
                {dateError && <p role="alert" className="spa-field-error-text">{dateError}</p>}
              </label>
              <label className={`spa-field${dateError ? ' spa-field-invalid' : ''}`}>
                <span>Đến ngày</span>
                <input
                  type="date"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  aria-invalid={!!dateError}
                />
              </label>
              <Button type="submit" size="sm" className="reports-submit-btn">
                Xem báo cáo
              </Button>
            </form>

            {/* KPI Cards */}
            <div className="reports-kpi-grid">
              <article className="reports-kpi-card reports-kpi-row">
                <div className="reports-kpi-icon kpi-green" aria-hidden="true">📋</div>
                <div>
                  <span>Tổng lượt sử dụng dịch vụ</span>
                  <strong>{svcQuery.isPending ? '…' : svcQuery.data?.totalUsage ?? 0}</strong>
                </div>
              </article>
              <article className="reports-kpi-card reports-kpi-row">
                <div className="reports-kpi-icon kpi-rose" aria-hidden="true">👥</div>
                <div>
                  <span>Khách hàng mới</span>
                  <strong>{custQuery.isPending ? '…' : custQuery.data?.newCustomers ?? 0}</strong>
                </div>
              </article>
              <article className="reports-kpi-card reports-kpi-row">
                <div className="reports-kpi-icon kpi-green" aria-hidden="true">💰</div>
                <div>
                  <span>Tổng doanh thu</span>
                  <strong>{revQuery.isPending ? '…' : formatVnd(revQuery.data?.totalRevenue ?? 0)}</strong>
                </div>
              </article>
            </div>

            {/* Revenue Chart */}
            <section className="admin-panel-card">
              <div className="reports-chart-head">
                <h2>Doanh thu theo {({ day: 'ngày', week: 'tuần', month: 'tháng', year: 'năm' } as const)[groupBy]}</h2>
                <div className="reports-granularity" role="group" aria-label="Chu kỳ thống kê">
                  {(
                    [
                      ['day', 'Ngày'],
                      ['week', 'Tuần'],
                      ['month', 'Tháng'],
                      ['year', 'Năm'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      aria-pressed={groupBy === val}
                      onClick={() => setGroupBy(val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {revQuery.isPending ? (
                <p role="status">Đang tải dữ liệu doanh thu…</p>
              ) : revQuery.isError ? (
                <div role="alert" className="spa-alert-error">
                  <p>{(revQuery.error as { message?: string })?.message ?? 'Không thể tải dữ liệu doanh thu. Vui lòng thử lại!'}</p>
                  <Button type="button" variant="outline" onClick={() => void revQuery.refetch()}>Thử lại</Button>
                </div>
              ) : series.length === 0 ? (
                <p className="customer-search-empty">Không có doanh thu trong khoảng thời gian đã chọn.</p>
              ) : (
                <RevenueLine series={series} />
              )}
            </section>

            {/* Bottom Two Tables */}
            <div className="reports-bottom-grid">
              <section className="admin-panel-card">
                <h2>Top dịch vụ được sử dụng nhiều nhất</h2>
                {svcQuery.isError ? (
                  <p role="alert" className="spa-form-error">⚠ Không thể tải dữ liệu thống kê. Vui lòng thử lại!</p>
                ) : !svcQuery.data?.items.length ? (
                  <p className="customer-search-empty">Không có lượt sử dụng dịch vụ trong khoảng thời gian đã chọn.</p>
                ) : (
                  <div className="reports-table-scroll"><table className="customer-search-table">
                    <thead>
                      <tr>
                        <th>Dịch vụ</th>
                        <th>Số lượt sử dụng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {svcQuery.data.items.map((item) => (
                        <tr key={item.serviceId}>
                          <td>{item.serviceName}</td>
                          <td><strong>{item.usageCount}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </section>

              <section className="admin-panel-card">
                <h2>Top khách hàng đặt nhiều nhất</h2>
                {custQuery.isError ? (
                  <p role="alert" className="spa-form-error">⚠ Không thể tải dữ liệu khách hàng. Vui lòng thử lại!</p>
                ) : !custQuery.data?.topCustomers.length ? (
                  <p className="customer-search-empty">Không có khách hàng trong khoảng thời gian đã chọn.</p>
                ) : (
                  <div className="reports-table-scroll"><table className="customer-search-table">
                    <thead>
                      <tr>
                        <th>Họ tên</th>
                        <th>Số điện thoại</th>
                        <th>Số lần đặt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custQuery.data.topCustomers.map((c) => (
                        <tr key={c.customerId}>
                          <td>{c.fullName}</td>
                          <td>{c.phone}</td>
                          <td><strong>{c.bookingCount}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </ManagementLayout>
  );
}
