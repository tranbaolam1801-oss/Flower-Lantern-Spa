import { useContinuousList, ContinuousListEnd } from '../components/continuous-list';
import { API_BASE_URL } from '../lib/api-client';

import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ManagementLayout } from '../components/management-layout';
import { useDismissable } from '../lib/use-dismissable';
import { useAuth } from '../contexts/auth-context';
import { isValidVnPhone } from '../lib/phone';
import { Button } from '../components/ui/button';
import {
  createCustomer,
  getCustomerDetail,
  updateCustomer,
  type CustomerSummary,
} from '../lib/management-api';

const SEARCH_FAILED_MESSAGE = 'Không thể tải kết quả tìm kiếm. Vui lòng thử lại!';
const DETAIL_FAILED_MESSAGE = 'Không thể hiển thị thông tin khách hàng, vui lòng thử lại!';
const FORBIDDEN_MESSAGE = 'Bạn không có quyền quản lý khách hàng.';

/**
 * Maps a load failure to what the user may read. Browser/network text ("Failed to fetch"), 5xx bodies and driver errors are never shown:
 *  - no HTTP status (offline, API unreachable, aborted) or 5xx / unexpected  -> the Figma message, retry allowed
 *  - 403 -> permission message (no retry);  400 -> invalid keyword (no retry);  404 on detail -> customer no longer exists (no retry)
 */
function loadFailure(err: unknown, generic: string, kind: 'search' | 'detail'): { message: string; retryable: boolean } {
  const status = typeof (err as { status?: unknown } | null)?.status === 'number' ? (err as { status: number }).status : undefined;
  if (status === 403) return { message: FORBIDDEN_MESSAGE, retryable: false };
  if (status === 400 && kind === 'search') return { message: 'Từ khóa tìm kiếm không hợp lệ!', retryable: false };
  if (status === 404 && kind === 'detail') return { message: 'Không tìm thấy khách hàng.', retryable: false };
  return { message: generic, retryable: true };
}

