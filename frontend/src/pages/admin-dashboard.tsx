import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/auth-context';
import { ManagementLayout } from '../components/management-layout';
import { Button } from '../components/ui/button';
import {
  createAdminBooking,
  getCalendar,
  searchAdminBookings,
  updateAdminBooking,
  type CalendarItem,
  type SearchBookingsParams,
} from '../lib/booking-api';
import { getPublicServiceDetail, getPublicServices } from '../lib/catalog-api';
import { BookingCancel } from '../components/booking-cancel';
import { SepayPaymentDialog } from '../components/sepay-payment-dialog';
import { formatVnd } from '../lib/api-client';
import { isValidVnPhone } from '../lib/phone';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const formatCalendarDateLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'long' }).format(d);
  const capWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const dmy = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  return `${capWeekday}, ${dmy}`;
};
// Mirrors backend/src/bookings/booking-rules.ts STATUS_TRANSITIONS: the server is authoritative, the UI only offers allowed next states.
const STATUS_TRANSITIONS: Record<string, string[]> = {
  'Chờ xác nhận': ['Đã xác nhận', 'Chưa đến', 'Đã hủy'],
  'Đã xác nhận': ['Chưa đến', 'Đã đến', 'Đã hủy'],
  'Chưa đến': ['Đã xác nhận', 'Đã đến', 'Đã hủy'],
  'Đã đến': ['Hoàn thành', 'Đã hủy'],
  'Hoàn thành': [],
  'Đã hủy': [],
};
const STATUS_LABELS: Record<string, string> = { 'Đã xác nhận': '✓ Đã xác nhận (Duyệt lịch)' };
const SEARCH_STATUSES = ['Chờ xác nhận', 'Đã xác nhận', 'Chưa đến', 'Đã đến', 'Hoàn thành', 'Đã hủy'];
const SEARCH_LABELS: Record<string, string> = {
  name: 'Tên', phone: 'SĐT', email: 'Email', code: 'Mã lịch', service: 'Dịch vụ', status: 'Trạng thái', source: 'Nguồn', dateFrom: 'Từ ngày', dateTo: 'Đến ngày',
};
const SEARCH_SOURCES = ['Trực tiếp', 'Facebook', 'Zalo', 'Website', 'Khác'];
const EMPTY_SEARCH = { name: '', phone: '', email: '', code: '', service: '', status: '', source: '', dateFrom: '', dateTo: '' };
// Server messages (backend/src/bookings/booking-rules.ts MESSAGES), matched exactly to place them at the bed/time or service field.
const BED_CONFLICT_MESSAGE = 'Giường đã có lịch tại khung giờ này. Vui lòng chọn giường hoặc thời gian khác!';
const PAST_MESSAGE = 'Không thể đặt lịch vào thời gian trong quá khứ!';
const HOURS_MESSAGE = 'Giờ kết thúc dịch vụ phải nằm trong khung giờ 08:00 – 22:00!';
const DATE_MESSAGE = 'Ngày hẹn không hợp lệ!';
const PACKAGE_MESSAGE = 'Vui lòng chọn dịch vụ và gói dịch vụ!';
const DEFAULT_BEDS =Array.from({ length: 15 }, (_, i) => `G${i + 1}`);
const TIME_SLOTS = Array.from({ length: 28 }, (_, i) => {
  const m = 8 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});

