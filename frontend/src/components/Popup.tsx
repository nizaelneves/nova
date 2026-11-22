import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/** A centered pop-up over the page. Click outside or press Escape to close. */
export function Popup({
  title,
  onClose,
  wide,
  large,
  hideTitle,
  topGap = 28,
  className = '',
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  /** Room for a text editor. */
  large?: boolean;
  /** Keep `title` for screen readers but do not draw it. */
  hideTitle?: boolean;
  /** With the title hidden, the space kept above the content for the close button, in px. */
  topGap?: number;
  /** Extra classes for the dialog box. */
  className?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(3, 3, 10, 0.72)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-label={title}
        className={`relative w-full ${large ? 'max-w-3xl' : wide ? 'max-w-lg' : 'max-w-md'} rounded-2xl p-5 ${className}`}
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-strong, var(--color-border))', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 flex items-center justify-center rounded-md cursor-pointer"
          style={{ width: 28, height: 28, color: 'var(--color-text-secondary)', background: 'transparent', border: 'none' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--color-text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M1 1l10 10M11 1L1 11" /></svg>
        </button>
        {hideTitle ? <div style={{ height: topGap }} /> : <h4 className="text-sm font-semibold mb-3 pr-8" style={{ color: 'var(--color-heading)' }}>{title}</h4>}
        {children}
      </div>
    </div>
  , document.body);
}
