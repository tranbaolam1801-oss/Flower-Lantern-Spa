import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ManagementLayout } from '../components/management-layout';
import { useAuth } from '../contexts/auth-context';
import { Button } from '../components/ui/button';

interface Customer {id:string;name:string;phone:string;channel:string|null;bookingCount:number}
async function search(q:string,page:number,signal:AbortSignal):Promise<{items:Customer[];page:number;hasNext:boolean}> {
  const response=await fetch(`/api/customers?${new URLSearchParams({q,page:String(page)})}`,{credentials:'include',signal});
  if(response.status===401)window.dispatchEvent(new Event('spa-session-expired'));
  if(!response.ok)throw new Error(response.status===403?'Bạn không có quyền quản lý khách hàng.':'Không thể tải kết quả tìm kiếm. Vui lòng thử lại!');
  return response.json();
}
export function CustomerSearch() {
  const {user}=useAuth();
  const [text,setText]=useState('');
  const [q,setQuery]=useState('');
  const [page,setPage]=useState(1);
  useEffect(()=>{const timer=setTimeout(()=>{setQuery(text.trim());setPage(1);},300);return ()=>clearTimeout(timer);},[text]);
  const allowed=user?.role==='Chủ Spa'||user?.permissions.includes('Q02');
  const query=useQuery({queryKey:['customers',q,page],queryFn:({signal})=>search(q,page,signal),enabled:!!allowed});
  return <ManagementLayout active="Q02"><section className="customer-search-card" aria-label="Quản lý khách hàng">
    <h1 className="sr-only">Quản lý khách hàng</h1>
    <div className="customer-search-toolbar"><label className="customer-search-input"><img src="/assets/customer-imgGroup.svg" alt=""/><input aria-label="Tìm kiếm theo tên hoặc số điện thoại" placeholder="Tìm kiếm theo tên hoặc số điện thoại" maxLength={100} value={text} onChange={e=>setText(e.target.value)}/></label><Button variant="outline" disabled title="Chức năng chưa sẵn sàng">Bộ lọc</Button><Button disabled title="Chức năng chưa sẵn sàng">+ Thêm mới</Button></div>
    {!allowed?<p role="alert">Bạn không có quyền quản lý khách hàng.</p>:query.isPending?<p role="status">Đang tải kết quả tìm kiếm…</p>:query.isError?<div role="alert"><p>{query.error.message}</p><Button onClick={()=>void query.refetch()}>Thử lại</Button></div>:<>
      <div className="customer-search-scroll"><table className="customer-search-table"><thead><tr>{['Mã KH','Họ tên','Số điện thoại','Kênh liên hệ','Tổng lịch hẹn','Thao tác'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{query.data.items.map(c=><tr key={c.id}><td>{c.id}</td><td><strong>{c.name}</strong></td><td>{c.phone}</td><td>{c.channel||'—'}</td><td>{c.bookingCount}</td><td><span title="Xem và sửa khách hàng chưa triển khai">—</span></td></tr>)}</tbody></table></div>
      {query.data.items.length===0&&<p className="customer-search-empty" role="status">Không tìm thấy khách hàng phù hợp!</p>}
      <nav className="customer-search-pagination" aria-label="Phân trang khách hàng"><Button variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Trang trước</Button><span>Trang {page}</span><Button variant="outline" disabled={!query.data.hasNext} onClick={()=>setPage(p=>p+1)}>Trang sau</Button></nav>
    </>}
  </section></ManagementLayout>;
}
