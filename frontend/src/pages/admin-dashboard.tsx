import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/auth-context';
import { AccountMenu } from '../components/account-menu';
import { Button } from '../components/ui/button';
import { getCalendar, type CalendarItem } from '../lib/booking-api';
import { BookingCancel } from '../components/booking-cancel';
import { ManagementSidebar } from '../components/management-sidebar';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
export function AdminDashboard() {
  const {user}=useAuth();
  const navigation=useRef<HTMLDialogElement>(null);
  const [navOpen,setNavOpen]=useState(false);
  const [date,setDate]=useState(today);
  const [selected,setSelected]=useState<CalendarItem|null>(null);
  const allowed=user?.role==='Chủ Spa'||user?.permissions.includes('Q01');
  const query=useQuery({queryKey:['bookings',date],queryFn:()=>getCalendar(date),enabled:!!allowed});
  return <div className="admin-shell">
    <div className="desktop-sidebar"><ManagementSidebar/></div>
    <dialog className="management-drawer" ref={navigation} onClose={()=>setNavOpen(false)} aria-label="Điều hướng quản lý"><button className="drawer-close" onClick={()=>navigation.current?.close()}>Đóng menu</button><ManagementSidebar onNavigate={()=>navigation.current?.close()}/></dialog>
    <div className="admin-workspace"><img className="admin-leaves" src="/assets/admin-imgTopRightLeaves.svg" alt=""/>
      <header className="admin-header"><button className="navigation-toggle" aria-expanded={navOpen} onClick={()=>{navigation.current?.showModal();setNavOpen(true);}}>Menu</button><img src="/assets/admin-imgNotificationIcon.svg" alt="Thông báo"/><AccountMenu/></header>
      <main className="admin-content">
        {selected&&<BookingCancel key={selected.id} item={query.data?.items.find(item=>item.id===selected.id)??selected} onClose={()=>setSelected(null)}/>}
        <div className="calendar-toolbar"><input aria-label="Ngày xem lịch" type="date" value={date} onChange={event=>{if(event.target.value)setDate(event.target.value);}}/><Button variant="outline" onClick={()=>setDate(today())}>Hôm nay</Button></div>
        <div className="calendar-legend"><h1>Lịch theo giường</h1>{['Chờ xác nhận','Đã xác nhận','Chưa đến','Hoàn thành','Đã hủy'].map((s,i)=><span key={s}><i className={`status-dot status-${i}`}/>{s}</span>)}</div>
        {!allowed?<p role="alert">Bạn không có quyền xem lịch hẹn.</p>:query.isPending?<p role="status">Đang tải danh sách lịch hẹn…</p>:query.isError?<div role="alert"><p>{query.error.message}</p><Button onClick={()=>void query.refetch()}>Thử lại</Button></div>:<div className="bed-calendar" aria-label="Lịch theo 20 giường">
          <div className="calendar-grid" style={{width:84+query.data.beds.length*75}}>
            <div className="calendar-grid-header"><span>Giờ</span>{query.data.beds.map(b=><span key={b.id}>{b.id}</span>)}</div>
            <div className="calendar-hours" ref={element=>{if(element&&element.dataset.positioned!=='yes'){element.scrollTop=8*56;element.dataset.positioned='yes';}}}>
              <div className="calendar-day" style={{height:24*56}}>
                {Array.from({length:24},(_,h)=><div className="hour-row" key={h} style={{top:h*56}}><span>{`${h}`.padStart(2,'0')}:00</span>{query.data.beds.map(b=><div key={b.id}/>)}</div>)}
                {query.data.items.filter(item=>item.bedId).map(item=>{const index=query.data.beds.findIndex(b=>b.id===item.bedId);if(index<0)return null;return <button type="button" onClick={()=>setSelected(item)} key={item.id} className="calendar-appointment" data-status={item.status} style={{left:87+index*75,top:Math.max(0,item.startMinute)*56/60+2,height:Math.max(22,(Math.min(1440,item.endMinute)-Math.max(0,item.startMinute))*56/60-4)}} title={`${item.bookingId}: ${item.startsAt} – ${item.endsAt} · ${item.status}`}><strong>{item.serviceName}</strong><span>{item.customerName}</span></button>;})}
              </div>
            </div>
          </div>
        </div>}
      </main>
    </div>
  </div>;
}
