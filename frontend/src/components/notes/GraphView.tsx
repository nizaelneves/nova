import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { type GraphEdge, type GraphNode, type Point, layout } from '../../lib/graphLayout';
import { notesGraph } from '../../lib/notes-api';

const COLOR = { note: '#bfefff', bookmark: '#a78bfa', tag: '#e879f9', collection: '#ffe9a8' } as const;
const EDGE: Record<GraphEdge['type'], { color: string; label: string }> = {
  tag: { color: 'rgba(232,121,249,0.22)', label: 'Tags' },
  collection: { color: 'rgba(255,233,168,0.26)', label: 'Collections' },
  link: { color: 'rgba(143,227,255,0.8)', label: 'Links' },
  similar: { color: 'rgba(167,139,250,0.2)', label: 'Similar Meaning' },
};
const radius = (n: GraphNode) => (n.type === 'note' ? 4 : 6 + Math.min(8, Math.sqrt(n.count ?? 1)));

/** The graph of the notes: what you tagged, grouped and linked, plus notes that mean the same thing. */
export function GraphView({ onOpenNote, onOpenGroup }: { onOpenNote: (id: string) => void; onOpenGroup: (node: GraphNode) => void }) {
  const [data, setData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const [shown, setShown] = useState<Record<GraphEdge['type'], boolean>>({ tag: true, collection: true, link: true, similar: true });
  const [hover, setHover] = useState<GraphNode | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const hoverId = useRef<string | null>(null);
  const touched = useRef(false); // once the user pans or zooms, the view is theirs

  useEffect(() => { notesGraph().then(setData).catch((e) => toast.error(e instanceof Error ? e.message : 'Could Not Load The Graph')); }, []);

  const points = useMemo<Map<string, Point>>(() => (data ? layout(data.nodes, data.edges) : new Map()), [data]);
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    data?.edges.forEach((e) => {
      if (!map.has(e.a)) map.set(e.a, new Set());
      if (!map.has(e.b)) map.set(e.b, new Set());
      map.get(e.a)!.add(e.b); map.get(e.b)!.add(e.a);
    });
    return map;
  }, [data]);

  // Every node drifts a little around its place, so the whole graph breathes; the layout itself stays put.
  const phase = useMemo(() => {
    const m = new Map<string, [number, number, number]>();
    data?.nodes.forEach((n) => m.set(n.id, [Math.random() * 6.283, 0.35 + Math.random() * 0.5, 2 + Math.random() * 3.5]));
    return m;
  }, [data]);
  const sparks = useRef<{ e: number; t: number; v: number }[]>([]);

  const draw = () => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !data) return;
    const { x, y, k } = view.current;
    const now = performance.now() / 1000;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.translate(x, y); ctx.scale(k, k);
    const focus = hoverId.current;
    const near = focus ? neighbours.get(focus) : undefined;
    const dim = (id: string) => !!focus && id !== focus && !near?.has(id);
    const at = (id: string): Point | undefined => {
      const p = points.get(id), f = phase.get(id);
      if (!p || !f) return p;
      return { x: p.x + Math.sin(now * f[1] + f[0]) * f[2], y: p.y + Math.cos(now * f[1] * 1.13 + f[0]) * f[2] };
    };
    ctx.globalCompositeOperation = 'lighter';
    const live: { a: Point; b: Point; type: GraphEdge['type'] }[] = [];
    for (const e of data.edges) {
      const a = at(e.a); const b = at(e.b);
      if (!shown[e.type] || !a || !b) continue;
      live.push({ a, b, type: e.type });
      const hot = !!focus && (e.a === focus || e.b === focus);
      ctx.strokeStyle = hot ? 'rgba(255,255,255,0.85)' : EDGE[e.type].color;
      ctx.globalAlpha = focus && !hot ? 0.2 : 1;
      ctx.lineWidth = (e.type === 'link' || hot ? 1.6 : 1) / k;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // light travelling along the edges: links carry it fastest
    const want = Math.min(70, live.length);
    while (sparks.current.length < want) sparks.current.push({ e: Math.floor(Math.random() * live.length), t: Math.random(), v: 0.12 + Math.random() * 0.25 });
    sparks.current.length = want;
    for (const sp of sparks.current) {
      sp.t += sp.v * 0.016;
      if (sp.t > 1) { sp.t = 0; sp.e = Math.floor(Math.random() * live.length); }
      const e = live[sp.e];
      if (!e) continue;
      const px = e.a.x + (e.b.x - e.a.x) * sp.t, py = e.a.y + (e.b.y - e.a.y) * sp.t;
      const g = ctx.createRadialGradient(px, py, 0, px, py, 7 / Math.sqrt(k));
      g.addColorStop(0, e.type === 'link' ? 'rgba(255,255,255,0.95)' : 'rgba(143,227,255,0.7)'); g.addColorStop(1, 'rgba(143,227,255,0)');
      ctx.globalAlpha = (focus ? 0.4 : 1) * Math.sin(sp.t * Math.PI);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 7 / Math.sqrt(k), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.font = `${12 / k}px Inter, sans-serif`;
    for (const n of data.nodes) {
      const p = at(n.id);
      if (!p) continue;
      const f = phase.get(n.id);
      const tw = f ? 0.8 + 0.2 * Math.sin(now * 1.6 + f[0] * 3) : 1; // each one twinkles on its own
      const r = (radius(n) / Math.sqrt(k)) * (n.id === focus ? 1.35 : 1);
      const col = n.type === 'note' ? COLOR[n.kind === 'bookmark' ? 'bookmark' : 'note'] : COLOR[n.type];
      ctx.globalAlpha = (dim(n.id) ? 0.2 : 1) * tw;
      const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * (n.type === 'note' ? 3.6 : 4.6));
      halo.addColorStop(0, col); halo.addColorStop(0.25, `${col}66`); halo.addColorStop(1, `${col}00`);
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(p.x, p.y, r * (n.type === 'note' ? 3.6 : 4.6), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.55, 0, Math.PI * 2); ctx.fill();
      if (n.id === focus) { // a ring that keeps widening from what you are pointing at
        const w = (now * 0.9) % 1;
        ctx.globalAlpha = 1 - w; ctx.strokeStyle = col; ctx.lineWidth = 1.4 / k;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * (1.6 + w * 3), 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const n of data.nodes) {
      const p = at(n.id);
      if (!p || !(n.type !== 'note' || n.id === focus || near?.has(n.id) || k > 1.8)) continue;
      ctx.globalAlpha = dim(n.id) ? 0.25 : 1;
      ctx.fillStyle = 'rgba(235,238,245,0.92)';
      ctx.fillText(n.label.length > 34 ? `${n.label.slice(0, 33)}…` : n.label, p.x + (radius(n) + 5) / Math.sqrt(k), p.y + 4 / k);
    }
    ctx.globalAlpha = 1;
  };

  // It keeps moving: redraw every frame while it is on screen (once, if the system asks for less motion).
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    if (!data) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { drawRef.current(); return undefined; }
    let raf = 0;
    const loop = () => { drawRef.current(); raf = requestAnimationFrame(loop); };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [data]);

  // Size the canvas to its box, start centred, and redraw when anything that changes the picture changes.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return undefined;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const r = c.getBoundingClientRect();
      c.width = r.width * dpr; c.height = r.height * dpr;
      if (!touched.current && points.size) { // until the user moves it, keep all of it in view
        // the middle 88% decides the view, so a few loose notes far away do not shrink everything else
        const spread = (v: number[]) => { const o = [...v].sort((a, b) => a - b); return [o[Math.floor(o.length * 0.06)], o[Math.ceil(o.length * 0.94) - 1]]; };
        const [x0, x1] = spread([...points.values()].map((p) => p.x));
        const [y0, y1] = spread([...points.values()].map((p) => p.y));
        const k = Math.min(2, r.width / (x1 - x0 + 160), r.height / (y1 - y0 + 160));
        view.current = { k, x: r.width / 2 - ((x0 + x1) / 2) * k, y: r.height / 2 - ((y0 + y1) / 2) * k };
      }
      draw();
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(c);
    return () => watch.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, points, shown]);

  const world = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.current.x) / view.current.k, y: (e.clientY - r.top - view.current.y) / view.current.k };
  };
  const hit = (e: { clientX: number; clientY: number }): GraphNode | null => {
    const w = world(e);
    let best: GraphNode | null = null; let bestD = Infinity;
    for (const n of data?.nodes ?? []) {
      const p = points.get(n.id);
      if (!p) continue;
      const d = Math.hypot(p.x - w.x, p.y - w.y);
      if (d < (radius(n) + 4) / Math.sqrt(view.current.k) && d < bestD) { best = n; bestD = d; }
    }
    return best;
  };

  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // The wheel zooms around the pointer; it needs a listener that may cancel the page's own scrolling.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return undefined;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      touched.current = true;
      const r = c.getBoundingClientRect();
      const v = view.current;
      const k = Math.min(6, Math.max(0.2, v.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      const px = e.clientX - r.left; const py = e.clientY - r.top;
      view.current = { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
      draw();
    };
    c.addEventListener('wheel', wheel, { passive: false });
    return () => c.removeEventListener('wheel', wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, points, shown]);

  return (
    <div className="nt-graph">
      <div className="nt-graph-key">
        {(Object.keys(EDGE) as GraphEdge['type'][]).sort((a, b) => EDGE[a].label.localeCompare(EDGE[b].label)).map((t) => (
          <label key={t}>
            <input type="checkbox" checked={shown[t]} onChange={() => setShown((s) => ({ ...s, [t]: !s[t] }))} />
            <i style={{ background: EDGE[t].color.replace(/[\d.]+\)$/, '1)') }} /> {EDGE[t].label}
          </label>
        ))}
      </div>
      {!data && <p className="nt-empty">Loading…</p>}
      {data && data.nodes.length === 0 && <p className="nt-empty">No Notes Yet</p>}
      <canvas
        ref={canvas}
        className="nt-graph-canvas"
        aria-label="Graph Of Notes"
        data-hover={hover ? 'true' : undefined}
        onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, moved: false }; touched.current = true; }}
        onMouseMove={(e) => {
          const d = drag.current;
          if (d) {
            const mx = e.clientX - d.x; const my = e.clientY - d.y;
            if (Math.abs(mx) + Math.abs(my) > 3) d.moved = true;
            view.current = { ...view.current, x: view.current.x + mx, y: view.current.y + my };
            d.x = e.clientX; d.y = e.clientY;
            draw();
            return;
          }
          const found = hit(e);
          if (found?.id !== hoverId.current) { hoverId.current = found?.id ?? null; setHover(found); draw(); }
        }}
        onMouseUp={(e) => {
          const moved = drag.current?.moved;
          drag.current = null;
          const found = !moved ? hit(e) : null;
          if (found) { if (found.type === 'note') onOpenNote(found.id); else onOpenGroup(found); }
        }}
        onMouseLeave={() => { drag.current = null; if (hoverId.current) { hoverId.current = null; setHover(null); draw(); } }}
      />
      {hover && <div className="nt-graph-tip">{hover.label}{hover.type !== 'note' && ` · ${hover.count} Notes`}</div>}
    </div>
  );
}
