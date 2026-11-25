import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../Icon';
import { Popup } from '../Popup';
import { type Look, PROJECT_ICONS } from '../../lib/projectMeta';

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

const BOX = 240; // preview size in px
const OUT = 256; // saved image size in px

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('That file is not an image.'));
  img.src = src;
});

/** Drag to move and slide to zoom; the round window is what gets saved. */
function Cropper({ img, onApply, onCancel }: { img: HTMLImageElement; onApply: (png: string) => void; onCancel: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: img.width / 2, y: img.height / 2 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const scale = (BOX / Math.min(img.width, img.height)) * zoom;
  // Keep the window inside the picture.
  const clamp = (c: { x: number; y: number }) => {
    const half = BOX / 2 / scale;
    // Zoomed out past the picture's size, it just stays centred.
    const fit = (v: number, size: number) => (half * 2 >= size ? size / 2 : Math.min(Math.max(v, half), size - half));
    return { x: fit(c.x, img.width), y: fit(c.y, img.height) };
  };
  // Draw the picture so its point (c.x, c.y) sits in the middle of a square of `side` px.
  const paint = (ctx: CanvasRenderingContext2D, side: number) => {
    const k = (scale * side) / BOX;
    ctx.clearRect(0, 0, side, side);
    ctx.drawImage(img, side / 2 - c.x * k, side / 2 - c.y * k, img.width * k, img.height * k);
  };
  const c = clamp(center);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    paint(ctx, BOX);
  });

  const apply = () => {
    const out = document.createElement('canvas');
    out.width = out.height = OUT;
    const ctx = out.getContext('2d');
    if (ctx) paint(ctx, OUT);
    onApply(out.toDataURL('image/png'));
  };

  return (
    <div className="pj-crop">
      <div className="pj-crop-box" style={{ width: BOX, height: BOX }}>
        <canvas ref={canvas} width={BOX} height={BOX} aria-label="Crop area"
          onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => { if (!drag.current) return; const dx = e.clientX - drag.current.x; const dy = e.clientY - drag.current.y; drag.current = { x: e.clientX, y: e.clientY }; setCenter(clamp({ x: c.x - dx / scale, y: c.y - dy / scale })); }}
          onPointerUp={() => { drag.current = null; }} />
        <span className="pj-crop-ring" aria-hidden="true" />
      </div>
      <label className="pj-crop-zoom">Zoom
        <button type="button" className="pj-zoom-btn" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}>−</button>
        <input type="range" min={0} max={1} step={0.001} value={Math.log(zoom / 0.25) / Math.log(40)} aria-label="Zoom" onChange={(e) => setZoom(0.25 * 40 ** Number(e.target.value))} />
        <button type="button" className="pj-zoom-btn" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(10, z * 1.25))}>+</button>
      </label>
      <div className="flex gap-2">
        <button type="button" className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={ghost} onClick={onCancel}>Cancel</button>
        <button type="button" className="text-sm px-3 py-1.5 rounded-lg cursor-pointer font-semibold" style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }} onClick={apply}>Apply</button>
      </div>
    </div>
  );
}

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
  const [cropping, setCropping] = useState<HTMLImageElement | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const open = async (src: string) => {
    try { setCropping(await loadImage(src)); } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not read that image.'); }
  };
  const pick = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => void open(String(reader.result));
    reader.readAsDataURL(f);
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

        {cropping
          ? <Cropper img={cropping} onCancel={() => setCropping(null)} onApply={(png) => { setImage(png); setIcon(undefined); setCropping(null); }} />
          : (
            <div className="pj-icons">
              <button type="button" data-on={!!image} aria-label={image ? 'Change or crop image' : 'Upload image'} title="Upload image" onClick={() => (image ? void open(image) : file.current?.click())}>
                {image ? <img src={image} alt="" /> : <Icon name="lucide-cloud-upload" size={18} />}
              </button>
              <button type="button" data-on={!icon && !image} aria-label="Initials" onClick={() => { setIcon(undefined); setImage(undefined); }}>Aa</button>
              {PROJECT_ICONS.map((n) => (
                <button key={n} type="button" data-on={icon === n && !image} aria-label={n} onClick={() => { setIcon(n); setImage(undefined); }}><Icon name={n} size={18} /></button>
              ))}
            </div>
          )}
        {image && !cropping && (
          <div className="flex gap-2">
            <button type="button" className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={ghost} onClick={() => file.current?.click()}>Replace image</button>
            <button type="button" className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={ghost} onClick={() => void open(image)}>Edit crop</button>
          </div>
        )}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />

        <div className="flex justify-end gap-2">
          <button type="button" className="text-sm px-3 py-1.5 rounded-lg cursor-pointer" style={ghost} onClick={onClose}>Cancel</button>
          <button type="button" disabled={!title.trim()} className="text-sm px-3 py-1.5 rounded-lg cursor-pointer font-semibold"
            style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)', opacity: title.trim() ? 1 : 0.5 }}
            onClick={() => onSave(title.trim(), image ? { icon: undefined, image } : { icon, image: undefined })}>Save</button>
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
