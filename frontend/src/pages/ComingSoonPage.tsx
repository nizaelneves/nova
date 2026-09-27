/** Placeholder for modules that are built in a later step. */
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="label-caps">Coming next</span>
      <h1 className="text-3xl font-medium">{title}</h1>
    </div>
  );
}
