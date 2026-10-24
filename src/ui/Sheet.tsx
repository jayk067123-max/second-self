"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function Sheet({ title, caption, onBack, onClose, children, footer, stepKey, wide = false }: {
  title: string; caption?: string; onBack: () => void; onClose: () => void;
  children: ReactNode; footer?: ReactNode; stepKey?: string | number; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.showModal();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [stepKey]);
  return <dialog ref={ref} className={"app-sheet" + (wide ? " app-sheet-wide" : "")} aria-labelledby={id}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onBlurCapture={() => queueMicrotask(() => { const dialog = ref.current; if (dialog?.open && !dialog.contains(document.activeElement)) heading.current?.focus({preventScroll:true}); })}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
    <header className="sheet-header">
      <button type="button" className="round-action" aria-label="返回上一步" onClick={onBack}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m14 5-7 7 7 7M7 12h13" /></svg></button>
      <div>{caption && <p className="sheet-caption">{caption}</p>}<h2 ref={heading} tabIndex={-1} id={id}>{title}</h2></div>
      <button type="button" className="sheet-close" aria-label="关闭弹层" onClick={onClose}>×</button>
    </header>
    <div ref={content} className="sheet-content">{children}</div>
    {footer && <footer className="sheet-footer">{footer}</footer>}
  </dialog>;
}
