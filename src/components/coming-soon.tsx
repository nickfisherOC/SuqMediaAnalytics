/** A designed placeholder for screens built in a later phase. */
export function ComingSoon({ title, phase, children }: { title: string; phase: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">{title}</h1>
      <div className="max-w-2xl rounded-2xl border border-dashed border-line bg-surface p-6">
        <p className="text-sm font-semibold text-muted">Arrives in phase {phase}</p>
        <div className="mt-2 text-ink-2">{children}</div>
      </div>
    </div>
  );
}
