import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Login } from './pages/login';
import { HomePage } from './pages/home';
import { AuthProvider, useAuth } from './contexts/auth-context';
import { getDefaultRoute } from './lib/auth-api';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/500.css';
import '@fontsource/noto-serif/400.css';
import './styles.css';

const ServicesCatalogPage = lazy(() => import('./pages/services-catalog').then((m) => ({ default: m.ServicesCatalogPage })));
const ServiceDetailPage = lazy(() => import('./pages/service-detail').then((m) => ({ default: m.ServiceDetailPage })));
const CustomerBookingPage = lazy(() => import('./pages/customer-booking').then((m) => ({ default: m.CustomerBookingPage })));
const SystemStatus = lazy(() => import('./pages/system-status').then((m) => ({ default: m.SystemStatus })));
const AdminDashboard = lazy(() => import('./pages/admin-dashboard').then((m) => ({ default: m.AdminDashboard })));
const AdminOverviewPage = lazy(() => import('./pages/admin-overview').then((m) => ({ default: m.AdminOverviewPage })));
const CustomerDashboard = lazy(() => import('./pages/customer-dashboard').then((m) => ({ default: m.CustomerDashboard })));
const CustomerSearch = lazy(() => import('./pages/customer-search').then((m) => ({ default: m.CustomerSearch })));
const AdminReviewsPage = lazy(() => import('./pages/admin-reviews').then((m) => ({ default: m.AdminReviewsPage })));
const AdminEmployeesPage = lazy(() => import('./pages/admin-employees').then((m) => ({ default: m.AdminEmployeesPage })));
const AdminServicesPage = lazy(() => import('./pages/admin-services').then((m) => ({ default: m.AdminServicesPage })));
const AdminReportsPage = lazy(() => import('./pages/admin-reports').then((m) => ({ default: m.AdminReportsPage })));

const ProfilePage = lazy(() => import('./pages/profile').then((m) => ({ default: m.ProfilePage })));
const RegisterPage = lazy(() => import('./pages/register').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('./pages/forgot-password').then((m) => ({ default: m.ForgotPasswordPage })));

const queryClient =new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Protected({ customer = false, children }: { customer?: boolean; children?: React.ReactNode }) {
  const { user, loading, error, refresh } = useAuth();
  if (loading) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (error) return <main><p role="alert">{error}</p><button onClick={refresh}>Thử lại</button></main>;
  if (!user) return <Navigate to="/dang-nhap" replace />;
  if (customer !== (user.role === 'Khách hàng')) return <Navigate to={getDefaultRoute(user.role)} replace />;
  if (!['Chủ Spa', 'Quản lý', 'Nhân viên', 'Khách hàng'].includes(user.role)) {
    return <p role="alert">Không có quyền truy cập.</p>;
  }
  return children ?? (customer ? <CustomerDashboard /> : <AdminDashboard />);
}

/**
 * Public customer website (/, /dich-vu, /dat-lich ...). Waits for the session to be resolved BEFORE rendering anything (so the customer UI never
 * flashes while the role is unknown) and sends signed-in staff (Chủ Spa / Quản lý / Nhân viên) to their own area instead of the customer site.
 * Guests and customers see the page. If the session check itself failed (network), the page is shown as for a guest.
 */
function PublicArea({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user && user.role !== 'Khách hàng') return <Navigate to={getDefaultRoute(user.role)} replace />;
  return <>{children}</>;
}

/** Login / register / forgot-password: a signed-in user is sent to the area of THEIR role (never defaults to the customer area). */
function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (user) return <Navigate to={getDefaultRoute(user.role)} replace />;
  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<p role="status">Đang tải…</p>}>
          <Routes>
            <Route path="/" element={<PublicArea><HomePage /></PublicArea>} />
            <Route path="/dich-vu" element={<PublicArea><ServicesCatalogPage /></PublicArea>} />
            <Route path="/dich-vu/:id" element={<PublicArea><ServiceDetailPage /></PublicArea>} />
            <Route path="/dat-lich" element={<PublicArea><CustomerBookingPage /></PublicArea>} />
            <Route path="/dang-nhap" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="/dang-ky" element={<GuestOnly><RegisterPage /></GuestOnly>} />
            <Route path="/quen-mat-khau" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
            <Route path="/admin/tong-quan" element={<Protected><AdminOverviewPage /></Protected>} />
            <Route path="/admin/lich-hen" element={<Protected />} />
            <Route path="/admin/khach-hang" element={<Protected><CustomerSearch /></Protected>} />
            <Route path="/admin/danh-gia" element={<Protected><AdminReviewsPage /></Protected>} />
            <Route path="/admin/nhan-vien" element={<Protected><AdminEmployeesPage /></Protected>} />
            <Route path="/admin/dich-vu" element={<Protected><AdminServicesPage /></Protected>} />
            <Route path="/admin/bao-cao" element={<Protected><AdminReportsPage /></Protected>} />
            <Route path="/admin/ho-so" element={<Protected><ProfilePage /></Protected>} />
            <Route path="/ho-so" element={<Protected customer><ProfilePage /></Protected>} />
            <Route path="/lich-hen-cua-toi" element={<Protected customer />} />
            <Route path="/system" element={<SystemStatus />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
