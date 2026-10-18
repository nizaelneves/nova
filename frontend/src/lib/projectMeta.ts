import type { IconName } from '../components/Icon';

/** How a project looks and whether it is put away. Kept on this device, by project id (`me` is the personal card). */
export interface Look {
  /** A system icon, instead of the initials. */
  icon?: IconName;
  /** An uploaded photo (a small data URL); wins over the icon. */
  image?: string;
  archived?: boolean;
}

export type MetaStore = Record<string, Look>;

const KEY = 'phibe-project-meta';

/** The icons offered for a project, besides the initials. */
export const PROJECT_ICONS: IconName[] = [
  'buildings-2', 'case-minimalistic', 'bag-smile', 'shop-2', 'bolt', 'star-shine', 'target', 'book-2',
  'code', 'bot', 'heart-pulse', 'music-note-2', 'clapperboard-play', 'gift', 'paw', 'home-2',
];

export function loadMeta(): MetaStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMeta(store: MetaStore): void {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage blocked or full: the look stays for this session */ }
}

/** Changes one project's look; a look with nothing set is dropped. Pass `undefined` to clear a field. */
export function setLook(store: MetaStore, id: string, changes: Partial<Look>): MetaStore {
  const merged = { ...store[id], ...changes };
  const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined && v !== false)) as Look;
  const { [id]: _old, ...rest } = store;
  return Object.keys(clean).length ? { ...rest, [id]: clean } : rest;
}

export const forget = (store: MetaStore, id: string): MetaStore => setLook(store, id, { icon: undefined, image: undefined, archived: false });

/** Shrinks a picked image to a small square (centre crop) so it fits in storage. */
export function squareImage(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d')?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image.')); };
    img.src = url;
  });
}
