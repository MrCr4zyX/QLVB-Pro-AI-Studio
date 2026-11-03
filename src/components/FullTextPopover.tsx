import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface FullTextPopoverProps {
  text?: string | null;
  popupContent?: string | null;
  className?: string;
  fitWidth?: boolean;
}

/** Hover with a mouse, or tap/click once. Outside tap, swipe or scroll closes it. */
export const FullTextPopover: React.FC<FullTextPopoverProps> = ({
  text,
  popupContent,
  className = '',
  fitWidth = false,
}) => {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 300 });

  const close = useCallback(() => {
    setOpen(false);
    setPinned(false);
  }, []);

  const show = useCallback((pin: boolean) => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = fitWidth ? 230 : Math.min(380, Math.max(200, window.innerWidth - 24));
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const below = window.innerHeight - rect.bottom;
    const top = below >= 180 || below >= rect.top ? rect.bottom + 6 : 12;
    setPosition({ top, left, width });
    setPinned(pin);
    setOpen(true);
  }, [fitWidth]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) close();
    };
    const onScroll = (event: Event) => {
      // Swiping the page closes; allow scrolling inside a long popup.
      if (panelRef.current?.contains(event.target as Node)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  if (!text) return null;
  const displayPopup = popupContent || text;
  return <>
    <span
      ref={triggerRef}
      className={`${className} cursor-pointer`}
      role="button"
      tabIndex={0}
      aria-label="Xem đầy đủ nội dung"
      aria-expanded={open}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse' && !pinned) show(false); }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse' && !pinned && !panelRef.current?.contains(event.relatedTarget as Node)) close();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (open && pinned) close(); else show(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          if (open && pinned) close(); else show(true);
        }
      }}
    >{text}</span>
    {open && createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Nội dung đầy đủ"
        className={`fixed z-[9999] rounded-xl border border-blue-200 bg-white shadow-2xl text-slate-800 whitespace-pre-wrap break-words overflow-y-auto ${
          fitWidth ? 'px-3 py-2 text-xs font-semibold w-max max-w-[90vw]' : 'p-3 text-sm'
        }`}
        style={{
          top: position.top,
          left: position.left,
          ...(fitWidth ? {} : { width: position.width }),
          maxHeight: `calc(100dvh - ${position.top + 12}px)`,
          minHeight: fitWidth ? 28 : 35,
        }}
        onPointerLeave={(event) => {
          if (!pinned && event.pointerType === 'mouse' && !triggerRef.current?.contains(event.relatedTarget as Node)) close();
        }}
      >{displayPopup}</div>,
      document.body
    )}
  </>;
};
