import { Suspense, lazy } from 'react';

const Canvas = lazy(() => import('./flow-canvas'));

/** A text-written diagram that belongs to the selected project. */
export function Flow({ projectId }: { projectId: string }) {
  return (
    <Suspense fallback={<div className="pj-soon" style={{ border: 0 }}>Loading Flow…</div>}>
      <Canvas key={projectId} projectId={projectId} />
    </Suspense>
  );
}
