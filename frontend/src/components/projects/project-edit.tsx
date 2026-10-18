import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import { Popup } from '../Popup';
import { type Look, PROJECT_ICONS, squareImage } from '../../lib/projectMeta';

/** The round mark of a project: its photo, its icon, or the initials. */
export function Mark({ name, look, color, personal }: { name: string; look?: Look; color: string; personal?: boolean }) {
  return (
    <span className="pj-mark" style={{ ['--c' as string]: color }} aria-hidden="true">
      {look?.image ? <img src={look.image} alt="" /> : look?.icon ? <Icon name={look.icon} size={18} /> : personal ? <Icon name="user-circle" size={18} /> : name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export interface MenuItem { label: string; onSelect: () => void; danger?: boolean }

/** The three dots on a card, with the actions it offers. */
export function ProjectMenu({ name, items }: { name: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={ref} className="pj-menu">
      <button type="button" className="pj-menu-btn" aria-label={`Options for ${name}`} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="menu-dots" size={18} /></button>
      {open && (
        <div className="pj-menu-pop" role="menu">
          {items.map((i) => (
            <button key={i.label} type="button" role="menuitem" data-danger={i.danger} onClick={() => { setOpen(false); i.onSelect(); }}>{i.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const ghost = { color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' };

/** Change a project's name and its photo or icon. The personal card keeps the name from your profile. */
export function EditProject({ name, look, color, personal, onSave, onClose }: {
  name: string;
  look?: Look;
  color: string;
  personal?: boolean;
  onSave: (name: string, look: Pick<Look, 'icon' | 'image'>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(name);
  const [icon, setIcon] = useState(look?.icon);
  const [image, setImage] = useState(look?.image);
  const file = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try { setImage(await squareImage(f)); } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not read that image.'); }
  };

  return (
    <Popup title={personal ? 'Edit Your Card' : 'Edit Project'} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="pj-edit-top">
          <span className="pj-edit-mark"><Mark name={title || name} look={{ icon, image }} color={color} personal={personal} /></span>
          <input value={title} disabled={personal} onChange={(e) => setTitle(e.target.value)} placeholder="Project Name" aria-label="Project Name"
            className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)', opacity: personal ? 0.6 : 1 }} />
        </div>
        {personal && <small style={{ color: 'var(--color-text-tertiary)' }}>The name comes from your profile.</small>}

        <div>
          <small style={{ color: 'var(--color-text-tertiary)' }}>Photo or Icon</small>
          <div className="pj-icons">
            <button type="button" data-on={!icon && !image} aria-label="Initials" onClick={() => { setIcon(undefined); setImage(undefined); }}>Aa</button>
            {PROJECT_ICONS.map((n) => (
              <button key={n} type="button" data-on={icon === n && !image} aria-label={n} onClick={() => { setIcon(n); setImage(undefined); }}><Icon name={n} size={18} /></button>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={ghost} onClick={() => file.current?.click()}>Upload Photo</button>
            {image && <button type="button" className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={ghost} onClick={() => setImage(undefined)}>Remove Photo</button>}
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={ghost} onClick={onClose}>Cancel</button>
          <button type="button" disabled={!title.trim()} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer font-semibold"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)', opacity: title.trim() ? 1 : 0.5 }}
            onClick={() => onSave(title.trim(), { icon, image })}>Save</button>
        </div>
      </div>
    </Popup>
  );
}

/** The warning before a project is deleted for good; archiving is offered as the gentler way out. */
export function ConfirmDelete({ name, tasks, onArchive, onDelete, onClose }: { name: string; tasks: number; onArchive?: () => void; onDelete: () => void; onClose: () => void }) {
  return (
    <Popup title={`Delete ${name}?`} onClose={onClose}>
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
        This permanently deletes the project{tasks ? ` and its ${tasks} ${tasks === 1 ? 'task' : 'tasks'}` : ''}. It cannot be undone.
        {onArchive && ' Archive it instead to keep everything and hide the card.'}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={ghost} onClick={onClose}>Cancel</button>
        {onArchive && <button type="button" className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={ghost} onClick={onArchive}>Archive Instead</button>}
        <button type="button" className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={{ background: 'var(--color-error)', color: '#fff' }} onClick={onDelete}>Delete</button>
      </div>
    </Popup>
  );
}
