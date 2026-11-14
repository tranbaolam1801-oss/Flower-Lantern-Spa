import { useContinuousList, ContinuousListEnd } from '../components/continuous-list';
import { useEffect, useRef, useState } from 'react';
import { resolveApiUrl } from '../lib/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ManagementLayout } from '../components/management-layout';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/auth-context';
import {
  createAdminService,
  listAdminServices,
  stopAdminService,
  updateAdminService,
  uploadServiceImage,
  type AdminServiceItem,
} from '../lib/management-api';
import { formatVnd } from '../lib/api-client';

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

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
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

const SAVE_FAILED = 'Có lỗi khi lưu dữ liệu, vui lòng thử lại sau!';
const REQUIRED = 'Vui lòng nhập trường bắt buộc.';
const DELETE_FAILED = 'Có lỗi xảy ra, không thể xóa dịch vụ lúc này. Vui lòng thử lại sau!';
const DELETE_BLOCKED = 'Không thể xóa dịch vụ do đang có lịch hẹn chưa hoàn thành!';
const LIST_FAILED = 'Không thể tải danh sách dịch vụ, vui lòng thử lại sau!';

type FieldKey = 'name' | 'category' | 'image' | 'packageName' | 'duration' | 'price';
type FieldErrors = Partial<Record<FieldKey, string>>;

/** Positive whole number; the price may be typed with thousand separators ("390.000"). Returns null when invalid. */
function parsePositiveInt(raw: string, money = false): number | null {
  const v = raw.trim();
  const plain = money && /^\d{1,3}([.,]\d{3})+$/.test(v) ? v.replace(/[.,]/g, '') : v;
  if (!/^\d+$/.test(plain)) return null;
  const n = Number(plain);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Maps a failed save to the Figma exception UI. No status (offline / unreachable) and 5xx show the Figma save-error line; the browser's raw
 * text ("Failed to fetch") and server error bodies are never shown. 409 = duplicate code/name; other 4xx messages are placed under their field.
 */
function saveFailure(err: unknown): { fields: FieldErrors; general?: string } {
  const e = err as { status?: unknown; message?: unknown } | null;
  const status = typeof e?.status === 'number' ? e.status : undefined;
  const message = typeof e?.message === 'string' ? e.message.trim() : '';
  if (status === undefined || status >= 500 || !message || /failed to fetch|networkerror|load failed/i.test(message)) return { fields: {}, general: SAVE_FAILED };
  if (status === 409) return { fields: { name: 'Mã/Tên dịch vụ đã tồn tại!' } };
  if (/ít nhất một gói|Gói dịch vụ|Tên gói/i.test(message)) return { fields: { packageName: /bị trùng/.test(message) ? message : 'Vui lòng thêm ít nhất một gói dịch vụ!' } };
  if (/Hình ảnh/i.test(message)) return { fields: { image: 'Hình ảnh không hợp lệ!' } };
  if (/Danh mục/i.test(message)) return { fields: { category: 'Vui lòng chọn danh mục.' } };
  if (/Thời lượng/i.test(message)) return { fields: { duration: 'Thời lượng phải là số nguyên dương.' } };
  if (/Giá/i.test(message)) return { fields: { price: 'Giá phải là số nguyên dương (VNĐ).' } };
  if (/tên dịch vụ|Mã dịch vụ/i.test(message)) return { fields: { name: /nhập/i.test(message) ? REQUIRED : message } };
  return { fields: {}, general: /[À-ỹ]/.test(message) ? message : SAVE_FAILED };
}

/** Figma UC_9.1/9.3/9.4 success toast: fixed bottom-right, 510px, "Thành công" + message + close. */
function ServiceToast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div role="status" className="svc-toast" data-testid="svc-toast">
      <span className="svc-toast-icon" aria-hidden="true"><img src="/assets/uc3-toast-check.svg" alt="" /></span>
      <div className="svc-toast-body"><p className="svc-toast-title">Thành công</p><p className="svc-toast-message">{message}</p></div>
      <button type="button" className="svc-toast-close" aria-label="Đóng thông báo" onClick={onClose}><img src="/assets/uc3-toast-close.svg" alt="" aria-hidden="true" /></button>
    </div>
  );
}

