import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from './ui/button';
import type { CalendarItem } from '../lib/booking-api';

export function BookingCancel({item,onClose}:{item:CalendarItem;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [message,setMessage]=useState('');
  const cache=useQueryClient();
  const mutation=useMutation({mutationFn:async()=>{
    const response=await fetch(`/api/bookings/${encodeURIComponent(item.bookingId)}/cancel`,{method:'POST',credentials:'include',headers:{'X-Spa-Request':'1'}});
    if(response.status===401)window.dispatchEvent(new Event('spa-session-expired'));
    if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(response.status===409?body.message:'Không thể hủy lịch hẹn. Vui lòng thử lại sau!');}
  },onSuccess:async()=>{dialog.current?.close();setMessage('Hủy lịch hẹn thành công!');await cache.invalidateQueries({queryKey:['bookings']});await cache.invalidateQueries({queryKey:['my-bookings']});}});
  return <section className="booking-detail" aria-label="Thông tin lịch hẹn">
    <button className="booking-detail-close" onClick={onClose} aria-label="Đóng thông tin lịch hẹn">×</button>
    <h2>{item.serviceName}</h2><p>{item.status}</p><p>Khách: {item.customerName}</p><p>Thời gian: {item.startsAt.slice(11,16)} – {item.endsAt.slice(11,16)}</p><p>Giường {item.bedId}</p>
    <Button className="cancel-booking-button" onClick={()=>{mutation.reset();dialog.current?.showModal();}}>Hủy lịch hẹn</Button>
    {message&&<p role="status">{message}</p>}
    <dialog className="booking-confirm-dialog" ref={dialog} aria-labelledby="cancel-title" onCancel={event=>{if(mutation.isPending)event.preventDefault();}}>
      <h2 id="cancel-title">Xác nhận</h2><p>Bạn có chắc chắn muốn hủy lịch hẹn này?</p>
      {mutation.isError&&<p role="alert">{mutation.error.message}</p>}
      <div><Button variant="outline" disabled={mutation.isPending} onClick={()=>dialog.current?.close()}>Không</Button><Button className="cancel-booking-button" disabled={mutation.isPending} onClick={()=>mutation.mutate()}>{mutation.isPending?'Đang hủy…':'Xác nhận hủy'}</Button></div>
    </dialog>
  </section>;
}
