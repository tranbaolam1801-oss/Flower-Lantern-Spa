import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AccountMenu } from '../components/account-menu';
import { Button } from '../components/ui/button';
import { getMyBookings } from '../lib/booking-api';
const filters=['Tất cả','Chờ xác nhận','Đã xác nhận','Hoàn thành','Đã hủy'];
const day=(value:string)=>value.slice(0,10).split('-').reverse().join('/');
export function CustomerDashboard() {
  const [filter,setFilter]=useState('Tất cả');
  const query=useQuery({queryKey:['my-bookings'],queryFn:getMyBookings});
  const items=query.data?.items??[];
  const visible=items.filter(b=>filter==='Tất cả'||b.status===filter);
  return <div className="customer-shell">
    <header className="customer-header"><img className="customer-logo" src="/assets/customer-imgRectangle.png" alt="Hoa Đăng Spa – Flower Lantern Spa"/>
      <nav aria-label="Điều hướng khách hàng">{['Trang chủ','Giới thiệu','Dịch vụ','Đặt lịch','Liên hệ'].map(label=><button key={label} disabled title="Chức năng chưa sẵn sàng">{label}</button>)}</nav>
      <div className="customer-header-actions"><img src="/assets/customer-imgGroup.svg" alt="Tìm kiếm"/><AccountMenu customer/><Button disabled><img src="/assets/customer-imgGroup2.svg" alt=""/>Đặt lịch ngay</Button></div>
    </header>
    <section className="customer-hero"><img className="hero-left" src="/assets/customer-imgRectangle1.png" alt=""/><img className="hero-right" src="/assets/customer-imgRectangle2.png" alt=""/><div><p>TÀI KHOẢN</p><h1>Lịch hẹn của tôi</h1><span>Theo dõi dịch vụ, thời gian và trạng thái<br/>các lịch hẹn bạn đã đặt tại Hoa Đăng Spa.</span></div></section>
    <main className="customer-bookings"><div className="booking-filters" role="group" aria-label="Lọc trạng thái lịch hẹn">{filters.map(label=>{const count=label==='Tất cả'?items.length:items.filter(b=>b.status===label).length;return <button key={label} aria-pressed={filter===label} onClick={()=>setFilter(label)}>{label}{count>0&&<span>{count}</span>}</button>;})}</div>
      <div className="booking-list-heading"><h2>Danh sách lịch hẹn</h2>{query.isSuccess&&<p>{visible.length} lịch hẹn | Sắp xếp: Mới đặt nhất</p>}</div>
      {query.isPending?<p role="status">Đang tải danh sách lịch hẹn…</p>:query.isError?<div role="alert"><p>{query.error.message}</p><Button onClick={()=>void query.refetch()}>Thử lại</Button></div>:items.length===0?<p className="booking-empty">Bạn chưa có lịch hẹn nào!</p>:<div className="booking-table-scroll"><table className="booking-table"><thead><tr>{['Mã lịch hẹn','Dịch vụ / Gói dịch vụ','Ngày hẹn','Giờ hẹn','Ngày đặt','Trạng thái','Thao tác'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{visible.map(b=><tr key={b.id}><td><strong>{b.id}</strong></td><td>{b.services.map(s=><div key={s.id}><strong>{s.name}</strong><small>{s.packageName}</small></div>)}</td><td>{day(b.date)}</td><td>{b.services.map(s=><div key={s.id}>{s.startsAt} – {s.endsAt}</div>)}</td><td>{day(b.createdAt)}</td><td><span className="booking-status" data-status={b.status}>{b.status}</span></td><td><span>—</span></td></tr>)}</tbody></table>{visible.length===0&&<p className="booking-empty">Không có lịch hẹn ở trạng thái này.</p>}</div>}
    </main><footer className="customer-footer">© 2026 Hoa Đăng Spa · Giờ hoạt động 9:00 – 21:00</footer>
  </div>;
}
