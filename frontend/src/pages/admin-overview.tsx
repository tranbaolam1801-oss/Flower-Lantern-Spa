import { Link } from 'react-router';
import { ManagementLayout } from '../components/management-layout';
import { useAuth } from '../contexts/auth-context';

const quickModules = [
  {
    code: 'Q01',
    title: 'Quản lý lịch hẹn',
    description: 'Theo dõi lịch theo giường, tạo mới, duyệt lịch, cập nhật và hủy lịch hẹn (08:00 – 22:00).',
    to: '/admin/lich-hen',
  },
  {
    code: 'Q02',
    title: 'Quản lý khách hàng',
    description: 'Tìm kiếm, thêm mới, chỉnh sửa hồ sơ và xem lịch sử lịch hẹn khách hàng.',
    to: '/admin/khach-hang',
  },
  {
    code: 'Q03',
    title: 'Quản lý đánh giá',
    description: 'Xem chi tiết và phản hồi đánh giá từ khách hàng sau khi hoàn thành dịch vụ.',
    to: '/admin/danh-gia',
  },
  {
    code: 'Q05',
    title: 'Quản lý nhân viên',
    description: 'Quản lý hồ sơ nhân viên, phân quyền truy cập Q01–Q06 và khóa/mở khóa tài khoản.',
    to: '/admin/nhan-vien',
  },
  {
    code: 'Q04',
    title: 'Quản lý dịch vụ',
    description: 'Thiết lập danh mục, gói dịch vụ, thời lượng, đơn giá và trạng thái hoạt động.',
    to: '/admin/dich-vu',
  },
  {
    code: 'Q06',
    title: 'Báo cáo thống kê',
    description: 'Theo dõi tổng lượt sử dụng dịch vụ, khách hàng mới và doanh thu theo thời gian.',
    to: '/admin/bao-cao',
  },
] as const;

export function AdminOverviewPage() {
  const { user } = useAuth();
  const allowedModules = quickModules.filter(
    (m) => user?.role === 'Chủ Spa' || user?.permissions.includes(m.code),
  );

  return (
    <ManagementLayout active="OVERVIEW">
      <section className="admin-panel-card">
        <div className="admin-panel-header">
          <div>
            <h1>Tổng quan vận hành Hoa Đăng Spa</h1>
            <p>
              Xin chào <strong>{user?.fullName}</strong> ({user?.role}) · Giờ hoạt động: 08:00 – 22:00 · 15 giường mặc định (G1–G15).
            </p>
          </div>
        </div>

        <div className="overview-grid">
          {allowedModules.map((mod) => (
            <Link key={mod.code} to={mod.to} className="overview-card">
              <span className="overview-badge">{mod.code}</span>
              <h2>{mod.title}</h2>
              <p>{mod.description}</p>
              <span className="home-text-link">Mở chức năng ›</span>
            </Link>
          ))}
        </div>
      </section>
    </ManagementLayout>
  );
}
