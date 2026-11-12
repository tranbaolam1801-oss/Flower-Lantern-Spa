import { apiFetch } from './api-client';

export interface CalendarItem {
  id: string;
  bookingId: string;
  bedId: string | null;
  customerName: string;
  customerPhone?: string;
  serviceName: string;
  packageName: string;
  packageId?: string;
  status: string;
  paymentStatus: string;
  startsAt: string;
  endsAt: string;
  startMinute: number;
  endMinute: number;
}

export interface CalendarData {
  date: string;
  beds: { id: string }[];
  items: CalendarItem[];
}

export interface MyBookingService {
  id: string;
  name: string;
  packageName: string;
  startsAt: string;
  endsAt: string;
}

export interface MyBooking {
  id: string;
  date: string;
  time: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  hasReview?: boolean;
  totalAmount?: number;
  paidAmount?: number;
  services: MyBookingService[];
}

export interface BookingGuestInput {
  customerName: string;
  customerPhone?: string;
  bedId: string;
  packageId: string;
  startsAt: string;
}

export interface CreateAdminBookingPayload {
  bookerName: string;
  bookerPhone: string;
  bookerEmail?: string;
  source?: string;
  date: string;
  notes?: string;
  status?: 'Chờ xác nhận' | 'Chưa đến' | 'Đã xác nhận';
  paymentStatus?: 'Chưa thanh toán' | 'Thanh toán một phần' | 'Đã thanh toán';
  prepaidAmount?: number;
  guests: BookingGuestInput[];
}

export interface UpdateAdminBookingPayload {
  status?: string;
  paymentStatus?: string;
  notes?: string;
  date?: string;
  guests?: BookingGuestInput[];
}

export interface CreateCustomerBookingPayload {
  fullName: string;
  phone: string;
  email?: string;
  date: string;
  time: string;
  notes?: string;
  guests: {
    customerName: string;
    customerPhone?: string;
    packageId: string;
  }[];
}

export interface SepayPaymentIntent {
  paymentId: string;
  bookingId: string;
  reference: string;
  amount: number;
  qrUrl: string;
  accountNumber: string;
  bankName: string;
  accountHolder: string;
  expiresAt: string;
  status: 'Chờ thanh toán' | 'Đã thanh toán' | 'Hết hạn' | 'Thất bại' | 'Đã hoàn tiền';
  refundedAmount?: number;
  provider?: 'SEPAY' | 'MOCK';
  simulated?: boolean;
}

async function read<T>(path: string): Promise<T> {
  const response = await fetch(`/api/${path}`, { credentials: 'include' });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('spa-session-expired'));
    throw new Error(
      response.status === 403
        ? 'Bạn không có quyền xem lịch hẹn.'
        : 'Không thể tải danh sách lịch hẹn. Vui lòng thử lại!',
    );
  }
  return response.json() as Promise<T>;
}

// Existing implemented endpoints
export const getCalendar = (date: string) => read<CalendarData>(`bookings?date=${encodeURIComponent(date)}`);
export const getMyBookings = () => read<{ items: MyBooking[] }>('me/bookings');
export const cancelAdminBooking = (id: string) =>
  apiFetch<{ message: string }>(`bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' });

// Missing / handoff contracts documented in frontend/API_HANDOFF_TO_CODEX.md
export const createAdminBooking = (payload: CreateAdminBookingPayload) =>
  apiFetch<{ id: string; message: string }>('bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateAdminBooking = (id: string, payload: UpdateAdminBookingPayload) =>
  apiFetch<{ id: string; message: string }>(`bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const searchAdminBookings = (params: { q?: string; date?: string; status?: string }) => {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.date) qs.set('date', params.date);
  if (params.status) qs.set('status', params.status);
  return apiFetch<{ items: CalendarItem[] }>(`bookings/search?${qs.toString()}`);
};

export const createMyBooking = (payload: CreateCustomerBookingPayload) =>
  apiFetch<{ id: string; status: string; message: string }>('me/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const rescheduleMyBooking = (id: string, payload: { date: string; time: string }) =>
  apiFetch<{ id: string; message: string }>(`me/bookings/${encodeURIComponent(id)}/time`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const cancelMyBooking = (id: string) =>
  apiFetch<{ message: string }>(`me/bookings/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });

export const reviewMyBooking = (id: string, payload: { rating: number; comment: string }) =>
  apiFetch<{ id: string; message: string }>(`me/bookings/${encodeURIComponent(id)}/review`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const createSepayIntent = (bookingId: string) =>
  apiFetch<SepayPaymentIntent>('payments/sepay/intent', {
    method: 'POST',
    body: JSON.stringify({ bookingId }),
  });

export const getPaymentStatus = (paymentId: string) =>
  apiFetch<SepayPaymentIntent>(`payments/${encodeURIComponent(paymentId)}/status`);
