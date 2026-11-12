import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CustomerHeader } from '../components/customer-header';
import { PublicFooter } from '../components/public-footer';
import { ServiceCard } from '../components/service-card';
import { Button } from '../components/ui/button';
import { getPublicServices, type PublicServiceItem } from '../lib/catalog-api';

const CATEGORY_TABS = [
  { id: '', label: 'Tất cả', icon: '/assets/uc7-category-all.svg' },
  { id: 'DM01', label: 'Massage', icon: '/assets/uc7-category-massage.svg' },
  { id: 'DM02', label: 'Chăm sóc da', icon: '/assets/uc7-category-skin.svg' },
  { id: 'DM03', label: 'Dưỡng sinh', icon: '/assets/uc7-category-wellness.svg' },
  { id: 'DM04', label: 'Chăm sóc body', icon: '/assets/uc7-category-body.svg' },
  { id: 'DM05', label: 'Gội đầu dưỡng sinh', icon: '/assets/uc7-category-hair.svg' },
] as const;

/** Clearly isolated design-only fixture matching Figma UC_7 01_DanhSachDichVu when SQL catalog is empty. */
const FIGMA_VISUAL_FIXTURE: PublicServiceItem[] = [
  {
    id: 'PREVIEW-1',
    name: 'Chăm sóc da mặt cơ bản',
    description: 'Thả lỏng cơ thể với những động tác nhẹ nhàng và tinh dầu dịu thơm.',
    image: '/assets/uc7-card-1.png',
    categoryId: 'DM01',
    categoryName: 'Massage',
    minDuration: 90,
    priceFrom: 450000,
  },
  {
    id: 'PREVIEW-2',
    name: 'Massage chân thư giãn',
    description: 'Hơi ấm từ đá kết hợp nhịp massage chậm, cho phút giây thư thái.',
    image: '/assets/uc7-card-2.png',
    categoryId: 'DM01',
    categoryName: 'Massage',
    minDuration: 90,
    priceFrom: 590000,
  },
  {
    id: 'PREVIEW-3',
    name: 'Massage cổ vai gáy',
    description: 'Chăm sóc đôi chân bằng thao tác xoa bóp êm dịu và nhịp nhàng.',
    image: '/assets/uc7-card-3.png',
    categoryId: 'DM01',
    categoryName: 'Massage',
    minDuration: 60,
    priceFrom: 350000,
  },
  {
    id: 'PREVIEW-4',
    name: 'Gội đầu dưỡng sinh',
    description: 'Giảm căng thẳng, thư giãn vùng cổ, vai và gáy sau ngày dài.',
    image: '/assets/uc7-card-4.png',
    categoryId: 'DM01',
    categoryName: 'Massage',
    minDuration: 60,
    priceFrom: 350000,
  },
  {
    id: 'PREVIEW-5',
    name: 'Chăm sóc da chuyên sâu',
    description: 'Làm sạch và nâng niu làn da qua từng bước chăm sóc dịu nhẹ.',
    image: '/assets/uc7-card-5.png',
    categoryId: 'DM02',
    categoryName: 'Chăm sóc da',
    minDuration: 90,
    priceFrom: 590000,
  },
  {
    id: 'PREVIEW-6',
    name: 'Gội đầu dưỡng sinh',
    description: 'Gội đầu với hương thảo mộc, kết hợp massage da đầu thư giãn.',
    image: '/assets/uc7-card-6.png',
    categoryId: 'DM03',
    categoryName: 'Dưỡng sinh',
    minDuration: 60,
    priceFrom: 350000,
  },
  {
    id: 'PREVIEW-7',
    name: 'Chăm sóc body thảo dược',
    description: 'Tận hưởng hương thảo dược ấm áp trong liệu trình chăm sóc cơ thể.',
    image: '/assets/uc7-card-7.png',
    categoryId: 'DM04',
    categoryName: 'Chăm sóc cơ thể',
    minDuration: 120,
    priceFrom: 590000,
  },
  {
    id: 'PREVIEW-8',
    name: 'Tẩy tế bào chết',
    description: 'Chăm sóc bề mặt da với bước tẩy tế bào chết nhẹ nhàng.',
    image: '/assets/uc7-card-8.png',
    categoryId: 'DM04',
    categoryName: 'Chăm sóc cơ thể',
    minDuration: 60,
    priceFrom: 450000,
  },
];

