import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { loginApi, getDefaultRoute, type ApiError } from '../lib/auth-api';
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

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginInput>({
    resolver: zodResolver(schema),
    defaultValues: { phone: '', password: '' },
  });

  const mutation = useMutation({
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
          message: err.status ? err.message : 'Không thể kết nối hệ thống. Vui lòng thử lại!',
        });
      }
    },
  });

  const submit = (data: LoginInput) => {
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
            <p>Chào mừng bạn quay lại FLOWERLANTERN SPA</p>
          </header>
          <div className="login-fields">
            <div className="field">
              <label htmlFor="phone">
                Số điện thoại <span>*</span>
              </label>
              <div className={`input-wrap ${errors.phone ? 'invalid' : ''}`}>
                <Icon name="phone" />
                <input
                  id="phone"
                  type="tel"
                  autoComplete="username"
                  placeholder="Nhập số điện thoại"
                  aria-invalid={!!errors.phone}
                  aria-describedby="phone-error"
                  disabled={mutation.isPending}
                  {...register('phone')}
                />
              </div>
              <p id="phone-error" className="field-error" aria-live="polite">
                {errors.phone?.message ?? '\u00a0'}
              </p>
            </div>
            <div className="field">
              <label htmlFor="password">
                Mật khẩu <span>*</span>
              </label>
              <div className={`input-wrap ${errors.password ? 'invalid' : ''}`}>
                <Icon name="lock" />
                <input
                  id="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  aria-invalid={!!errors.password}
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
              <p id="password-error" className="field-error" aria-live="polite">
                {errors.password?.message ?? '\u00a0'}
              </p>
            </div>
          </div>
          <div className="login-actions">
            <div className="remember-row">
              <label>
                <input type="checkbox" />
                Ghi nhớ đăng nhập
              </label>
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  setError('root', {
                    message: 'Chức năng khôi phục mật khẩu chưa được triển khai.',
                  })
                }
              >
                <Icon name="key" />
                Quên mật khẩu?
              </button>
            </div>
            <Button
              type="submit"
              className="w-full gap-[10px]"
              disabled={mutation.isPending}
            >
              <Icon name="log-in" />
              {mutation.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
            <p className="register-row">
              Chưa có tài khoản?{' '}
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  setError('root', {
                    message: 'Chức năng đăng ký chưa được triển khai.',
                  })
                }
              >
                Đăng ký ngay
              </button>
            </p>
          </div>
          {errors.root && (
            <p role="alert" className="notice">
              {errors.root.message}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
