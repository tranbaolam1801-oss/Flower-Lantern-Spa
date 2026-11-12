import { Link } from 'react-router';
import { BrandLogo } from './brand-logo';

export function PublicFooter({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <footer className="customer-footer">
        © 2026 Hoa Đăng Spa · 102 Bà Triệu, Hội An · Giờ hoạt động 08:00 – 22:00
      </footer>
    );
  }

  return (
    <footer className="public-footer">
      <div className="public-footer-inner">
        <div className="public-footer-brand">
          <div className="public-footer-logo-wrap">
            <BrandLogo className="public-footer-logo" />
          </div>
          <p>
            Hoa Đăng Spa (Flower Lantern Spa) mang đến liệu trình thư giãn, phục hồi năng lượng và chăm sóc sắc đẹp
            trong không gian yên bình đậm chất phố cổ Hội An.
          </p>
          <ul className="public-footer-meta">
            <li>Địa chỉ: 102 Bà Triệu, Phường Hội An, Thành Phố Đà Nẵng</li>
            <li>Giờ mở cửa: 08:00 – 22:00 (Tất cả các ngày)</li>
          </ul>
        </div>

        <div className="public-footer-col">
          <h3>Liên kết nhanh</h3>
          <ul>
            <li><Link to="/">Trang chủ</Link></li>
            <li><a href="/#gioi-thieu">Giới thiệu</a></li>
            <li><Link to="/dich-vu">Dịch vụ</Link></li>
            <li><Link to="/dat-lich">Đặt lịch ngay</Link></li>
            <li><Link to="/lich-hen-cua-toi">Lịch hẹn của tôi</Link></li>
          </ul>
        </div>

        <div className="public-footer-col">
          <h3>Trải nghiệm dịch vụ</h3>
          <ul>
            <li><Link to="/dich-vu?q=Massage">Massage thư giãn</Link></li>
            <li><Link to="/dich-vu?q=Ch%C4%83m%20s%C3%B3c%20da">Chăm sóc da</Link></li>
            <li><Link to="/dich-vu?q=G%E1%BB%99i%20%C4%91%E1%BA%A7u">Gội đầu dưỡng sinh</Link></li>
            <li><Link to="/dich-vu">Tất cả dịch vụ</Link></li>
          </ul>
        </div>

        <div className="public-footer-col">
          <h3>Hỗ trợ khách hàng</h3>
          <ul>
            <li><a href="/#lien-he">Thông tin liên hệ</a></li>
            <li><Link to="/dang-nhap">Đăng nhập tài khoản</Link></li>
            <li><Link to="/system">Trạng thái hệ thống</Link></li>
          </ul>
        </div>
      </div>

      <div className="public-footer-bottom">
        <span>© 2026 Flower Lantern Spa (Hoa Đăng Spa). Tất cả quyền được bảo lưu.</span>
        <span>Giờ hoạt động: 08:00 – 22:00</span>
      </div>
    </footer>
  );
}