function FieldMessage({ id, text }: { id: string; text?: string }) {
  return text ? <small id={id} className="svc-field-error" role="alert">{text}</small> : null;
}

export function AdminServicesPage() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [notice, setNotice] = useState('');

  const [editing, setEditing] = useState<AdminServiceItem | null>(null);
  const [detailTarget, setDetailTarget] = useState<AdminServiceItem | null>(null);
  const [stopTarget, setStopTarget] = useState<AdminServiceItem | null>(null);

  const [serviceIdInput, setServiceIdInput] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [statusVal, setStatusVal] = useState<'Hoạt động' | 'Ngừng hoạt động'>('Hoạt động');
  const [shortDesc, setShortDesc] = useState('');
  const [details, setDetails] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pkgName, setPkgName] = useState('');
  const [pkgDuration, setPkgDuration] = useState('');
  const [pkgPrice, setPkgPrice] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState('');
  const savingRef = useRef(false);
  const stoppingRef = useRef(false);
  const clearField = (key: FieldKey) => setFieldErrors((old) => (old[key] ? { ...old, [key]: undefined } : old));

  const detailDialog = useRef<HTMLDialogElement>(null);
  const formDialog = useRef<HTMLDialogElement>(null);
  const stopDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(text.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  const allowed = user?.role === 'Chủ Spa' || (user?.role === 'Quản lý' && !!user.permissions.includes('Q04')); // mirrors backend @Roles('Quản lý') @Permissions('Q04')
  const query = useContinuousList({
    queryKey: ['admin-services', q, category, statusFilter],
    queryFn: (page) => listAdminServices({ q, category, status: statusFilter, page }),
    enabled: !!allowed,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        id: editing ? undefined : serviceIdInput.trim() || undefined,
        name: serviceName.trim(),
        categoryId,
        status: statusVal,
        description: shortDesc.trim() || undefined,
        details: details.trim() || undefined,
        image: imageUrl.trim() || undefined,
        packages: [
          {
            id: editing?.packages[0]?.id,
            name: pkgName.trim(),
            durationMinutes: parsePositiveInt(pkgDuration) ?? 0,
            price: parsePositiveInt(pkgPrice, true) ?? 0,
          },
          ...(editing?.packages.slice(1) ?? []),
        ],
      };
      return editing ? updateAdminService(editing.id, payload) : createAdminService(payload);
    },
    onSuccess: async (res) => {
      formDialog.current?.close();
      setNotice(res.message || (editing ? 'Cập nhật dịch vụ thành công!' : 'Thêm mới dịch vụ thành công!'));
      await cache.invalidateQueries({ queryKey: ['admin-services'] });
      await cache.invalidateQueries({ queryKey: ['public-services'] });
    },
    onError: (err) => {
      const failure = saveFailure(err);
      setFieldErrors(failure.fields);
      setSaveError(failure.general ?? '');
    },
    onSettled: () => { savingRef.current = false; },
  });

  const stopMutation = useMutation({
    mutationFn: () => stopAdminService(stopTarget!.id),
    onSettled: () => { stoppingRef.current = false; },
    onSuccess: async () => {
      stopDialog.current?.close();
      setNotice('Xóa dịch vụ thành công!');
      await cache.invalidateQueries({ queryKey: ['admin-services'] });
    },
  });
  const stopBlocked = (stopMutation.error as { status?: number } | null)?.status === 409;

  const openCreate = () => {
    setEditing(null);
    setServiceIdInput('');
    setServiceName('');
    setCategoryId('');
    setStatusVal('Hoạt động');
    setShortDesc('');
    setDetails('');
    setImageUrl('');
    setPkgName('');
    setPkgDuration('');
    setPkgPrice('');
    setFieldErrors({});
    setSaveError('');
    formDialog.current?.showModal();
  };

  const openEdit = (svc: AdminServiceItem) => {
    setEditing(svc);
    setServiceIdInput(svc.id);
    setServiceName(svc.name);
    setCategoryId(svc.categoryId);
    setStatusVal(svc.status);
    setShortDesc(svc.description ?? '');
    setDetails(svc.details ?? '');
    setImageUrl(svc.image ?? '');
    setPkgName(svc.packages[0]?.name ?? '');
    setPkgDuration(svc.packages[0] ? String(svc.packages[0].durationMinutes) : '');
    setPkgPrice(svc.packages[0] ? String(svc.packages[0].price) : '');
    setFieldErrors({});
    setSaveError('');
    formDialog.current?.showModal();
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    clearField('image');
    setSaveError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) return setFieldErrors((old) => ({ ...old, image: 'Hình ảnh không hợp lệ!' }));
    setUploading(true);
    try {
      setImageUrl((await uploadServiceImage(file)).path);
    } catch (err) {
      const status = (err as { status?: number }).status;
      setFieldErrors((old) => ({ ...old, image: status && status < 500 ? 'Hình ảnh không hợp lệ!' : undefined }));
      if (!status || status >= 500) setSaveError(SAVE_FAILED);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (saveMutation.isPending || savingRef.current) return; // never send a duplicate request
    setSaveError('');
    const errors: FieldErrors = {};
    if (!serviceName.trim()) errors.name = REQUIRED;
    if (!categoryId) errors.category = 'Vui lòng chọn danh mục.';
    if (!pkgName.trim()) errors.packageName = REQUIRED;
    if (!pkgDuration.trim()) errors.duration = REQUIRED;
    else if (parsePositiveInt(pkgDuration) === null) errors.duration = 'Thời lượng phải là số nguyên dương.';
    if (!pkgPrice.trim()) errors.price = REQUIRED;
    else if (parsePositiveInt(pkgPrice, true) === null) errors.price = 'Giá phải là số nguyên dương (VNĐ).';
    if (uploading) errors.image = 'Đang tải hình ảnh, vui lòng đợi.';
    setFieldErrors(errors);
    const first = (['name', 'category', 'image', 'packageName', 'duration', 'price'] as FieldKey[]).find((k) => errors[k]);
    if (first) { formDialog.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus(); return; }
    savingRef.current = true;
    saveMutation.mutate();
  };

  return (
    <ManagementLayout active="Q04">
      <div className="figma-admin-stack" aria-label="Quản lý dịch vụ">
        <h1 className="sr-only">Quản lý dịch vụ</h1>

        {/* UC_9.1 / UC_9.5 Toolbar Card khớp Figma 3:5771 */}
        <section className="figma-toolbar-card">
          <label className="customer-search-input">
            <img src="/assets/customer-imgGroup.svg" alt="" />
            <input
              aria-label="Tìm theo mã hoặc tên dịch vụ"
              placeholder="Tìm theo mã hoặc tên dịch vụ..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <select
            className="spa-select-toolbar"
            aria-label="Lọc danh mục"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
            }}
          >
            <option value="">Tất cả danh mục</option>
            {(query.data?.categories ?? []).map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <select
            className="spa-select-toolbar"
            aria-label="Lọc trạng thái dịch vụ"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="Hoạt động">Hoạt động</option>
            <option value="Ngừng hoạt động">Ngừng hoạt động</option>
          </select>
          <Button type="button" className="figma-filter-submit" onClick={() => void query.refetch()}>
            <FilterIcon />
            Lọc
          </Button>
          <Button type="button" className="figma-add-submit" onClick={openCreate}>
            + Thêm dịch vụ
          </Button>
        </section>

        <section className="admin-panel-card">
          {!allowed ? (
            <p role="alert">Bạn không có quyền quản lý dịch vụ.</p>
          ) : (
            <>
              <div className="customer-search-scroll">
                <table className="customer-search-table figma-admin-table admin-service-table">
                  <thead>
                    <tr>
                      <th>Mã DV</th>
                      <th>Hình ảnh</th>
                      <th>Tên dịch vụ</th>
                      <th>Mô tả ngắn</th>
                      <th>Danh mục</th>
                      <th>Gói &amp; giá</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!query.isPending && !query.isError && (query.data?.items ?? []).map((svc) => (
                      <tr key={svc.id}>
                        <td>{svc.id}</td>
                        <td>
                          {svc.image ? (
                            <img src={resolveApiUrl(svc.image)} alt={svc.name} className="svc-table-thumb" />
                          ) : (
                            <span className="svc-table-noimg">Chưa có ảnh</span>
                          )}
                        </td>
                        <td><strong>{svc.name}</strong></td>
                        <td><span className="svc-table-desc">{svc.description || 'Chưa có mô tả'}</span></td>
                        <td>{svc.categoryName}</td>
                        <td>
                          {svc.packages.length
                            ? `${svc.packages[0].durationMinutes} phút · ${formatVnd(svc.packages[0].price)}`
                            : 'Chưa có gói'}
                        </td>
                        <td>
                          <span className={`pill-status ${svc.status === 'Hoạt động' ? 'pill-ok' : 'pill-warn'}`}>
                            {svc.status}
                          </span>
                        </td>
                        <td>
                          <div className="figma-row-actions">
                            <button
                              type="button"
                              className="figma-icon-btn figma-icon-view"
                              aria-label={`Xem dịch vụ ${svc.name}`}
                              title="Xem chi tiết"
                              onClick={() => {
                                setDetailTarget(svc);
                                detailDialog.current?.showModal();
                              }}
                            >
                              <EyeIcon />
                            </button>
                            <button
                              type="button"
                              className="figma-icon-btn figma-icon-edit"
                              aria-label={`Sửa dịch vụ ${svc.name}`}
                              title="Sửa dịch vụ"
                              onClick={() => openEdit(svc)}
                            >
                              <EditIcon />
                            </button>
                            {svc.status === 'Hoạt động' && (
                              <button
                                type="button"
                                className="figma-icon-btn figma-icon-delete"
                                aria-label={`Xóa dịch vụ ${svc.name}`}
                                title="Xóa dịch vụ"
                                onClick={() => {
                                  setStopTarget(svc);
                                  stopMutation.reset();
                                  stopDialog.current?.showModal();
                                }}
                              >
                                <TrashIcon />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {query.isPending && <p role="status" className="svc-state"><span className="svc-state-text">Đang tải danh sách dịch vụ…</span></p>}
              {query.isError && (
                <div role="alert" className="svc-state" data-testid="svc-list-error">
                  <p className="svc-state-title">Không thể tải danh sách</p>
                  <p className="svc-state-text svc-state-text-error">{LIST_FAILED}</p>
                </div>
              )}
              {!query.isPending && !query.isError && (query.data?.items.length ?? 0) === 0 && (
                <div role="status" className="svc-state" data-testid="svc-list-empty">
                  <p className="svc-state-title">Không có kết quả phù hợp</p>
                  <p className="svc-state-text">Không tìm thấy dịch vụ phù hợp.</p>
                </div>
              )}
              {!query.isPending && !query.isError && <ContinuousListEnd query={query} />}
            </>
          )}
        </section>
      </div>

      {/* UC_9.2 Xem chi tiết dịch vụ */}
      <dialog ref={detailDialog} className="spa-modal spa-modal-lg spa-modal-tinted" aria-labelledby="svc-detail-title">
        <div className="spa-modal-header">
          <h2 id="svc-detail-title">Thông tin dịch vụ</h2>
          <button type="button" className="spa-modal-close" onClick={() => detailDialog.current?.close()}>×</button>
        </div>
        {detailTarget && (
          <div className="spa-modal-body">
            <dl className="emp-detail-grid">
              <div><dt>Mã dịch vụ</dt><dd>{detailTarget.id}</dd></div>
              <div><dt>Tên dịch vụ</dt><dd>{detailTarget.name}</dd></div>
              <div><dt>Danh mục</dt><dd>{detailTarget.categoryName}</dd></div>
              <div><dt>Trạng thái</dt><dd>{detailTarget.status}</dd></div>
              <div><dt>Mô tả ngắn</dt><dd>{detailTarget.description || 'Chưa có mô tả'}</dd></div>
              <div><dt>Mô tả chi tiết</dt><dd>{detailTarget.details || 'Chưa có mô tả'}</dd></div>
              <div className="emp-detail-grid-full"><dt>Hình ảnh</dt><dd>{detailTarget.image || 'Chưa có ảnh'}</dd></div>
            </dl>
            <h3 className="spa-section-subtitle">Các gói dịch vụ</h3>
            <ul>
              {detailTarget.packages.map((p, idx) => (
                <li key={p.id ?? idx}>{p.name} — {p.durationMinutes} phút — {formatVnd(p.price)}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="spa-modal-footer">
          <Button type="button" size="sm" variant="outline" onClick={() => detailDialog.current?.close()}>Đóng</Button>
        </div>
      </dialog>

      {/* UC_9.1 / UC_9.3 Thêm / Sửa dịch vụ */}
      <dialog ref={formDialog} className="spa-modal spa-modal-lg spa-modal-tinted" aria-labelledby="svc-form-title">
        <div className="spa-modal-header">
          <h2 id="svc-form-title">{editing ? 'Cập nhật dịch vụ' : 'Thêm dịch vụ'}</h2>
          <button type="button" className="spa-modal-close" onClick={() => formDialog.current?.close()}>×</button>
        </div>
        <form onSubmit={handleSave} noValidate>
          <div className="spa-modal-body">
            <div className="booking-form-grid-2">
              <label className="spa-field">
                <span>Mã dịch vụ</span>
                <input
                  value={serviceIdInput}
                  disabled={!!editing}
                  placeholder="Để trống để tự tạo mã"
                  onChange={(e) => setServiceIdInput(e.target.value)}
                />
              </label>
              <label className={`spa-field${fieldErrors.name ? ' has-error' : ''}`}>
                <span>Tên dịch vụ <em>*</em></span>
                <input data-field="name" value={serviceName} placeholder="Chưa nhập" aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'svc-err-name' : undefined}
                  onChange={(e) => { setServiceName(e.target.value); clearField('name'); }} />
                <FieldMessage id="svc-err-name" text={fieldErrors.name} />
              </label>
            </div>
            <div className="booking-form-grid-2">
              <label className={`spa-field${fieldErrors.category ? ' has-error' : ''}`}>
                <span>Danh mục <em>*</em></span>
                <select data-field="category" value={categoryId} aria-invalid={Boolean(fieldErrors.category)} aria-describedby={fieldErrors.category ? 'svc-err-category' : undefined}
                  onChange={(e) => { setCategoryId(e.target.value); clearField('category'); }}>
                  <option value="">Chưa nhập</option>
                  {(query.data?.categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <FieldMessage id="svc-err-category" text={fieldErrors.category} />
              </label>
              <label className="spa-field">
                <span>Trạng thái</span>
                <select
                  value={statusVal}
                  onChange={(e) => setStatusVal(e.target.value as 'Hoạt động' | 'Ngừng hoạt động')}
                >
                  <option value="Hoạt động">Hoạt động</option>
                  <option value="Ngừng hoạt động">Ngừng hoạt động</option>
                </select>
              </label>
            </div>
            <div className="booking-form-grid-2">
              <label className="spa-field">
                <span>Mô tả ngắn</span>
                <input value={shortDesc} placeholder="Chưa có mô tả" onChange={(e) => setShortDesc(e.target.value)} />
              </label>
              <label className="spa-field">
                <span>Mô tả chi tiết</span>
                <input value={details} placeholder="Chưa có mô tả" onChange={(e) => setDetails(e.target.value)} />
              </label>
            </div>
            <div className="booking-form-grid-2">
              <label className={`spa-field${fieldErrors.image ? ' has-error' : ''}`}>
                <span>Hình ảnh</span>
                <input data-field="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImagePick} disabled={uploading} aria-invalid={Boolean(fieldErrors.image)} aria-describedby={fieldErrors.image ? 'svc-err-image' : undefined} />
                <FieldMessage id="svc-err-image" text={fieldErrors.image} />
                {imageUrl ? <img src={resolveApiUrl(imageUrl)} alt="Xem trước hình ảnh" className="svc-image-preview" /> : null}
              </label>
              <label className={`spa-field${fieldErrors.packageName ? ' has-error' : ''}`}>
                <span>Tên gói <em>*</em></span>
                <input data-field="packageName" value={pkgName} placeholder="Chưa nhập" aria-invalid={Boolean(fieldErrors.packageName)} aria-describedby={fieldErrors.packageName ? 'svc-err-package' : undefined}
                  onChange={(e) => { setPkgName(e.target.value); clearField('packageName'); }} />
                <FieldMessage id="svc-err-package" text={fieldErrors.packageName} />
              </label>
            </div>
            <div className="booking-form-grid-2">
              <label className={`spa-field${fieldErrors.duration ? ' has-error' : ''}`}>
                <span>Thời lượng (phút) <em>*</em></span>
                <input data-field="duration" inputMode="numeric" value={pkgDuration} placeholder="Chưa nhập" aria-invalid={Boolean(fieldErrors.duration)} aria-describedby={fieldErrors.duration ? 'svc-err-duration' : undefined}
                  onChange={(e) => { setPkgDuration(e.target.value); clearField('duration'); }} />
                <FieldMessage id="svc-err-duration" text={fieldErrors.duration} />
              </label>
              <label className={`spa-field${fieldErrors.price ? ' has-error' : ''}`}>
                <span>Giá (VNĐ) <em>*</em></span>
                <input data-field="price" inputMode="numeric" value={pkgPrice} placeholder="Chưa nhập" aria-invalid={Boolean(fieldErrors.price)} aria-describedby={fieldErrors.price ? 'svc-err-price' : undefined}
                  onChange={(e) => { setPkgPrice(e.target.value); clearField('price'); }} />
                <FieldMessage id="svc-err-price" text={fieldErrors.price} />
              </label>
            </div>
            <p className="spa-modal-demo-note">
              Ảnh JPG/JPEG/PNG/WEBP · tối đa 5MB · tối thiểu 300×300px. Dữ liệu minh họa.
            </p>
            {saveError && <p role="alert" className="svc-save-error" data-testid="svc-save-error">{saveError}</p>}
          </div>
          <div className="spa-modal-footer">
            <Button type="button" size="sm" variant="outline" onClick={() => formDialog.current?.close()}>Hủy</Button>
            <Button type="submit" size="sm" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Đang lưu…' : editing ? 'Lưu cập nhật' : 'Thêm dịch vụ'}
            </Button>
          </div>
        </form>
      </dialog>

      {/* UC_9.4 Xóa dịch vụ (vô hiệu hóa mềm — chuyển Ngừng hoạt động) */}
      <dialog ref={stopDialog} className="svc-delete-dialog" aria-labelledby="svc-stop-title" onCancel={(e) => { if (stopMutation.isPending) e.preventDefault(); }}>
        <h2 id="svc-stop-title">Xóa dịch vụ</h2>
        {stopTarget && (
          <>
            <p className="svc-delete-line">{stopTarget.id} · {stopTarget.name}</p>
            <p className="svc-delete-line svc-delete-meta">
              Danh mục: {stopTarget.categoryName}
              {stopTarget.packages.length ? ` · ${stopTarget.packages[0].durationMinutes} phút · ${formatVnd(stopTarget.packages[0].price)}` : ''}
            </p>
          </>
        )}
        <p className="svc-delete-question">Bạn có chắc muốn xóa dịch vụ này?</p>
        <p className="svc-delete-note">Dịch vụ sẽ chuyển sang “Ngừng hoạt động”. Lịch sử đặt lịch được giữ nguyên.</p>
        {stopMutation.isError && <p role="alert" className="svc-delete-error" data-testid="svc-delete-error">{stopBlocked ? DELETE_BLOCKED : DELETE_FAILED}</p>}
        <div className="svc-delete-actions">
          <button type="button" className="svc-delete-cancel" disabled={stopMutation.isPending} onClick={() => stopDialog.current?.close()}>Hủy</button>
          {!stopBlocked && (
            <button type="button" className="svc-delete-confirm" disabled={stopMutation.isPending} onClick={() => { if (stoppingRef.current || stopMutation.isPending) return; stoppingRef.current = true; stopMutation.mutate(); }}>
              {stopMutation.isPending ? 'Đang xóa…' : 'Xóa dịch vụ'}
            </button>
          )}
        </div>
      </dialog>
      {notice && <ServiceToast message={notice} onClose={() => setNotice('')} />}
    </ManagementLayout>
  );
}
