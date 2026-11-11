import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/auth-context';
const menu=[['Tổng quan','',0],['Quản lý lịch hẹn','Q01',1],['Quản lý khách hàng','Q02',2],['Quản lý đánh giá','Q03',3],['Quản lý nhân viên','Q05',4],['Quản lý dịch vụ','Q04',5],['Báo cáo thống kê','Q06',6]] as const;
/** Shared approved management sidebar; UC_3.4 must use this same component. */
export function ManagementSidebar({active='Q01',onNavigate}:{active?:string;onNavigate?:()=>void}) {
  const {user}=useAuth();
  const navigate=useNavigate();
  return <aside className="admin-sidebar">
    <img className="sidebar-lotus" src="/assets/admin-imgLotusDecoration.png" alt=""/>
    <div className="admin-brand"><img src="/assets/admin-imgBrandLotus.png" alt=""/><strong>FLOWERLANTERN SPA</strong></div>
    <nav aria-label="Quản lý Spa">{menu.filter(([,permission])=>!permission||user?.role==='Chủ Spa'||user?.permissions.includes(permission)).map(([label,permission,icon])=><button key={label} className={permission===active?'active':''} aria-current={permission===active?'page':undefined} disabled={!['Q01','Q02'].includes(permission)} onClick={()=>{navigate(permission==='Q02'?'/admin/khach-hang':'/admin/lich-hen');onNavigate?.();}} title={!['Q01','Q02'].includes(permission)?'Chức năng chưa sẵn sàng':undefined}><img src={permission==='Q01'&&active!=='Q01'?'/assets/admin-calendar-inactive.svg':permission==='Q02'&&active==='Q02'?'/assets/admin-customers-active.svg':`/assets/admin-imgIconsAdminMenu${icon}.svg`} alt=""/>{label}</button>)}</nav>
  </aside>;
}
