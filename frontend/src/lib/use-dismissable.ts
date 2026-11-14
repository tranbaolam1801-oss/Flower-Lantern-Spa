import { useEffect, useRef, type RefObject } from 'react';

const OPEN_EVENT = 'spa-popover-open';

/**
 * Shared open/close behaviour for header dropdowns and popovers (account menu, notification bell, filter popovers).
 * While `open` is true it closes the popover when the user presses/touches OUTSIDE `containerRef` (the trigger and the panel must both be
 * inside that container, so a click on the trigger is handled by the trigger itself and cannot "close then re-open"), or presses Escape.
 * Opening a popover announces itself, which closes any OTHER open popover that uses this hook (only one is open at a time).
 * Listeners exist only while open and are removed on close/unmount. It never touches modals or forms.
 */
export function useDismissable({ id, open, onClose, containerRef, onEscape }: {
  id: string;
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  /** Runs after Escape closed the popover (e.g. to return focus to the trigger). */
  onEscape?: () => void;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    const onPointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (container && event.target instanceof Node && !container.contains(event.target)) closeRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      closeRef.current();
      escapeRef.current?.();
    };
    const onOtherOpened = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) closeRef.current();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_EVENT, onOtherOpened);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_EVENT, onOtherOpened);
    };
  }, [open, id, containerRef]);
}
