import type { ReactNode } from 'react';

/** The frame every Horizon widget sits in. */
export function Card({ title, note, children }: { title?: string; note?: string; children: ReactNode }) {
  return (
    <section className="hz-card">
      <header>
        {title && <h3>{title}</h3>}
        {note && <span>{note}</span>}
      </header>
      {children}
    </section>
  );
}
