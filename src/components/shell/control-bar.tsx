"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import clsx from "clsx";
import type { BrandSettings } from "@/config/brands";
import { parseControls } from "@/lib/controls";
import { formatRange, type ISODate } from "@/lib/dates";
import { COMPARE_KEYS, COMPARE_LABELS, PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from "@/lib/periods";

interface Props {
  brands: BrandSettings[];
  /** Today in Edmonton, from the server, so the client never uses its own clock or timezone. */
  today: ISODate;
}

/** Brand · Period · Compare to. State lives in the URL. */
export function ControlBar({ brands, today }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const c = parseControls(Object.fromEntries(params.entries()), brands, today);
  const compareWindows = c.compare.windows;
  const props = {
    brand: c.brand,
    periodKey: c.periodKey,
    compareKey: c.compareKey,
    from: c.period.from,
    to: c.period.to,
    periodRange: formatRange(c.period.from, c.period.to),
    compareRange:
      compareWindows.length > 1
        ? `the ${compareWindows.length} periods before`
        : formatRange(compareWindows[0].from, compareWindows[0].to),
  };
  const [pending, startTransition] = useTransition();

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const brandOptions = [
    ...brands.map((b) => ({ value: b.slug, label: b.name, accent: b.accent as { light: string; dark: string } | null })),
    { value: "all", label: "All brands", accent: null },
  ];

  return (
    <div
      className={clsx("flex w-full flex-wrap items-end gap-x-2 gap-y-2 transition-opacity sm:w-auto sm:gap-x-4 sm:gap-y-3", pending && "opacity-60")}
      aria-busy={pending}
    >
      <fieldset className="flex w-full flex-col gap-1 sm:w-auto">
        <legend className="sr-only mb-1 text-xs font-medium text-muted sm:not-sr-only">Brand</legend>
        <div className="flex rounded-lg bg-surface-2 p-0.5" role="radiogroup" aria-label="Brand">
          {brandOptions.map((o) => {
            const selected = props.brand === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => update({ brand: o.value })}
                // Each brand's own colour when selected (light/dark variants via .brand-scope); "All brands" uses ink.
                style={o.accent ? ({ "--brand-light": o.accent.light, "--brand-dark": o.accent.dark } as React.CSSProperties) : undefined}
                className={clsx(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm whitespace-nowrap transition-colors sm:flex-none sm:px-3",
                  o.accent && "brand-scope",
                  selected
                    ? o.accent
                      ? "bg-accent font-semibold text-on-accent shadow-sm"
                      : "bg-ink font-semibold text-page shadow-sm"
                    : "font-medium text-muted hover:text-ink",
                )}
              >
                {selected && (
                  <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
                    <path d="M3 8.5l3 3L13 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {o.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
        <span className="sr-only text-xs font-medium text-muted sm:not-sr-only">Period</span>
        <select
          value={props.periodKey}
          onChange={(e) => {
            const v = e.target.value as PeriodKey;
            update(v === "custom" ? { period: v, from: props.from, to: props.to } : { period: v, from: null, to: null });
          }}
          className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm sm:w-auto sm:px-3"
        >
          {PERIOD_KEYS.map((k) => (
            <option key={k} value={k}>
              {k === "last_week" ? "Last week (Mon–Sun)" : k === "this_week" ? "This week so far" : k === "last_7" ? "Last 7 days (to yesterday)" : PERIOD_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      {props.periodKey === "custom" && (
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">From</span>
            <input
              type="date"
              defaultValue={props.from}
              onChange={(e) => e.target.value && update({ from: e.target.value })}
              className="h-9 rounded-lg border border-line bg-surface px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">To</span>
            <input
              type="date"
              defaultValue={props.to}
              onChange={(e) => e.target.value && update({ to: e.target.value })}
              className="h-9 rounded-lg border border-line bg-surface px-2 text-sm"
            />
          </label>
        </div>
      )}

      <label className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-none">
        <span className="sr-only text-xs font-medium text-muted sm:not-sr-only">Compare to</span>
        <select
          value={props.compareKey}
          onChange={(e) => update({ compare: e.target.value })}
          className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm sm:w-auto sm:px-3"
        >
          {COMPARE_KEYS.map((k) => (
            <option key={k} value={k}>
              {COMPARE_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      <p className="hidden pb-2 text-sm text-muted sm:block">
        <span className="font-medium text-ink-2">{props.periodRange}</span> vs {props.compareRange}
      </p>
    </div>
  );
}
