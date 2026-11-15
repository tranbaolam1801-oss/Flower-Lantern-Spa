import { serviceFallbackImage } from '../lib/spa-images';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import {
  cancelMyBooking,
  getMyBookings,
  rescheduleMyBooking,
  reviewMyBooking,
  type MyBooking,
} from '../lib/booking-api';
import { CustomerHeader } from '../components/customer-header';
import { PublicFooter } from '../components/public-footer';
import { SepayPaymentDialog } from '../components/sepay-payment-dialog';
import { NoticeToast, errorNotice, successNotice, type NoticeState } from '../components/notice-toast';
import { DateField, TimeSlotGrid, slotState, toMinutes, fromMinutes } from '../components/slot-picker';

const RATING_LABELS = ['Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Tuyệt vời'];
const STAR_PATH = 'm12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z';
const StarOutline = ({ size = 16 }: { size?: number }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d={STAR_PATH} /></svg>;
const StarFilled = ({ size = 16 }: { size?: number }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" aria-hidden="true"><path d={STAR_PATH} /></svg>;
const filters = ['Tất cả', 'Chờ xác nhận', 'Đã xác nhận', 'Hoàn thành', 'Đã hủy'];
const day = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
const minutesBetween = (a: string, b: string) => {
  const [ah, am] = a.slice(0, 5).split(':').map(Number);
  const [bh, bm] = b.slice(0, 5).split(':').map(Number);
  return bh * 60 + bm - (ah * 60 + am);
};

export function CustomerDashboard() {
  const [filter, setFilter] = useState('Tất cả');
  const [rescheduleTarget, setRescheduleTarget] = useState<MyBooking | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MyBooking | null>(null);
  const [reviewTarget, setReviewTarget] = useState<MyBooking | null>(null);
  const [payBookingId, setPayBookingId] = useState<string | null>(null);

  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [rescheduleFieldError, setRescheduleFieldError] = useState('');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reviewFieldError, setReviewFieldError] = useState('');
  const [toast, setToast] = useState<NoticeState | null>(null);
  const setToastMsg = (message: string) => setToast(successNotice(message));
  // UC_5.5 Figma toasts: white card with a coloured left bar (success / error / info).
  const [barToast, setBarToast] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  useEffect(() => {
    if (!barToast) return;
    const t = setTimeout(() => setBarToast(null), 3000);
    return () => clearTimeout(t);
  }, [barToast]);
  const [reviewState, setReviewState] = useState<{ kind: 'notcompleted' | 'exists' | 'failed'; title: string; message: string } | null>(null);
  const reviewStateDialog = useRef<HTMLDialogElement>(null);

  const rescheduleDialog = useRef<HTMLDialogElement>(null);
  const cancelDialog = useRef<HTMLDialogElement>(null);
  const reviewDialog = useRef<HTMLDialogElement>(null);

  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['my-bookings'], queryFn: getMyBookings });
  const items = query.data?.items ?? [];
  const visible = items.filter((b) => filter === 'Tất cả' || b.status === filter);
  const rescheduleTotalDuration = rescheduleTarget
    ? rescheduleTarget.services.reduce((sum, s) => sum + minutesBetween(s.startsAt, s.endsAt), 0)
    : 0;

  const rescheduleMutation = useMutation({
    mutationFn: () => rescheduleMyBooking(rescheduleTarget!.id, { date: newDate, time: newTime }),
    onSuccess: async () => {
      rescheduleDialog.current?.close();
      setRescheduleTarget(null);
      setToastMsg('Đổi lịch hẹn thành công!');
      await cache.invalidateQueries({ queryKey: ['my-bookings'] });
    },
    onError: (err: unknown) => {
      const e = err as { status?: number; message?: string } | undefined;
      const status = e?.status;
      // Figma UC_5.3 5b/5c/6a: the system toast sits top-right and the dialog stays open with the chosen date/time kept.
      if (typeof status !== 'number' || status >= 500) setToast(errorNotice('Không thể đổi lịch hẹn. Vui lòng thử lại!'));
      else if (status === 409) setToast(errorNotice(e?.message && /giường|khung giờ/i.test(e.message) ? e.message : 'Khung giờ này không còn chỗ trống. Vui lòng chọn thời gian khác!'));
      else setToast(errorNotice('Thời gian đặt lịch không hợp lệ. Vui lòng chọn thời gian khác!'));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelMyBooking(cancelTarget!.id),
    onSuccess: async () => {
      cancelDialog.current?.close();
      setCancelTarget(null);
      setToastMsg('Hủy lịch hẹn thành công!');
      await cache.invalidateQueries({ queryKey: ['my-bookings'] });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: () => reviewMyBooking(reviewTarget!.id, { rating, comment }),
    onSuccess: async () => {
      reviewDialog.current?.close();
      setReviewTarget(null);
      setComment('');
      setBarToast({ kind: 'success', text: 'Gửi đánh giá thành công!' });
      await cache.invalidateQueries({ queryKey: ['my-bookings'] });
    },
    onError: (err: unknown) => {
      const e = err as { status?: number; message?: string } | undefined;
      const msg = e?.message ?? '';
      if (e?.status === 409 && /đã được đánh giá/i.test(msg)) setReviewState({ kind: 'exists', title: 'Bạn đã đánh giá rồi', message: 'Bạn đã đánh giá lịch hẹn này!' });
      else if (e?.status === 409) setReviewState({ kind: 'notcompleted', title: 'Chưa thể đánh giá', message: 'Lịch hẹn chưa đủ điều kiện đánh giá!' });
      else setReviewState({ kind: 'failed', title: 'Gửi đánh giá chưa thành công', message: 'Không thể gửi đánh giá. Vui lòng thử lại!' });
      reviewStateDialog.current?.showModal();
    },
  });

  const submitReview = () => {
    if (reviewMutation.isPending) return;
    if (rating === 0) {
      setReviewFieldError('Vui lòng chọn số sao đánh giá!');
      setBarToast({ kind: 'error', text: 'Vui lòng chọn số sao đánh giá!' });
      return;
    }
    setReviewFieldError('');
    reviewMutation.mutate();
  };
  const cancelReview = () => {
    reviewDialog.current?.close();
    setBarToast({ kind: 'info', text: 'Đã hủy thao tác. Không lưu đánh giá.' });
  };

  const openReschedule = (b: MyBooking) => {
    setRescheduleTarget(b);
    setNewDate(b.date.slice(0, 10));
    setNewTime(b.time.slice(0, 5));
    setRescheduleFieldError('');
    rescheduleMutation.reset();
    rescheduleDialog.current?.showModal();
  };

  const openCancel = (b: MyBooking) => {
    setCancelTarget(b);
    cancelMutation.reset();
    cancelDialog.current?.showModal();
  };

  const openReview = (b: MyBooking) => {
    setReviewTarget(b);
    setRating(0);
    setComment('');
    setReviewFieldError('');
    reviewMutation.reset();
    reviewDialog.current?.showModal();
  };

  return (
    <div className="customer-shell">
      <CustomerHeader />
      <section className="customer-hero-hoian">
        <img className="hero-hoian-banner" src="/assets/hero-hoian-bg.png" alt="" />
        <div className="hero-copy-box">
          <p>
            TÀI KHOẢN <span className="hero-eyebrow-line" aria-hidden="true" />
          </p>
          <h1>Lịch hẹn của tôi</h1>
          <span>
            Theo dõi dịch vụ, thời gian và trạng thái các lịch hẹn bạn đã đặt tại Flower Lantern Spa.
          </span>
        </div>
      </section>
      <main className="customer-bookings">
        {toast && <NoticeToast notice={toast} onClose={() => setToast(null)} />}
        {barToast && (
          <div role={barToast.kind === 'error' ? 'alert' : 'status'} className={`bar-toast bar-toast-${barToast.kind}`} data-testid={`review-toast-${barToast.kind}`}>
            <span className="bar-toast-icon" aria-hidden="true">
              {barToast.kind === 'success'
                ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 12.5 4 4 8-9" /></svg>
                : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.1" /></svg>}
            </span>
            <p>{barToast.text}</p>
          </div>
        )}
        {!(query.isSuccess && items.length === 0) && <>
        <div className="booking-filters" role="group" aria-label="Lọc trạng thái lịch hẹn">
          {filters.map((label) => {
            const count =
              label === 'Tất cả' ? items.length : items.filter((b) => b.status === label).length;
            return (
              <button
                key={label}
                aria-pressed={filter === label}
                onClick={() => setFilter(label)}
              >
                {label}
                {count > 0 && <span>{count}</span>}
              </button>
            );
          })}
        </div>
        <div className="booking-list-heading">
          <h2>Danh sách lịch hẹn</h2>
          {query.isSuccess && <p>{visible.length} lịch hẹn | Sắp xếp: Mới đặt nhất</p>}
        </div>
        </>}
        {query.isPending ? (
          <p role="status">Đang tải danh sách lịch hẹn…</p>
        ) : query.isError ? (
          <div className="booking-state-card booking-state-card-error" role="alert">
            <span className="booking-state-icon booking-state-icon-error" aria-hidden="true">!</span>
            <h2>Không thể tải danh sách lịch hẹn.</h2>
            <p className="booking-state-error-text">Vui lòng thử lại!</p>
            <Button onClick={() => void query.refetch()}>↻ Thử lại</Button>
          </div>
        ) : items.length === 0 ? (
          <div className="booking-empty-card" data-testid="my-bookings-empty">
            <span className="booking-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
            </span>
            <h2>Bạn chưa có lịch hẹn nào!</h2>
            <p>Hãy đặt lịch để trải nghiệm dịch vụ tại Flower Lantern Spa.</p>
            <Link to="/dat-lich" className="booking-empty-cta">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>
              Đặt lịch ngay
            </Link>
          </div>
        ) : (
          <div className="booking-table-scroll">
            <table className="booking-table">
              <thead>
                <tr>
                  {[
                    'Mã lịch hẹn',
                    'Dịch vụ / Gói dịch vụ',
                    'Ngày hẹn',
                    'Giờ hẹn',
                    'Ngày đặt',
                    'Trạng thái',
                    'Thanh toán',
                    'Thao tác',
                    'Đánh giá',
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => {
                  const canEdit = b.status === 'Chờ xác nhận' || b.status === 'Đã xác nhận';
                  const canReview = b.status === 'Hoàn thành' && !b.hasReview;
                  const canPay =
                    b.status !== 'Đã hủy' && b.paymentStatus !== 'Đã thanh toán';
                  return (
                    <tr key={b.id}>
                      <td><strong>{b.id}</strong></td>
                      <td>
                        {b.services.map((s) => (
                          <div key={s.id}>
                            <strong>{s.name}</strong>
                            <small>{s.packageName}</small>
                          </div>
                        ))}
                      </td>
                      <td>{day(b.date)}</td>
                      <td>
                        {b.services.map((s) => (
                          <div key={s.id}>
                            {s.startsAt} – {s.endsAt}
                          </div>
                        ))}
                      </td>
                      <td>{day(b.createdAt)}</td>
                      <td>
                        <span className="booking-status" data-status={b.status}>
                          {b.status}
                        </span>
                      </td>
                      <td>
                        <span className="payment-chip">{b.paymentStatus}</span>
                      </td>
                      <td>
                        <div className="table-action-row">
                          {/* Shown on every row; dimmed and inert when the booking can no longer be changed or cancelled. */}
                          <Button type="button" size="sm" variant="outline" className="pill-action-btn" disabled={!canEdit} onClick={() => openReschedule(b)}>
                            Đổi lịch
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="pill-action-btn danger-outline-btn"
                            disabled={!canEdit}
                            onClick={() => openCancel(b)}
                          >
                            Hủy lịch
                          </Button>
                          {/* Hidden to match Figma UC_5 (function kept: SepayPaymentDialog and openers stay in place). */}
                          {canPay && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              hidden
                              aria-hidden="true"
                              tabIndex={-1}
                              className="pill-action-btn"
                              onClick={() => setPayBookingId(b.id)}
                            >
                              Thanh toán QR
                            </Button>
                          )}
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`review-pill${canReview ? ' is-active' : ''}`}
                          disabled={!canReview}
                          aria-label={`Đánh giá lịch hẹn ${b.id}`}
                          onClick={() => openReview(b)}
                        >
                          <StarOutline size={16} />
                          Đánh giá
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visible.length === 0 && (
              <p className="booking-empty">Không có lịch hẹn ở trạng thái này.</p>
            )}
          </div>
        )}
      </main>

      {/* UC_5.3 Đổi lịch hẹn — Figma 1:19366 / 1:18547 / 5a-5d */}
      <dialog ref={rescheduleDialog} className="resch-dialog" aria-labelledby="reschedule-title">
        <div className="resch-head">
          <div>
            <h2 id="reschedule-title">Đổi lịch hẹn</h2>
            <p>Chọn ngày và giờ mới cho lịch hẹn của bạn.</p>
          </div>
          <button type="button" className="resch-close" aria-label="Đóng" onClick={() => rescheduleDialog.current?.close()}>×</button>
        </div>
        {rescheduleTarget && (
          <div className="resch-body">
            <div className="resch-current">
              <img className="resch-thumb" src={serviceFallbackImage(rescheduleTarget.services[0]?.name ?? '')} alt="" />
              <div className="resch-current-main">
                <strong>{rescheduleTarget.services[0]?.name ?? 'Dịch vụ'}</strong>
                <span>{rescheduleTarget.services[0]?.packageName ? `${rescheduleTarget.services[0].packageName} · ` : ''}Mã lịch hẹn {rescheduleTarget.id}</span>
              </div>
              <div className="resch-current-date">
                <span>Lịch hiện tại</span>
                <strong>{day(rescheduleTarget.date)} · {rescheduleTarget.time.slice(0, 5)}</strong>
              </div>
            </div>
            <div className="resch-pickers">
              <div className="resch-col">
                <span className="resch-label">Ngày hẹn mới</span>
                <DateField alwaysOpen value={newDate} currentDate={rescheduleTarget.date.slice(0, 10)} invalid={Boolean(rescheduleFieldError)}
                  onChange={(iso) => { setNewDate(iso); setRescheduleFieldError(''); if (slotState(iso, newTime, rescheduleTotalDuration) !== 'ok') setNewTime(''); }} />
              </div>
              <div className="resch-col">
                <span className="resch-label">Giờ hẹn mới (08:00 – 22:00)</span>
                <TimeSlotGrid date={newDate} value={newTime} durationMin={rescheduleTotalDuration} invalid={Boolean(rescheduleFieldError)} label="Giờ hẹn mới"
                  onChange={(slot) => { setNewTime(slot); setRescheduleFieldError(''); }} />
                {rescheduleTotalDuration > 0 && newTime && (
                  <div className="resch-info"><span aria-hidden="true">ⓘ</span> Dịch vụ {rescheduleTotalDuration} phút · dự kiến kết thúc lúc {fromMinutes(toMinutes(newTime) + rescheduleTotalDuration)}</div>
                )}
              </div>
            </div>
            <div className="resch-legend">
              <span className="resch-hint"><span className="resch-dot" /> Lịch hiện tại</span>
              <span className="resch-note">Chỉ đổi ngày và giờ hẹn; dịch vụ, gói dịch vụ và thông tin khác giữ nguyên.</span>
            </div>
            {rescheduleFieldError && <p role="alert" className="resch-error" data-testid="resch-error">⚠ {rescheduleFieldError}</p>}
          </div>
        )}
        <div className="resch-foot">
          <button type="button" className="resch-cancel" onClick={() => rescheduleDialog.current?.close()}>Hủy</button>
          <button type="button" className="resch-confirm" disabled={rescheduleMutation.isPending} onClick={() => {
            if (!rescheduleTarget || rescheduleMutation.isPending) return;
            if (!newDate || !newTime) return setRescheduleFieldError('Vui lòng chọn ngày và giờ hẹn mới!');
            if (newDate === rescheduleTarget.date.slice(0, 10) && newTime === rescheduleTarget.time.slice(0, 5)) return setRescheduleFieldError('Bạn chưa thay đổi thời gian lịch hẹn!');
            const state = slotState(newDate, newTime, rescheduleTotalDuration);
            if (state === 'past') return setRescheduleFieldError('Không thể đặt lịch vào thời gian trong quá khứ!');
            if (state === 'late') return setRescheduleFieldError('Thời gian đặt lịch không hợp lệ. Dịch vụ phải kết thúc trước 22:00!');
            setRescheduleFieldError('');
            rescheduleMutation.mutate();
          }}>
            {rescheduleMutation.isPending ? 'Đang lưu…' : '✓ Xác nhận đổi lịch'}
          </button>
        </div>
      </dialog>

      {/* UC_5.4 Hủy lịch cá nhân */}
      <dialog ref={cancelDialog} className="booking-confirm-dialog booking-cancel-confirm-dialog" aria-labelledby="my-cancel-title">
        <span className="booking-state-icon booking-state-icon-error booking-cancel-confirm-icon" aria-hidden="true">!</span>
        <h2 id="my-cancel-title">Xác nhận hủy lịch</h2>
        <p>Bạn có chắc muốn hủy lịch hẹn này?</p>
        {cancelTarget && (
          <div className="booking-current-info-card">
            <div>
              <strong>{cancelTarget.services[0]?.name ?? 'Dịch vụ'}</strong>
              <span>{day(cancelTarget.date)} · {cancelTarget.time.slice(0, 5)} · Mã {cancelTarget.id}</span>
            </div>
          </div>
        )}
        {cancelMutation.isError && (
          <p role="alert">{(cancelMutation.error as { message?: string })?.message ?? 'Lịch hẹn này không thể hủy!'}</p>
        )}
        <div>
          <Button type="button" variant="outline" onClick={() => cancelDialog.current?.close()}>
            Hủy
          </Button>
          <Button
            type="button"
            className="booking-cancel-confirm-ok"
            disabled={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
          >
            {cancelMutation.isPending ? 'Đang hủy…' : 'Xác nhận'}
          </Button>
        </div>
      </dialog>

      {/* UC_5.5 Đánh giá dịch vụ — Figma 02 / 02b / 03 / 04 / 5a-5c / 6a */}
      <dialog ref={reviewDialog} className="rvw-dialog" aria-labelledby="review-title" onCancel={(e) => { if (reviewMutation.isPending) e.preventDefault(); }}>
        <div className="rvw-head">
          <div>
            <h2 id="review-title">Đánh giá dịch vụ</h2>
            <p>Chia sẻ trải nghiệm của bạn để Flower Lantern Spa phục vụ tốt hơn.</p>
          </div>
          <button type="button" className="resch-close" aria-label="Đóng" disabled={reviewMutation.isPending} onClick={cancelReview}>×</button>
        </div>
        {reviewTarget && (
          <div className="rvw-body">
            <div className="rvw-service">
              <img src={serviceFallbackImage(reviewTarget.services[0]?.name ?? '')} alt="" />
              <div>
                <strong>{reviewTarget.services[0]?.name ?? 'Dịch vụ'}</strong>
                <span>{reviewTarget.services[0]?.packageName}</span>
                <b>{day(reviewTarget.date)} · {reviewTarget.services[0]?.startsAt} – {reviewTarget.services[0]?.endsAt}</b>
              </div>
              <span className="rvw-code">{reviewTarget.id}</span>
            </div>
            <div className="rvw-field">
              <span className="rvw-label">Mức đánh giá <em>*</em></span>
              <div className={`rvw-stars${reviewFieldError ? ' is-invalid' : ''}`}>
                <div role="radiogroup" aria-label="Số sao đánh giá">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} type="button" role="radio" aria-checked={rating === star} aria-label={`${star} sao`}
                      className={star <= rating ? 'rvw-star on' : 'rvw-star'}
                      onClick={() => { setRating(star); setReviewFieldError(''); }}>
                      {star <= rating ? <StarFilled size={34} /> : <StarOutline size={34} />}
                    </button>
                  ))}
                </div>
                <span className={rating ? 'rvw-star-label has-value' : 'rvw-star-label'}>{rating ? RATING_LABELS[rating - 1] : 'Chạm vào sao để chọn'}</span>
              </div>
            </div>
            <label className="rvw-field">
              <span className="rvw-label">Nội dung bình luận</span>
              <textarea rows={4} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Hãy chia sẻ cảm nhận của bạn về dịch vụ..." />
            </label>
          </div>
        )}
        <div className="rvw-foot">
          <button type="button" className="resch-cancel rvw-cancel" disabled={reviewMutation.isPending} onClick={cancelReview}>Hủy</button>
          <button type="button" className="resch-confirm rvw-submit" disabled={reviewMutation.isPending} onClick={submitReview}>
            {reviewMutation.isPending ? <><span className="rvw-spinner" aria-hidden="true" />Đang gửi đánh giá…</> : '✓ Gửi đánh giá'}
          </button>
        </div>
      </dialog>

      {/* UC_5.5 5b / 5c / 6a: state dialogs */}
      <dialog ref={reviewStateDialog} className="rvw-state-dialog" aria-labelledby="rvw-state-title">
        <span className="rvw-state-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.4v.1" /></svg>
        </span>
        <h2 id="rvw-state-title">{reviewState?.title}</h2>
        <p>{reviewState?.message}</p>
        <div>
          <button type="button" className={reviewState?.kind === 'failed' ? 'rvw-state-outline' : 'rvw-state-primary'} onClick={() => {
            reviewStateDialog.current?.close();
            if (reviewState?.kind !== 'failed') { reviewDialog.current?.close(); void cache.invalidateQueries({ queryKey: ['my-bookings'] }); }
          }}>Đóng</button>
          {reviewState?.kind === 'failed' && (
            <button type="button" className="rvw-state-primary" onClick={() => { reviewStateDialog.current?.close(); submitReview(); }}>Thử lại</button>
          )}
        </div>
      </dialog>

      <SepayPaymentDialog
        bookingId={payBookingId ?? ''}
        open={!!payBookingId}
        onClose={() => setPayBookingId(null)}
        onPaid={() => void cache.invalidateQueries({ queryKey: ['my-bookings'] })}
      />

      <PublicFooter compact />
    </div>
  );
}
