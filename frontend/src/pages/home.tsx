import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CustomerHeader } from '../components/customer-header';
import { PublicFooter } from '../components/public-footer';
import { ServiceCard } from '../components/service-card';
import { Button } from '../components/ui/button';
import { getPublicReviews, getPublicServices } from '../lib/catalog-api';

// Address-based Google Maps search; no unverified coordinates or Place ID.
const spaMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Flower Lantern Spa, 102 Bà Triệu, Hội An, Đà Nẵng, Việt Nam')}`;

const whyChooseItems = [
  {
    icon: '🏮',
    title: 'Không gian yên tĩnh',
    description: 'Thiết kế ấm cúng, gần gũi thiên nhiên, mang lại cảm giác an yên và thư thái.',
  },
  {
    icon: '👩‍⚕️',
    title: 'Kỹ thuật viên chuyên nghiệp',
    description: 'Đội ngũ giàu kinh nghiệm, được đào tạo bài bản và phục vụ tận tâm.',
  },
  {
    icon: '🌿',
    title: 'Dịch vụ cá nhân hóa',
    description: 'Liệu trình được tư vấn và thiết kế phù hợp với nhu cầu, thể trạng và mục tiêu của bạn.',
  },
  {
    icon: '📅',
    title: 'Đặt lịch nhanh chóng',
    description: 'Dễ dàng đặt lịch trực tuyến, chủ động khung giờ 08:00 – 22:00 và xác nhận tiện lợi.',
  },
];

const galleryItems = [
  { src: '/assets/hero-hoian-bg.png', alt: 'Phố cổ Hội An và hoa đăng tại Flower Lantern Spa' },
  { src: '/assets/lotus-decor.png', alt: 'Họa tiết hoa sen thanh khiết đặc trưng' },
  { src: '/assets/login-lotus.png', alt: 'Không gian thư giãn với hương sen dịu nhẹ' },
  { src: '/assets/admin-imgLotusDecoration.png', alt: 'Góc đón tiếp nhẹ nhàng tại Flower Lantern Spa' },
];

