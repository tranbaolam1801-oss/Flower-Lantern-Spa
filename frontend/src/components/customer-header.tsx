import { useRef, useState } from 'react';
import { AccountMenu } from './account-menu';
import { BrandLogo } from './brand-logo';
import { Button } from './ui/button';

const links = ['Trang chủ', 'Giới thiệu', 'Dịch vụ', 'Đặt lịch', 'Liên hệ'];
export function CustomerHeader() {
  const drawer = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  return <header className="customer-header">
    <BrandLogo className="customer-logo"/>
    <nav aria-label="Điều hướng khách hàng">{links.map(label => <button key={label} disabled title="Chức năng chưa sẵn sàng">{label}</button>)}</nav>
    <div className="customer-header-actions">
      <img src="/assets/customer-imgGroup.svg" alt="Tìm kiếm"/>
      <button className="customer-navigation-toggle" aria-label="Mở menu" aria-expanded={open} aria-controls="customer-navigation" onClick={() => { drawer.current?.showModal(); setOpen(true); }}>Menu</button>
      <AccountMenu customer/>
      <Button disabled><img src="/assets/customer-imgGroup2.svg" alt=""/>Đặt lịch ngay</Button>
    </div>
    <dialog id="customer-navigation" className="customer-drawer" ref={drawer} onClose={() => setOpen(false)} aria-label="Điều hướng khách hàng">
      <button className="drawer-close" onClick={() => drawer.current?.close()}>Đóng menu</button>
      <BrandLogo/>
      <nav aria-label="Menu khách hàng"><a href="/lich-hen-cua-toi" aria-current="page">Lịch hẹn của tôi</a>{links.map(label => <button key={label} disabled title="Chức năng chưa sẵn sàng">{label}</button>)}</nav>
    </dialog>
  </header>;
}
