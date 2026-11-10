import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Login } from './pages/login';
import { SystemStatus } from './pages/system-status';
import { AuthProvider, useAuth } from './contexts/auth-context';
import { AdminDashboard } from './pages/admin-dashboard';
import { CustomerDashboard } from './pages/customer-dashboard';
import { getDefaultRoute } from './lib/auth-api';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/500.css';
import '@fontsource/noto-serif/400.css';
import './styles.css';
const queryClient = new QueryClient({defaultOptions:{queries:{retry:false}}});
function Protected({ customer = false }: { customer?: boolean }) {
  const { user, loading, error, refresh } = useAuth();
  if (loading) return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (error) return <main><p role="alert">{error}</p><button onClick={refresh}>Thử lại</button></main>;
  if (!user) return <Navigate to="/dang-nhap" replace/>;
  if (customer !== (user.role === 'Khách hàng')) return <Navigate to={getDefaultRoute(user.role)} replace/>;
  if (!['Chủ Spa', 'Quản lý', 'Nhân viên', 'Khách hàng'].includes(user.role)) return <p role="alert">Không có quyền truy cập.</p>;
  return customer ? <CustomerDashboard/> : <AdminDashboard/>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><Routes>
  <Route path="/dang-nhap" element={<Login/>}/>
  <Route path="/admin/lich-hen" element={<Protected/>}/>
  <Route path="/lich-hen-cua-toi" element={<Protected customer/>}/>
  <Route path="/system" element={<SystemStatus/>}/>
  <Route path="*" element={<Navigate to="/dang-nhap" replace/>}/>
</Routes></AuthProvider></BrowserRouter></QueryClientProvider></React.StrictMode>);
