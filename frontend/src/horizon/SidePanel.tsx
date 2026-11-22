import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const CLOSE_MS = 320;

/** Inside the hub window a panel is plain content: the window itself carries the hologram, so no fold of its own. */
export const InlinePanels = createContext(false);

/**
 * A screen of the home screen: closed until opened, then it unfolds from top to bottom as a hologram (a flicker,
 * a tint and fine scan lines) and folds back the same way when closed. Its content is only mounted while it is
 * open or closing. Inside the hub window (see `InlinePanels`) it is just its content.
 */
export function SidePanel({ open, label, children }: { open: boolean; label: string; children: ReactNode }) {
  const inline = useContext(InlinePanels);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (inline) return undefined;
    if (open) { setMounted(true); return undefined; }
    const t = window.setTimeout(() => setMounted(false), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [open, inline]);

  if (inline) return open ? <div className="dg dg-bare" data-kind={label}>{children}</div> : null;
  if (!mounted) return null;
  return (
    <div className="dg-wrap" data-open={open}>
      <div className="dg-fold">
        <aside className="dg" aria-label={label}>{children}</aside>
      </div>
    </div>
  );
}
