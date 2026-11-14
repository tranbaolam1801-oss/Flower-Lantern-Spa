import { useEffect, useMemo, useRef, useState } from 'react';
import { DateField, TimeSlotGrid, slotState } from '../components/slot-picker';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CustomerHeader } from '../components/customer-header';
import { PublicFooter } from '../components/public-footer';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/auth-context';
import { getPublicServiceDetail, getPublicServices } from '../lib/catalog-api';
import { createMyBooking, type CreateCustomerBookingPayload } from '../lib/booking-api';
import { formatVnd } from '../lib/api-client';
import { isValidVnPhone } from '../lib/phone';

const PHONE_REGEX = { test: isValidVnPhone };
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type BookingFieldKey = 'fullName' | 'phone' | 'email' | 'service' | 'date' | 'time';

// Tạo danh sách khung giờ mở cửa 08:00 – 21:30 (mỗi 30 phút); kết thúc phải <= 22:00
function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

export function CustomerBookingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetServiceId = searchParams.get('serviceId') ?? '';

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState(presetServiceId);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [date, setDate] = useState(todayIso);
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [guestNames, setGuestNames] = useState<string[]>(['']);
  const [heroAlert, setHeroAlert] = useState<{ title: string; subtitle?: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Set<BookingFieldKey>>(new Set());
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [lastPayload, setLastPayload] = useState<CreateCustomerBookingPayload | null>(null);
  const saveErrorDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (user) {
      setFullName((prev) => prev || user.fullName);
      setPhone((prev) => prev || user.phone);
    }
  }, [user]);

  const servicesQuery = useQuery({
    queryKey: ['booking-public-services'],
    queryFn: () => getPublicServices({ page: 1, limit: 50 }),
  });

  const detailQuery = useQuery({
    queryKey: ['booking-service-detail', selectedServiceId],
    queryFn: () => getPublicServiceDetail(selectedServiceId),
    enabled: !!selectedServiceId,
  });

  const selectedService = servicesQuery.data?.items.find((s) => s.id === selectedServiceId);
  const selectedPackage = detailQuery.data?.packages.find((p) => p.id === selectedPackageId);

  const endTimeLabel = useMemo(() => {
    if (!selectedPackage || !time) return '';
    const [hh, mm] = time.split(':').map(Number);
    const endMinutes = hh * 60 + mm + selectedPackage.durationMinutes;
    const eh = Math.floor(endMinutes / 60);
    const em = endMinutes % 60;
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  }, [selectedPackage, time]);

  const exceedsClosingHour = useMemo(() => {
    if (!selectedPackage || !time) return false;
    const [hh, mm] = time.split(':').map(Number);
    return hh * 60 + mm + selectedPackage.durationMinutes > 22 * 60;
  }, [selectedPackage, time]);

  const mutation = useMutation({
    mutationFn: createMyBooking,
    onSuccess: (res) => {
      saveErrorDialog.current?.close();
      setCreatedId(res.id);
      setHeroAlert(null);
      setFieldErrors(new Set());
    },
    onError: () => {
      if (saveErrorDialog.current && !saveErrorDialog.current.open) {
        saveErrorDialog.current.showModal();
      }
    },
  });

  useEffect(() => {
    if (mutation.isError && saveErrorDialog.current && !saveErrorDialog.current.open) {
      saveErrorDialog.current.showModal();
    }
  }, [mutation.failureCount]);

  const handleRetrySave = () => {
    if (lastPayload) mutation.mutate(lastPayload);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setHeroAlert(null);
    setFieldErrors(new Set());

    if (!user) {
      navigate('/dang-nhap');
      return;
    }
    if (!fullName.trim()) {
      setFieldErrors(new Set(['fullName']));
      setHeroAlert({ title: 'Vui lòng nhập họ tên!' });
      return;
    }

    const phoneInvalid = !PHONE_REGEX.test(phone.trim());
    const emailInvalid = !!email.trim() && !EMAIL_REGEX.test(email.trim());
    if (phoneInvalid || emailInvalid) {
      const invalid: BookingFieldKey[] = [];
      if (phoneInvalid) invalid.push('phone');
      if (emailInvalid) invalid.push('email');
      setFieldErrors(new Set(invalid));
      setHeroAlert({
        title: 'Thông tin liên hệ không hợp lệ!',
        subtitle: 'Vui lòng kiểm tra lại số điện thoại và email.',
      });
      return;
    }

    if (!selectedServiceId || !selectedPackageId) {
      setFieldErrors(new Set(['service']));
      setHeroAlert({ title: 'Vui lòng chọn dịch vụ và gói dịch vụ!' });
      return;
    }

    if (!date || !time) {
      setFieldErrors(new Set(['date', 'time']));
      setHeroAlert({ title: 'Vui lòng chọn ngày và giờ hẹn!' });
      return;
    }

    // Asia/Ho_Chi_Minh wall clock (never the browser's zone): past slots and services ending after 22:00 are refused.
    if (slotState(date, time, selectedPackage?.durationMinutes ?? 0) !== 'ok' || exceedsClosingHour) {
      setFieldErrors(new Set(['date', 'time']));
      setHeroAlert({
        title: 'Thời gian đặt lịch không hợp lệ.',
        subtitle: 'Vui lòng chọn thời gian khác!',
      });
      return;
    }

    const guests = Array.from({ length: guestCount }, (_, idx) => ({
      customerName: (guestNames[idx]?.trim() || fullName.trim()),
      customerPhone: idx === 0 ? phone.trim() : undefined,
      packageId: selectedPackageId,
    }));

    const payload: CreateCustomerBookingPayload = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      date,
      time,
      notes: notes.trim() || undefined,
      guests,
    };
    setLastPayload(payload);
    mutation.mutate(payload);
  };

  return (
    <div className="customer-shell">
      <CustomerHeader />

      <section className="customer-hero-hoian">
        <img className="hero-hoian-banner" src="/assets/hero-hoian-bg.png" alt="" />
        <div className="hero-copy-box">
          <p>
            ĐẶT LỊCH <span className="hero-eyebrow-line" aria-hidden="true" />
          </p>
          <h1>Đặt lịch hẹn</h1>
          <span>
            Chọn dịch vụ và thời gian phù hợp để chúng tôi chăm sóc bạn thật chu đáo tại Flower Lantern Spa.
          </span>
        </div>
        {heroAlert && (
          <div className="booking-hero-alert" role="alert">
            <span className="booking-hero-alert-icon" aria-hidden="true">!</span>
            <div>
              <p className="booking-hero-alert-title">{heroAlert.title}</p>
              {heroAlert.subtitle && <p className="booking-hero-alert-subtitle">{heroAlert.subtitle}</p>}
            </div>
          </div>
        )}
        {createdId && (
          <div className="booking-hero-alert booking-hero-alert-success" role="status">
            <span className="booking-hero-alert-icon booking-hero-alert-icon-success" aria-hidden="true">✓</span>
            <p className="booking-hero-alert-title booking-hero-alert-title-success">Đặt lịch thành công!</p>
          </div>
        )}
      </section>

      <main className="booking-page-main">
        {!user && (
          <div className="booking-auth-banner" role="status">
            <span>Vui lòng đăng nhập tài khoản khách hàng để gửi yêu cầu đặt lịch và theo dõi trạng thái.</span>
            <Link to="/dang-nhap" className="home-text-link">Đăng nhập ngay ›</Link>
          </div>
        )}

        {createdId ? (
          <section className="booking-success-card" role="status">
            <span className="booking-success-icon" aria-hidden="true">✓</span>
            <h2>Đặt lịch thành công</h2>
            <p className="booking-success-subtitle">
              Yêu cầu của bạn đã được ghi nhận và đang chờ Spa xác nhận.
            </p>
            <dl className="booking-success-detail">
              <div><dt>Mã lịch hẹn</dt><dd>{createdId}</dd></div>
              <div><dt>Thời lượng</dt><dd>{selectedPackage ? `${selectedPackage.durationMinutes} phút` : '—'}</dd></div>
              <div><dt>Dịch vụ</dt><dd>{selectedService?.name ?? '—'}</dd></div>
              <div><dt>Giá dự kiến</dt><dd>{selectedPackage ? formatVnd(selectedPackage.price * guestCount) : '—'}</dd></div>
              <div><dt>Gói dịch vụ</dt><dd>{selectedPackage?.name ?? '—'}</dd></div>
              <div><dt>Trạng thái</dt><dd><span className="booking-status">Chờ xác nhận</span></dd></div>
              <div>
                <dt>Ngày giờ hẹn</dt>
                <dd>
                  {endTimeLabel ? `${time} – ${endTimeLabel}, ` : `${time}, `}
                  {date.split('-').reverse().join('/')}
                </dd>
              </div>
            </dl>
            <div className="booking-success-actions">
              <Button type="button" onClick={() => navigate('/lich-hen-cua-toi')}>
                Xem lịch hẹn của tôi
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreatedId(null)}>
                Đặt thêm lịch khác
              </Button>
            </div>
          </section>
        ) : (
          <div className="booking-two-col">
            <form className="booking-form-card" onSubmit={handleSubmit} noValidate>
              <h2><span className="step-circle">1</span> Thông tin khách hàng</h2>
              <div className="booking-form-grid-3">
                <label className={`spa-field${fieldErrors.has('fullName') ? ' spa-field-invalid' : ''}`}>
                  <span>Họ và tên <em>*</em></span>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nhập họ và tên"
                    aria-invalid={fieldErrors.has('fullName')}
                  />
                </label>
                <label className={`spa-field${fieldErrors.has('phone') ? ' spa-field-invalid' : ''}`}>
                  <span>Số điện thoại <em>*</em></span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0905 123 123"
                    aria-invalid={fieldErrors.has('phone')}
                  />
                </label>
                <label className={`spa-field${fieldErrors.has('email') ? ' spa-field-invalid' : ''}`}>
                  <span>Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Không bắt buộc"
                    aria-invalid={fieldErrors.has('email')}
                  />
                </label>
              </div>

              <h2><span className="step-circle">2</span> Dịch vụ</h2>
              <div className="booking-form-grid-2">
                <label className={`spa-field${fieldErrors.has('service') ? ' spa-field-invalid' : ''}`}>
                  <span>Dịch vụ <em>*</em></span>
                  <select
                    value={selectedServiceId}
                    aria-invalid={fieldErrors.has('service')}
                    onChange={(e) => {
                      setSelectedServiceId(e.target.value);
                      setSelectedPackageId('');
                    }}
                  >
                    <option value="">Chọn dịch vụ</option>
                    {(servicesQuery.data?.items ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>

                <label className={`spa-field${fieldErrors.has('service') ? ' spa-field-invalid' : ''}`}>
                  <span>Gói dịch vụ <em>*</em></span>
                  <select
                    value={selectedPackageId}
                    disabled={!selectedServiceId || detailQuery.isPending}
                    aria-invalid={fieldErrors.has('service')}
                    onChange={(e) => setSelectedPackageId(e.target.value)}
                  >
                    <option value="">Chọn gói dịch vụ</option>
                    {(detailQuery.data?.packages ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.durationMinutes} phút · {formatVnd(p.price)})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="booking-info-hint">
                <span aria-hidden="true">ⓘ</span>
                <span>
                  {selectedPackage
                    ? `Gói đã chọn: ${selectedPackage.durationMinutes} phút · Dự kiến ${formatVnd(selectedPackage.price * guestCount)}`
                    : 'Chọn dịch vụ và gói dịch vụ để xem thời lượng và giá dự kiến.'}
                </span>
              </div>

              <div className="booking-guest-row">
                <label className="spa-field">
                  <span>Số lượng khách</span>
                  <select
                    value={guestCount}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setGuestCount(n);
                      setGuestNames((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? ''));
                    }}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>{n} khách</option>
                    ))}
                  </select>
                </label>
                {guestCount > 1 && (
                  <div className="booking-extra-guests">
                    {Array.from({ length: guestCount }, (_, idx) => (
                      <label key={idx} className="spa-field">
                        <span>Tên khách {idx + 1}</span>
                        <input
                          value={guestNames[idx] ?? ''}
                          onChange={(e) => {
                            const next = [...guestNames];
                            next[idx] = e.target.value;
                            setGuestNames(next);
                          }}
                          placeholder={idx === 0 ? fullName || 'Người đặt' : `Khách đi cùng ${idx + 1}`}
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <h2><span className="step-circle">3</span> Thời gian &amp; ghi chú</h2>
              <div className="booking-form-grid-2">
                <div className={`spa-field${fieldErrors.has('date') ? ' spa-field-invalid' : ''}`}>
                  <span>Ngày hẹn <em>*</em></span>
                  <DateField value={date} onChange={(iso) => { setDate(iso); if (slotState(iso, time, selectedPackage?.durationMinutes ?? 0) !== 'ok') setTime(''); }} invalid={fieldErrors.has('date')} />
                </div>

                <div className={`spa-field${fieldErrors.has('time') ? ' spa-field-invalid' : ''}`}>
                  <span>Giờ hẹn (08:00 – 22:00) <em>*</em></span>
                  <div className="slot-panel">
                    <p>Chọn giờ bắt đầu</p>
                    <TimeSlotGrid date={date} value={time} onChange={setTime} durationMin={selectedPackage?.durationMinutes ?? 0} invalid={fieldErrors.has('time')} />
                    <small>Dịch vụ phải kết thúc trước 22:00. Khung giờ đã qua hoặc không đủ thời lượng sẽ bị khóa.</small>
                  </div>
                </div>
              </div>

              <label className="spa-field">
                <span>Ghi chú thêm</span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Yêu cầu riêng về tinh dầu, lực tay hoặc kỹ thuật viên..."
                />
              </label>

              <div className="booking-form-submit">
                <Button type="submit" size="sm" className="booking-submit-pill" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Đang gửi yêu cầu…' : 'Xác nhận đặt lịch'}
                </Button>
              </div>
            </form>

            <aside className="booking-summary-card" aria-label="Tóm tắt lịch hẹn">
              <h2>Tóm tắt lịch hẹn</h2>
              <dl>
                <div><dt>Khách hàng</dt><dd>{fullName || '—'}</dd></div>
                <div><dt>Số khách</dt><dd>{guestCount} khách</dd></div>
                <div><dt>Dịch vụ</dt><dd>{selectedService?.name ?? '—'}</dd></div>
                <div><dt>Gói dịch vụ</dt><dd>{selectedPackage?.name ?? '—'}</dd></div>
                <div><dt>Thời lượng</dt><dd>{selectedPackage ? `${selectedPackage.durationMinutes} phút` : '—'}</dd></div>
                <div><dt>Ngày hẹn</dt><dd>{date.split('-').reverse().join('/')}</dd></div>
                <div><dt>Giờ hẹn</dt><dd>{endTimeLabel ? `${time} – ${endTimeLabel}` : time}</dd></div>
                <div>
                  <dt>Giá dự kiến</dt>
                  <dd><strong>{selectedPackage ? formatVnd(selectedPackage.price * guestCount) : '—'}</strong></dd>
                </div>
                <div><dt>Trạng thái</dt><dd><span className="booking-status">Chờ xác nhận</span></dd></div>
              </dl>
            </aside>
          </div>
        )}
      </main>

      <PublicFooter compact />

      <dialog ref={saveErrorDialog} className="spa-modal" aria-labelledby="booking-save-error-title">
        <div className="spa-modal-body booking-save-error-body">
          <span className="booking-hero-alert-icon booking-save-error-icon" aria-hidden="true">!</span>
          <h2 id="booking-save-error-title">Đặt lịch chưa thành công</h2>
          <p>
            {(mutation.error as { message?: string } | null)?.message ?? 'Có lỗi khi đặt lịch hẹn. Vui lòng thử lại!'}
          </p>
        </div>
        <div className="spa-modal-footer">
          <Button type="button" variant="outline" onClick={() => saveErrorDialog.current?.close()}>
            Đóng
          </Button>
          <Button type="button" disabled={mutation.isPending} onClick={handleRetrySave}>
            {mutation.isPending ? 'Đang thử lại…' : 'Thử lại'}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
