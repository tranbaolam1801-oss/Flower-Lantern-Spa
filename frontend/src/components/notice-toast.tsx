import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type NoticeKind = 'success' | 'info' | 'error';
export interface NoticeState { kind: NoticeKind; title: string; message: string; onRetry?: () => void }

export const successNotice = (message: string): NoticeState => ({ kind: 'success', title: 'Thành công', message });
export const cancelledNotice = (): NoticeState => ({ kind: 'info', title: 'Đã hủy thao tác', message: 'Đã hủy thao tác. Không lưu thay đổi.' });
export const errorNotice = (message: string, onRetry?: () => void): NoticeState => ({ kind: 'error', title: 'Không thể thực hiện', message, onRetry });

/**
 * Figma notification toast (UC_3 / UC_8 frames): fixed top-right, 510px, 36px status circle, title, message, optional "Thử lại", close X.
 *  success = green "Thành công", info = blue "Đã hủy thao tác", error = pink "Không thể thực hiện". The X always closes it without touching form data.
 * Success/info dismiss themselves after 6 s; errors stay until closed or retried.
 */
export function NoticeToast({ notice, onClose, retrying = false }: { notice: NoticeState; onClose: () => void; retrying?: boolean }) {
  useEffect(() => {
    if (notice.kind === 'error') return;
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [notice, onClose]);
  const error = notice.kind === 'error';
  // A modal <dialog> sits in the browser's top layer and would hide (and block clicks on) a normal fixed toast: when one is open at the moment
  // the toast appears, the toast is rendered INSIDE that dialog (still position:fixed, so it keeps the Figma top-right position).
  const [host] = useState<HTMLElement | null>(() => (typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('dialog[open]')));
  const node = (
    <div role={error ? 'alert' : 'status'} className={`customer-toast customer-toast-${notice.kind}`} data-testid={`notice-toast-${notice.kind}`}>
      <span className="customer-toast-icon" aria-hidden="true">
        <img src={error ? '/assets/uc3-toast-error-x.svg' : '/assets/uc3-toast-check.svg'} alt="" />
      </span>
      <div className="customer-toast-body">
        <p className="customer-toast-title">{notice.title}</p>
        <p className="customer-toast-message">{notice.message}</p>
        {notice.onRetry && (
          <div>
            <button type="button" className="customer-toast-retry" onClick={notice.onRetry} disabled={retrying}>{retrying ? 'Đang thử lại…' : 'Thử lại'}</button>
          </div>
        )}
      </div>
      <button type="button" className="customer-toast-close" aria-label="Đóng thông báo" onClick={onClose}>
        <img src="/assets/uc3-toast-close.svg" alt="" aria-hidden="true" />
      </button>
    </div>
  );
  return host ? createPortal(node, host) : node;
}
