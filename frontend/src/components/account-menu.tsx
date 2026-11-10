import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/auth-context';

export function AccountMenu({ customer=false }: {customer?:boolean}) {
  const {user,logout}=useAuth();
  const navigate=useNavigate();
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  async function leave() {
    setPending(true); setError('');
    try { await logout(); navigate('/dang-nhap',{replace:true}); }
    catch { setError('Không thể đăng xuất. Vui lòng thử lại!'); }
    finally {setPending(false);}
  }
  return <div className="account-menu">
    <details><summary aria-label="Tài khoản">
      <img src={customer?'/assets/customer-imgGroup1.svg':'/assets/admin-imgAdminAvatar.png'} className={customer?'':'account-avatar'} alt=""/>
      {!customer&&<><span>{user?.role}</span><img src="/assets/admin-imgChevronDown.svg" alt=""/></>}
    </summary><div className="account-dropdown"><strong>{user?.fullName}</strong><span>{user?.role}</span>
      <button onClick={()=>navigate(customer?'/lich-hen-cua-toi':'/admin/lich-hen')}>{customer?'Lịch hẹn của tôi':'Quản lý lịch hẹn'}</button>
      <button onClick={()=>void leave()} disabled={pending}>{pending?'Đang đăng xuất…':'Đăng xuất'}</button>
    </div></details>
    {error&&<p role="alert">{error}</p>}
  </div>;
}
