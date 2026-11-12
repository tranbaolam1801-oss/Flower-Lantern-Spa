import { Link, useNavigate, useParams } from 'react-router';
import { resolveApiUrl } from '../lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { CustomerHeader } from '../components/customer-header';
import { PublicFooter } from '../components/public-footer';
import { Button } from '../components/ui/button';
import { getPublicServiceDetail } from '../lib/catalog-api';
import { formatVnd } from '../lib/api-client';

function splitLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n|;/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ServiceDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['public-service-detail', id],
    queryFn: () => getPublicServiceDetail(id),
    enabled: !!id,
  });

  const service = query.data;
  const minPrice = service?.packages.length
    ? Math.min(...service.packages.map((p) => Number(p.price)))
    : null;
  const durations = service?.packages.map((p) => p.durationMinutes) ?? [];
  const durationLabel = durations.length
    ? Math.min(...durations) === Math.max(...durations)
      ? `${Math.min(...durations)} phút`
      : `${Math.min(...durations)} – ${Math.max(...durations)} phút`
    : 'Theo gói';

  return (
    <div className="customer-shell">
      <CustomerHeader />

      <main className="service-detail-main">
        <div className="service-detail-topbar">
          <Link to="/dich-vu" className="home-text-link">
            ‹ Quay lại danh sách dịch vụ
          </Link>
          <nav aria-label="Breadcrumb" className="service-breadcrumb">
            <Link to="/">Trang chủ</Link> › <Link to="/dich-vu">Dịch vụ</Link> ›{' '}
            <span>{service?.name ?? id}</span>
          </nav>
        </div>

        {query.isPending ? (
          <p role="status" className="booking-empty">Đang tải thông tin dịch vụ…</p>
        ) : query.isError || !service ? (
          <div role="alert" className="review-state-error">
            <p>
              {(query.error as { status?: number } | null)?.status === 404
                ? 'Không tìm thấy thông tin dịch vụ!'
                : 'Không thể tải thông tin dịch vụ. Vui lòng thử lại!'}
            </p>
            <Button type="button" variant="outline" onClick={() => navigate('/dich-vu')}>
              Về danh sách dịch vụ
            </Button>
          </div>
        ) : (
          <>
            <section className="service-detail-hero">
              <div className="service-detail-image">
                <span className="service-detail-cat-pill">{service.categoryName || 'Dịch vụ'}</span>
                <img src={resolveApiUrl(service.image) || '/assets/lotus-decor.png'} alt={service.name} />
              </div>
              <div className="service-detail-summary">
                <div className="service-badges">
                  <span className="service-badge-cat">{service.categoryName || 'Spa'}</span>
                  <span className="service-badge-active">Hoạt động</span>
                </div>
                <h1>{service.name}</h1>
                <p className="service-detail-desc">
                  {service.details || service.description || 'Liệu trình chăm sóc toàn diện tại Hoa Đăng Spa.'}
                </p>
                <div className="service-meta-row">
                  <span>Thời lượng: <strong>{durationLabel}</strong></span>
                  <span>Giá từ: <strong className="service-price-lg">{formatVnd(minPrice)}</strong></span>
                </div>

                <div className="service-packages-box">
                  <h2>Gói dịch vụ</h2>
                  {service.packages.length === 0 ? (
                    <p>Chưa có gói dịch vụ.</p>
                  ) : (
                    <ul>
                      {service.packages.map((pkg) => (
                        <li key={pkg.id}>
                          <div>
                            <strong>{pkg.name}</strong>
                            <small>Thời lượng {pkg.durationMinutes} phút</small>
                          </div>
                          <strong>{formatVnd(pkg.price)}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="service-detail-actions">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => document.getElementById('service-procedure')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Xem liệu trình
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="service-detail-book-btn"
                    onClick={() => navigate(`/dat-lich?serviceId=${encodeURIComponent(service.id)}`)}
                  >
                    <img src="/assets/customer-imgGroup2.svg" alt="" />
                    Đặt lịch ngay
                  </Button>
                </div>
              </div>
            </section>

            <section className="service-info-grid" id="service-procedure">
              <article className="service-info-card">
                <h3>Lợi ích</h3>
                <ul>
                  {(splitLines(service.benefits).length
                    ? splitLines(service.benefits)
                    : ['Giảm căng cơ, thư giãn cơ thể', 'Phục hồi năng lượng và giấc ngủ']
                  ).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="service-info-card">
                <h3>Đối tượng phù hợp</h3>
                <ul>
                  {(splitLines(service.suitableFor).length
                    ? splitLines(service.suitableFor)
                    : ['Khách hàng cần thư giãn sau ngày làm việc', 'Phù hợp cho nhiều thể trạng']
                  ).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>

              <article className="service-info-card">
                <h3>Quy trình thực hiện</h3>
                <ol>
                  {(splitLines(service.procedureSteps).length
                    ? splitLines(service.procedureSteps)
                    : ['Tư vấn nhu cầu và lựa chọn tinh dầu', 'Thực hiện liệu trình chăm sóc', 'Nghỉ ngơi và thưởng thức trà thảo mộc']
                  ).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </article>

              <article className="service-info-card">
                <h3>Liệu trình và lưu ý</h3>
                <ul>
                  {(splitLines(service.notes).length
                    ? splitLines(service.notes)
                    : ['Đến sớm 10 phút trước giờ hẹn', 'Thông báo cho kỹ thuật viên nếu có vùng nhạy cảm']
                  ).map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </article>
            </section>
          </>
        )}
      </main>

      <PublicFooter compact />
    </div>
  );
}