export function AdminDashboard() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [date, setDate] = useState(today);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [payBookingId, setPayBookingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  // UC_2.1 Tạo lịch hẹn
  const createDialog = useRef<HTMLDialogElement>(null);
  const [bookerName, setBookerName] = useState('');
  const [bookerPhone, setBookerPhone] = useState('');
  const [bookerEmail, setBookerEmail] = useState('');
  const [sourceChannel, setSourceChannel] = useState('Trực tiếp');
  const [bookingNotes, setBookingNotes] = useState('');
  const [guestSameAsBooker, setGuestSameAsBooker] = useState(true);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [bedId, setBedId] = useState('G1');
  const [startTime, setStartTime] = useState('09:00');
  const [serviceId, setServiceId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [extraGuests, setExtraGuests] = useState<Array<{ name: string; phone: string; bedId: string; startTime: string }>>([]);
  const [initialStatus, setInitialStatus] = useState<'Chưa đến' | 'Chờ xác nhận'>('Chưa đến');
  const [paymentStatus, setPaymentStatus] = useState<'Chưa thanh toán' | 'Thanh toán một phần' | 'Đã thanh toán'>('Chưa thanh toán');
  const [prepaidAmount, setPrepaidAmount] = useState('0');
  const [createError, setCreateError] = useState('');
  const [createFieldError, setCreateFieldError] = useState<{ field: string; message: string } | null>(null);

  // UC_2.3 Cập nhật / Duyệt lịch hẹn
  const editDialog = useRef<HTMLDialogElement>(null);
  const [editTarget, setEditTarget] = useState<CalendarItem | null>(null);
  const [editStatus, setEditStatus] = useState('Đã xác nhận');
  const [editPaymentStatus, setEditPaymentStatus] = useState('Chưa thanh toán');
  const [editNotes, setEditNotes] = useState('');
  const [editBookerName, setEditBookerName] = useState('');
  const [editBookerPhone, setEditBookerPhone] = useState('');
  const [editBookerEmail, setEditBookerEmail] = useState('');
  const [editFieldError, setEditFieldError] = useState<{ field: string; message: string } | null>(null);
  const [editDate, setEditDate] = useState(today);
  const [editBedId, setEditBedId] = useState('G1');
  const [editStartTime, setEditStartTime] = useState('09:00');
  // null = service not touched by the user: resolved from the item's serviceName once the service list is loaded.
  const [editServiceId, setEditServiceId] = useState<string | null>(null);
  const [editPackageId, setEditPackageId] = useState('');

  // UC_2.4 Tìm lịch hẹn
  const searchDialog = useRef<HTMLDialogElement>(null);
  const [searchForm, setSearchForm] = useState(EMPTY_SEARCH);
  const [searchApplied, setSearchApplied] = useState(EMPTY_SEARCH);
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [searchFieldError, setSearchFieldError] = useState('');

  const allowed = user?.role === 'Chủ Spa' || user?.permissions.includes('Q01');
  const query = useQuery({ queryKey: ['bookings', date], queryFn: () => getCalendar(date), enabled: !!allowed });
  const servicesQuery = useQuery({ queryKey: ['admin-booking-services'], queryFn: () => getPublicServices({ limit: 50 }), enabled: !!allowed });
  const detailQuery = useQuery({ queryKey: ['admin-booking-service', serviceId], queryFn: () => getPublicServiceDetail(serviceId), enabled: !!serviceId });
  const effectiveEditServiceId =
    editServiceId ?? (servicesQuery.data?.items ?? []).find((s) => s.name === editTarget?.serviceName)?.id ?? '';
  const editDetailQuery = useQuery({
    queryKey: ['admin-booking-service', effectiveEditServiceId],
    queryFn: () => getPublicServiceDetail(effectiveEditServiceId),
    enabled: !!effectiveEditServiceId && !!editTarget,
  });

  // UC_2.3: bed/time/service/package are editable only while the booking is still editable server-side
  // (CUSTOMER_EDITABLE_STATUSES) and every guest row has the data needed to resend a complete guests[].
  const editBookingItems = editTarget ? (query.data?.items ?? []).filter((i) => i.bookingId === editTarget.bookingId) : [];
  const editGuestsEditable =
    !!editTarget &&
    ['Chờ xác nhận', 'Đã xác nhận', 'Chưa đến'].includes(editTarget.status) &&
    editBookingItems.some((i) => i.id === editTarget.id) &&
    editBookingItems.every((i) => i.bedId && i.packageId);
  const editInitial = editTarget
    ? { date: editTarget.startsAt.slice(0, 10), bed: editTarget.bedId ?? '', time: editTarget.startsAt.slice(11, 16), pkg: editTarget.packageId ?? '' }
    : null;
  const editGuestsDirty =
    editGuestsEditable &&
    !!editInitial &&
    (editDate !== editInitial.date || editBedId !== editInitial.bed || editStartTime !== editInitial.time || editPackageId !== editInitial.pkg);

  const searchQuery = useQuery({
    queryKey: ['bookings-search', searchApplied],
    queryFn: () => searchAdminBookings(searchApplied as SearchBookingsParams),
    enabled: searchTriggered && !!allowed,
  });

  const createMutation = useMutation({
    mutationFn: createAdminBooking,
    onSuccess: async (res) => {
      createDialog.current?.close();
      setNotice([`Tạo lịch hẹn ${res.id} thành công!`, ...(res.warnings ?? [])].join(' '));
      await cache.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: (err: { message?: string; fields?: Record<string, string> }) => {
      const [field, message] = Object.entries(err?.fields ?? {})[0] ?? [];
      if (field && message && ['bookerName', 'bookerPhone', 'bookerEmail'].includes(field)) {
        return setCreateFieldError({ field, message });
      }
      setCreateError(err?.message ?? 'Không thể lưu lịch hẹn. Vui lòng thử lại sau!');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateAdminBooking(editTarget!.bookingId, {
        status: editStatus,
        ...(editPaymentStatus !== editTarget!.paymentStatus ? { paymentStatus: editPaymentStatus } : {}),
        // '' clears the notes on the server; undefined would keep them.
        notes: editNotes.trim(),
        bookerName: editBookerName.trim(),
        bookerPhone: editBookerPhone.trim(),
        bookerEmail: editBookerEmail.trim(),
        // Only when the user changed bed/time/service/package/date: the server then replaces ALL guest rows, so send every guest.
        ...(editGuestsDirty
          ? {
              date: editDate,
              guests: editBookingItems.map((i) => {
                const mine = i.id === editTarget!.id;
                return {
                  customerName: i.customerName,
                  customerPhone: i.customerPhone || undefined,
                  bedId: mine ? editBedId : i.bedId!,
                  packageId: mine ? editPackageId : i.packageId!,
                  startsAt: `${editDate}T${mine ? `${editStartTime}:00` : i.startsAt.slice(11, 19)}`,
                };
              }),
            }
          : {}),
      }),
    onSuccess: async () => {
      editDialog.current?.close();
      setEditTarget(null);
      setSelected(null);
      setNotice('Cập nhật lịch hẹn thành công!');
      await cache.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: (err: { message?: string; fields?: Record<string, string> }) => {
      const [field, message] = Object.entries(err?.fields ?? {})[0] ?? [];
      if (field && message && ['bookerName', 'bookerPhone', 'bookerEmail'].includes(field)) {
        return setEditFieldError({ field, message });
      }
      // Server rule messages (booking-rules.ts MESSAGES) shown next to the field they concern (Figma E5b).
      const text = err?.message ?? '';
      if (text === BED_CONFLICT_MESSAGE || text === PAST_MESSAGE || text === HOURS_MESSAGE || text === DATE_MESSAGE) {
        setEditFieldError({ field: 'bedTime', message: text });
      } else if (text === PACKAGE_MESSAGE) {
        setEditFieldError({ field: 'servicePackage', message: text });
      }
    },
  });

  const submitEdit = () => {
    setEditFieldError(null);
    if (!editBookerName.trim()) return setEditFieldError({ field: 'bookerName', message: 'Vui lòng nhập họ tên người đặt!' });
    if (!isValidVnPhone(editBookerPhone)) return setEditFieldError({ field: 'bookerPhone', message: 'Số điện thoại không hợp lệ!' });
    if (editBookerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editBookerEmail.trim())) {
      return setEditFieldError({ field: 'bookerEmail', message: 'Email không hợp lệ!' });
    }
    if (editGuestsDirty && editTarget) {
      if (!editPackageId) {
        return setEditFieldError({ field: 'servicePackage', message: PACKAGE_MESSAGE });
      }
      if (new Date(`${editDate}T${editStartTime}:00`).getTime() < Date.now()) {
        return setEditFieldError({ field: 'bedTime', message: PAST_MESSAGE });
      }
      const pkg = editDetailQuery.data?.packages.find((p) => p.id === editPackageId);
      const duration = pkg?.durationMinutes ?? (editPackageId === editInitial?.pkg ? editTarget.endMinute - editTarget.startMinute : undefined);
      if (duration !== undefined) {
        const [hh, mm] = editStartTime.split(':').map(Number);
        const start = hh * 60 + mm;
        const end = start + duration;
        if (end > 22 * 60) return setEditFieldError({ field: 'bedTime', message: HOURS_MESSAGE });
        // The loaded calendar only covers `date`; for another date the server (locking) decides.
        if (editDate === date) {
          const clash = (query.data?.items ?? []).some(
            (item) =>
              item.id !== editTarget.id &&
              item.bedId === editBedId &&
              item.status !== 'Đã hủy' &&
              start < item.endMinute &&
              end > item.startMinute,
          );
          if (clash) return setEditFieldError({ field: 'bedTime', message: BED_CONFLICT_MESSAGE });
        }
      }
    }
    updateMutation.mutate();
  };

  const openCreateModal = (presetBed = 'G1', presetHour = '09:00') => {
    setCreateError('');
    setCreateFieldError(null);
    setBedId(presetBed);
    setStartTime(presetHour);
    setBookerName('');
    setBookerPhone('');
    setBookerEmail('');
    setGuestName('');
    setGuestPhone('');
    setGuestSameAsBooker(true);
    setExtraGuests([]);
    setInitialStatus('Chưa đến');
    setPaymentStatus('Chưa thanh toán');
    setPrepaidAmount('0');
    createDialog.current?.showModal();
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateFieldError(null);
    const effectiveGuestName = (guestSameAsBooker ? bookerName : guestName).trim();
    if (!bookerName.trim()) {
      return setCreateFieldError({ field: 'bookerName', message: 'Vui lòng nhập họ tên người đặt!' });
    }
    if (!isValidVnPhone(bookerPhone)) {
      return setCreateFieldError({ field: 'bookerPhone', message: 'Số điện thoại không hợp lệ!' });
    }
    if (bookerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bookerEmail.trim())) {
      return setCreateFieldError({ field: 'bookerEmail', message: 'Email không hợp lệ!' });
    }
    if (!effectiveGuestName) {
      return setCreateFieldError({ field: 'guestName', message: 'Vui lòng nhập thông tin khách sử dụng dịch vụ!' });
    }
    const effectiveGuestPhone = (guestSameAsBooker ? bookerPhone : guestPhone).trim();
    if (!guestSameAsBooker && effectiveGuestPhone && !isValidVnPhone(effectiveGuestPhone)) {
      return setCreateFieldError({ field: 'guestPhone', message: 'Số điện thoại khách không hợp lệ!' });
    }
    if (!serviceId || !packageId) {
      return setCreateFieldError({ field: 'servicePackage', message: 'Vui lòng chọn dịch vụ và gói dịch vụ!' });
    }

    const selectedPkg = detailQuery.data?.packages.find((p) => p.id === packageId);
    const bedTimeEntries = [
      { bedId, startTime },
      ...extraGuests.filter((g) => g.name.trim()).map((g) => ({ bedId: g.bedId, startTime: g.startTime })),
    ];

    for (const entry of bedTimeEntries) {
      const startDateTime = new Date(`${date}T${entry.startTime}:00`);
      if (startDateTime.getTime() < Date.now()) {
        return setCreateFieldError({ field: 'bedTime', message: 'Không thể đặt lịch vào thời gian trong quá khứ!' });
      }
    }

    if (selectedPkg) {
      for (const entry of bedTimeEntries) {
        const [hh, mm] = entry.startTime.split(':').map(Number);
        const entryStartMinute = hh * 60 + mm;
        const entryEndMinute = entryStartMinute + selectedPkg.durationMinutes;
        if (entryEndMinute > 22 * 60) {
          return setCreateFieldError({
            field: 'bedTime',
            message: 'Giờ kết thúc dịch vụ phải nằm trong khung giờ 08:00 – 22:00!',
          });
        }
        const hasConflict = (query.data?.items ?? []).some(
          (item) =>
            item.bedId === entry.bedId &&
            item.status !== 'Đã hủy' &&
            entryStartMinute < item.endMinute &&
            entryEndMinute > item.startMinute,
        );
        if (hasConflict) {
          return setCreateFieldError({
            field: 'bedTime',
            message: 'Giường đã có lịch tại khung giờ này. Vui lòng chọn giường hoặc thời gian khác!',
          });
        }
      }
    }

    const guestsPayload = [
      {
        customerName: effectiveGuestName,
        customerPhone: (guestSameAsBooker ? bookerPhone : guestPhone).trim() || undefined,
        bedId,
        packageId,
        startsAt: `${date}T${startTime}:00`,
      },
      ...extraGuests
        .filter((g) => g.name.trim())
        .map((g) => ({
          customerName: g.name.trim(),
          customerPhone: g.phone.trim() || undefined,
          bedId: g.bedId,
          packageId,
          startsAt: `${date}T${g.startTime}:00`,
        })),
    ];

    createMutation.mutate({
      bookerName: bookerName.trim(),
      bookerPhone: bookerPhone.trim(),
      bookerEmail: bookerEmail.trim() || undefined,
      source: sourceChannel,
      date,
      notes: bookingNotes.trim() || undefined,
      status: initialStatus,
      paymentStatus,
      prepaidAmount: Number(prepaidAmount) || 0,
      guests: guestsPayload,
    });
  };

  const openEditModal = (item: CalendarItem) => {
    setEditTarget(item);
    setEditStatus(item.status === 'Chờ xác nhận' ? 'Đã xác nhận' : item.status);
    setEditPaymentStatus(item.paymentStatus);
    setEditNotes(item.notes ?? '');
    setEditBookerName(item.bookerName ?? item.customerName);
    setEditBookerPhone(item.bookerPhone ?? item.customerPhone ?? '');
    setEditBookerEmail(item.bookerEmail ?? '');
    setEditDate(item.startsAt.slice(0, 10));
    setEditBedId(item.bedId ?? 'G1');
    setEditStartTime(item.startsAt.slice(11, 16));
    setEditServiceId(null);
    setEditPackageId(item.packageId ?? '');
    setEditFieldError(null);
    updateMutation.reset();
    editDialog.current?.showModal();
  };

  return (
    <ManagementLayout active="Q01">
      {selected && (
        <BookingCancel
          key={selected.id}
          item={query.data?.items.find((item) => item.id === selected.id) ?? selected}
          onClose={() => setSelected(null)}
          onEdit={() => openEditModal(selected)}
          onPay={() => setPayBookingId(selected.bookingId)}
        />
      )}

      {notice && (
        <p role="status" className="spa-toast-success calendar-toast-success">
          {notice}
        </p>
      )}

      <div className="calendar-toolbar calendar-toolbar-extended">
        <label className="calendar-date-picker">
          <img src="/assets/admin-calendar-inactive.svg" alt="" />
          <span>{formatCalendarDateLabel(date)}</span>
          <img className="calendar-date-chevron" src="/assets/admin-imgChevronDown.svg" alt="" />
          <input
            aria-label="Ngày xem lịch"
            type="date"
            value={date}
            onChange={(event) => {
              if (event.target.value) setDate(event.target.value);
            }}
          />
        </label>
        <Button type="button" size="sm" variant="outline" onClick={() => setDate(today())}>
          Hôm nay
        </Button>
        <div className="calendar-toolbar-right">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSearchTriggered(false);
              searchDialog.current?.showModal();
            }}
          >
            Tìm lịch hẹn
          </Button>
          <Button type="button" size="sm" onClick={() => openCreateModal()}>
            + Tạo lịch hẹn
          </Button>
        </div>
      </div>

      <div className="calendar-legend">
        <h1>Lịch theo giường</h1>
        {['Chờ xác nhận', 'Đã xác nhận', 'Chưa đến', 'Hoàn thành', 'Đã hủy'].map((s, i) => (
          <span key={s}>
            <i className={`status-dot status-${i}`} />
            {s}
          </span>
        ))}
      </div>

      {!allowed ? (
        <p role="alert">Bạn không có quyền xem lịch hẹn.</p>
      ) : query.isPending ? (
        <p role="status">Đang tải danh sách lịch hẹn…</p>
      ) : query.isError ? (
        <div role="alert" className="calendar-load-error">
          <p>Không thể tải danh sách lịch hẹn. Vui lòng thử lại!</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : (
        <div className="bed-calendar" aria-label="Lịch theo giường">
          <div className="calendar-grid" style={{ width: 84 + query.data.beds.length * 75 }}>
            <div className="calendar-grid-header">
              <span>Giờ</span>
              {query.data.beds.map((b) => (
                <span key={b.id}>{b.id}</span>
              ))}
            </div>
            <div
              className="calendar-hours"
              ref={(element) => {
                if (element && element.dataset.positioned !== 'yes') {
                  element.scrollTop = 8 * 56;
                  element.dataset.positioned = 'yes';
                }
              }}
            >
              <div className="calendar-day" style={{ height: 24 * 56 }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <div className="hour-row" key={h} style={{ top: h * 56 }}>
                    <span>{`${h}`.padStart(2, '0')}:00</span>
                    {query.data.beds.map((b) => (
                      <div
                        key={b.id}
                        role="button"
                        tabIndex={-1}
                        title={`Tạo lịch giường ${b.id} lúc ${String(h).padStart(2, '0')}:00`}
                        onClick={() => {
                          if (h >= 8 && h < 22) {
                            openCreateModal(b.id, `${String(h).padStart(2, '0')}:00`);
                          }
                        }}
                      />
                    ))}
                  </div>
                ))}
                {query.data.items
                  .filter((item) => item.bedId)
                  .map((item) => {
                    const index = query.data.beds.findIndex((b) => b.id === item.bedId);
                    if (index < 0) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        key={item.id}
                        className="calendar-appointment"
                        data-status={item.status}
                        style={{
                          left: 87 + index * 75,
                          top: (Math.max(0, item.startMinute) * 56) / 60 + 2,
                          height: Math.max(
                            22,
                            ((Math.min(1440, item.endMinute) - Math.max(0, item.startMinute)) * 56) / 60 - 4,
                          ),
                        }}
                        title={`${item.bookingId}: ${item.startsAt} – ${item.endsAt} · ${item.status}`}
                      >
                        <strong>{item.serviceName}</strong>
                        <span>{item.customerName}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal UC_2.1 Tạo lịch hẹn */}
      <dialog ref={createDialog} className="spa-modal spa-modal-lg booking-create-modal" aria-labelledby="create-booking-title">
        <div className="spa-modal-header">
          <h2 id="create-booking-title">Tạo lịch hẹn</h2>
          <button type="button" className="spa-modal-close" onClick={() => createDialog.current?.close()}>×</button>
        </div>
        <form onSubmit={handleCreateSubmit} noValidate>
          <div className="spa-modal-body">
            <h3 className="spa-section-subtitle">Thông tin người đặt</h3>
            <div className="booking-form-grid-3">
              <label className={`spa-field${createFieldError?.field === 'bookerName' ? ' spa-field-invalid' : ''}`}>
                <span>Họ tên <em>*</em></span>
                <input
                  value={bookerName}
                  onChange={(e) => setBookerName(e.target.value)}
                  placeholder="Nguyễn Thị Lan"
                  aria-invalid={createFieldError?.field === 'bookerName'}
                />
                {createFieldError?.field === 'bookerName' && (
                  <p role="alert" className="spa-field-error-text">{createFieldError.message}</p>
                )}
              </label>
              <label className={`spa-field${createFieldError?.field === 'bookerPhone' ? ' spa-field-invalid' : ''}`}>
                <span>Số điện thoại <em>*</em></span>
                <input
                  value={bookerPhone}
                  onChange={(e) => setBookerPhone(e.target.value)}
                  placeholder="0905123456"
                  aria-invalid={createFieldError?.field === 'bookerPhone'}
                />
                {createFieldError?.field === 'bookerPhone' && (
                  <p role="alert" className="spa-field-error-text">{createFieldError.message}</p>
                )}
              </label>
              <label className={`spa-field${createFieldError?.field === 'bookerEmail' ? ' spa-field-invalid' : ''}`}>
                <span>Email</span>
                <input
                  value={bookerEmail}
                  onChange={(e) => setBookerEmail(e.target.value)}
                  placeholder="khach@example.com"
                  aria-invalid={createFieldError?.field === 'bookerEmail'}
                />
                {createFieldError?.field === 'bookerEmail' && (
                  <p role="alert" className="spa-field-error-text">{createFieldError.message}</p>
                )}
              </label>
            </div>
            <div className="booking-form-grid-3">
              <label className="spa-field">
                <span>Nguồn đặt lịch</span>
                <select value={sourceChannel} onChange={(e) => setSourceChannel(e.target.value)}>
                  <option value="Trực tiếp">Trực tiếp</option>
                  <option value="Facebook">Facebook</option>
                  <option value="Zalo">Zalo</option>
                  <option value="Website">Website</option>
                </select>
              </label>
              <label className="spa-field">
                <span>Ngày hẹn <em>*</em></span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className="spa-field">
                <span>Ghi chú</span>
                <input value={bookingNotes} onChange={(e) => setBookingNotes(e.target.value)} placeholder="Khách quen..." />
              </label>
            </div>

            <h3 className="spa-section-subtitle">Khách sử dụng dịch vụ</h3>
            <div className="booking-guest-box">
              <div className="booking-form-grid-3 booking-guest-person-fields">
                <label className={`spa-field${createFieldError?.field === 'guestName' ? ' spa-field-invalid' : ''}`}>
                  <span>Tên khách <em>*</em></span>
                  <input
                    value={guestSameAsBooker ? bookerName : guestName}
                    readOnly={guestSameAsBooker}
                    onChange={(e) => setGuestName(e.target.value)}
                    aria-invalid={createFieldError?.field === 'guestName'}
                  />
                  {createFieldError?.field === 'guestName' && (
                    <p role="alert" className="spa-field-error-text">{createFieldError.message}</p>
                  )}
                </label>
                <label className={`spa-field${createFieldError?.field === 'guestPhone' ? ' spa-field-invalid' : ''}`}>
                  <span>Số điện thoại khách</span>
                  <input
                    value={guestSameAsBooker ? bookerPhone : guestPhone}
                    readOnly={guestSameAsBooker}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    aria-invalid={createFieldError?.field === 'guestPhone'}
                  />
                  {createFieldError?.field === 'guestPhone' && (
                    <p role="alert" className="spa-field-error-text">{createFieldError.message}</p>
                  )}
                </label>
                <label className="spa-checkbox-row">
                  <input
                    type="checkbox"
                    checked={guestSameAsBooker}
                    onChange={(e) => setGuestSameAsBooker(e.target.checked)}
                  />
                  <span>= người đặt</span>
                </label>
              </div>
              <div className="booking-form-grid-4">
                <label className={`spa-field booking-bed-time-field${createFieldError?.field === 'bedTime' ? ' spa-field-invalid' : ''}`}>
                  <span>Giường / khung giờ <em>*</em></span>
                  <div className="booking-bed-time-group">
                    <select value={bedId} onChange={(e) => setBedId(e.target.value)} aria-label="Giường (mặc định G1–G15)">
                      {DEFAULT_BEDS.map((b) => (
                        <option key={b} value={b}>Giường {b}</option>
                      ))}
                    </select>
                    <select value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="Giờ bắt đầu (08:00–22:00)">
                      {TIME_SLOTS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  {createFieldError?.field === 'bedTime' && (
                    <p role="alert" className="spa-field-error-text">{createFieldError.message}</p>
                  )}
                </label>
                <label className={`spa-field${createFieldError?.field === 'servicePackage' ? ' spa-field-invalid' : ''}`}>
                  <span>Dịch vụ <em>*</em></span>
                  <select
                    value={serviceId}
                    onChange={(e) => {
                      setServiceId(e.target.value);
                      setPackageId('');
                    }}
                  >
                    <option value="">Chọn dịch vụ</option>
                    {(servicesQuery.data?.items ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className={`spa-field${createFieldError?.field === 'servicePackage' ? ' spa-field-invalid' : ''}`}>
                  <span>Gói dịch vụ <em>*</em></span>
                  <select value={packageId} disabled={!serviceId} onChange={(e) => setPackageId(e.target.value)}>
                    <option value="">Chọn gói dịch vụ</option>
                    {(detailQuery.data?.packages ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.durationMinutes} phút · {formatVnd(p.price)}
                      </option>
                    ))}
                  </select>
                  {createFieldError?.field === 'servicePackage' && (
                    <p role="alert" className="spa-field-error-text">{createFieldError.message}</p>
                  )}
                </label>
              </div>

              {extraGuests.map((eg, idx) => (
                <div key={idx} className="booking-extra-guest-row">
                  <div className="booking-form-grid-3">
                    <label className="spa-field">
                      <span>Tên khách {idx + 2}</span>
                      <input
                        value={eg.name}
                        onChange={(e) =>
                          setExtraGuests((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, name: e.target.value } : row)),
                          )
                        }
                      />
                    </label>
                    <label className="spa-field">
                      <span>Giường</span>
                      <select
                        value={eg.bedId}
                        onChange={(e) =>
                          setExtraGuests((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, bedId: e.target.value } : row)),
                          )
                        }
                      >
                        {DEFAULT_BEDS.map((b) => (
                          <option key={b} value={b}>Giường {b}</option>
                        ))}
                      </select>
                    </label>
                    <label className="spa-field">
                      <span>Giờ bắt đầu</span>
                      <select
                        value={eg.startTime}
                        onChange={(e) =>
                          setExtraGuests((prev) =>
                            prev.map((row, i) => (i === idx ? { ...row, startTime: e.target.value } : row)),
                          )
                        }
                      >
                        {TIME_SLOTS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ))}

              <div>
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    setExtraGuests((prev) => [
                      ...prev,
                      { name: '', phone: '', bedId: `G${Math.min(15, prev.length + 2)}`, startTime },
                    ])
                  }
                >
                  + Thêm khách
                </button>
              </div>
            </div>

            <h3 className="spa-section-subtitle">Trạng thái &amp; thanh toán</h3>
            <div className="booking-form-grid-3">
              <label className="spa-field">
                <span>Trạng thái lịch hẹn</span>
                <select
                  value={initialStatus}
                  onChange={(e) => setInitialStatus(e.target.value as 'Chưa đến' | 'Chờ xác nhận')}
                >
                  <option value="Chưa đến">Chưa đến</option>
                  <option value="Chờ xác nhận">Chờ xác nhận</option>
                </select>
              </label>
              <label className="spa-field">
                <span>Thanh toán trả trước (VNĐ)</span>
                <input type="number" min={0} value={prepaidAmount} onChange={(e) => setPrepaidAmount(e.target.value)} />
              </label>
              <label className="spa-field">
                <span>Trạng thái thanh toán</span>
                <select
                  value={paymentStatus}
                  onChange={(e) =>
                    setPaymentStatus(e.target.value as 'Chưa thanh toán' | 'Thanh toán một phần' | 'Đã thanh toán')
                  }
                >
                  <option value="Chưa thanh toán">Chưa thanh toán</option>
                  <option value="Thanh toán một phần">Thanh toán một phần</option>
                  <option value="Đã thanh toán">Đã thanh toán</option>
                </select>
              </label>
            </div>

            {createError && <p role="alert" className="spa-form-error">⚠ {createError}</p>}
          </div>
          <div className="spa-modal-footer">
            <Button type="button" variant="outline" onClick={() => createDialog.current?.close()}>
              Hủy
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Đang lưu…' : 'Lưu lịch hẹn'}
            </Button>
          </div>
        </form>
      </dialog>

      {/* Modal UC_2.3 Cập nhật / Duyệt lịch hẹn */}
      <dialog ref={editDialog} className="spa-modal spa-modal-lg booking-create-modal" aria-labelledby="edit-booking-title">
        <div className="spa-modal-header">
          <h2 id="edit-booking-title">Cập nhật lịch hẹn</h2>
          <button type="button" className="spa-modal-close" onClick={() => editDialog.current?.close()}>×</button>
        </div>
        {editTarget && (
          <div className="spa-modal-body">
            {editTarget.status === 'Hoàn thành' && (
              <p role="alert" className="spa-form-error">
                ⚠ Lịch hẹn đã hoàn thành, không thể chỉnh sửa.
              </p>
            )}
            <h3 className="spa-section-subtitle">Thông tin người đặt</h3>
            {editFieldError && ['bookerName', 'bookerPhone', 'bookerEmail'].includes(editFieldError.field) && (
              <p role="alert" className="spa-field-error-text">Thông tin không hợp lệ. Vui lòng kiểm tra lại!</p>
            )}
            <div className="booking-form-grid-3">
              <label className={`spa-field${editFieldError?.field === 'bookerName' ? ' spa-field-invalid' : ''}`}>
                <span>Họ tên <em>*</em></span>
                <input
                  value={editBookerName}
                  onChange={(e) => setEditBookerName(e.target.value)}
                  disabled={editTarget.status === 'Hoàn thành' || editTarget.status === 'Đã hủy'}
                  aria-invalid={editFieldError?.field === 'bookerName'}
                />
                {editFieldError?.field === 'bookerName' && <p role="alert" className="spa-field-error-text">{editFieldError.message}</p>}
              </label>
              <label className={`spa-field${editFieldError?.field === 'bookerPhone' ? ' spa-field-invalid' : ''}`}>
                <span>Số điện thoại <em>*</em></span>
                <input
                  value={editBookerPhone}
                  onChange={(e) => setEditBookerPhone(e.target.value)}
                  disabled={editTarget.status === 'Hoàn thành' || editTarget.status === 'Đã hủy'}
                  aria-invalid={editFieldError?.field === 'bookerPhone'}
                />
                {editFieldError?.field === 'bookerPhone' && <p role="alert" className="spa-field-error-text">{editFieldError.message}</p>}
              </label>
              <label className={`spa-field${editFieldError?.field === 'bookerEmail' ? ' spa-field-invalid' : ''}`}>
                <span>Email</span>
                <input
                  value={editBookerEmail}
                  onChange={(e) => setEditBookerEmail(e.target.value)}
                  disabled={editTarget.status === 'Hoàn thành' || editTarget.status === 'Đã hủy'}
                  aria-invalid={editFieldError?.field === 'bookerEmail'}
                />
                {editFieldError?.field === 'bookerEmail' && <p role="alert" className="spa-field-error-text">{editFieldError.message}</p>}
              </label>
              <label className="spa-field">
                <span>Mã lịch</span>
                <input value={editTarget.bookingId} readOnly />
              </label>
              <label className="spa-field">
                <span>Ngày hẹn <em>*</em></span>
                <input type="date" value={editDate} disabled={!editGuestsEditable} onChange={(e) => e.target.value && setEditDate(e.target.value)} />
              </label>
            </div>

            <h3 className="spa-section-subtitle">Khách sử dụng dịch vụ</h3>
            <div className="booking-guest-box">
              {editBookingItems.length > 1 && (
                <p className="spa-field-error-text" style={{ color: 'inherit' }}>
                  Lịch hẹn có {editBookingItems.length} khách; chỉ khách “{editTarget.customerName}” được chỉnh ở đây, các khách còn lại giữ nguyên.
                </p>
              )}
              <div className="booking-form-grid-4">
                <label className={`spa-field booking-bed-time-field${editFieldError?.field === 'bedTime' ? ' spa-field-invalid' : ''}`}>
                  <span>Giường / khung giờ <em>*</em></span>
                  <div className="booking-bed-time-group">
                    <select
                      value={editBedId}
                      disabled={!editGuestsEditable}
                      onChange={(e) => setEditBedId(e.target.value)}
                      aria-label="Giường (mặc định G1–G15)"
                      aria-invalid={editFieldError?.field === 'bedTime'}
                    >
                      {(DEFAULT_BEDS.includes(editBedId) ? DEFAULT_BEDS : [editBedId, ...DEFAULT_BEDS]).map((b) => (
                        <option key={b} value={b}>Giường {b}</option>
                      ))}
                    </select>
                    <select
                      value={editStartTime}
                      disabled={!editGuestsEditable}
                      onChange={(e) => setEditStartTime(e.target.value)}
                      aria-label="Giờ bắt đầu (08:00–22:00)"
                      aria-invalid={editFieldError?.field === 'bedTime'}
                    >
                      {(TIME_SLOTS.includes(editStartTime) ? TIME_SLOTS : [editStartTime, ...TIME_SLOTS]).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  {editFieldError?.field === 'bedTime' && <p role="alert" className="spa-field-error-text">{editFieldError.message}</p>}
                </label>
                <label className={`spa-field${editFieldError?.field === 'servicePackage' ? ' spa-field-invalid' : ''}`}>
                  <span>Dịch vụ <em>*</em></span>
                  <select
                    value={effectiveEditServiceId}
                    disabled={!editGuestsEditable}
                    onChange={(e) => {
                      setEditServiceId(e.target.value);
                      setEditPackageId('');
                    }}
                  >
                    <option value="">{effectiveEditServiceId === '' && editPackageId === editInitial?.pkg ? editTarget.serviceName : 'Chọn dịch vụ'}</option>
                    {(servicesQuery.data?.items ?? []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className={`spa-field${editFieldError?.field === 'servicePackage' ? ' spa-field-invalid' : ''}`}>
                  <span>Gói dịch vụ <em>*</em></span>
                  <select
                    value={editPackageId}
                    disabled={!editGuestsEditable || (!effectiveEditServiceId && editPackageId !== editInitial?.pkg)}
                    onChange={(e) => setEditPackageId(e.target.value)}
                  >
                    <option value="">Chọn gói dịch vụ</option>
                    {editPackageId !== '' && !(editDetailQuery.data?.packages ?? []).some((p) => p.id === editPackageId) && (
                      <option value={editPackageId}>{editTarget.packageName}</option>
                    )}
                    {(editDetailQuery.data?.packages ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.durationMinutes} phút · {formatVnd(p.price)}
                      </option>
                    ))}
                  </select>
                  {editFieldError?.field === 'servicePackage' && <p role="alert" className="spa-field-error-text">{editFieldError.message}</p>}
                </label>
              </div>
            </div>

            <h3 className="spa-section-subtitle">Trạng thái &amp; thanh toán</h3>
            <div className="booking-form-grid-2">
              <label className="spa-field">
                <span>Trạng thái lịch hẹn</span>
                <select
                  value={editStatus}
                  disabled={editTarget.status === 'Hoàn thành' || editTarget.status === 'Đã hủy'}
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  {[editTarget.status, ...(STATUS_TRANSITIONS[editTarget.status] ?? [])].map((st) => (
                    <option key={st} value={st}>{STATUS_LABELS[st] ?? st}</option>
                  ))}
                </select>
              </label>
              <label className="spa-field">
                <span>Trạng thái thanh toán</span>
                <select
                  value={editPaymentStatus}
                  disabled={editTarget.status === 'Hoàn thành' || editTarget.status === 'Đã hủy'}
                  onChange={(e) => setEditPaymentStatus(e.target.value)}
                >
                  <option value="Chưa thanh toán">Chưa thanh toán</option>
                  <option value="Thanh toán một phần">Thanh toán một phần</option>
                  <option value="Đã thanh toán">Đã thanh toán</option>
                </select>
              </label>
            </div>
            <label className="spa-field">
              <span>Ghi chú cập nhật</span>
              <textarea
                rows={2}
                value={editNotes}
                disabled={editTarget.status === 'Hoàn thành' || editTarget.status === 'Đã hủy'}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </label>
            {updateMutation.isError && !editFieldError && (
              <p role="alert" className="spa-form-error">
                ⚠ {(updateMutation.error as { message?: string })?.message ?? 'Có lỗi khi lưu dữ liệu. Vui lòng thử lại!'}
              </p>
            )}
          </div>
        )}
        <div className="spa-modal-footer">
          <Button type="button" variant="outline" onClick={() => editDialog.current?.close()}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={updateMutation.isPending || editTarget?.status === 'Hoàn thành' || editTarget?.status === 'Đã hủy'}
            onClick={submitEdit}
          >
            {updateMutation.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
          </Button>
        </div>
      </dialog>

      {/* Modal UC_2.4 Tìm lịch hẹn */}
      <dialog ref={searchDialog} className="spa-modal spa-modal-lg" aria-labelledby="search-booking-title">
        <div className="spa-modal-header">
          <h2 id="search-booking-title">Tìm kiếm lịch hẹn</h2>
          <button type="button" className="spa-modal-close" onClick={() => searchDialog.current?.close()}>×</button>
        </div>
        <div className="spa-modal-body">
          <div className="booking-form-grid-3">
            <label className="spa-field">
              <span>Tên khách/người đặt</span>
              <input value={searchForm.name} onChange={(e) => setSearchForm({ ...searchForm, name: e.target.value })} placeholder="" />
            </label>
            <label className="spa-field">
              <span>Số điện thoại</span>
              <input value={searchForm.phone} onChange={(e) => setSearchForm({ ...searchForm, phone: e.target.value })} placeholder="" />
            </label>
            <label className="spa-field">
              <span>Email</span>
              <input value={searchForm.email} onChange={(e) => setSearchForm({ ...searchForm, email: e.target.value })} placeholder="" />
            </label>
            <label className="spa-field">
              <span>Mã lịch hẹn</span>
              <input value={searchForm.code} onChange={(e) => setSearchForm({ ...searchForm, code: e.target.value })} placeholder="" />
            </label>
            <label className="spa-field">
              <span>Dịch vụ/gói</span>
              <input value={searchForm.service} onChange={(e) => setSearchForm({ ...searchForm, service: e.target.value })} placeholder="" />
            </label>
            <label className="spa-field">
              <span>Trạng thái</span>
              <select value={searchForm.status} onChange={(e) => setSearchForm({ ...searchForm, status: e.target.value })}>
                <option value="">Tất cả trạng thái</option>
                {SEARCH_STATUSES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="spa-field">
              <span>Nguồn</span>
              <select value={searchForm.source} onChange={(e) => setSearchForm({ ...searchForm, source: e.target.value })}>
                <option value="">Tất cả nguồn</option>
                {SEARCH_SOURCES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="spa-field">
              <span>Từ ngày</span>
              <input type="date" value={searchForm.dateFrom} onChange={(e) => setSearchForm({ ...searchForm, dateFrom: e.target.value })} />
            </label>
            <label className="spa-field">
              <span>Đến ngày</span>
              <input type="date" value={searchForm.dateTo} onChange={(e) => setSearchForm({ ...searchForm, dateTo: e.target.value })} />
            </label>
          </div>
          <div className="booking-search-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchForm(EMPTY_SEARCH);
                setSearchApplied(EMPTY_SEARCH);
                setSearchTriggered(false);
                setSearchFieldError('');
              }}
            >
              Đặt lại
            </Button>
            <Button
              type="button"
              onClick={() => {
                const trimmed = Object.fromEntries(Object.entries(searchForm).map(([k, v]) => [k, v.trim()])) as typeof EMPTY_SEARCH;
                if (!Object.values(trimmed).some(Boolean)) {
                  setSearchFieldError('Vui lòng nhập điều kiện tìm kiếm!');
                  return;
                }
                if (trimmed.dateFrom && trimmed.dateTo && trimmed.dateFrom > trimmed.dateTo) {
                  setSearchFieldError('Ngày bắt đầu không được sau ngày kết thúc!');
                  return;
                }
                setSearchFieldError('');
                setSearchApplied(trimmed);
                setSearchTriggered(true);
              }}
            >
              Tìm kiếm
            </Button>
          </div>

          {searchFieldError && (
            <p role="alert" className="spa-form-error">⚠ {searchFieldError}</p>
          )}

          {searchQuery.isPending && searchTriggered ? (
            <p role="status">Đang tìm kiếm…</p>
          ) : searchQuery.isError ? (
            <p role="alert" className="spa-form-error">
              ⚠ {(searchQuery.error as { message?: string })?.message ?? 'Không thể tìm kiếm lịch hẹn. Vui lòng thử lại sau!'}
            </p>
          ) : searchQuery.data ? (
            searchQuery.data.items.length === 0 ? (
              <p className="customer-search-empty">Không tìm thấy lịch hẹn phù hợp!</p>
            ) : (
              <div className="booking-search-results">
                <h3 className="spa-section-subtitle">Kết quả tìm kiếm</h3>
                <p className="booking-search-condition">
                  Điều kiện: {Object.entries(searchApplied).filter(([, v]) => v).map(([k, v]) => `${SEARCH_LABELS[k]}: ${v}`).join(' · ')}
                </p>
                {(searchQuery.data.warnings ?? []).map((w) => <p key={w} role="status" className="booking-search-condition">ⓘ {w}</p>)}
                <div className="customer-search-scroll">
                <table className="customer-search-table">
                  <thead>
                    <tr>
                      <th>Mã</th>
                      <th>Khách</th>
                      <th>SĐT</th>
                      <th>Dịch vụ</th>
                      <th>Giường</th>
                      <th>Thời gian</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchQuery.data.items.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.bookingId}</strong></td>
                        <td>{item.customerName}</td>
                        <td>{item.customerPhone ?? '—'}</td>
                        <td>{item.serviceName}</td>
                        <td>{item.bedId ?? '—'}</td>
                        <td>
                          {new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(
                            new Date(item.startsAt),
                          )}{' '}
                          · {item.startsAt.slice(11, 16)}
                        </td>
                        <td>{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )
          ) : null}
        </div>
        <div className="spa-modal-footer">
          <Button type="button" variant="outline" onClick={() => searchDialog.current?.close()}>
            Đóng
          </Button>
        </div>
      </dialog>

      <SepayPaymentDialog
        bookingId={payBookingId ?? ''}
        open={!!payBookingId}
        onClose={() => setPayBookingId(null)}
        onPaid={() => void cache.invalidateQueries({ queryKey: ['bookings'] })}
      />
    </ManagementLayout>
  );
}
