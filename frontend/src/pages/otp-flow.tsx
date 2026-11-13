import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router';
import { Button } from '../components/ui/button';
import { BrandLogo } from '../components/brand-logo';
import { isValidVnPhone, normalizeVnPhone } from '../lib/phone';
import {
  registerCustomer,
  requestOtp,
  resetPassword,
  verifyOtp,
  type OtpHttpError,
  type OtpPurpose,
} from '../lib/otp-api';

type Step = 'phone' | 'code' | 'details' | 'done';

const GENERIC_SENT = 'Nếu số điện thoại hợp lệ, mã xác thực đã được gửi.';
const SEND_FAILED = 'Không thể gửi mã xác thực. Vui lòng thử lại sau!';
const NETWORK = 'Không thể kết nối hệ thống. Vui lòng thử lại!';
const PASSWORD_POLICY = 'Mật khẩu tối thiểu 8 ký tự, gồm chữ và số.';

const Icon = ({ name }: { name: string }) => <img src={`/assets/${name}.svg`} alt="" />;

const passwordRule = z
  .string()
  .min(1, 'Không được để trống!')
  .refine((v) => v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v), PASSWORD_POLICY);

const registerSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Không được để trống!').max(100, 'Họ và tên tối đa 100 ký tự.'),
    password: passwordRule,
    confirm: z.string().min(1, 'Không được để trống!'),
    consentZalo: z.boolean(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Mật khẩu xác nhận không khớp!' });

const resetSchema = z
  .object({ password: passwordRule, confirm: z.string().min(1, 'Không được để trống!') })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Mật khẩu xác nhận không khớp!' });

type DetailsInput = { fullName?: string; password: string; confirm: string; consentZalo?: boolean };

const asHttpError = (e: unknown): OtpHttpError =>
  e && typeof e === 'object' && 'message' in e ? (e as OtpHttpError) : { status: 0, message: NETWORK };

interface Props {
  purpose: OtpPurpose;
}

export function OtpFlow({ purpose }: Props) {
  const isRegister = purpose === 'REGISTER';
  const [step, setStep] = useState<Step>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [phone, setPhone] = useState(''); // normalised, sent to backend
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [notice, setNotice] = useState('');
  const [banner, setBanner] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  // The completion token lives only in memory: never in storage, URL or a form field.
  const tokenRef = useRef<string>('');
  const tokenTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [cooldown > 0]);

  useEffect(() => () => window.clearTimeout(tokenTimer.current), []);

  const clearToken = useCallback(() => {
    tokenRef.current = '';
    window.clearTimeout(tokenTimer.current);
  }, []);

  const guard = async (fn: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await fn();
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const sendCode = async (target: string, isResend: boolean) => {
    setBanner('');
    setCodeError('');
    try {
      const res = await requestOtp(target, purpose);
      setCooldown(res.resendAfterSeconds);
      setNotice(GENERIC_SENT);
      setCode('');
      setStep('code');
    } catch (e) {
      const err = asHttpError(e);
      if (err.status === 429) {
        if (err.retryAfterSeconds) setCooldown(err.retryAfterSeconds);
        setNotice('');
        const msg = err.message;
        if (isResend || step === 'code') setCodeError(msg);
        else {
          setPhoneError(msg);
          // Keep the user on step 1: the countdown also gates the submit button there.
        }
      } else if (err.status === 503) {
        const msg = SEND_FAILED;
        if (isResend || step === 'code') setCodeError(msg);
        else setPhoneError(msg);
      } else {
        const msg = err.status === 0 ? NETWORK : err.message;
        if (isResend || step === 'code') setCodeError(msg);
        else setPhoneError(msg);
      }
    }
  };

  const submitPhone = (ev: React.FormEvent) => {
    ev.preventDefault();
    setPhoneError('');
    const raw = phoneInput.trim();
    if (!raw) return setPhoneError('Không được để trống!');
    if (!isValidVnPhone(raw)) return setPhoneError('Số điện thoại không hợp lệ!');
    const normalized = normalizeVnPhone(raw);
    if (normalized !== phone) setCooldown(0);
    setPhone(normalized);
    void guard(() => sendCode(normalized, false));
  };

  const verify = (value: string) =>
    guard(async () => {
      setCodeError('');
      try {
        const res = await verifyOtp(phone, purpose, value);
        tokenRef.current = res.completionToken;
        window.clearTimeout(tokenTimer.current);
        tokenTimer.current = window.setTimeout(() => {
          clearToken();
          setCode('');
          setBanner('Phiên xác thực đã hết hạn. Vui lòng nhập số điện thoại và xác thực lại.');
          setStep('phone');
        }, (res.expiresInSeconds || 600) * 1000);
        setCode('');
        setNotice('');
        setStep('details');
      } catch (e) {
        const err = asHttpError(e);
        setCode('');
        setCodeError(err.status === 0 ? NETWORK : err.message);
      }
    });

  const onCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setCodeError('');
    if (digits.length === 6 && !busy.current) void verify(digits);
  };

  const submitCode = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (code.length !== 6) return setCodeError('Vui lòng nhập đủ 6 chữ số.');
    void verify(code);
  };

  const changePhone = () => {
    clearToken();
    setCode('');
    setCodeError('');
    setNotice('');
    setBanner('');
    setStep('phone');
  };

  const stepTitle = isRegister
    ? { phone: 'Đăng ký tài khoản', code: 'Nhập mã xác thực', details: 'Hoàn tất đăng ký', done: 'Đăng ký thành công' }[step]
    : { phone: 'Quên mật khẩu', code: 'Nhập mã xác thực', details: 'Đặt mật khẩu mới', done: 'Đặt lại mật khẩu thành công' }[step];
  const stepHint = {
    phone: isRegister
      ? 'Nhập số điện thoại để nhận mã xác thực'
      : 'Nhập số điện thoại để nhận mã xác thực đặt lại mật khẩu',
    code: `Nhập mã gồm 6 chữ số đã gửi tới ${phone}`,
    details: isRegister ? 'Nhập thông tin để tạo tài khoản Flower Lantern Spa' : 'Nhập mật khẩu mới cho tài khoản của bạn',
    done: isRegister
      ? 'Tài khoản của bạn đã được tạo. Bạn có thể đăng nhập ngay.'
      : 'Mật khẩu của bạn đã được cập nhật. Bạn có thể đăng nhập bằng mật khẩu mới.',
  }[step];

  return (
    <main className="login-page">
      <img className="login-decoration" src="/assets/login-lotus.png" alt="" />
      <section className="login-column" aria-label={isRegister ? 'Đăng ký Flower Lantern Spa' : 'Quên mật khẩu Flower Lantern Spa'}>
        <div className="login-brand-slot"><BrandLogo /></div>
        {step === 'phone' && (
          <form className="login-card" noValidate onSubmit={submitPhone}>
            <Header title={stepTitle} hint={stepHint} />
            {banner && <p role="alert" className="notice otp-banner">{banner}</p>}
            <div className="login-fields">
              <div className="field">
                <label htmlFor="otp-phone">Số điện thoại <span>*</span></label>
                <div className={`input-wrap ${phoneError ? 'invalid' : ''}`}>
                  <Icon name="phone" />
                  <input
                    id="otp-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    autoFocus
                    placeholder="Nhập số điện thoại"
                    aria-invalid={!!phoneError}
                    aria-describedby="otp-phone-error"
                    disabled={pending}
                    value={phoneInput}
                    onChange={(e) => { setPhoneInput(e.target.value); setPhoneError(''); }}
                  />
                </div>
                <p id="otp-phone-error" className="field-error" role={phoneError ? 'alert' : undefined} aria-live="polite">
                  {phoneError || ' '}
                </p>
              </div>
            </div>
            <div className="login-actions">
              <Button type="submit" className="w-full gap-[10px]" disabled={pending || (cooldown > 0 && normalizeVnPhone(phoneInput) === phone)}>
                {pending ? 'Đang gửi mã...' : cooldown > 0 && normalizeVnPhone(phoneInput) === phone ? `Gửi lại sau ${cooldown}s` : 'Gửi mã xác thực'}
              </Button>
              <p className="register-row">
                {isRegister ? 'Đã có tài khoản? ' : 'Nhớ mật khẩu rồi? '}
                <Link className="text-link" to="/dang-nhap">Đăng nhập</Link>
              </p>
            </div>
          </form>
        )}

        {step === 'code' && (
          <form className="login-card" noValidate onSubmit={submitCode}>
            <Header title={stepTitle} hint={stepHint} />
            {notice && <p role="status" className="notice otp-notice">{notice}</p>}
            <div className="login-fields">
              <div className="field">
                <label htmlFor="otp-code">Mã xác thực <span>*</span></label>
                <div className={`input-wrap ${codeError ? 'invalid' : ''}`}>
                  <Icon name="key" />
                  <input
                    id="otp-code"
                    className="otp-code-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="------"
                    aria-invalid={!!codeError}
                    aria-describedby="otp-code-error"
                    disabled={pending}
                    value={code}
                    onChange={(e) => onCodeChange(e.target.value)}
                  />
                </div>
                <p id="otp-code-error" className="field-error" role={codeError ? 'alert' : undefined} aria-live="polite">
                  {codeError || ' '}
                </p>
              </div>
            </div>
            <div className="login-actions">
              <Button type="submit" className="w-full gap-[10px]" disabled={pending || code.length !== 6}>
                {pending ? 'Đang xác thực...' : 'Xác nhận'}
              </Button>
              <div className="otp-links">
                <button
                  type="button"
                  className="text-link"
                  disabled={pending || cooldown > 0}
                  onClick={() => void guard(() => sendCode(phone, true))}
                >
                  {cooldown > 0 ? `Gửi lại mã sau ${cooldown}s` : 'Gửi lại mã'}
                </button>
                <button type="button" className="text-link" onClick={changePhone}>Đổi số điện thoại</button>
              </div>
            </div>
          </form>
        )}

        {step === 'details' && (
          <DetailsForm
            key="details"
            isRegister={isRegister}
            title={stepTitle}
            hint={stepHint}
            onSubmit={async (values, setFieldError) => {
              const token = tokenRef.current;
              if (!token) return;
              setBanner('');
              try {
                if (isRegister) {
                  await registerCustomer({
                    phone,
                    completionToken: token,
                    fullName: (values.fullName ?? '').trim(),
                    password: values.password,
                    consentZalo: !!values.consentZalo,
                  });
                } else {
                  await resetPassword({ phone, completionToken: token, newPassword: values.password });
                }
                clearToken();
                setCode('');
                setStep('done');
              } catch (e) {
                const err = asHttpError(e);
                const pwd = err.fields?.password ?? err.fields?.newPassword;
                if (err.status === 400 && pwd) {
                  setFieldError('password', pwd);
                } else if (err.status === 400 && !isRegister) {
                  clearToken();
                  setBanner(err.message);
                  setStep('phone');
                } else if (err.status === 0) {
                  setFieldError('root', NETWORK);
                } else {
                  setFieldError('root', err.message);
                }
              }
            }}
          />
        )}

        {step === 'done' && (
          <section className="login-card" role="status">
            <Header title={stepTitle} hint={stepHint} />
            <div className="login-actions">
              <Link className="otp-login-link" to="/dang-nhap">
                <Icon name="log-in" />
                Đến trang đăng nhập
              </Link>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function Header({ title, hint }: { title: string; hint: string }) {
  return (
    <header>
      <h1>{title}</h1>
      <p>{hint}</p>
    </header>
  );
}

function DetailsForm({
  isRegister,
  title,
  hint,
  onSubmit,
}: {
  isRegister: boolean;
  title: string;
  hint: string;
  onSubmit: (v: DetailsInput, setFieldError: (name: 'password' | 'root', message: string) => void) => Promise<void>;
}) {
  const [visible, setVisible] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DetailsInput>({
    resolver: zodResolver(isRegister ? registerSchema : resetSchema) as never,
    defaultValues: { fullName: '', password: '', confirm: '', consentZalo: false },
  });
  const pwdLabel = isRegister ? 'Mật khẩu' : 'Mật khẩu mới';

  const toggle = (
    <button
      className="visibility"
      type="button"
      aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      aria-pressed={visible}
      onClick={() => setVisible(!visible)}
    >
      <img src="/assets/eye-off.svg" alt="" />
    </button>
  );

  return (
    <form
      className="login-card"
      noValidate
      onSubmit={handleSubmit((v) =>
        onSubmit(v, (name, message) => setError(name, { message })),
      )}
    >
      <Header title={title} hint={hint} />
      <div className="login-fields">
        {isRegister && (
          <div className="field">
            <label htmlFor="reg-name">Họ và tên <span>*</span></label>
            <div className={`input-wrap ${errors.fullName ? 'invalid' : ''}`}>
              <input
                id="reg-name"
                type="text"
                autoComplete="name"
                autoFocus
                placeholder="Nhập họ và tên"
                aria-invalid={!!errors.fullName}
                aria-describedby="reg-name-error"
                disabled={isSubmitting}
                {...register('fullName')}
              />
            </div>
            <p id="reg-name-error" className="field-error" aria-live="polite">{errors.fullName?.message ?? ' '}</p>
          </div>
        )}
        <div className="field">
          <label htmlFor="reg-password">{pwdLabel} <span>*</span></label>
          <div className={`input-wrap ${errors.password ? 'invalid' : ''}`}>
            <img src="/assets/lock.svg" alt="" />
            <input
              id="reg-password"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus={!isRegister}
              placeholder={isRegister ? 'Nhập mật khẩu' : 'Nhập mật khẩu mới'}
              aria-invalid={!!errors.password}
              aria-describedby="reg-password-error"
              disabled={isSubmitting}
              {...register('password')}
            />
            {toggle}
          </div>
          <p id="reg-password-error" className="field-error" aria-live="polite">{errors.password?.message ?? ' '}</p>
        </div>
        <div className="field">
          <label htmlFor="reg-confirm">Xác nhận mật khẩu <span>*</span></label>
          <div className={`input-wrap ${errors.confirm ? 'invalid' : ''}`}>
            <img src="/assets/lock.svg" alt="" />
            <input
              id="reg-confirm"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Nhập lại mật khẩu"
              aria-invalid={!!errors.confirm}
              aria-describedby="reg-confirm-error"
              disabled={isSubmitting}
              {...register('confirm')}
            />
          </div>
          <p id="reg-confirm-error" className="field-error" aria-live="polite">{errors.confirm?.message ?? ' '}</p>
        </div>
        {isRegister && (
          <label className="otp-consent">
            <input type="checkbox" {...register('consentZalo')} disabled={isSubmitting} />
            Tôi đồng ý nhận thông báo lịch hẹn qua Zalo
          </label>
        )}
      </div>
      {errors.root && <p role="alert" className="notice otp-error">{errors.root.message}</p>}
      <div className="login-actions">
        <Button type="submit" className="w-full gap-[10px]" disabled={isSubmitting}>
          {isSubmitting ? 'Đang xử lý...' : isRegister ? 'Đăng ký' : 'Đặt lại mật khẩu'}
        </Button>
      </div>
    </form>
  );
}
