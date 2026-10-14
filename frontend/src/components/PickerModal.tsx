import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * The same pop-up as the local model selector: tabs on top, a list of rows, a footer line.
 * It is drawn on <body> (the island is transformed, which would trap a fixed pop-up inside it).
 */
export function PickerModal<T extends string>({ tabs, tab, onTab, onClose, footer, children }: {
  tabs: { id: T; label: string }[];
  tab: T;
  onTab: (t: T) => void;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-label={tabs.find((t) => t.id === tab)?.label} className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="fixed inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} />
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 24px 64px rgba(0,0,0,0.45), var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 px-3 pt-3 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => onTab(t.id)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                style={{ color: tab === t.id ? 'var(--color-accent)' : 'var(--color-text-tertiary)', background: tab === t.id ? 'var(--color-accent-subtle)' : 'transparent' }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 flex justify-end">
            <button onClick={onClose} className="p-1 rounded-lg cursor-pointer" aria-label="Close" style={{ color: 'var(--color-text-tertiary)' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto py-2">{children}</div>

        {footer && (
          <div className="flex items-center gap-4 px-4 py-2 text-[11px]" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** One row of a picker, like the rows of the model list. */
export function PickerRow({ icon, title, note, active, soon, onClick }: {
  icon: React.ReactNode;
  title: string;
  note?: string;
  active?: boolean;
  soon?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={soon}
      onClick={onClick}
      className="flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors cursor-pointer disabled:cursor-default"
      style={{ opacity: soon ? 0.5 : 1 }}
      onMouseEnter={(e) => { if (!soon) e.currentTarget.style.background = 'var(--color-bg-secondary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm truncate" style={{ color: active ? 'var(--color-accent)' : 'var(--color-text)', fontWeight: active ? 500 : 400 }}>{title}</span>
        {note && <span className="block text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>{note}</span>}
      </span>
    </button>
  );
}