export function ServicesCatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const initialCat = searchParams.get('category') ?? '';
  const previewParam = searchParams.get('preview') === 'figma';

  const [text, setText] = useState(initialQ);
  const [q, setQ] = useState(initialQ);
  const [category, setCategory] = useState(initialCat);
  const [page, setPage] = useState(1);
  const [searchError, setSearchError] = useState('');
  const [showVisualFixture, setShowVisualFixture] = useState(previewParam);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = text.trim();
      setQ(trimmed);
      setPage(1);
      const next = new URLSearchParams();
      if (trimmed) next.set('q', trimmed);
      if (category) next.set('category', category);
      if (showVisualFixture) next.set('preview', 'figma');
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [text, category, showVisualFixture, setSearchParams]);

  const query = useQuery({
    queryKey: ['public-services', q, category, page],
    queryFn: () => getPublicServices({ q, category, page, limit: 12 }),
  });

  const items = query.data?.items ?? [];
  const isFiltered = q.length > 0 || category.length > 0;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setSearchError('Vui lòng nhập từ khóa tìm kiếm!');
      return;
    }
    setSearchError('');
    setQ(trimmed);
    setPage(1);
  };

  return (
    <div className="customer-shell uc7-catalog-page">
      <CustomerHeader />

      {/* Figma UC_7 / UC6 Hero Banner (1440x235 exact ratio) */}
      <section className="customer-hero-hoian uc7-catalog-hero">
        <img className="uc7-hero-artwork uc7-hero-left" src="/assets/uc7-hero-left.png" alt="" />
        <img className="uc7-hero-artwork uc7-hero-right" src="/assets/uc7-hero-right.png" alt="" />
        <div className="hero-copy-box">
          <p>
            DỊCH VỤ <span className="hero-eyebrow-line" aria-hidden="true" />
          </p>
          <h1>Liệu trình chăm sóc &amp; thư giãn</h1>
          <span>
            Trải nghiệm các dịch vụ massage, chăm sóc da và dưỡng sinh được thiết kế riêng tại FLOWERLANTERN SPA.
          </span>
        </div>
      </section>

      <main className="catalog-main">
        {/* Figma UC_7 Centered Pill Search Bar */}
        <div className="catalog-search-wrapper">
          <form
            className={`catalog-search-pill ${searchError ? 'invalid' : ''}`}
            onSubmit={handleSearchSubmit}
            noValidate
          >
            <img src="/assets/uc7-search.svg" alt="" />
            <input
              type="search"
              aria-label="Nhập tên dịch vụ cần tìm"
              placeholder="Nhập tên dịch vụ cần tìm..."
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (searchError && e.target.value.trim()) setSearchError('');
              }}
            />
            <Button type="submit" size="sm" className="catalog-search-btn">
              Tìm kiếm
            </Button>
          </form>
          {searchError && (
            <p role="alert" className="catalog-search-error">
              {searchError}
            </p>
          )}
        </div>

        {/* Figma UC_6 / UC_7 Centered Category Pills */}
        <div className="catalog-category-pills" role="group" aria-label="Lọc theo danh mục">
          {CATEGORY_TABS.map((cat) => (
            <button
              key={cat.id || 'all'}
              type="button"
              aria-pressed={category === cat.id}
              onClick={() => {
                setCategory(cat.id);
                setPage(1);
              }}
            >
              <img src={cat.icon} alt="" aria-hidden="true" />
              {cat.label}
            </button>
          ))}
        </div>

        {query.isPending ? (
          <p role="status" className="booking-empty">Đang tải danh sách dịch vụ…</p>
        ) : query.isError ? (
          <div role="alert" className="booking-empty catalog-error-state">
            <p>Không thể tải kết quả tìm kiếm. Vui lòng thử lại!</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="catalog-error-retry"
              onClick={() => void query.refetch()}
            >
              Thử lại
            </Button>
          </div>
        ) : items.length === 0 ? (
          showVisualFixture ? (
            <div className="catalog-fixture-section">
              <div role="note" className="catalog-fixture-banner">
                <span>
                  <strong>Chế độ xem mẫu bố cục Figma</strong> (Dữ liệu minh họa kiểm tra giao diện — cơ sở dữ liệu Dev hiện có 0 dịch vụ).
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowVisualFixture(false)}
                >
                  Ẩn mẫu minh họa
                </Button>
              </div>
              <div className="catalog-grid">
                {FIGMA_VISUAL_FIXTURE.map((service) => (
                  <ServiceCard key={service.id} service={service} isPreview />
                ))}
              </div>
            </div>
          ) : (
            <div role="status" className={`booking-empty ${isFiltered ? 'catalog-empty-state' : ''}`}>
              {isFiltered ? (
                <>
                  <span className="catalog-empty-icon" aria-hidden="true">
                    <img src="/assets/uc7-search.svg" alt="" />
                  </span>
                  <p>Không tìm thấy dịch vụ phù hợp!</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="catalog-empty-reset"
                    onClick={() => {
                      setText('');
                      setQ('');
                      setCategory('');
                      setSearchError('');
                    }}
                  >
                    Xem tất cả dịch vụ
                  </Button>
                </>
              ) : (
                <>
                  <p>Hiện chưa có dịch vụ nào đang hoạt động trong hệ thống.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowVisualFixture(true)}
                  >
                    Xem trước mẫu lưới thẻ Figma
                  </Button>
                </>
              )}
            </div>
          )
        ) : (
          <>
            <div className="catalog-grid">
              {items.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
            <nav className="customer-search-pagination" aria-label="Phân trang dịch vụ">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Trang trước
              </Button>
              <span>Trang {page}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={items.length < 12}
                onClick={() => setPage((p) => p + 1)}
              >
                Trang sau
              </Button>
            </nav>
          </>
        )}
      </main>

      <PublicFooter compact />
    </div>
  );
}
