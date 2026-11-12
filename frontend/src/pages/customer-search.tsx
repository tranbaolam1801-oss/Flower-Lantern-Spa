import { API_BASE_URL } from '../lib/api-client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ManagementLayout } from '../components/management-layout';
import { useAuth } from '../contexts/auth-context';
import { isValidVnPhone } from '../lib/phone';
import { Button } from '../components/ui/button';
import {
  createCustomer,
  getCustomerDetail,
  updateCustomer,
  type CustomerSummary,
} from '../lib/management-api';

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
  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? 'Bạn không có quyền quản lý khách hàng.'
        : 'Không thể tải kết quả tìm kiếm. Vui lòng thử lại!',
    );
  }
  return response.json();
}

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
  const [page, setPage] = useState(1);
  const [channelFilter, setChannelFilter] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerSummary | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formChannel, setFormChannel] = useState('Trực tiếp');
  const [formGender, setFormGender] = useState('');
  const [formBirthDate, setFormBirthDate] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [formFieldError, setFormFieldError] = useState<{ field: string; message: string } | null>(null);

  const detailDialog = useRef<HTMLDialogElement>(null);
  const formDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  const allowed = user?.role === 'Chủ Spa' || user?.permissions.includes('Q02');
  const query = useQuery({
    queryKey: ['customers', q, page],
    queryFn: ({ signal }) => search(q, page, signal),
    enabled: !!allowed,
  });

  const detailQuery = useQuery({
    queryKey: ['customer-detail', detailId],
    queryFn: () => getCustomerDetail(detailId!),
    enabled: !!detailId,
  });

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
    onSuccess: async (res) => {
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
        setFormError('');
        return setFormFieldError({ field: keys[hit[0]], message: hit[1] });
      }
      setFormError(err?.message ?? 'Có lỗi khi lưu dữ liệu. Vui lòng thử lại!');
    },
  });

  const openCreate = () => {
    setEditing(null);
    setFormName('');
    setFormPhone('');
    setFormChannel('Trực tiếp');
    setFormGender('');
    setFormBirthDate('');
    setFormAddress('');
    setFormNotes('');
    setFormError('');
    setFormFieldError(null);
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
    setFormError('');
    setFormFieldError(null);
    formDialog.current?.showModal();
  };

  const openDetail = (id: string) => {
    setDetailId(id);
    detailDialog.current?.showModal();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
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
    saveMutation.mutate();
  };

  const visibleItems = (query.data?.items ?? []).filter(
    (item) => !channelFilter || (item.channel ?? '') === channelFilter,
  );

  return (
    <ManagementLayout active="Q02">
      <section className="customer-search-card" aria-label="Quản lý khách hàng">
        <h1 className="sr-only">Quản lý khách hàng</h1>
        {notice && (
          <p role="status" className="spa-toast-success">
            {notice}
          </p>
        )}
        <div className="customer-search-toolbar">
          <label className="customer-search-input">
            <img src="/assets/customer-imgGroup.svg" alt="" />
            <input
              aria-label="Tìm kiếm theo tên hoặc số điện thoại"
              placeholder="Tìm kiếm theo tên hoặc số điện thoại"
              maxLength={100}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="customer-filter-wrap">
            <Button
              type="button"
              variant="outline"
              className="customer-filter-btn"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((o) => !o)}
            >
              <FilterIcon />
              {channelFilter ? `Kênh: ${channelFilter}` : 'Bộ lọc'}
            </Button>
            {filterOpen && (
              <div className="customer-filter-popover" role="dialog" aria-label="Lọc theo kênh liên hệ">
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
        ) : query.isPending ? (
          <p role="status">Đang tải kết quả tìm kiếm…</p>
        ) : query.isError ? (
          <div role="alert">
            <p>{query.error.message}</p>
            <Button type="button" size="sm" onClick={() => void query.refetch()}>
              Thử lại
            </Button>
          </div>
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
                  {visibleItems.map((c) => (
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleItems.length === 0 && (
              <p className="customer-search-empty" role="status">
                Không tìm thấy khách hàng phù hợp!
              </p>
            )}
            <nav className="customer-search-pagination" aria-label="Phân trang khách hàng">
              <div className="figma-pagination-pill">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ‹ Trước
                </button>
                <span className="page-current">{page}</span>
                <button
                  type="button"
                  disabled={!query.data.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau ›
                </button>
              </div>
            </nav>
          </>
        )}
      </section>

      {/* UC_3.3 Slide-over Chi tiết khách hàng khớp Figma 1:29624 */}
      <dialog ref={detailDialog} className="spa-drawer-right" aria-labelledby="customer-detail-title">
        <div className="spa-drawer-header">
          <h2 id="customer-detail-title">Chi tiết khách hàng</h2>
          <button type="button" className="spa-modal-close" onClick={() => detailDialog.current?.close()} aria-label="Đóng">
            ×
          </button>
        </div>
        <div className="spa-drawer-body">
          <p className="detail-section-label">THÔNG TIN CHI TIẾT</p>
          {detailQuery.isPending ? (
            <p role="status">Đang tải thông tin khách hàng…</p>
          ) : detailQuery.isError ? (
            <p role="alert" className="spa-form-error">
              ⚠ {(detailQuery.error as { message?: string })?.message ?? 'Không thể hiển thị thông tin khách hàng, vui lòng thử lại!'}
            </p>
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
      <dialog ref={formDialog} className="spa-modal spa-modal-tinted" aria-labelledby="customer-form-title">
        <div className="spa-modal-header">
          <h2 id="customer-form-title">{editing ? 'Cập nhật thông tin khách hàng' : 'Thêm khách hàng mới'}</h2>
          <button type="button" className="spa-modal-close" onClick={() => formDialog.current?.close()}>×</button>
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
            {formError && (
              <div role="alert" className="spa-form-error">
                <p>⚠ {formError}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => saveMutation.mutate()}>
                  Thử lại
                </Button>
              </div>
            )}
          </div>
          <div className="spa-modal-footer">
            <Button type="button" size="sm" variant="outline" onClick={() => formDialog.current?.close()}>Hủy</Button>
            <Button type="submit" size="sm" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Đang lưu…' : editing ? 'Cập nhật' : 'Lưu'}
            </Button>
          </div>
        </form>
      </dialog>
    </ManagementLayout>
  );
}
