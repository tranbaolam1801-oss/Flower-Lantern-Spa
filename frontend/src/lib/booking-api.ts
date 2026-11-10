export interface CalendarItem {id:string;bookingId:string;bedId:string|null;customerName:string;serviceName:string;packageName:string;status:string;paymentStatus:string;startsAt:string;endsAt:string;startMinute:number;endMinute:number}
export interface CalendarData { date:string;beds:{id:string}[];items:CalendarItem[] }
export interface MyBooking {id:string;date:string;time:string;createdAt:string;status:string;paymentStatus:string;services:{id:string;name:string;packageName:string;startsAt:string;endsAt:string}[]}
async function read<T>(path:string):Promise<T> {
  const response=await fetch(`/api/${path}`,{credentials:'include'});
  if (!response.ok) {
    if(response.status===401) window.dispatchEvent(new Event('spa-session-expired'));
    throw new Error(response.status===403?'Bạn không có quyền xem lịch hẹn.':'Không thể tải danh sách lịch hẹn. Vui lòng thử lại!');
  }
  return response.json() as Promise<T>;
}
export const getCalendar=(date:string)=>read<CalendarData>(`bookings?date=${encodeURIComponent(date)}`);
export const getMyBookings=()=>read<{items:MyBooking[]}>('me/bookings');
