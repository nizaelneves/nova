import { useEffect } from 'react';

/** A centered pop-up over the page. Click outside or press Escape to close. */
export function Popup({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(3, 3, 10, 0.72)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-label={title}
        className={wide ? 'w-full max-w-lg rounded-2xl p-5' : 'w-full max-w-md rounded-2xl p-5'}
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-strong, var(--color-border))' }}
      >
        <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-heading)' }}>{title}</h4>
        {children}
      </div>
    </div>
  );
}
