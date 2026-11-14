import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/auth-context';
import { CustomerHeader } from '../components/customer-header';
import { PublicFooter } from '../components/public-footer';
import { ManagementLayout } from '../components/management-layout';
import {
  AVATAR_MAX_BYTES, AVATAR_TYPES, profileKey, updateProfile, uploadAvatar, useProfile, type ProfileData, type ProfileInput,
} from '../lib/profile-api';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const dateVn = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const errorMessage = (error: unknown, fallback: string) => {
  const e = error as { status?: number; message?: string } | undefined;
  // 4xx and our own controlled 503 carry a safe Vietnamese message; anything else (network, 500) gets the generic text.
  return e?.status && (e.status < 500 || e.status === 503) && e.message && /[À-ỹ]/.test(e.message) ? e.message : fallback;
};

interface FormState { fullName: string; email: string; gender: string; birthDate: string; address: string }
const toForm = (p: ProfileData): FormState => ({ fullName: p.fullName, email: p.email ?? '', gender: p.gender ?? '', birthDate: p.birthDate ?? '', address: p.address ?? '' });

function validate(form: FormState, p: ProfileData) {
  const errors: Partial<Record<keyof FormState, string>> = {};
  const name = form.fullName.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 50) errors.fullName = 'Họ và tên phải từ 2 đến 50 ký tự!';
  if (p.editable.email && form.email.trim() && (!EMAIL_PATTERN.test(form.email.trim()) || form.email.trim().length > 100)) errors.email = 'Email không hợp lệ!';
  if (form.birthDate && form.birthDate >= todayIso()) errors.birthDate = 'Ngày sinh không hợp lệ!';
  if (form.address.length > 255) errors.address = 'Địa chỉ tối đa 255 ký tự!';
  return errors;
}

