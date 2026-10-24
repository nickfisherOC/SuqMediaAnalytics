import { PLATFORM_INFO } from "@/config/platforms";
import type { Flag } from "@/lib/data/source";

const SEVERITY = {
  serious: { label: "Fix now", color: "var(--status-critical)", icon: "M8 1.5l6.5 12h-13z M8 6v3.5 M8 11.5v.2" },
  warning: { label: "Needs a look", color: "var(--status-warning)", icon: "M8 1.5a6.5 6.5 0 110 13 6.5 6.5 0 010-13z M8 4.5v4 M8 11v.2" },
  info: { label: "Heads up", color: "var(--muted)", icon: "M8 1.5a6.5 6.5 0 110 13 6.5 6.5 0 010-13z M8 7v4 M8 4.8v.2" },
} as const;

/** Data-quality and housekeeping flags: stuck posts, missed days, test traffic, insights switched off. */
export function FlagList({ flags }: { flags: Flag[] }) {
  if (!flags.length) {
    return <p className="rounded-2xl border border-line bg-surface p-5 text-ink-2">Nothing flagged for this period.</p>;
  }
  const order = { serious: 0, warning: 1, info: 2 };
  const sorted = [...flags].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {sorted.map((f) => {
        const s = SEVERITY[f.severity];
        return (
          <li key={f.id} className="flex gap-4 p-4">
            <svg viewBox="0 0 16 16" className="mt-0.5 size-5 shrink-0" aria-hidden>
              <path d={s.icon} fill="none" stroke={s.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="min-w-0">
              <p className="font-semibold">{f.title}</p>
              {f.detail && <p className="text-sm text-ink-2">{f.detail}</p>}
              <p className="mt-1 text-xs text-muted">
                {s.label}
                {f.platform ? ` · ${PLATFORM_INFO[f.platform].label}` : ""}
                {f.isSample ? " · sample" : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
