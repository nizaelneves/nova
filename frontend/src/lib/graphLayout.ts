/** Places the nodes of the notes graph: linked nodes pull together, every node pushes the others away. */

export interface GraphNode { id: string; type: 'note' | 'tag' | 'collection'; label: string; kind?: string; count?: number }
export interface GraphEdge { a: string; b: string; type: 'tag' | 'collection' | 'link' | 'similar'; weight?: number }
export interface Point { x: number; y: number }

const PULL: Record<GraphEdge['type'], number> = { tag: 1, collection: 1.2, link: 1.6, similar: 0.5 };

/** Force-directed layout (Fruchterman-Reingold). Deterministic: the same graph always gives the same picture. */
export function layout(nodes: GraphNode[], edges: GraphEdge[], iterations = 260): Map<string, Point> {
  const n = nodes.length;
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  nodes.forEach((_, i) => { const a = (i / Math.max(n, 1)) * Math.PI * 2; const r = 200 + (i % 7) * 30; x[i] = Math.cos(a) * r; y[i] = Math.sin(a) * r; });
  const pairs = edges.flatMap((e) => {
    const a = index.get(e.a); const b = index.get(e.b);
    return a === undefined || b === undefined ? [] : [[a, b, PULL[e.type] * (e.type === 'similar' ? (e.weight ?? 0.7) : 1)] as const];
  });
  const k = 100; // the distance two unlinked nodes settle at
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  for (let step = 0; step < iterations; step++) {
    const temp = 40 * (1 - step / iterations) + 0.5;
    dx.fill(0); dy.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ex = x[i] - x[j]; const ey = y[i] - y[j];
        const d2 = ex * ex + ey * ey + 0.01;
        if (d2 > 36 * k * k) continue; // far apart: no push, so loose notes are not flung out of sight
        const push = (k * k) / d2;
        dx[i] += ex * push; dy[i] += ey * push; dx[j] -= ex * push; dy[j] -= ey * push;
      }
    }
    for (const [a, b, w] of pairs) {
      const ex = x[a] - x[b]; const ey = y[a] - y[b];
      const d = Math.sqrt(ex * ex + ey * ey) + 0.01;
      const pull = (d * w) / k;
      dx[a] -= ex * pull; dy[a] -= ey * pull; dx[b] += ex * pull; dy[b] += ey * pull;
    }
    for (let i = 0; i < n; i++) { // a gentle pull to the centre keeps loose notes in view
      dx[i] -= x[i] * 0.05; dy[i] -= y[i] * 0.05;
      const len = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1;
      const move = Math.min(len, temp);
      x[i] += (dx[i] / len) * move; y[i] += (dy[i] / len) * move;
    }
  }
  return new Map(nodes.map((node, i) => [node.id, { x: x[i], y: y[i] }]));
}