async function search(
  q: string,
  page: number,
  signal: AbortSignal,
): Promise<{ items: CustomerSummary[]; page: number; hasNext: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/customers?${new URLSearchParams({ q, page: String(page) })}`, {
    credentials: 'include',
    signal,
  });
  if (response.status === 401) window.dispatchEvent(new Event('spa-session-expired'));
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
  return response.json();
}

const SAVE_FAILED_MESSAGE = 'Có lỗi khi lưu dữ liệu. Vui lòng thử lại!';

/**
 * Message shown in the error toast. A missing HTTP status means fetch() itself rejected (offline, API unreachable, DNS, CORS/blocked):
 * the browser's raw text ("Failed to fetch") is never shown. 5xx are also generic. Other 4xx keep the server's Vietnamese message.
 */
function saveFailureMessage(err: unknown): string {
  const e = err as { status?: unknown; message?: unknown } | null;
  const status = typeof e?.status === 'number' ? e.status : undefined;
  const message = typeof e?.message === 'string' ? e.message.trim() : '';
  if (status === undefined || status >= 500 || !message) return SAVE_FAILED_MESSAGE;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) return SAVE_FAILED_MESSAGE;
  return message;
}

/** Figma UC_3.1 Toast (5:19160 success / 5:19187 error): fixed top-right, 510px, icon circle 36px, title, message, optional "Thử lại", close X. */
function CustomerToast({ kind, title, message, onClose, onRetry, retrying }: {
  kind: 'success' | 'error';
  title: string;
  message: string;
  onClose: () => void;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`customer-toast customer-toast-${kind}`} data-testid={`customer-toast-${kind}`}>
      <span className="customer-toast-icon" aria-hidden="true">
        <img src={kind === 'error' ? '/assets/uc3-toast-error-x.svg' : '/assets/uc3-toast-check.svg'} alt="" />
      </span>
      <div className="customer-toast-body">
        <p className="customer-toast-title">{title}</p>
        <p className="customer-toast-message">{message}</p>
        {onRetry && (
          <div>
            <button type="button" className="customer-toast-retry" onClick={onRetry} disabled={retrying}>
              {retrying ? 'Đang thử lại…' : 'Thử lại'}
            </button>
          </div>
        )}
      </div>
      <button type="button" className="customer-toast-close" aria-label="Đóng thông báo" onClick={onClose}>
        <img src="/assets/uc3-toast-close.svg" alt="" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Figma UC_3.4 empty (1:28969) / error: centred 42px magnifier, 25px title, 16px text, inside the table area under the header row. */
function SearchState({ title, text }: { title: string; text: string }) {
  return (
    <div className="customer-search-state" data-testid="customer-search-state">
      <img src="/assets/uc3-search-empty.svg" alt="" width={42} height={42} aria-hidden="true" />
      <p className="customer-search-state-title" role="status">{title}</p>
      <p className="customer-search-state-text">{text}</p>
    </div>
  );
}

const UNAVAILABLE_DELETE_NOTICE = 'Chức năng xóa/hủy khách hàng chưa được áp dụng. Dữ liệu khách hàng không bị thay đổi.';

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

export function CustomerSearch() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [text, setText] = useState('');
  const [q, setQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterWrap = useRef<HTMLDivElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const filterPanelId = useId();
  useDismissable({ id: 'customer-filter', open: filterOpen, onClose: () => setFilterOpen(false), containerRef: filterWrap, onEscape: () => filterButton.current?.focus() });
  const [notice, setNotice] = useState('');
  // Xóa/Hủy khách hàng chưa có nghiệp vụ trong SRS: nút hiển thị theo Figma nhưng không thay đổi dữ liệu.
  const [unavailableNotice, setUnavailableNotice] = useState('');

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailToast, setDetailToast] = useState<{ id: string; message: string; retryable: boolean } | null>(null);
  const [searchToastDismissedAt, setSearchToastDismissedAt] = useState(0);
  const [editing, setEditing] = useState<CustomerSummary | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formChannel, setFormChannel] = useState('Trực tiếp');
  const [formGender, setFormGender] = useState('');
  const [formBirthDate, setFormBirthDate] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [formFieldError, setFormFieldError] = useState<{ field: string; message: string } | null>(null);

  const savingRef = useRef(false);
  const detailDialog = useRef<HTMLDialogElement>(null);
  const formDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(text.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  const allowed = user?.role === 'Chủ Spa' || user?.permissions.includes('Q02');
  // Quyền thao tác Xóa/Hủy chưa được SRS quy định: chỉ hiển thị cho Chủ Spa/Quản lý (an toàn tối thiểu).
  const canSeeDelete = user?.role === 'Chủ Spa' || user?.role === 'Quản lý';
  const query = useContinuousList({
    queryKey: ['customers', q],
    queryFn: (page, signal) => search(q, page, signal),
    enabled: !!allowed,
  });

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const detailQuery = useQuery({
    queryKey: ['customer-detail', detailId],
    queryFn: () => getCustomerDetail(detailId!),
    enabled: !!detailId,
  });

  // Figma UC_3.3 error: the slide-over is not shown; the list stays and the error toast appears top-right.
  useEffect(() => {
    if (!detailQuery.isError || detailQuery.isFetching || !detailId) return;
    detailDialog.current?.close();
    setDetailToast({ id: detailId, ...loadFailure(detailQuery.error, DETAIL_FAILED_MESSAGE, 'detail') });
  }, [detailQuery.errorUpdatedAt, detailQuery.isFetching]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: formName.trim(),
        phone: formPhone.trim(),
        channel: formChannel,
        gender: formGender || undefined,
        birthDate: formBirthDate || undefined,
        address: formAddress.trim() || undefined,
        notes: formNotes.trim() || undefined,
      };
      return editing ? updateCustomer(editing.id, payload) : createCustomer(payload);
    },
    onSettled: () => {
      savingRef.current = false;
    },
    onSuccess: async (res) => {
      setSaveFailure(null);
      formDialog.current?.close();
      setNotice(
        res.message || (editing ? 'Cập nhật thông tin khách hàng thành công!' : 'Thêm khách hàng thành công!'),
      );
      await cache.invalidateQueries({ queryKey: ['customers'] });
      if (detailId) await cache.invalidateQueries({ queryKey: ['customer-detail', detailId] });
    },
    onError: (err: { message?: string; fields?: Record<string, string> }) => {
      // Server field errors (409 DUPLICATE_PHONE, 400 validation) are shown under the matching input.
      const keys: Record<string, string> = { name: 'formName', phone: 'formPhone' };
      const hit = Object.entries(err?.fields ?? {}).find(([field]) => keys[field]);
      if (hit) {
        setSaveFailure(null);
        return setFormFieldError({ field: keys[hit[0]], message: hit[1] });
      }
      // Entered values stay in the form (state is untouched) so the user can retry.
      setSaveFailure(saveFailureMessage(err));
    },
  });

  /** Clears every message tied to the form or a previous save, so nothing stale (e.g. an old success toast) survives into a new interaction. */
  const resetFormMessages = () => {
    setSaveFailure(null);
    setFormFieldError(null);
    setNotice('');
    setUnavailableNotice('');
  };

  /** Hủy / × / Esc: only closes the dialog. No request is made and no success or error message is produced. */
  const closeForm = () => {
    if (saveMutation.isPending) return;
    formDialog.current?.close();
    setSaveFailure(null);
    setFormFieldError(null);
  };

  const openCreate = () => {
    setEditing(null);
    setFormName('');
    setFormPhone('');
    setFormChannel('Trực tiếp');
    setFormGender('');
    setFormBirthDate('');
    setFormAddress('');
    setFormNotes('');
    resetFormMessages();
    formDialog.current?.showModal();
  };

  const openEdit = (c: CustomerSummary) => {
    setEditing(c);
    setFormName(c.name);
    setFormPhone(c.phone);
    setFormChannel(c.channel ?? 'Trực tiếp');
    setFormGender('');
    setFormBirthDate('');
    setFormAddress('');
    setFormNotes('');
    resetFormMessages();
    formDialog.current?.showModal();
  };

  const openDetail = (id: string) => {
    setDetailToast(null);
    if (detailId === id && detailQuery.isError && !detailQuery.isFetching) void detailQuery.refetch();
    setDetailId(id);
    if (!detailDialog.current?.open) detailDialog.current?.showModal();
  };

  const submitForm = () => {
    if (saveMutation.isPending || savingRef.current) return; // never send a duplicate request
    setSaveFailure(null);
    setFormFieldError(null);
    if (!formName.trim()) {
      return setFormFieldError({
        field: 'formName',
        message: editing ? 'Vui lòng nhập đầy đủ các thông tin bắt buộc!' : 'Vui lòng nhập họ tên khách hàng!',
      });
    }
    if (!isValidVnPhone(formPhone)) {
      return setFormFieldError({ field: 'formPhone', message: 'Số điện thoại không hợp lệ!' });
    }
    savingRef.current = true;
    saveMutation.mutate();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    submitForm();
  };

  const searchFailure = loadFailure(query.error, SEARCH_FAILED_MESSAGE, 'search');
  const visibleItems = (query.data?.items ?? []).filter(
    (item) => !channelFilter || (item.channel ?? '') === channelFilter,
  );

  return (
    <ManagementLayout active="Q02">
      <section className="customer-search-card" aria-label="Quản lý khách hàng">
        <h1 className="sr-only">Quản lý khách hàng</h1>
        {notice && <CustomerToast kind="success" title="Thành công" message={notice} onClose={() => setNotice('')} />}
        {unavailableNotice && (
          <p role="status" className="spa-toast-neutral">
            {unavailableNotice}
          </p>
        )}
        <div className="customer-search-toolbar">
          <label className="customer-search-input">
            <img src="/assets/customer-imgGroup.svg" alt="" />
            <input
              aria-label="Tìm theo tên, số điện thoại hoặc mã khách hàng"
              placeholder="Tìm theo tên, số điện thoại hoặc mã…"
              maxLength={100}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="customer-filter-wrap" ref={filterWrap}>
            <Button
              type="button"
              variant="outline"
              className="customer-filter-btn"
              ref={filterButton}
              aria-haspopup="dialog"
              aria-controls={filterPanelId}
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((o) => !o)}
            >
              <FilterIcon />
              {channelFilter ? `Kênh: ${channelFilter}` : 'Bộ lọc'}
            </Button>
            {filterOpen && (
              <div className="customer-filter-popover" id={filterPanelId} role="dialog" aria-label="Lọc theo kênh liên hệ">
                {['', 'Trực tiếp', 'Zalo', 'Facebook', 'Website'].map((ch) => (
                  <button
                    key={ch || 'all'}
                    type="button"
                    className={channelFilter === ch ? 'active' : undefined}
                    onClick={() => {
                      setChannelFilter(ch);
                      setFilterOpen(false);
                    }}
                  >
                    {ch || 'Tất cả kênh liên hệ'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button type="button" className="customer-add-btn" onClick={openCreate}>
            + Thêm mới
          </Button>
        </div>

        {!allowed ? (
          <p role="alert">Bạn không có quyền quản lý khách hàng.</p>
        ) : (
          <>
            <div className="customer-search-scroll">
              <table className="customer-search-table figma-admin-table">
                <thead>
                  <tr>
                    {['Mã KH', 'Họ tên', 'Số điện thoại', 'Kênh liên hệ', 'Tổng lịch hẹn', 'Thao tác'].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {!query.isPending && !query.isError && visibleItems.map((c) => (
                    <tr key={c.id}>
                      <td>{c.id}</td>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.phone}</td>
                      <td>{c.channel || '—'}</td>
                      <td>{String(c.bookingCount).padStart(2, '0')}</td>
                      <td>
                        <div className="figma-row-actions">
                          <button
                            type="button"
                            className="figma-icon-btn figma-icon-view"
                            aria-label={`Xem chi tiết ${c.name}`}
                            title="Xem chi tiết"
                            onClick={() => openDetail(c.id)}
                          >
                            <EyeIcon />
                          </button>
                          <button
                            type="button"
                            className="figma-icon-btn figma-icon-edit"
                            aria-label={`Cập nhật ${c.name}`}
                            title="Sửa thông tin"
                            onClick={() => openEdit(c)}
                          >
                            <EditIcon />
                          </button>
                          {canSeeDelete && (
                            <button
                              type="button"
                              className="figma-icon-btn figma-icon-delete"
                              aria-label={`Xóa/Hủy ${c.name}`}
                              aria-disabled="true"
                              title="Chức năng xóa/hủy khách hàng chưa được áp dụng"
                              data-testid="customer-delete-button"
                              onClick={() => setUnavailableNotice(UNAVAILABLE_DELETE_NOTICE)}
                            >
                              <img src="/assets/uc3-trash-2.svg" alt="" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {query.isPending && (
              <p role="status" className="customer-search-state customer-search-state-loading">Đang tải kết quả tìm kiếm…</p>
            )}
            {query.isError && <SearchState title="Không thể tải kết quả tìm kiếm" text={searchFailure.message} />}
            {!query.isPending && !query.isError && visibleItems.length === 0 && (
              <SearchState title="Không có kết quả phù hợp" text="Không tìm thấy khách hàng phù hợp!" />
            )}
            {!query.isPending && !query.isError && <ContinuousListEnd query={query} />}
          </>
        )}
        {query.isError && query.errorUpdatedAt !== searchToastDismissedAt && (
          <CustomerToast
            kind="error"
            title="Không thể thực hiện"
            message={searchFailure.message}
            onClose={() => setSearchToastDismissedAt(query.errorUpdatedAt)}
            onRetry={searchFailure.retryable ? () => void query.refetch() : undefined}
            retrying={query.isFetching}
          />
        )}
        {detailToast && (
          <CustomerToast
            kind="error"
            title="Không thể thực hiện"
            message={detailToast.message}
            onClose={() => { setDetailToast(null); setDetailId(null); }}
            onRetry={detailToast.retryable ? () => openDetail(detailToast.id) : undefined}
            retrying={detailQuery.isFetching}
          />
        )}
      </section>

      {/* UC_3.3 Slide-over Chi tiết khách hàng khớp Figma 1:29624 */}
      <dialog ref={detailDialog} className="spa-drawer-right" aria-labelledby="customer-detail-title" onClose={() => setDetailId(null)}>
        <div className="spa-drawer-header">
          <h2 id="customer-detail-title">Chi tiết khách hàng</h2>
          <button type="button" className="spa-modal-close" onClick={() => detailDialog.current?.close()} aria-label="Đóng">
            ×
          </button>
        </div>
        <div className="spa-drawer-body">
          <p className="detail-section-label">THÔNG TIN CHI TIẾT</p>
          {!detailQuery.data ? (
            <p role="status">Đang tải thông tin khách hàng…</p>
          ) : detailQuery.data ? (
            <dl className="detail-kv-list">
              <div><dt>Mã khách hàng</dt><dd>{detailQuery.data.id}</dd></div>
              <div><dt>Họ tên</dt><dd>{detailQuery.data.name}</dd></div>
              <div><dt>Số điện thoại</dt><dd>{detailQuery.data.phone}</dd></div>
              <div><dt>Giới tính</dt><dd>{detailQuery.data.gender || 'Chưa cập nhật'}</dd></div>
              <div><dt>Ngày sinh</dt><dd>{detailQuery.data.birthDate || 'Chưa cập nhật'}</dd></div>
              <div><dt>Địa chỉ</dt><dd>{detailQuery.data.address || 'Chưa cập nhật'}</dd></div>
              <div><dt>Kênh liên hệ</dt><dd>{detailQuery.data.channel || 'Chưa cập nhật'}</dd></div>
              <div><dt>Ngày tạo</dt><dd>{detailQuery.data.createdAt || 'Chưa cập nhật'}</dd></div>
              <div><dt>Ghi chú</dt><dd>{detailQuery.data.notes || 'Chưa cập nhật'}</dd></div>
              <div><dt>Tổng số lịch hẹn</dt><dd>{String(detailQuery.data.bookingCount).padStart(2, '0')}</dd></div>
            </dl>
          ) : null}
        </div>
        <div className="spa-drawer-footer">
          <Button type="button" size="sm" onClick={() => detailDialog.current?.close()}>
            Đóng
          </Button>
        </div>
      </dialog>

      {/* UC_3.1 / UC_3.2 Thêm & Sửa khách hàng */}
      <dialog
        ref={formDialog}
        className="spa-modal spa-modal-tinted customer-form-modal"
        aria-labelledby="customer-form-title"
        onCancel={(e) => { if (saveMutation.isPending) e.preventDefault(); }}
        onClose={() => { setSaveFailure(null); setFormFieldError(null); }}
      >
        <div className="spa-modal-header">
          <h2 id="customer-form-title">{editing ? 'Cập nhật thông tin khách hàng' : 'Thêm khách hàng mới'}</h2>
          <button type="button" className="spa-modal-close" onClick={closeForm} disabled={saveMutation.isPending} aria-label="Đóng">×</button>
        </div>
        <form onSubmit={handleSave} noValidate>
          <div className="spa-modal-body">
            <div className="spa-modal-meta-row">
              <span>{editing ? `Khách hàng ${editing.id}` : 'Khách hàng mới'}</span>
              <span className="spa-modal-meta-required">* Bắt buộc</span>
            </div>
            <div className="booking-form-grid-2">
              <label className={`spa-field${formFieldError?.field === 'formName' ? ' spa-field-invalid' : ''}`}>
                <span>Họ tên <em>*</em></span>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  aria-invalid={formFieldError?.field === 'formName'}
                />
                {formFieldError?.field === 'formName' && (
                  <p role="alert" className="spa-field-error-text">{formFieldError.message}</p>
                )}
              </label>
              <label className={`spa-field${formFieldError?.field === 'formPhone' ? ' spa-field-invalid' : ''}`}>
                <span>Số điện thoại <em>*</em></span>
                <input
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  aria-invalid={formFieldError?.field === 'formPhone'}
                />
                {formFieldError?.field === 'formPhone' && (
                  <p role="alert" className="spa-field-error-text">{formFieldError.message}</p>
                )}
              </label>
            </div>
            <div className="booking-form-grid-2">
              <label className="spa-field">
                <span>Giới tính</span>
                <select value={formGender} onChange={(e) => setFormGender(e.target.value)}>
                  <option value="">Chọn giới tính</option>
                  <option value="Nữ">Nữ</option>
                  <option value="Nam">Nam</option>
                  <option value="Khác">Khác</option>
                </select>
              </label>
              <label className="spa-field">
                <span>Ngày sinh</span>
                <input type="date" value={formBirthDate} onChange={(e) => setFormBirthDate(e.target.value)} />
              </label>
            </div>
            <div className="booking-form-grid-2">
              <label className="spa-field">
                <span>Kênh liên hệ</span>
                <select value={formChannel} onChange={(e) => setFormChannel(e.target.value)}>
                  <option value="Trực tiếp">Trực tiếp</option>
                  <option value="Zalo">Zalo</option>
                  <option value="Facebook">Facebook</option>
                  <option value="Website">Website</option>
                </select>
              </label>
              <label className="spa-field">
                <span>Địa chỉ</span>
                <input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
              </label>
            </div>
            <label className="spa-field">
              <span>Ghi chú</span>
              <textarea rows={2} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </label>
            <p className="spa-modal-demo-note">
              Dữ liệu DEMO, không phải thông tin khách hàng thực. Số điện thoại được hiển thị đầy đủ chỉ để minh họa nhập liệu.
            </p>
          </div>
          <div className="spa-modal-footer">
            <Button type="button" size="sm" variant="outline" onClick={closeForm} disabled={saveMutation.isPending}>Hủy</Button>
            <Button type="submit" size="sm" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Đang lưu…' : editing ? 'Cập nhật' : 'Lưu'}
            </Button>
          </div>
        </form>
        {saveFailure && (
          <CustomerToast
            kind="error"
            title="Không thể thực hiện"
            message={saveFailure}
            onClose={() => setSaveFailure(null)}
            onRetry={submitForm}
            retrying={saveMutation.isPending}
          />
        )}
      </dialog>
    </ManagementLayout>
  );
}
