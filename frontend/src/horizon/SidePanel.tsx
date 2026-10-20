import { useEffect, useState, type ReactNode } from 'react';

const CLOSE_MS = 320;

/**
 * A side screen of the home screen: closed until its button is pressed, then it unfolds from top to bottom as a
 * hologram (a flicker, a tint and fine scan lines) and folds back the same way when closed. Its content is only
 * mounted while it is open or closing.
 */
export function SidePanel({ open, label, children }: { open: boolean; label: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) { setMounted(true); return undefined; }
    const t = window.setTimeout(() => setMounted(false), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!mounted) return null;
  return (
    <div className="dg-wrap" data-open={open}>
      <div className="dg-fold">
        <aside className="dg" aria-label={label}>{children}</aside>
      </div>
    </div>
  );
}