export function HomePage() {
  const navigate = useNavigate();

  const servicesQuery = useQuery({
    queryKey: ['public-services-featured'],
    queryFn: () => getPublicServices({ page: 1, limit: 4 }),
  });

  const reviewsQuery = useQuery({
    queryKey: ['public-reviews'],
    queryFn: getPublicReviews,
  });

  return (
    <div className="public-shell">
      <CustomerHeader />

      {/* 2. Hero Section matching reference layout with Hoi An banner & GREEN primary CTAs */}
      <section className="home-hero">
        <img className="home-hero-bg" src="/assets/hero-hoian-bg.png" alt="" />
        <div className="home-hero-inner">
          <div className="home-hero-copy">
            <h1>Thư giãn, phục hồi và chăm sóc toàn diện</h1>
            <p>
              Flower Lantern Spa là điểm đến chăm sóc sức khỏe và sắc đẹp lấy cảm hứng từ vẻ đẹp an yên của Hội An,
              mang đến những liệu trình thư giãn, phục hồi năng lượng và cân bằng thân – tâm – trí.
            </p>
            <div className="home-hero-actions">
              <Button type="button" onClick={() => navigate('/dich-vu')}>
                Khám phá dịch vụ ›
              </Button>
              <Button
                type="button"
                variant="outline"
                className="home-hero-book-btn"
                onClick={() => navigate('/dat-lich')}
              >
                <img src="/assets/customer-imgGroup2.svg" alt="" />
                Đặt lịch ngay
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. About Flower Lantern Spa */}
      <section id="gioi-thieu" className="home-section home-about">
        <div className="home-container home-about-grid">
          <div className="home-about-media">
            <img src="/assets/lotus-decor.png" alt="Không gian hoa sen thanh tịnh tại Flower Lantern Spa" />
          </div>
          <div className="home-about-body">
            <h2>Flower Lantern Spa</h2>
            <p>
              Flower Lantern Spa là spa chăm sóc sức khỏe và sắc đẹp tại Hội An, nơi kết hợp giữa các liệu pháp trị
              liệu truyền thống và phương pháp chăm sóc hiện đại, đem đến trải nghiệm thư giãn sâu, phục hồi
              năng lượng và tái tạo vẻ đẹp tự nhiên.
            </p>
            <p>
              Với không gian yên bình, đội ngũ kỹ thuật viên tận tâm và các liệu trình được thiết kế tinh tế,
              chúng tôi mong muốn mang đến cho bạn những phút giây thư thái trọn vẹn, nhẹ nhàng như ánh hoa
              đăng trên dòng sông Hội An.
            </p>
            <div className="home-about-pillars">
              <div>
                <strong>Chăm sóc toàn diện</strong>
                <span>Sức khỏe – Sắc đẹp – Thư giãn</span>
              </div>
              <div>
                <strong>Liệu pháp tự nhiên</strong>
                <span>An toàn, lành tính</span>
              </div>
              <div>
                <strong>Trải nghiệm an yên</strong>
                <span>Cân bằng thân – tâm – trí</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Featured Services */}
      <section className="home-section home-featured-services">
        <div className="home-container">
          <div className="home-section-header">
            <h2>Khám phá liệu trình chăm sóc</h2>
            <p>
              Đa dạng dịch vụ từ thư giãn, chăm sóc da đến các gói trị liệu chuyên sâu, được thiết kế phù hợp
              với nhu cầu của từng khách hàng.
            </p>
          </div>

          {servicesQuery.isPending ? (
            <p role="status" className="home-state-box">Đang tải danh sách dịch vụ…</p>
          ) : servicesQuery.isError ? (
            <div role="alert" className="home-state-box home-state-error">
              <p>Không thể tải danh sách dịch vụ nổi bật.</p>
              <Button type="button" variant="outline" onClick={() => void servicesQuery.refetch()}>
                Thử lại
              </Button>
            </div>
          ) : servicesQuery.data.items.length === 0 ? (
            <div className="home-state-box">
              <p>Hiện chưa có dịch vụ hoạt động được công bố.</p>
              <Link to="/dich-vu" className="home-text-link">Xem trang dịch vụ →</Link>
            </div>
          ) : (
            <div className="home-services-grid">
              {servicesQuery.data.items.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 5. Why Choose Us */}
      <section className="home-section home-why">
        <div className="home-container">
          <div className="home-section-header">
            <h2>Trải nghiệm khác biệt và trọn vẹn</h2>
          </div>
          <div className="home-why-grid">
            {whyChooseItems.map((item) => (
              <div key={item.title} className="home-why-card">
                <div className="home-why-icon" aria-hidden="true">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Spa Gallery */}
      <section className="home-section home-gallery">
        <div className="home-container">
          <div className="home-section-header">
            <h2>Không gian thư giãn, đậm chất Hội An</h2>
            <p>
              Một không gian yên bình, tinh tế và ấm cúng, nơi bạn có thể tạm rời xa nhịp sống vội vã và tận
              hưởng những giây phút chăm sóc và tái tạo năng lượng.
            </p>
          </div>
          <div className="home-gallery-grid">
            {galleryItems.map((img) => (
              <figure key={img.src} className="home-gallery-item">
                <img src={img.src} alt={img.alt} />
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Customer Reviews */}
      <section className="home-section home-reviews">
        <div className="home-container">
          <div className="home-section-header">
            <h2>Khách hàng nói gì về chúng tôi?</h2>
            <p>Sự hài lòng của bạn là nguồn cảm hứng để Flower Lantern Spa không ngừng hoàn thiện.</p>
          </div>

          {reviewsQuery.isPending ? (
            <p role="status" className="home-state-box">Đang tải đánh giá khách hàng…</p>
          ) : reviewsQuery.data && reviewsQuery.data.items.length > 0 ? (
            <div className="home-reviews-grid">
              {reviewsQuery.data.items.slice(0, 3).map((review) => (
                <article key={review.id} className="home-review-card">
                  <div className="home-review-head">
                    <strong>{review.customerName}</strong>
                    <span aria-label={`${review.rating} trên 5 sao`}>
                      {'★'.repeat(review.rating)}{'☆'.repeat(Math.max(0, 5 - review.rating))}
                    </span>
                  </div>
                  <small>{review.serviceName}</small>
                  <p>{review.comment}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="home-state-box">
              <p>Chưa có đánh giá công khai từ khách hàng. Các đánh giá xác thực sau khi hoàn thành dịch vụ sẽ hiển thị tại đây.</p>
            </div>
          )}
        </div>
      </section>

      {/* 9. Contact Section */}
      <section id="lien-he" className="home-section home-contact">
        <div className="home-container">
          <article className="home-contact-card home-contact-visit-card">
            <div className="home-section-header">
              <h2>Ghé thăm Flower Lantern Spa</h2>
              <p>Một điểm dừng chân yên bình giữa lòng Hội An, nơi bạn tận hưởng những phút giây chăm sóc và phục hồi năng lượng.</p>
            </div>
            <div className="home-contact-visit-layout">
              <img className="home-contact-visit-image" src="/assets/hero-hoian-bg.png" alt="Không gian Hội An" />
              <div className="home-contact-visit-details">
                <dl className="home-contact-list">
                  <div>
                    <dt>Địa chỉ</dt>
                    <dd><a className="contact-map-link" href={spaMapsUrl} target="_blank" rel="noopener noreferrer">102 Bà Triệu, Phường Hội An, TP. Đà Nẵng</a></dd>
                  </div>
                  <div>
                    <dt>Giờ mở cửa</dt>
                    <dd>08:00 – 22:00</dd>
                  </div>
                </dl>
                <div className="home-contact-actions">
                  <Button asChild size="sm"><Link to="/dat-lich">Đặt lịch ngay</Link></Button>
                  <Button asChild size="sm" variant="outline"><a href={spaMapsUrl} target="_blank" rel="noopener noreferrer">Xem đường đi</a></Button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
