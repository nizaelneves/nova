/** One text diagram per project (or "all" / "me"), kept in this browser like the other project data. */

export const DEFAULT_FLOW = `Ad click
  Landing page
    Lead form
      Thank you page
      Email sequence
  Bounce: Retargeting
`;

const key = (projectId: string) => `phibe-flow-${projectId}`;

export function loadFlow(projectId: string): string {
  try {
    return localStorage.getItem(key(projectId)) ?? DEFAULT_FLOW;
  } catch {
    return DEFAULT_FLOW;
  }
}

export function saveFlow(projectId: string, text: string): void {
  try {
    localStorage.setItem(key(projectId), text);
  } catch {
    // Storage blocked or full: the diagram lasts until the page closes.
  }
}

export interface Box { id: string; label: string; x: number; y: number; w: number; h: number }
export interface Link { source: string; target: string; label: string }

const escapeXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A standalone SVG of the laid-out diagram (ours: no third-party exporter). */
export function toSvg(boxes: Box[], links: Link[]): string {
  const pad = 30;
  const at = new Map(boxes.map((b) => [b.id, b]));
  const minX = Math.min(...boxes.map((b) => b.x - b.w / 2)) - pad;
  const minY = Math.min(...boxes.map((b) => b.y - b.h / 2)) - pad;
  const width = Math.max(...boxes.map((b) => b.x + b.w / 2)) + pad - minX;
  const height = Math.max(...boxes.map((b) => b.y + b.h / 2)) + pad - minY;
  const lines = links.flatMap((l) => {
    const a = at.get(l.source);
    const b = at.get(l.target);
    if (!a || !b) return [];
    const mid = l.label ? `<text x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 4}" font-size="11" fill="#9aa3c7" text-anchor="middle">${escapeXml(l.label)}</text>` : '';
    return [`<line x1="${a.x}" y1="${a.y + a.h / 2}" x2="${b.x}" y2="${b.y - b.h / 2}" stroke="#9aa3c7" stroke-width="1.5" marker-end="url(#arrow)"/>${mid}`];
  });
  const shapes = boxes.map((b) => `<rect x="${b.x - b.w / 2}" y="${b.y - b.h / 2}" width="${b.w}" height="${b.h}" rx="10" fill="#14142a" stroke="#20e7aa" stroke-width="1.5"/><text x="${b.x}" y="${b.y}" font-size="13" fill="#e9ecf5" text-anchor="middle" dominant-baseline="central">${escapeXml(b.label)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}" font-family="system-ui, sans-serif"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#9aa3c7"/></marker></defs><rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="#07070f"/>${lines.join('')}${shapes.join('')}</svg>`;
}
