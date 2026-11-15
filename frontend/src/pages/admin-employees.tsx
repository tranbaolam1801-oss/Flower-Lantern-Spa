import { useContinuousList, ContinuousListEnd } from '../components/continuous-list';
import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ManagementLayout } from '../components/management-layout';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/auth-context';
import { useDismissable } from '../lib/use-dismissable';
import { isValidVnPhone } from '../lib/phone';
import { NoticeToast, cancelledNotice, errorNotice, successNotice, type NoticeState } from '../components/notice-toast';
import {
  createEmployee,
  getEmployeeDetail,
  listEmployees,
  softDeleteEmployee,
  updateEmployee,
  updateEmployeeAccountStatus,
  updateEmployeePermissions,
  type EmployeeItem,
} from '../lib/management-api';

const ALL_PERMISSIONS = [
  { code: 'Q01', label: 'Quản lý lịch hẹn' },
  { code: 'Q02', label: 'Quản lý khách hàng' },
  { code: 'Q03', label: 'Quản lý đánh giá và phản hồi' },
  { code: 'Q04', label: 'Quản lý dịch vụ' },
  { code: 'Q05', label: 'Quản lý nhân viên' },
  { code: 'Q06', label: 'Xem báo cáo thống kê' },
];

const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const day = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
/** Figma wording: the stored work status "Đang làm việc" is shown as "Đang hoạt động". */
const workLabel = (status: string) => (status === 'Đang làm việc' ? 'Đang hoạt động' : status);
const isNetworkOrServer = (err: unknown) => { const st = (err as { status?: unknown } | null)?.status; return typeof st !== 'number' || st >= 500; };
const PHONE_INVALID = 'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.';

const svgProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const ViewIcon = () => <svg {...svgProps}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>;
const PencilIcon = () => <svg {...svgProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" /></svg>;
const TrashIcon = () => <svg {...svgProps}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>;
const FilterGlyph = () => <svg {...svgProps}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>;
const PersonGlyph = () => <svg {...svgProps} width={24} height={24}><circle cx="12" cy="8" r="4" /><path d="M4.5 21c.7-4 3.5-6 7.5-6s6.8 2 7.5 6" /></svg>;
const STATUS_OPTIONS = [['', 'Tất cả trạng thái'], ['Hoạt động', 'Hoạt động'], ['Đã khóa', 'Đã khóa'], ['Vô hiệu hóa', 'Vô hiệu hóa']] as const;

export function AdminEmployeesPage() {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [toast, setToast] = useState<NoticeState | null>(null);
  const setNotice = (message: string) => setToast(successNotice(message));

  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EmployeeItem | null>(null);
  const [permTarget, setPermTarget] = useState<EmployeeItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeItem | null>(null);
  const [statusTarget, setStatusTarget] = useState<EmployeeItem | null>(null);

  // Form fields
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [formErrorDetail, setFormErrorDetail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Permission modal state
  const [newRole, setNewRole] = useState<'Quản lý' | 'Nhân viên'>('Nhân viên');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const detailDialog = useRef<HTMLDialogElement>(null);
  const formDialog = useRef<HTMLDialogElement>(null);
  const permDialog = useRef<HTMLDialogElement>(null);
  const permConfirmDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const lockDialog = useRef<HTMLDialogElement>(null);

  // UC_8.5 Tìm kiếm nhân viên (modal "Lọc" — khớp Figma 5:9761)
  const [filterOpen, setFilterOpen] = useState(false);
  const filterWrap = useRef<HTMLDivElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const filterPanelId = useId();
  useDismissable({ id: 'employee-filter', open: filterOpen, onClose: () => setFilterOpen(false), containerRef: filterWrap, onEscape: () => filterButton.current?.focus() });

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(text.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  // Backend: role Quản lý + Q05 (Chủ Spa always). A plain 'Nhân viên' with Q05 would get 403, so it must not see the page.
  const allowed = user?.role === 'Chủ Spa' || (user?.role === 'Quản lý' && !!user.permissions.includes('Q05'));
  const isOwner = user?.role === 'Chủ Spa';

  const query = useContinuousList({
    queryKey: ['admin-employees', q, statusFilter],
    queryFn: (page) => listEmployees({ q, status: statusFilter, page }),
    enabled: !!allowed,
  });

  const detailQuery = useQuery({
    queryKey: ['admin-employee-detail', detailId],
    queryFn: () => getEmployeeDetail(detailId!),
    enabled: !!detailId,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (editing) {
        return updateEmployee(editing.id, {
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          gender: gender || undefined,
          birthDate: birthDate || undefined,
          address: address.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      }
      return createEmployee({
        username: username.trim(),
        fullName: fullName.trim(),
        password,
        confirmPassword,
        phone: phone.trim(),
        email: email.trim(),
        gender: gender || undefined,
        birthDate: birthDate || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: async (res) => {
      formDialog.current?.close();
      setNotice(res.message || (editing ? 'Cập nhật thông tin nhân viên thành công!' : 'Thêm nhân viên mới thành công!'));
      await cache.invalidateQueries({ queryKey: ['admin-employees'] });
    },
    onError: (err: { message?: string; fields?: Record<string, string>; conflictWith?: string }) => {
      // Server field errors (409 {field}, 400 {fields}) are shown under the matching input; the banner stays at the TOP of the form.
      const known = ['username', 'fullName', 'password', 'confirmPassword', 'phone', 'email'];
      const mapped: Record<string, string> = Object.fromEntries(Object.entries(err?.fields ?? {}).filter(([field]) => known.includes(field)));
      if (Object.keys(mapped).length) {
        const owner = err.conflictWith;
        if (owner) {
          if (mapped.phone) mapped.phone = `Số điện thoại đã được sử dụng bởi nhân viên ${owner}.`;
          if (mapped.email) mapped.email = `Email đã được sử dụng bởi nhân viên ${owner}.`;
          const what = mapped.phone && mapped.email ? 'Số điện thoại và email' : mapped.phone ? 'Số điện thoại' : 'Email';
          setFormError('Thông tin đã tồn tại trong hệ thống!');
          setFormErrorDetail(`${what} trùng với nhân viên ${owner}. Vui lòng nhập thông tin khác.`);
        } else {
          setFormError('');
          setFormErrorDetail('');
        }
        return setFieldErrors(mapped);
      }
      setFieldErrors({});
      setFormErrorDetail('');
      setFormError(isNetworkOrServer(err)
        ? (editing ? 'Cập nhật thông tin thất bại. Vui lòng thử lại!' : 'Không thể lưu thông tin nhân viên. Vui lòng thử lại!')
        : (err?.message ?? 'Không thể lưu thông tin nhân viên.'));
    },
  });

  const permMutation = useMutation({
    mutationFn: () =>
      updateEmployeePermissions(permTarget!.id, {
        role: newRole,
        permissions: selectedPerms,
      }),
    onSuccess: async () => {
      permDialog.current?.close();
      permConfirmDialog.current?.close();
      setNotice('Phân quyền nhân viên thành công!');
      await cache.invalidateQueries({ queryKey: ['admin-employees'] });
    },
    onError: (err: unknown) => {
      // Figma UC_8.6 8a/5b: the dialogs close and a system toast appears (with "Thử lại" only when retrying can help).
      permDialog.current?.close();
      permConfirmDialog.current?.close();
      setToast(isNetworkOrServer(err)
        ? errorNotice('Không thể cập nhật phân quyền. Vui lòng thử lại!', () => { setToast(null); permMutation.mutate(); })
        : errorNotice('Không thể phân quyền cho tài khoản này!'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => softDeleteEmployee(deleteTarget!.id),
    onSuccess: async () => {
      deleteDialog.current?.close();
      setNotice('Xóa nhân viên thành công!');
      await cache.invalidateQueries({ queryKey: ['admin-employees'] });
    },
  });

  const lockMutation = useMutation({
    mutationFn: () => {
      const nextStatus = statusTarget!.accountStatus === 'Hoạt động' ? 'Đã khóa' : 'Hoạt động';
      return updateEmployeeAccountStatus(statusTarget!.id, nextStatus);
    },
    onSuccess: async (res) => {
      lockDialog.current?.close();
      setNotice(res?.message || 'Cập nhật trạng thái tài khoản thành công!');
      await cache.invalidateQueries({ queryKey: ['admin-employees'] });
    },
    onError: (err: unknown) => {
      // Figma UC_8.7 4b / 5a: system toast; "Thử lại" re-sends the same explicit target status (idempotent).
      lockDialog.current?.close();
      setToast(isNetworkOrServer(err)
        ? errorNotice('Không thể cập nhật trạng thái tài khoản. Vui lòng thử lại!', () => { setToast(null); lockMutation.mutate(); })
        : errorNotice('Không thể thay đổi trạng thái tài khoản này!'));
    },
  });

  const openCreate = () => {
    setEditing(null);
    setUsername('');
    setFullName('');
    setPassword('');
    setConfirmPassword('');
    setPhone('');
    setEmail('');
    setGender('');
    setBirthDate('');
    setAddress('');
    setNotes('');
    setFormError('');
    setFormErrorDetail('');
    setFieldErrors({});
    setShowPassword(false);
    setShowConfirmPassword(false);
    formDialog.current?.showModal();
  };

  const openEdit = (emp: EmployeeItem) => {
    setEditing(emp);
    setUsername(emp.username);
    setFullName(emp.fullName);
    setPhone(emp.phone);
    setEmail(emp.email ?? '');
    setGender(emp.gender ?? '');
    setBirthDate(emp.birthDate ?? '');
    setAddress(emp.address ?? '');
    setNotes(emp.notes ?? '');
    setFormError('');
    setFormErrorDetail('');
    setFieldErrors({});
    formDialog.current?.showModal();
  };

  const openPermissions = (emp: EmployeeItem) => {
    setPermTarget(emp);
    setNewRole(emp.role === 'Quản lý' ? 'Quản lý' : 'Nhân viên');
    setSelectedPerms([...emp.permissions]);
    permDialog.current?.showModal();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormErrorDetail('');
    setFieldErrors({});

    const missing: Record<string, string> = {};
    if (!editing && !username.trim()) missing.username = 'Vui lòng nhập tên đăng nhập.';
    if (!fullName.trim()) missing.fullName = 'Vui lòng nhập họ tên.';
    if (!editing) {
      if (!password) missing.password = 'Vui lòng nhập mật khẩu.';
      if (!confirmPassword) missing.confirmPassword = 'Vui lòng xác nhận mật khẩu.';
    }
    if (!phone.trim()) missing.phone = 'Vui lòng nhập số điện thoại.';
    if (!email.trim()) missing.email = 'Vui lòng nhập email.';
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      return setFormError('Vui lòng nhập đầy đủ các thông tin bắt buộc!');
    }

    if (!editing) {
      if (!PASSWORD_POLICY.test(password)) {
        return setFieldErrors({ password: 'Mật khẩu không đáp ứng yêu cầu bảo mật (tối thiểu 8 ký tự gồm chữ hoa, thường, số và ký tự đặc biệt).' });
      }
      if (password !== confirmPassword) {
        return setFieldErrors({ confirmPassword: 'Mật khẩu xác nhận không khớp!' });
      }
    }
    if (!isValidVnPhone(phone)) {
      return setFieldErrors({ phone: PHONE_INVALID });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setFieldErrors({ email: 'Email không hợp lệ!' });
    }
    saveMutation.mutate();
  };

  return (
    <ManagementLayout active="Q05">
      <div className="employee-management emp-page" aria-label="Quản lý nhân viên">
        {toast && <NoticeToast notice={toast} onClose={() => setToast(null)} retrying={permMutation.isPending || lockMutation.isPending} />}

        <div className="emp-toolbar">
          <label className="emp-search">
            <img src="/assets/customer-imgGroup.svg" alt="" />
            <input
              aria-label="Tìm theo họ tên, tên đăng nhập hoặc số điện thoại"
              placeholder="Tìm theo họ tên, tên đăng nhập hoặc số điện thoại..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="emp-filter-wrap" ref={filterWrap}>
            <button type="button" ref={filterButton} className="emp-toolbar-btn emp-filter-btn" aria-haspopup="dialog" aria-controls={filterPanelId} aria-expanded={filterOpen} onClick={() => setFilterOpen((o) => !o)}>
              <FilterGlyph />
              <span>{statusFilter ? `Trạng thái: ${statusFilter}` : 'Bộ lọc'}</span>
            </button>
            {filterOpen && (
              <div className="customer-filter-popover emp-filter-popover" id={filterPanelId} role="dialog" aria-label="Lọc theo trạng thái tài khoản">
                {STATUS_OPTIONS.map(([value, label]) => (
                  <button key={value || 'all'} type="button" className={statusFilter === value ? 'active' : undefined} onClick={() => { setStatusFilter(value); setFilterOpen(false); }}>{label}</button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="emp-toolbar-btn emp-add-btn" onClick={openCreate}>+ Thêm mới</button>
        </div>

        <section className="emp-card" aria-labelledby="emp-list-title">
          <header className="emp-card-head">
            <span className="emp-card-icon"><PersonGlyph /></span>
            <h1 id="emp-list-title">Danh sách nhân viên</h1>
          </header>

        {!allowed ? (
          <p role="alert">Bạn không có quyền quản lý nhân viên.</p>
        ) : query.isPending ? (
          <p role="status">Đang tải danh sách nhân viên…</p>
        ) : query.isError ? (
          <div role="alert" className="review-state-error">
            <p>Không thể tìm kiếm nhân viên. Vui lòng thử lại!</p>
            <Button type="button" variant="outline" onClick={() => void query.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : (
          <>
            <div className="customer-search-scroll emp-scroll">
              <table className="customer-search-table admin-employee-table">
                <thead>
                  <tr>
                    <th>Mã NV</th>
                    <th>Tên đăng nhập</th>
                    <th>Họ tên</th>
                    <th>Điện thoại</th>
                    <th>Email</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {(query.data?.items ?? []).map((emp) => (
                    <tr key={emp.id}>
                      <td>{emp.id}</td>
                      <td><strong>{emp.username}</strong></td>
                      <td><strong>{emp.fullName}</strong></td>
                      <td>{emp.phone}</td>
                      <td><span className="admin-table-email" title={emp.email || undefined}>{emp.email || '—'}</span></td>
                      <td>
                        <span className={`pill-status ${emp.accountStatus === 'Hoạt động' ? 'pill-ok' : 'pill-warn'}`}>
                          {emp.accountStatus}
                        </span>
                      </td>
                      <td>
                        <div className="figma-row-actions emp-actions">
                          {(() => {
                            const isOwnerRow = emp.role === 'Chủ Spa';
                            const isSelf = Boolean(emp.accountId) && emp.accountId === user?.id;
                            const lockable = emp.accountStatus === 'Hoạt động' || emp.accountStatus === 'Đã khóa' || (emp.accountStatus === 'Vô hiệu hóa' && !!emp.accountId);
                            const canEdit = !isOwnerRow;
                            const canDelete = !isOwnerRow && !isSelf && emp.accountStatus !== 'Vô hiệu hóa';
                            // Chủ Spa: everyone. Quản lý (Q05): only Nhân viên rows (same rule as the backend).
                            const canPerm = !isOwnerRow && !isSelf && (isOwner || emp.role !== 'Quản lý');
                            const canLock = !isOwnerRow && !isSelf && lockable;
                            const locked = emp.accountStatus !== 'Hoạt động';
                            const why = (ok: boolean, text: string) => (ok ? text : `${text} (không khả dụng)`);
                            return (
                              <>
                                <button type="button" className="emp-icon-btn emp-icon-view" aria-label={`Xem nhân viên ${emp.fullName}`} title="Xem chi tiết"
                                  onClick={() => { setDetailId(emp.id); detailDialog.current?.showModal(); }}><ViewIcon /></button>
                                <button type="button" className="emp-icon-btn emp-icon-edit" disabled={!canEdit} aria-label={`Sửa nhân viên ${emp.fullName}`} title={why(canEdit, 'Sửa thông tin')}
                                  onClick={() => openEdit(emp)}><PencilIcon /></button>
                                <button type="button" className="emp-icon-btn emp-icon-delete" disabled={!canDelete} aria-label={`Xóa nhân viên ${emp.fullName}`} title={why(canDelete, 'Vô hiệu hóa')}
                                  onClick={() => { setDeleteTarget(emp); deleteMutation.reset(); deleteDialog.current?.showModal(); }}><TrashIcon /></button>
                                <button type="button" className="emp-text-btn" disabled={!canPerm} title={why(canPerm, 'Phân quyền')} onClick={() => openPermissions(emp)}>Phân quyền</button>
                                <button type="button" className="emp-text-btn emp-lock-btn" disabled={!canLock} title={why(canLock, locked ? 'Mở khóa tài khoản' : 'Khóa tài khoản')}
                                  onClick={() => { setStatusTarget(emp); lockMutation.reset(); lockDialog.current?.showModal(); }}>{locked ? 'Mở khóa' : 'Khóa'}</button>
                              </>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(query.data?.items.length ?? 0) === 0 && (
              <p className="customer-search-empty" role="status">
                Không có kết quả phù hợp
              </p>
            )}
            <ContinuousListEnd query={query}/>
          </>
        )}
        </section>
      </div>

      {/* UC_8.1 Chi tiết nhân viên */}
      <dialog ref={detailDialog} className="spa-drawer-right" aria-labelledby="emp-detail-title">
        <div className="spa-modal-header">
          <h2 id="emp-detail-title">Chi tiết nhân viên</h2>
          <button type="button" className="spa-modal-close" aria-label="Đóng" onClick={() => detailDialog.current?.close()}>×</button>
        </div>
        <div className="spa-modal-body">
          {detailQuery.isPending ? (
            <p role="status">Đang tải…</p>
          ) : detailQuery.isError ? (
            <p role="alert" className="spa-form-error">
              {(detailQuery.error as { status?: number })?.status === 404
                ? 'Không tìm thấy thông tin nhân viên!'
                : 'Không thể tải thông tin nhân viên. Vui lòng thử lại!'}
            </p>
          ) : detailQuery.data ? (
            <>
              <div className="emp-identity-card emp-identity-stacked">
                <strong>{detailQuery.data.fullName}</strong>
                <span className={`pill-status ${detailQuery.data.workStatus === 'Đang làm việc' ? 'pill-ok' : 'pill-warn'}`}>
                  {workLabel(detailQuery.data.workStatus)}
                </span>
              </div>
              <h3 className="emp-detail-section-title">Thông tin cơ bản</h3>
              <dl className="emp-detail-grid">
                <div><dt>Mã nhân viên</dt><dd>{detailQuery.data.id}</dd></div>
                <div><dt>Tên đăng nhập</dt><dd>{detailQuery.data.username}</dd></div>
                <div><dt>Họ tên</dt><dd>{detailQuery.data.fullName}</dd></div>
                <div><dt>Số điện thoại</dt><dd>{detailQuery.data.phone}</dd></div>
                <div className="emp-detail-grid-full"><dt>Email</dt><dd>{detailQuery.data.email || '—'}</dd></div>
                <div><dt>Giới tính</dt><dd>{detailQuery.data.gender || '—'}</dd></div>
                <div><dt>Ngày sinh</dt><dd>{detailQuery.data.birthDate ? day(detailQuery.data.birthDate) : '—'}</dd></div>
                <div className="emp-detail-grid-full"><dt>Địa chỉ</dt><dd>{detailQuery.data.address || '—'}</dd></div>
                <div className="emp-detail-grid-full"><dt>Ghi chú</dt><dd>{detailQuery.data.notes || '—'}</dd></div>
                <div className="emp-detail-grid-full">
                  <dt>Trạng thái làm việc</dt>
                  <dd>
                    <span className={`pill-status ${detailQuery.data.workStatus === 'Đang làm việc' ? 'pill-ok' : 'pill-warn'}`}>
                      {workLabel(detailQuery.data.workStatus)}
                    </span>
                  </dd>
                </div>
              </dl>
            </>
          ) : null}
        </div>
        <div className="spa-modal-footer">
          <Button type="button" onClick={() => detailDialog.current?.close()}>Đóng</Button>
        </div>
      </dialog>

      {/* UC_8.2 / UC_8.3 Thêm / Sửa nhân viên */}
      <dialog ref={formDialog} className="spa-modal spa-modal-lg" aria-labelledby="emp-form-title">
        <div className="spa-modal-header">
          <h2 id="emp-form-title">{editing ? 'Cập nhật nhân viên' : 'Thêm nhân viên mới'}</h2>
          <button type="button" className="spa-modal-close" onClick={() => formDialog.current?.close()}>×</button>
        </div>
        <form onSubmit={handleSave} noValidate>
          <div className="spa-modal-body">
            {editing && (
              <div className="emp-identity-card">
                <div className="emp-identity-top">
                  <strong>{editing.fullName}</strong>
                  <span className={`pill-status ${editing.workStatus === 'Đang làm việc' ? 'pill-ok' : 'pill-warn'}`}>
                    {workLabel(editing.workStatus)}
                  </span>
                </div>
              </div>
            )}
            {formError && (
              <div role="alert" className={`emp-form-banner${formErrorDetail ? ' has-detail' : ''}`} data-testid="emp-form-banner">
                <span className="emp-banner-icon" aria-hidden="true">!</span>
                <div className="emp-banner-text"><strong>{formError}</strong>{formErrorDetail && <small>{formErrorDetail}</small>}</div>
                {formErrorDetail && <button type="button" className="emp-banner-close" aria-label="Đóng thông báo" onClick={() => { setFormError(''); setFormErrorDetail(''); }}>×</button>}
              </div>
            )}
            <p className="spa-modal-demo-note">{editing ? 'Các trường có dấu * là bắt buộc.' : '* Thông tin bắt buộc'}</p>
            {editing && (
              <div className="booking-form-grid-2">
                <label className="spa-field">
                  <span>Mã nhân viên</span>
                  <input value={editing.id} disabled />
                </label>
                <label className="spa-field">
                  <span>Tên đăng nhập</span>
                  <input value={username} disabled />
                </label>
              </div>
            )}
            <div className="booking-form-grid-2">
              {!editing && (
                <label className={`spa-field${fieldErrors.username ? ' spa-field-invalid' : ''}`}>
                  <span>Tên đăng nhập <em>*</em></span>
                  <input value={username} onChange={(e) => { setUsername(e.target.value); setFieldErrors((prev) => ({ ...prev, username: '' })); }} />
                  {fieldErrors.username && <p role="alert" className="spa-field-error-text">{fieldErrors.username}</p>}
                </label>
              )}
              <label className={`spa-field${fieldErrors.fullName ? ' spa-field-invalid' : ''}`}>
                <span>Họ tên <em>*</em></span>
                <input value={fullName} onChange={(e) => { setFullName(e.target.value); setFieldErrors((prev) => ({ ...prev, fullName: '' })); }} />
                {fieldErrors.fullName && <p role="alert" className="spa-field-error-text">{fieldErrors.fullName}</p>}
              </label>
              {editing && (
              <label className={`spa-field${fieldErrors.phone ? ' spa-field-invalid' : ''}`}>
                <span>Số điện thoại <em>*</em></span>
                <input value={phone} onChange={(e) => { setPhone(e.target.value); setFieldErrors((prev) => ({ ...prev, phone: '' })); }} />
                {fieldErrors.phone && <p role="alert" className="spa-field-error-text">{fieldErrors.phone}</p>}
              </label>
              )}
            </div>
            {!editing && (
              <div className="booking-form-grid-2">
                <label className={`spa-field${fieldErrors.password ? ' spa-field-invalid' : ''}`}>
                  <span>Mật khẩu <em>*</em></span>
                  <span className="spa-password-input">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, password: '' })); }}
                    />
                    <button
                      type="button"
                      className="spa-password-toggle"
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? '🙈' : '👁'}
                    </button>
                  </span>
                  {fieldErrors.password && <p role="alert" className="spa-field-error-text">{fieldErrors.password}</p>}
                </label>
                <label className={`spa-field${fieldErrors.confirmPassword ? ' spa-field-invalid' : ''}`}>
                  <span>Xác nhận mật khẩu <em>*</em></span>
                  <span className="spa-password-input">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, confirmPassword: '' })); }}
                    />
                    <button
                      type="button"
                      className="spa-password-toggle"
                      aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      aria-pressed={showConfirmPassword}
                      onClick={() => setShowConfirmPassword((v) => !v)}
                    >
                      {showConfirmPassword ? '🙈' : '👁'}
                    </button>
                  </span>
                  {fieldErrors.confirmPassword && <p role="alert" className="spa-field-error-text">{fieldErrors.confirmPassword}</p>}
                </label>
              </div>
            )}
            <div className="booking-form-grid-2">
              {!editing && (
              <label className={`spa-field${fieldErrors.phone ? ' spa-field-invalid' : ''}`}>
                <span>Số điện thoại <em>*</em></span>
                <input value={phone} onChange={(e) => { setPhone(e.target.value); setFieldErrors((prev) => ({ ...prev, phone: '' })); }} />
                {fieldErrors.phone && <p role="alert" className="spa-field-error-text">{fieldErrors.phone}</p>}
              </label>
              )}
              <label className={`spa-field${fieldErrors.email ? ' spa-field-invalid' : ''}`}>
                <span>Email <em>*</em></span>
                <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setFieldErrors((prev) => ({ ...prev, email: '' })); }} />
                {fieldErrors.email && <p role="alert" className="spa-field-error-text">{fieldErrors.email}</p>}
              </label>
              {editing && (
              <label className="spa-field">
                <span>Trạng thái <em>*</em></span>
                <select value={editing?.accountStatus ?? 'Hoạt động'} disabled aria-readonly="true">
                  <option>{editing?.accountStatus ?? 'Hoạt động'}</option>
                </select>
              </label>
              )}
            </div>
            <div className="booking-form-grid-2">
              <label className="spa-field">
                <span>Giới tính</span>
                <select value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">Chọn giới tính</option>
                  <option value="Nam">Nam</option>
                  <option value="Nữ">Nữ</option>
                  <option value="Khác">Khác</option>
                </select>
              </label>
              <label className="spa-field">
                <span>Ngày sinh</span>
                <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </label>
            </div>
            <label className="spa-field">
              <span>Địa chỉ</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </label>
            <label className="spa-field">
              <span>Ghi chú</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
          <div className="spa-modal-footer">
            <Button type="button" variant="outline" onClick={() => formDialog.current?.close()}>Hủy</Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Đang lưu…' : editing ? 'Cập nhật' : 'Lưu'}
            </Button>
          </div>
        </form>
      </dialog>

      {/* UC_8.6 Phân quyền nhân viên — Figma 6:13745 (form) / 6:13858 (xác nhận) */}
      <dialog ref={permDialog} className="emp-perm-dialog" aria-labelledby="emp-perm-title">
        <div className="emp-perm-head">
          <h2 id="emp-perm-title">Phân quyền nhân viên</h2>
          <button type="button" className="emp-perm-close" aria-label="Đóng" onClick={() => { permDialog.current?.close(); setToast(cancelledNotice()); }}>×</button>
        </div>
        {permTarget && (
          <div className="emp-perm-body">
            <div className="emp-perm-card">
              <div className="emp-perm-card-top">
                <strong>{permTarget.id} · {permTarget.fullName}</strong>
                <span className={`pill-status ${permTarget.accountStatus === 'Hoạt động' ? 'pill-ok' : 'pill-warn'}`}>{permTarget.accountStatus}</span>
              </div>
              <div className="emp-perm-card-meta">
                <div><small>Tên đăng nhập</small><strong>{permTarget.username}</strong></div>
                <div><small>Điện thoại</small><strong>{permTarget.phone}</strong></div>
                <div><small>Vai trò hiện tại</small><strong>{permTarget.role}</strong></div>
              </div>
            </div>
            <label className="spa-field">
              <span>Vai trò mới <em>*</em></span>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as 'Quản lý' | 'Nhân viên')}>
                <option value="Nhân viên">Nhân viên</option>
                {isOwner && <option value="Quản lý">Quản lý</option>}
              </select>
            </label>
            <p className="emp-perm-hint">{isOwner ? 'Vai trò có thể chọn: Nhân viên hoặc Quản lý.' : 'Quản lý chỉ có thể gán vai trò Nhân viên.'}</p>
            <div className="emp-perm-list">
              <strong>Quyền truy cập</strong>
              {ALL_PERMISSIONS.map((p) => (
                <label key={p.code} className="emp-perm-check">
                  <input
                    type="checkbox"
                    checked={selectedPerms.includes(p.code)}
                    disabled={!isOwner && !user?.permissions.includes(p.code)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedPerms((prev) => [...prev, p.code]);
                      else setSelectedPerms((prev) => prev.filter((x) => x !== p.code));
                    }}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
            <p className="emp-perm-note">{isOwner ? 'Chỉ Chủ Spa được thay đổi vai trò và quyền truy cập.' : 'Quản lý chỉ cấp được những quyền mà mình đang có.'} Thay đổi chỉ có hiệu lực sau khi xác nhận lưu.</p>
          </div>
        )}
        <div className="emp-perm-foot emp-perm-foot-split">
          <button type="button" className="emp-btn-outline" onClick={() => { permDialog.current?.close(); setToast(cancelledNotice()); }}>Hủy</button>
          <button type="button" className="emp-btn-primary" onClick={() => { permDialog.current?.close(); permConfirmDialog.current?.showModal(); }}>Lưu phân quyền</button>
        </div>
      </dialog>

      <dialog ref={permConfirmDialog} className="emp-perm-dialog emp-confirm-dialog" aria-labelledby="emp-perm-confirm-title">
        {permTarget && (
          <>
            <div className="emp-confirm-body">
              <div className="emp-confirm-title">
                <span className="emp-confirm-icon" aria-hidden="true"><img src="/assets/uc8-alert-circle.svg" alt="" /></span>
                <h2 id="emp-perm-confirm-title">Xác nhận phân quyền</h2>
              </div>
              <p className="emp-confirm-subject">{permTarget.id} · {permTarget.fullName}</p>
              <div className="emp-confirm-transition">
                <div><small>Vai trò hiện tại</small><strong>{permTarget.role}</strong></div>
                <img className="emp-confirm-arrow" src="/assets/uc8-arrow-right.svg" alt="" aria-hidden="true" />
                <div><small>Vai trò mới</small><strong>{newRole}</strong></div>
              </div>
              <div className="emp-confirm-summary">
                <strong>Quyền sau khi lưu</strong>
                <p>Được cấp: {ALL_PERMISSIONS.filter((p) => selectedPerms.includes(p.code)).map((p) => p.label).join(', ') || '—'}</p>
                <p className="emp-confirm-denied">Không cấp: {ALL_PERMISSIONS.filter((p) => !selectedPerms.includes(p.code)).map((p) => p.label).join(', ') || '—'}</p>
              </div>
              <p className="emp-confirm-note">Bạn có chắc chắn muốn lưu phân quyền? Khi lưu thành công, lịch sử sẽ ghi nhận Chủ Spa, thời điểm và nội dung thay đổi.</p>
            </div>
            <div className="emp-perm-foot emp-perm-foot-split">
              <button type="button" className="emp-btn-outline" onClick={() => { permConfirmDialog.current?.close(); permDialog.current?.showModal(); }}>Quay lại</button>
              <button type="button" className="emp-btn-primary" disabled={permMutation.isPending} onClick={() => { if (!permMutation.isPending) permMutation.mutate(); }}>
                {permMutation.isPending ? 'Đang lưu…' : 'Xác nhận lưu'}
              </button>
            </div>
          </>
        )}
      </dialog>

      {/* UC_8.4 Xóa mềm */}
      <dialog ref={deleteDialog} className="spa-modal spa-modal-tinted" aria-labelledby="emp-del-title">
        <div className="spa-modal-header">
          <h2 id="emp-del-title">Xóa nhân viên</h2>
          <button type="button" className="spa-modal-close" onClick={() => deleteDialog.current?.close()}>×</button>
        </div>
        <div className="spa-modal-body">
          <p>Bạn có chắc chắn muốn xóa nhân viên này không?</p>
          {deleteTarget && (
            <div className="emp-identity-meta">
              <div><small>Tên đăng nhập</small><strong>{deleteTarget.username}</strong></div>
              <div><small>Họ và tên</small><strong>{deleteTarget.fullName}</strong></div>
              <div><small>Số điện thoại</small><strong>{deleteTarget.phone}</strong></div>
              <div><small>Email</small><strong>{deleteTarget.email || '—'}</strong></div>
              <div><small>Trạng thái</small><strong>{deleteTarget.accountStatus}</strong></div>
            </div>
          )}
          {deleteMutation.isError && (
            <p role="alert" className="spa-form-error">
              ⚠ {(deleteMutation.error as { message?: string })?.message ?? 'Không thể xóa nhân viên. Vui lòng thử lại!'}
            </p>
          )}
        </div>
        <div className="spa-modal-footer">
          <Button type="button" size="sm" variant="outline" onClick={() => { deleteDialog.current?.close(); setToast(cancelledNotice()); }}>Hủy</Button>
          <Button type="button" size="sm" disabled={deleteMutation.isPending} onClick={() => { if (!deleteMutation.isPending) deleteMutation.mutate(); }}>
            Xác nhận xóa
          </Button>
        </div>
      </dialog>

      {/* UC_8.7 Khóa / Mở khóa — Figma 5:24733 / 5:24613 */}
      <dialog ref={lockDialog} className="emp-perm-dialog emp-confirm-dialog emp-lock-dialog" aria-labelledby="emp-lock-title">
        {statusTarget && (
          <>
            <div className="emp-confirm-body">
              <div className="emp-confirm-title">
                <span className="emp-confirm-icon" aria-hidden="true"><img src="/assets/uc8-alert-circle.svg" alt="" /></span>
                <h2 id="emp-lock-title">{statusTarget.accountStatus === 'Hoạt động' ? 'Xác nhận khóa tài khoản' : 'Xác nhận mở khóa tài khoản'}</h2>
              </div>
              <p className="emp-confirm-subject">{statusTarget.id} · {statusTarget.fullName} · {statusTarget.username} · {statusTarget.phone}</p>
              <div className="emp-confirm-transition">
                <div><small>Trạng thái hiện tại</small><strong>{statusTarget.accountStatus === 'Hoạt động' ? 'Hoạt động' : 'Đã khóa'}</strong></div>
                <img className="emp-confirm-arrow" src="/assets/uc8-arrow-right.svg" alt="" aria-hidden="true" />
                <div><small>Trạng thái sau xác nhận</small><strong>{statusTarget.accountStatus === 'Hoạt động' ? 'Đã khóa' : 'Hoạt động'}</strong></div>
              </div>
              <p className="emp-confirm-note emp-lock-question">
                Bạn chắc chắn muốn {statusTarget.accountStatus === 'Hoạt động' ? 'khóa' : 'mở khóa'} tài khoản nhân viên này?
                {statusTarget.accountStatus !== 'Hoạt động' && <><br />Hệ thống kiểm tra quyền thao tác và trạng thái hiện tại khi xác nhận.</>}
              </p>
            </div>
            <div className="emp-perm-foot">
              <button type="button" className="emp-btn-outline" onClick={() => { lockDialog.current?.close(); setToast(cancelledNotice()); }}>Hủy</button>
              <button type="button" className="emp-btn-primary" disabled={lockMutation.isPending} onClick={() => { if (!lockMutation.isPending) lockMutation.mutate(); }}>
                {lockMutation.isPending ? 'Đang xử lý…' : 'Xác nhận'}
              </button>
            </div>
          </>
        )}
      </dialog>
    </ManagementLayout>
  );
}
