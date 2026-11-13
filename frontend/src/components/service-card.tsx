import { Link } from 'react-router';
import { resolveApiUrl } from '../lib/api-client';
import type { PublicServiceItem } from '../lib/catalog-api';
import { formatVnd } from '../lib/api-client';

// Same catalog IDs/names as the existing ServicesCatalogPage category tabs.
// Public list responses currently supply categoryId without categoryName.
const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  DM00000001: 'Massage',
  DM00000002: 'Chăm sóc da',
  DM00000003: 'Dưỡng sinh',
  DM00000004: 'Chăm sóc body',
  DM00000005: 'Gội đầu dưỡng sinh',
};

export function ServiceCard({
  service,
  isPreview = false,
}: {
  service: PublicServiceItem;
  isPreview?: boolean;
}) {
  const detailPath = isPreview
    ? `/dich-vu?preview=figma`
    : `/dich-vu/${encodeURIComponent(service.id)}`;
  const categoryLabel = service.categoryName?.trim() || CATEGORY_LABELS[service.categoryId];

  return (
    <article className="figma-service-card">
      <div className="figma-service-thumb">
        <img src={resolveApiUrl(service.image) || '/assets/lotus-decor.png'} alt={service.name} />
      </div>
      <div className="figma-service-meta">
        <span className="figma-cat-badge" title={categoryLabel ? undefined : `Mã danh mục chưa khớp: ${service.categoryId || '(thiếu)'}`}>
          {categoryLabel || 'Chưa rõ danh mục'}
        </span>
        <span className="figma-dur-label">
          <img className="figma-clock-icon" src="/assets/uc7-clock.svg" alt="" aria-hidden="true" />
          {service.minDuration ? `${service.minDuration} phút` : '60 phút'}
        </span>
      </div>
      <div className="figma-service-body">
        <h3>{service.name}</h3>
        <p>{service.description || 'Liệu trình chăm sóc chuyên sâu tại Flower Lantern Spa.'}</p>
        <div className="figma-service-footer">
          <strong>{formatVnd(service.priceFrom)}</strong>
          <Link to={detailPath} className="figma-detail-pill" aria-label="Xem chi tiết →">
            <span>Xem chi tiết</span>
            <img className="figma-detail-arrow" src="/assets/uc7-arrow-right.svg" alt="" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
