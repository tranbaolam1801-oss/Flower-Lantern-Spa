import { API_BASE_URL } from '../lib/api-client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from './ui/button';
import type { CalendarItem } from '../lib/booking-api';

export function BookingCancel({
  item,
  onClose,
  onEdit,
  onPay,
}: {
  item: CalendarItem;
  onClose: () => void;
  onEdit?: () => void;
  onPay?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState('');
  const cache = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE_URL}/api/bookings/${encodeURIComponent(item.bookingId)}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Spa-Request': '1' },
      });
      if (response.status === 401) window.dispatchEvent(new Event('spa-session-expired'));
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          response.status === 409 ? body.message : 'Không thể hủy lịch hẹn. Vui lòng thử lại sau!',
        );
      }
    },
    onSuccess: async () => {
      dialog.current?.close();
      setMessage('Hủy lịch hẹn thành công!');
      await cache.invalidateQueries({ queryKey: ['bookings'] });
      await cache.invalidateQueries({ queryKey: ['my-bookings'] });
    },
  });

  const isLockedStatus = item.status === 'Hoàn thành' || item.status === 'Đã hủy';

  return (
    <section className="booking-detail" aria-label="Thông tin lịch hẹn">
      <button
        type="button"
        className="booking-detail-close"
        onClick={onClose}
        aria-label="Đóng thông tin lịch hẹn"
      >
        ×
      </button>
      <div className="booking-detail-head">
        <h2>{item.serviceName}</h2>
        <span className="booking-status" data-status={item.status}>{item.status}</span>
      </div>
      <p><strong>Mã lịch:</strong> {item.bookingId}</p>
      <p><strong>Thanh toán:</strong> {item.paymentStatus}</p>
      <p>Khách: {item.customerName}</p>
      <p>Gói: {item.packageName}</p>
      <p>Thời gian: {item.startsAt.slice(11, 16)} – {item.endsAt.slice(11, 16)}</p>
      <p>Giường {item.bedId}</p>

      <div className="booking-detail-actions">
        {onEdit && !isLockedStatus && (
          <Button type="button" size="sm" variant="outline" onClick={onEdit}>
            Cập nhật / Duyệt
          </Button>
        )}
        {onPay && item.status !== 'Đã hủy' && item.paymentStatus !== 'Đã thanh toán' && (
          <Button type="button" size="sm" variant="outline" onClick={onPay}>
            Thanh toán QR
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          className="cancel-booking-button"
          onClick={() => {
            mutation.reset();
            dialog.current?.showModal();
          }}
        >
          Hủy lịch hẹn
        </Button>
      </div>

      {message && <p role="status">{message}</p>}

      <dialog
        className="booking-confirm-dialog"
        ref={dialog}
        aria-labelledby="cancel-title"
        onCancel={(event) => {
          if (mutation.isPending) event.preventDefault();
        }}
      >
        <h2 id="cancel-title">Xác nhận</h2>
        <p>Bạn có chắc chắn muốn hủy lịch hẹn này?</p>
        {mutation.isError && <p role="alert">{mutation.error.message}</p>}
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => dialog.current?.close()}
          >
            Không
          </Button>
          <Button
            type="button"
            className="cancel-booking-button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Đang hủy…' : 'Xác nhận hủy'}
          </Button>
        </div>
      </dialog>
    </section>
  );
}
