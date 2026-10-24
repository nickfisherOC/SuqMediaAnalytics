import { useId } from "react";

/** A small ⓘ that shows a metric's definition, source and caveats on hover or keyboard focus. */
export function InfoTip({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`About ${title}`}
        aria-describedby={id}
        className="inline-flex size-5 items-center justify-center rounded-full text-muted hover:text-ink focus-visible:text-ink"
      >
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7v4M8 4.8v.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute top-6 left-1/2 z-30 hidden w-72 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 text-left text-sm leading-snug font-normal text-ink-2 shadow-lg group-focus-within:block group-hover:block"
      >
        {children}
      </span>
    </span>
  );
}
