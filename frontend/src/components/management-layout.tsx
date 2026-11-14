import { useRef, useState, type ReactNode } from 'react';
import { ManagementSidebar } from './management-sidebar';
import { AccountMenu } from './account-menu';
import { NotificationBell } from './notification-bell';

export function ManagementLayout({active,children}:{active:string;children:ReactNode}) {
  const navigation=useRef<HTMLDialogElement>(null);
  const [open,setOpen]=useState(false);
  return <div className="admin-shell">
    <div className="desktop-sidebar"><ManagementSidebar active={active}/></div>
    <dialog className="management-drawer" ref={navigation} onClose={()=>setOpen(false)} aria-label="Điều hướng quản lý"><button className="drawer-close" onClick={()=>navigation.current?.close()}>Đóng menu</button><ManagementSidebar active={active} onNavigate={()=>navigation.current?.close()}/></dialog>
    <div className="admin-workspace"><img className="admin-leaves" src="/assets/admin-imgTopRightLeaves.svg" alt=""/>
      <header className="admin-header"><button className="navigation-toggle" aria-expanded={open} onClick={()=>{navigation.current?.showModal();setOpen(true);}}>Menu</button><NotificationBell/><AccountMenu/></header>
      <main className="admin-content">{children}</main>
    </div>
  </div>;
}
