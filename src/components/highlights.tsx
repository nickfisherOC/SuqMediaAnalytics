import type { Highlight } from "@/lib/highlights";

const TONE = {
  good: { title: "What improved", color: "var(--status-good)", icon: "M3 9l3.5 3.5L13 5" },
  bad: { title: "What needs work", color: "var(--status-serious)", icon: "M8 3v6M8 12.5v.5" },
} as const;

/** Bold-headline bullets, in the style of the hand-made reports. */
export function HighlightList({ items, tone }: { items: Highlight[]; tone: "good" | "bad" }) {
  const t = TONE[tone];
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <path d={t.icon} fill="none" stroke={t.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {t.title}
      </h3>
      {items.length === 0 ? (
        <p className="text-ink-2">{tone === "good" ? "No big gains this period." : "Nothing big slipped this period."}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((h) => (
            <li key={h.title} className="text-lg leading-snug">
              <span className="font-semibold text-ink">{h.title}.</span>
              {h.detail && <span className="text-ink-2"> {h.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Headline({ text, auto = true }: { text: string; auto?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-2/60 p-6">
      <p className="text-2xl leading-snug font-semibold text-balance sm:text-3xl">{text}</p>
      {auto && <p className="mt-2 text-xs text-muted">Summary picked from the biggest changes. A written version comes with the AI layer.</p>}
    </div>
  );
}
