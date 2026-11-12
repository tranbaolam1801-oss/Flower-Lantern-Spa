import { useEffect, useRef, useState } from 'react';
import { resolveApiUrl } from '../lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export function AdminServicesPage() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');

  const [editing, setEditing] = useState<AdminServiceItem | null>(null);
  const [detailTarget, setDetailTarget] = useState<AdminServiceItem | null>(null);
  const [stopTarget, setStopTarget] = useState<AdminServiceItem | null>(null);

  const [serviceIdInput, setServiceIdInput] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [categoryId, setCategoryId] = useState('DM01');
  const [statusVal, setStatusVal] = useState<'Hoạt động' | 'Ngừng hoạt động'>('Hoạt động');
  const [shortDesc, setShortDesc] = useState('');
  const [details, setDetails] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pkgName, setPkgName] = useState('Gói tiêu chuẩn 60 phút');
  const [pkgDuration, setPkgDuration] = useState('60');
  const [pkgPrice, setPkgPrice] = useState('350000');
  const [formError, setFormError] = useState('');

  const detailDialog = useRef<HTMLDialogElement>(null);
  const formDialog = useRef<HTMLDialogElement>(null);
  const stopDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [text]);

  const allowed = user?.role === 'Chủ Spa' || user?.permissions.includes('Q04');
  const query = useQuery({
    queryKey: ['admin-services', q, category, statusFilter, page],
    queryFn: () => listAdminServices({ q, category, status: statusFilter, page }),
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
            durationMinutes: Number(pkgDuration),
            price: Number(pkgPrice),
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
    onError: (err: { message?: string }) => {
      setFormError(err?.message ?? 'Có lỗi khi lưu dữ liệu, vui lòng thử lại sau!');
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => stopAdminService(stopTarget!.id),
    onSuccess: async () => {
      stopDialog.current?.close();
      setNotice('Đã chuyển dịch vụ sang Ngừng hoạt động!');
      await cache.invalidateQueries({ queryKey: ['admin-services'] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setServiceIdInput('');
    setServiceName('');
    setCategoryId(query.data?.categories[0]?.id ?? 'DM01');
    setStatusVal('Hoạt động');
    setShortDesc('');
    setDetails('');
    setImageUrl('');
    setPkgName('Gói 60 phút');
    setPkgDuration('60');
    setPkgPrice('350000');
    setFormError('');
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
    setPkgName(svc.packages[0]?.name ?? 'Gói 60 phút');
    setPkgDuration(String(svc.packages[0]?.durationMinutes ?? 60));
    setPkgPrice(String(svc.packages[0]?.price ?? 350000));
    setFormError('');
    formDialog.current?.showModal();
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFormError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) return setFormError('Hình ảnh không hợp lệ!');
    setUploading(true);
    try {
      setImageUrl((await uploadServiceImage(file)).path);
    } catch (err) {
      setFormError((err as { message?: string }).message || 'Hình ảnh không hợp lệ!');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!serviceName.trim()) return setFormError('Vui lòng nhập tên dịch vụ!');
    if (uploading) return setFormError('Đang tải hình ảnh, vui lòng đợi.');
    if (!imageUrl.trim()) return setFormError('Hình ảnh không hợp lệ!');
    if (!pkgName.trim()) return setFormError('Vui lòng nhập tên gói dịch vụ!');
    const dur = Number(pkgDuration);
    const pr = Number(pkgPrice);
    if (!Number.isInteger(dur) || dur <= 0) return setFormError('Thời lượng phải là số nguyên dương!');
    if (!Number.isInteger(pr) || pr <= 0) return setFormError('Giá dịch vụ phải là số nguyên dương!');
    saveMutation.mutate();
  };

  return (
    <ManagementLayout active="Q04">
      <div className="figma-admin-stack" aria-label="Quản lý dịch vụ">
        <h1 className="sr-only">Quản lý dịch vụ</h1>
        {notice && <p role="status" className="spa-toast-success">{notice}</p>}

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
              setPage(1);
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
              setPage(1);
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
          ) : query.isPending ? (
            <p role="status">Đang tải danh sách dịch vụ…</p>
          ) : query.isError ? (
            <div role="alert" className="booking-empty">
              <p>{(query.error as { message?: string })?.message ?? 'Không thể tải danh sách dịch vụ!'}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
                Thử lại
              </Button>
            </div>
          ) : (
            <>
              <div className="customer-search-scroll">
                <table className="customer-search-table figma-admin-table">
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
                    {query.data.items.map((svc) => (
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
              {query.data.items.length === 0 && (
                <p className="customer-search-empty" role="status">
                  Không tìm thấy dịch vụ phù hợp!
                </p>
              )}
              <nav className="customer-search-pagination" aria-label="Phân trang dịch vụ">
                <div className="figma-pagination-pill">
                  <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    ‹ Trước
                  </button>
                  <span className="page-current">{page}</span>
                  <button type="button" disabled={!query.data.hasNext} onClick={() => setPage((p) => p + 1)}>
                    Sau ›
                  </button>
                </div>
              </nav>
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
              <label className="spa-field">
                <span>Tên dịch vụ <em>*</em></span>
                <input value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
              </label>
            </div>
            <div className="booking-form-grid-2">
              <label className="spa-field">
                <span>Danh mục <em>*</em></span>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {(query.data?.categories.length ? query.data.categories : [{ id: 'DM01', name: 'Massage' }]).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
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
                <input value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} />
              </label>
              <label className="spa-field">
                <span>Mô tả chi tiết</span>
                <input value={details} onChange={(e) => setDetails(e.target.value)} />
              </label>
            </div>
            <div className="booking-form-grid-2">
              <label className="spa-field">
                <span>Hình ảnh</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImagePick} disabled={uploading} />
                {imageUrl ? <img src={resolveApiUrl(imageUrl)} alt="Xem trước hình ảnh" className="svc-image-preview" /> : null}
              </label>
              <label className="spa-field">
                <span>Tên gói <em>*</em></span>
                <input value={pkgName} onChange={(e) => setPkgName(e.target.value)} />
              </label>
            </div>
            <div className="booking-form-grid-2">
              <label className="spa-field">
                <span>Thời lượng (phút) <em>*</em></span>
                <input type="number" min={1} value={pkgDuration} onChange={(e) => setPkgDuration(e.target.value)} />
              </label>
              <label className="spa-field">
                <span>Giá (VNĐ) <em>*</em></span>
                <input type="number" min={1000} step={1000} value={pkgPrice} onChange={(e) => setPkgPrice(e.target.value)} />
              </label>
            </div>
            <p className="spa-modal-demo-note">
              Ảnh JPG/JPEG/PNG/WEBP · tối đa 5MB · tối thiểu 300×300px. Dữ liệu minh họa.
            </p>
            {formError && <p role="alert" className="spa-form-error">{formError}</p>}
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
      <dialog ref={stopDialog} className="booking-confirm-dialog" aria-labelledby="svc-stop-title">
        <h2 id="svc-stop-title">Xóa dịch vụ</h2>
        {stopTarget && (
          <p className="emp-lock-identity">
            {stopTarget.id} · {stopTarget.name}
            <br />
            Danh mục: {stopTarget.categoryName}
            {stopTarget.packages.length
              ? ` · ${stopTarget.packages[0].durationMinutes} phút · ${formatVnd(stopTarget.packages[0].price)}`
              : ''}
          </p>
        )}
        <p>Bạn có chắc muốn xóa dịch vụ này?</p>
        <p className="emp-lock-note">
          Dịch vụ sẽ chuyển sang &quot;Ngừng hoạt động&quot;. Lịch sử đặt lịch được giữ nguyên.
        </p>
        {stopMutation.isError && <p role="alert">{(stopMutation.error as { message?: string })?.message}</p>}
        <div>
          <Button type="button" size="sm" variant="outline" onClick={() => stopDialog.current?.close()}>Hủy</Button>
          <Button type="button" size="sm" className="cancel-booking-button" disabled={stopMutation.isPending} onClick={() => stopMutation.mutate()}>
            Xóa dịch vụ
          </Button>
        </div>
      </dialog>
    </ManagementLayout>
  );
}
