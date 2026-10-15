import { useEffect, useRef, useState } from 'react';
import cytoscape, { type Core } from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { parse, toCytoscapeElements } from 'graph-selector';
import { loadFlow, saveFlow, toSvg } from '../../lib/flow';

cytoscape.use(dagre);

const STYLE: cytoscape.StylesheetJsonBlock[] = [
  { selector: 'node', style: { shape: 'round-rectangle', label: 'data(label)', color: '#e9ecf5', 'font-size': 13, 'text-valign': 'center', 'text-halign': 'center', 'background-color': '#14142a', 'border-width': 1.5, 'border-color': '#20e7aa', width: 'label', height: 'label', padding: '12px' } },
  { selector: 'edge', style: { width: 1.5, 'line-color': '#9aa3c7', 'target-arrow-color': '#9aa3c7', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', label: 'data(label)', 'font-size': 11, color: '#9aa3c7', 'text-background-color': '#07070f', 'text-background-opacity': 1, 'text-background-padding': '2px' } },
];

function download(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

/** A diagram written as indented text (one line per box, indent = arrow), drawn with Cytoscape and laid out with dagre. */
export default function FlowCanvas({ projectId }: { projectId: string }) {
  const [text, setText] = useState(() => loadFlow(projectId));
  const host = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);

  useEffect(() => {
    cy.current = cytoscape({ container: host.current, style: STYLE, userZoomingEnabled: true, minZoom: 0.2, maxZoom: 2, boxSelectionEnabled: false });
    return () => { cy.current?.destroy(); cy.current = null; };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      saveFlow(projectId, text);
      const graph = cy.current;
      if (!graph) return;
      let elements: cytoscape.ElementDefinition[] = [];
      try { elements = toCytoscapeElements(parse(text)); } catch { return; } // keep the last good drawing while the text is half-typed
      graph.elements().remove();
      graph.add(elements);
      graph.layout({ name: 'dagre', rankDir: 'TB', nodeSep: 40, rankSep: 50, animate: false } as cytoscape.LayoutOptions).run();
      graph.fit(undefined, 30);
    }, 250);
    return () => window.clearTimeout(t);
  }, [text, projectId]);

  const exportSvg = () => {
    const graph = cy.current;
    if (!graph || graph.nodes().empty()) return;
    const boxes = graph.nodes().map((n) => ({ id: n.id(), label: String(n.data('label') ?? ''), x: n.position('x'), y: n.position('y'), w: n.outerWidth(), h: n.outerHeight() }));
    const links = graph.edges().map((e) => ({ source: e.source().id(), target: e.target().id(), label: String(e.data('label') ?? '') }));
    const url = URL.createObjectURL(new Blob([toSvg(boxes, links)], { type: 'image/svg+xml' }));
    download(url, 'flow.svg');
    URL.revokeObjectURL(url);
  };

  const exportPng = () => {
    if (cy.current && !cy.current.nodes().empty()) download(cy.current.png({ full: true, scale: 2, bg: '#07070f' }), 'flow.png');
  };

  return (
    <div className="pj-flow">
      <div className="pj-flow-side">
        <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="Diagram text" />
        <p>One line per box. Indent a line to draw an arrow from the line above. Write <code>label: Box</code> to name the arrow.</p>
        <div className="pj-flow-actions">
          <button type="button" onClick={exportSvg}>Export SVG</button>
          <button type="button" onClick={exportPng}>Export PNG</button>
        </div>
        <small>Text syntax by Flowchart Fun (graph-selector). Drawn with Cytoscape.js and dagre.</small>
      </div>
      <div className="pj-flow-view" ref={host} />
    </div>
  );
}
