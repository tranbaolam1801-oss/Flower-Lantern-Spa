import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from './ui/button';
import { createSepayIntent, getPaymentStatus } from '../lib/booking-api';
import { formatVnd } from '../lib/api-client';

export function SepayPaymentDialog({
  bookingId,
  open,
  onClose,
  onPaid,
}: {
  bookingId: string;
  open: boolean;
  onClose: () => void;
  onPaid?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  const intentMutation = useMutation({
    mutationFn: () => createSepayIntent(bookingId),
  });

  const paymentId = intentMutation.data?.paymentId;

  const statusQuery = useQuery({
    queryKey: ['payment-status', paymentId],
    queryFn: () => getPaymentStatus(paymentId!),
    enabled: !!paymentId && open,
    refetchInterval: (q) => (q.state.data?.status && q.state.data.status !== 'Chờ thanh toán' ? false : 3000),
  });

  const current = statusQuery.data ?? intentMutation.data;
  const status = current?.status;
  const pending = status === 'Chờ thanh toán';

  // Display only: the server decides expiry; the next poll reports 'Hết hạn'.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!pending) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pending, paymentId]);
  const expiresMs = current?.expiresAt ? new Date(current.expiresAt).getTime() : NaN;
  const remaining = Number.isFinite(expiresMs) ? Math.max(0, Math.floor((expiresMs - now) / 1000)) : null;
  const countdown = remaining === null ? '' : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;

  const triggerIntent = intentMutation.mutate;

  useEffect(() => {
    if (open && bookingId) {
      dialog.current?.showModal();
      triggerIntent();
    } else {
      dialog.current?.close();
    }
  }, [open, bookingId, triggerIntent]);

  // Fire once per payment: parents pass an inline callback, so it must not be an effect dependency.
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;
  const notified = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (status === 'Đã thanh toán' && paymentId && notified.current !== paymentId) {
      notified.current = paymentId;
      onPaidRef.current?.();
    }
  }, [status, paymentId]);

  if (!open) return null;

  return (
    <dialog
      ref={dialog}
      className="spa-modal"
      aria-labelledby="sepay-title"
      onClose={onClose}
    >
      <div className="spa-modal-header">
        <h2 id="sepay-title">Thanh toán SePay QR (Test Mode)</h2>
        <button type="button" className="spa-modal-close" onClick={onClose} aria-label="Đóng">
          ×
        </button>
      </div>
      <div className="spa-modal-body">
        {intentMutation.isPending ? (
          <p role="status">Đang tạo mã thanh toán SePay…</p>
        ) : intentMutation.isError ? (
          <div role="alert" className="spa-alert-error">
            <p>{(intentMutation.error as { message?: string })?.message ?? 'Không thể khởi tạo thanh toán SePay.'}</p>
            <Button type="button" variant="outline" onClick={() => intentMutation.mutate()}>
              Thử lại
            </Button>
          </div>
        ) : current ? (
          <div className="sepay-panel">
            <div className={`sepay-qr-box ${pending ? '' : 'sepay-qr-inactive'}`}>
              {current.qrUrl ? (
                <img src={current.qrUrl} alt={`Mã QR thanh toán ${current.reference}`} />
              ) : (
                <div className="sepay-qr-placeholder">QR SePay</div>
              )}
            </div>
            <div className="sepay-info">
              <p><strong>Mã lịch hẹn:</strong> {current.bookingId}</p>
              <p><strong>Số tiền cần thanh toán:</strong> <span className="sepay-amount">{formatVnd(current.amount)}</span></p>
              <p><strong>Nội dung chuyển khoản:</strong> <code>{current.reference}</code></p>
              <p><strong>Ngân hàng:</strong> {current.bankName} · {current.accountNumber}</p>
              <p><strong>Chủ tài khoản:</strong> {current.accountHolder}</p>
              {pending && countdown ? (
                <p><strong>Hết hạn sau:</strong> <span className="sepay-countdown" aria-live="off">{countdown}</span></p>
              ) : null}
              <p>
                <strong>Trạng thái:</strong>{' '}
                <span className={`sepay-status ${status === 'Đã thanh toán' ? 'paid' : pending ? '' : 'ended'}`}>
                  {status}
                </span>
              </p>
              {pending ? (
                <p className="sepay-note">
                  Trạng thái chỉ chuyển sang Đã thanh toán sau khi Backend nhận webhook xác thực hợp lệ từ SePay.
                </p>
              ) : null}
              {pending && statusQuery.isError ? (
                <p role="alert" className="sepay-note">
                  {(statusQuery.error as { message?: string })?.message ?? 'Không thể cập nhật trạng thái thanh toán.'} Đang thử lại…
                </p>
              ) : null}
            </div>
            {status === 'Đã thanh toán' ? (
              <p role="status" className="sepay-result paid">Thanh toán thành công. Backend đã nhận xác nhận từ SePay.</p>
            ) : null}
            {status === 'Hết hạn' ? (
              <div role="alert" className="sepay-result ended">
                <p>Mã thanh toán đã hết hạn. Vui lòng không chuyển khoản vào mã này; tạo mã mới để tiếp tục.</p>
                <Button type="button" onClick={() => intentMutation.mutate()} disabled={intentMutation.isPending}>
                  Tạo mã mới
                </Button>
              </div>
            ) : null}
            {status === 'Đã hoàn tiền' ? (
              <p role="status" className="sepay-result ended">
                Giao dịch này đã được hoàn tiền{current.refundedAmount ? ` (${formatVnd(current.refundedAmount)})` : ''}.
              </p>
            ) : null}
            {status === 'Thất bại' ? (
              <div role="alert" className="sepay-result ended">
                <p>Giao dịch thất bại.</p>
                <Button type="button" onClick={() => intentMutation.mutate()} disabled={intentMutation.isPending}>
                  Tạo mã mới
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="spa-modal-footer">
        <Button type="button" variant="outline" onClick={onClose}>
          Đóng
        </Button>
      </div>
    </dialog>
  );
}
