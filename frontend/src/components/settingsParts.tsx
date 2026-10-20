import type { ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="set-section fin-card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}


export function SettingRow({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-text">
        {label && <b>{label}</b>}
        {description && <span>{description}</span>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}
