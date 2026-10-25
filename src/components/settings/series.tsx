"use client";

import { useRef, useState, useTransition } from "react";
import { addSeries, deleteSeries } from "@/app/(app)/settings/actions";
import type { Series } from "@/config/series";
import { addDays, formatRange } from "@/lib/dates";

const input = "h-9 rounded-lg border border-line bg-page px-3 text-sm text-ink";

function SeriesRow({ s, brandName }: { s: Series; brandName: string }) {
  const [pending, start] = useTransition();
  return (
    <li className={`flex flex-wrap items-center justify-between gap-3 py-3 ${pending ? "opacity-60" : ""}`}>
      <div>
        <p className="font-semibold">{s.name}</p>
        <p className="text-xs text-muted">
          {brandName} · {formatRange(s.start, addDays(s.start, s.days - 1))} · {s.days} days
        </p>
      </div>
      {s.id && (
        <button
          type="button"
          disabled={pending}
          onClick={() => confirm(`Remove the series "${s.name}"? Posts keep their numbers; they just stop being labelled "Day N".`) && start(() => void deleteSeries(s.id!))}
          className="text-sm text-ink-2 hover:text-bad"
        >
          Remove
        </button>
      )}
    </li>
  );
}

/** Daily content series ("31 Days of …"): the Content Lab tracker and "Day N" labels come from here. */
export function SeriesSettings({ series, brands }: { series: Series[]; brands: { slug: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const nameOf = (slug: string) => brands.find((b) => b.slug === slug)?.name ?? slug;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      {series.length ? (
        <ul className="divide-y divide-line">
          {series.map((s) => (
            <SeriesRow key={s.id ?? s.name} s={s} brandName={nameOf(s.brand)} />
          ))}
        </ul>
      ) : (
        <p className="text-ink-2">No series yet.</p>
      )}
      <form
        ref={form}
        action={(fd) =>
          start(async () => {
            const r = await addSeries(fd);
            if (r.ok) {
              form.current?.reset();
              setError(null);
            } else setError(r.message ?? "Couldn't add it.");
          })
        }
        className="flex flex-wrap items-end gap-2 border-t border-line pt-4"
      >
        <label className="flex flex-col gap-1 text-xs text-muted">
          Brand
          <select name="brand" className={`${input} px-2`}>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted">
          Series name
          <input name="name" required placeholder="e.g. 30 Days of Gratitude" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          First day
          <input name="start" type="date" required className={`${input} px-2`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Days
          <input name="days" type="number" min={1} max={366} required defaultValue={30} className={`${input} w-20`} />
        </label>
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60">
          {pending ? "Adding…" : "Add series"}
        </button>
      </form>
      {error && <p className="text-sm text-bad">{error}</p>}
      <p className="text-xs text-muted">Day 1 is the first day. A post counts for Day N when its caption says &quot;Day N&quot;.</p>
    </div>
  );
}