function ProfileBody({ profile }: { profile: ProfileData }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const customer = profile.role === 'Khách hàng';
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => toForm(profile));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pick, setPick] = useState<{ file: File; url: string } | null>(null);
  const [broken, setBroken] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const key = profileKey(user?.id);

  useEffect(() => () => { if (pick) URL.revokeObjectURL(pick.url); }, [pick]);

  const save = useMutation({
    mutationFn: (input: ProfileInput) => updateProfile(input),
    onSuccess: (next) => { client.setQueryData(key, next); void client.invalidateQueries({ queryKey: ['auth', 'me'], exact: true }); setEditing(false); setNotice({ kind: 'ok', text: 'Cập nhật thông tin thành công!' }); },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error, 'Không thể cập nhật thông tin. Vui lòng thử lại!') }),
    onSettled: () => { saving.current = false; },
  });
  const avatar = useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: (avatarUrl) => { client.setQueryData<ProfileData>(key, (old) => (old ? { ...old, avatarUrl } : old)); void client.invalidateQueries({ queryKey: key }); setBroken(false); setPick(null); setNotice({ kind: 'ok', text: 'Cập nhật ảnh đại diện thành công!' }); },
    onError: (error) => setNotice({ kind: 'error', text: errorMessage(error, 'Không thể lưu ảnh đại diện. Vui lòng thử lại!') }),
  });

  function startEdit() { setForm(toForm(profile)); setErrors({}); setNotice(null); setEditing(true); }
  function cancelEdit() { setEditing(false); setErrors({}); setForm(toForm(profile)); setNotice(null); }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    const found = validate(form, profile);
    setErrors(found);
    if (Object.keys(found).length) return;
    const input: ProfileInput = { fullName: form.fullName.trim().replace(/\s+/g, ' '), gender: form.gender || null, birthDate: form.birthDate || null, address: form.address.trim() || null };
    if (profile.editable.email) input.email = form.email.trim() || null;
    saving.current = true; setNotice(null);
    save.mutate(input);
  }

  function choose(file: File | undefined) {
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) { setNotice({ kind: 'error', text: 'Ảnh đại diện chỉ hỗ trợ định dạng JPG, PNG hoặc WebP!' }); return; }
    if (file.size > AVATAR_MAX_BYTES) { setNotice({ kind: 'error', text: 'Ảnh đại diện tối đa 2MB!' }); return; }
    setNotice(null); setPick({ file, url: URL.createObjectURL(file) });
  }

  const shown = pick?.url ?? (profile.avatarUrl && !broken ? profile.avatarUrl : null);
  const fallback = customer ? '/assets/customer-imgGroup1.svg' : '/assets/admin-imgAdminAvatar.png';
  const set = (field: keyof FormState) => (value: string) => setForm((old) => ({ ...old, [field]: value }));

  return <section className="profile-card" aria-labelledby="profile-title">
    <h1 id="profile-title">Thông tin cá nhân</h1>
    {notice && <p className={`profile-notice profile-notice-${notice.kind}`} role={notice.kind === 'ok' ? 'status' : 'alert'}>{notice.text}</p>}
    <div className="profile-hero">
      <button type="button" className="profile-avatar-button" aria-label="Thay đổi ảnh đại diện" disabled={avatar.isPending} onClick={() => fileInput.current?.click()}>
        <img src={shown ?? fallback} alt="Ảnh đại diện" onError={() => setBroken(true)} />
        <span className="profile-camera" aria-hidden="true">📷</span>
      </button>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden data-testid="avatar-input" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="profile-hero-text">
        <strong>{profile.fullName}</strong>
        {pick
          ? <div className="profile-avatar-actions">
            <button type="button" className="profile-primary" disabled={avatar.isPending} onClick={() => avatar.mutate(pick.file)}>{avatar.isPending ? 'Đang lưu…' : 'Lưu ảnh'}</button>
            <button type="button" className="profile-secondary" disabled={avatar.isPending} onClick={() => { setPick(null); setNotice(null); }}>Hủy</button>
          </div>
          : <button type="button" className="profile-link-button" disabled={avatar.isPending} onClick={() => fileInput.current?.click()}>Thay đổi ảnh</button>}
        <small>JPG, PNG, WebP · tối đa 2MB</small>
      </div>
    </div>
    <form className="profile-grid" onSubmit={submit} noValidate>
      <Field label="Họ và tên" id="pf-name" editing={editing && profile.editable.fullName} value={form.fullName} shown={profile.fullName} error={errors.fullName} onChange={set('fullName')} maxLength={50} />
      <div className="profile-field">
        <label htmlFor="pf-phone">Số điện thoại</label>
        <p id="pf-phone" className="profile-locked">{profile.phone}</p>
      </div>
      <Field label="Email" id="pf-email" type="email" editing={editing && profile.editable.email} value={form.email} shown={profile.email ?? 'Chưa cập nhật'} error={errors.email} onChange={set('email')} maxLength={100} />
      <Field label="Ngày sinh" id="pf-birth" type="date" editing={editing && profile.editable.birthDate} value={form.birthDate} shown={profile.birthDate ? dateVn(profile.birthDate) : 'Chưa cập nhật'} error={errors.birthDate} onChange={set('birthDate')} max={todayIso()} />
      <div className="profile-field">
        <label htmlFor="pf-gender">Giới tính</label>
        {editing && profile.editable.gender
          ? <select id="pf-gender" value={form.gender} onChange={(e) => set('gender')(e.target.value)}><option value="">Chưa chọn</option><option>Nam</option><option>Nữ</option><option>Khác</option></select>
          : <p>{profile.gender ?? 'Chưa cập nhật'}</p>}
      </div>
      <Field label="Địa chỉ" id="pf-address" editing={editing && profile.editable.address} value={form.address} shown={profile.address ?? 'Chưa cập nhật'} error={errors.address} onChange={set('address')} maxLength={255} />
      <div className="profile-actions">
        {editing
          ? <><button type="button" className="profile-secondary" onClick={cancelEdit} disabled={save.isPending}>Hủy</button>
            <button type="submit" className="profile-primary" disabled={save.isPending}>{save.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}</button></>
          : <button type="button" className="profile-primary" onClick={startEdit} disabled={!profile.editable.fullName}>Chỉnh sửa thông tin</button>}
      </div>
    </form>
  </section>;
}

function Field({ label, id, editing, value, shown, error, onChange, type = 'text', maxLength, max, hint }: {
  label: string; id: string; editing: boolean; value: string; shown: string; error?: string; onChange: (v: string) => void; type?: string; maxLength?: number; max?: string; hint?: string;
}) {
  return <div className="profile-field">
    <label htmlFor={id}>{label}</label>
    {editing
      ? <><input id={id} type={type} value={value} maxLength={maxLength} max={max} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : undefined} />
        {error && <span id={`${id}-err`} className="profile-error" role="alert">{error}</span>}</>
      : <><p>{shown}</p>{hint && <small>{hint}</small>}</>}
  </div>;
}

export function ProfilePage() {
  const { user } = useAuth();
  const profile = useProfile();
  const customer = user?.role === 'Khách hàng';
  const content = profile.isPending ? <p role="status">Đang tải thông tin…</p>
    : profile.isError || !profile.data ? <p role="alert">Không thể tải thông tin cá nhân. <button type="button" onClick={() => void profile.refetch()}>Thử lại</button></p>
    : <ProfileBody key={profile.data.id} profile={profile.data} />;
  if (customer) return <div className="customer-shell"><CustomerHeader /><main className="profile-page">{content}</main><PublicFooter compact /></div>;
  return <ManagementLayout active="profile"><div className="profile-page">{content}</div></ManagementLayout>;
}
