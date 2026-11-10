import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '../components/ui/button';

const schema = z.object({phone:z.string().trim().min(1,'Không được để trống!'),password:z.string().min(1,'Không được để trống!')});
type LoginInput = z.infer<typeof schema>;
const Icon = ({name}:{name:string}) => <img src={`/assets/${name}.svg`} alt=""/>;

export function Login() {
  const [visible,setVisible] = useState(false);
  const [notice,setNotice] = useState('');
  const {register,handleSubmit,formState:{errors}} = useForm<LoginInput>({resolver:zodResolver(schema),defaultValues:{phone:'',password:''}});
  // Milestone 2 is the UI foundation only. Do not transmit credentials before
  // the authenticated SQL-backed endpoint, lockout and CSRF controls are ready.
  const submit = () => setNotice('Chức năng đăng nhập đang được triển khai. Vui lòng quay lại sau.');
  return <main className="login-page">
    <img className="login-decoration" src="/assets/login-lotus.png" alt=""/>
    <section className="login-column" aria-label="Đăng nhập Flower Lantern Spa">
      <img className="brand-logo" src="/assets/login-logo.png" alt="Hoa Đăng Spa – Flower Lantern Spa"/>
      <form className="login-card" noValidate onSubmit={handleSubmit(submit)}>
        <header><h1>Đăng nhập</h1><p>Chào mừng bạn quay lại FLOWERLANTERN SPA</p></header>
        <div className="login-fields">
          <div className="field">
            <label htmlFor="phone">Số điện thoại <span>*</span></label>
            <div className={`input-wrap ${errors.phone?'invalid':''}`}><Icon name="phone"/><input id="phone" type="tel" autoComplete="username" placeholder="Nhập số điện thoại" aria-invalid={!!errors.phone} aria-describedby="phone-error" {...register('phone')}/></div>
            <p id="phone-error" className="field-error" aria-live="polite">{errors.phone?.message ?? '\u00a0'}</p>
          </div>
          <div className="field">
            <label htmlFor="password">Mật khẩu <span>*</span></label>
            <div className={`input-wrap ${errors.password?'invalid':''}`}><Icon name="lock"/><input id="password" type={visible?'text':'password'} autoComplete="current-password" placeholder="Nhập mật khẩu" aria-invalid={!!errors.password} aria-describedby="password-error" {...register('password')}/><button className="visibility" type="button" aria-label={visible?'Ẩn mật khẩu':'Hiện mật khẩu'} aria-pressed={visible} onClick={()=>setVisible(!visible)}><Icon name="eye-off"/></button></div>
            <p id="password-error" className="field-error" aria-live="polite">{errors.password?.message ?? '\u00a0'}</p>
          </div>
        </div>
        <div className="login-actions">
          <div className="remember-row"><label><input type="checkbox"/>Ghi nhớ đăng nhập</label><button type="button" className="text-link" onClick={()=>setNotice('Chức năng khôi phục mật khẩu chưa được triển khai.')}><Icon name="key"/>Quên mật khẩu?</button></div>
          <Button type="submit" className="w-full gap-[10px]"><Icon name="log-in"/>Đăng nhập</Button>
          <p className="register-row">Chưa có tài khoản? <button type="button" className="text-link" onClick={()=>setNotice('Chức năng đăng ký chưa được triển khai.')}>Đăng ký ngay</button></p>
        </div>
        {notice && <p role="status" className="notice">{notice}</p>}
      </form>
    </section>
  </main>;
}
