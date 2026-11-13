import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { loginApi, getDefaultRoute, type ApiError, type AuthUser } from '../lib/auth-api';
import { useAuth } from '../contexts/auth-context';
import { BrandLogo } from '../components/brand-logo';

const schema = z.object({
  phone: z.string().trim().min(1, 'Không được để trống!'),
  password: z.string().min(1, 'Không được để trống!'),
});
type LoginInput = z.infer<typeof schema>;

const Icon = ({ name }: { name: string }) => <img src={`/assets/${name}.svg`} alt="" />;

export function Login() {
  const [visible, setVisible] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const submitting=useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginInput>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '', password: '' },
  });

  const mutation = useMutation<AuthUser, ApiError, LoginInput>({
    mutationFn: loginApi,
    onSuccess: (user) => {
      setUser(user);
      navigate(getDefaultRoute(user.role), { replace: true });
    },
    onError: (err: ApiError) => {
      if (err.code === 'ACCOUNT_TEMPORARILY_LOCKED') {
        setError('root', {
          message: 'Bạn đã nhập sai quá số lần cho phép. Vui lòng thử lại sau 15 phút.',
        });
      } else if (err.code === 'ACCOUNT_INACTIVE') {
        setError('root', {
          message: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.',
        });
      } else {
        setError('root', {
          message: err.message || 'Không thể kết nối hệ thống. Vui lòng thử lại!',
        });
      }
    },
    onSettled:()=>{submitting.current=false;},
  });

  const showInvalidCredentials =
    mutation.isError &&
    (mutation.error.code === 'INVALID_CREDENTIALS' || mutation.error.status === 401) &&
    mutation.error.code !== 'ACCOUNT_TEMPORARILY_LOCKED' &&
    mutation.error.code !== 'ACCOUNT_INACTIVE';

  const isTemporarilyLocked = mutation.isError && mutation.error.code === 'ACCOUNT_TEMPORARILY_LOCKED';

  const submit = (data: LoginInput) => {
    if(submitting.current)return;
    submitting.current=true;
    mutation.mutate({ phone: data.phone.trim(), password: data.password });
  };

  return (
    <main className="login-page">
      <img className="login-decoration" src="/assets/login-lotus.png" alt="" />
      <section className="login-column" aria-label="Đăng nhập Flower Lantern Spa">
        <div className="login-brand-slot"><BrandLogo/></div>
        <form className="login-card" noValidate onSubmit={handleSubmit(submit)}>
          <header>
            <h1>Đăng nhập</h1>
            <p>Chào mừng bạn quay lại Flower Lantern Spa</p>
          </header>
          <div className="login-fields">
            <div className="field">
              <label htmlFor="phone">
                Số điện thoại <span>*</span>
              </label>
              <div className={`input-wrap ${errors.phone || showInvalidCredentials ? 'invalid' : ''}`}>
                <Icon name="phone" />
                <input
                  id="phone"
                  type="tel"
                  autoComplete="username"
                  placeholder="Nhập số điện thoại"
                  aria-invalid={!!errors.phone || showInvalidCredentials}
                  aria-describedby="phone-error"
                  disabled={mutation.isPending}
                  {...register('phone')}
                />
              </div>
              {(errors.phone || !mutation.isError) && (
                <p id="phone-error" className="field-error" aria-live="polite">
                  {errors.phone?.message ?? '\u00a0'}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="password">
                Mật khẩu <span>*</span>
              </label>
              <div className={`input-wrap ${errors.password || showInvalidCredentials ? 'invalid' : ''}`}>
                <Icon name="lock" />
                <input
                  id="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  aria-invalid={!!errors.password || showInvalidCredentials}
                  aria-describedby="password-error"
                  disabled={mutation.isPending}
                  {...register('password')}
                />
                <button
                  className="visibility"
                  type="button"
                  aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  <Icon name="eye-off" />
                </button>
              </div>
              {(errors.password || !mutation.isError) && (
                <p id="password-error" className="field-error" aria-live="polite">
                  {errors.password?.message ?? '\u00a0'}
                </p>
              )}
            </div>
          </div>
          {errors.root && (
            <p role="alert" className="notice">
              {mutation.error?.code === 'INVALID_CREDENTIALS'
                ? 'Số điện thoại hoặc mật khẩu không đúng'
                : errors.root.message}
            </p>
          )}
          {isTemporarilyLocked && (
            <p role="alert" className="login-lockout-badge">
              Lần đăng nhập sai liên tiếp thứ 5 · Tạm khóa 15 phút
            </p>
          )}
          <div className="login-actions">
            {!showInvalidCredentials && (
              <div className="remember-row">
                <label>
                  <input type="checkbox" />
                  Ghi nhớ đăng nhập
                </label>
                <button
                  type="button"
                  className="text-link"
                  onClick={() => navigate('/quen-mat-khau')}
                >
                  <Icon name="key" />
                  Quên mật khẩu?
                </button>
              </div>
            )}
            <Button
              type="submit"
              className="w-full gap-[10px]"
              disabled={mutation.isPending || isTemporarilyLocked}
            >
              <Icon name="log-in" />
              {mutation.isPending ? 'Đang đăng nhập...' : mutation.isError && !showInvalidCredentials && !isTemporarilyLocked ? 'Thử lại' : 'Đăng nhập'}
            </Button>
            {!showInvalidCredentials && (
              <p className="register-row">
                Chưa có tài khoản?{' '}
                <button
                  type="button"
                  className="text-link"
                  onClick={() => navigate('/dang-ky')}
                >
                  Đăng ký ngay
                </button>
              </p>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
