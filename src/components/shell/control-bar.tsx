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

  const brandOptions = [...brands.map((b) => ({ value: b.slug, label: b.name })), { value: "all", label: "All brands" }];

  return (
    <div
      className={clsx("flex flex-wrap items-end gap-x-4 gap-y-3 transition-opacity", pending && "opacity-60")}
      aria-busy={pending}
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-xs font-medium text-muted">Brand</legend>
        <div className="flex rounded-lg bg-surface-2 p-0.5" role="radiogroup" aria-label="Brand">
          {brandOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={props.brand === o.value}
              onClick={() => update({ brand: o.value })}
              className={clsx(
                "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                props.brand === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Period</span>
        <select
          value={props.periodKey}
          onChange={(e) => {
            const v = e.target.value as PeriodKey;
            update(v === "custom" ? { period: v, from: props.from, to: props.to } : { period: v, from: null, to: null });
          }}
          className="h-9 rounded-lg border border-line bg-surface px-3 text-sm"
        >
          {PERIOD_KEYS.map((k) => (
            <option key={k} value={k}>
              {k === "last_week" ? "Last week (Mon–Sun)" : k === "this_week" ? "This week so far" : PERIOD_LABELS[k]}
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

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted">Compare to</span>
        <select
          value={props.compareKey}
          onChange={(e) => update({ compare: e.target.value })}
          className="h-9 rounded-lg border border-line bg-surface px-3 text-sm"
        >
          {COMPARE_KEYS.map((k) => (
            <option key={k} value={k}>
              {COMPARE_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      <p className="pb-2 text-sm text-muted">
        <span className="font-medium text-ink-2">{props.periodRange}</span> vs {props.compareRange}
      </p>
    </div>
  );
}
