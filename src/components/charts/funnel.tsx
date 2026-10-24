import { PLATFORM_INFO } from "@/config/platforms";
import { formatExact } from "@/lib/format";
import type { Figure } from "@/lib/pack";

/**
 * The funnel from first view to sale. Bars use a log scale: the steps span
 * thousands of views down to a handful of orders, and a straight scale would
 * leave the bottom steps invisible. The number and the share that went on to
 * the next step are always printed, so nothing depends on bar length alone.
 */
export function Funnel({ steps }: { steps: { label: string; figure: Figure }[] }) {
  const values = steps.map((s) => s.figure.value ?? 0);
  const max = Math.max(...values, 1);
  const width = (v: number) => (v <= 0 ? 0 : Math.max(2, (Math.log10(v + 1) / Math.log10(max + 1)) * 100));

  // Where the most people drop off between two measured steps.
  let worst = -1;
  let worstRate = Infinity;
  steps.forEach((s, i) => {
    if (i === 0) return;
    const prev = steps[i - 1].figure.value;
    const cur = s.figure.value;
    if (prev && cur !== null && prev > 0) {
      const rate = cur / prev;
      if (rate < worstRate) {
        worstRate = rate;
        worst = i;
      }
    }
  });

  return (
    <ol className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-5">
      {steps.map((s, i) => {
        const v = s.figure.value;
        const prev = i > 0 ? steps[i - 1].figure.value : null;
        const rate = prev && v !== null && prev > 0 ? v / prev : null;
        const missing = s.figure.platformsMissing.map((p) => PLATFORM_INFO[p].label);
        return (
          <li key={s.label} className="flex flex-col gap-1">
            {i > 0 && (
              <p className={`pl-1 text-xs ${i === worst ? "font-semibold text-bad" : "text-muted"}`}>
                {rate === null
                  ? "↓"
                  : rate > 1
                    ? "↓ more than the step above (this step also counts people from elsewhere)"
                    : rate === 0
                      ? "↓ none went on"
                      : `↓ ${rate >= 0.1 ? Math.round(rate * 100) : (rate * 100).toFixed(1)}% went on`}
                {i === worst && " · biggest drop-off"}
              </p>
            )}
            <div className="grid grid-cols-[minmax(8rem,14rem)_1fr_auto] items-center gap-3">
              <span className="text-sm text-ink-2">{s.label}</span>
              <div className="h-6 rounded-md bg-surface-2" aria-hidden>
                <div className="h-6 rounded-md bg-accent" style={{ width: `${width(v ?? 0)}%` }} />
              </div>
              <span className="tabular min-w-16 text-right text-lg font-semibold">
                {v === null ? <span className="text-sm font-normal text-muted">No data</span> : formatExact(v, s.figure.unit)}
              </span>
            </div>
            {missing.length > 0 && v !== null && <p className="pl-1 text-xs text-muted">Not counted yet: {missing.join(", ")}</p>}
          </li>
        );
      })}
    </ol>
  );
}
