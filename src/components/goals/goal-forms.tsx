"use client";

import { useRef, useState, useTransition } from "react";
import { addGoal, deleteGoal } from "@/app/(app)/goals/actions";

export interface MetricOption {
  key: string;
  label: string;
  /** Where this number comes from for the brand: "all" first, then each platform. */
  platforms: { value: string; label: string }[];
  hint: string;
}

export function DeleteGoal({ id, label }: { id: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm(`Remove the goal "${label}"?`)) start(() => void deleteGoal(id));
      }}
      aria-label={`Remove goal: ${label}`}
      title="Remove goal"
      className="no-print rounded px-1.5 text-muted hover:bg-surface-2 hover:text-bad disabled:opacity-50"
    >
      ×
    </button>
  );
}

/** Admins: add a goal for one brand. */
export function AddGoal({ brand, metrics }: { brand: string; metrics: MetricOption[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState(metrics[0]?.key ?? "");
  const [cadence, setCadence] = useState("week");
  const form = useRef<HTMLFormElement>(null);
  const chosen = metrics.find((m) => m.key === metric);

  return (
    <form
      ref={form}
      action={(fd) =>
        start(async () => {
          const r = await addGoal(fd);
          if (r.ok) {
            // Reset the form and the choices that drive it, so the description and "From" match what's shown.
            form.current?.reset();
            setMetric(metrics[0]?.key ?? "");
            setCadence("week");
            setError(null);
          } else setError(r.message ?? "Couldn't add it.");
        })
      }
      className="no-print flex flex-col gap-3 rounded-2xl border border-dashed border-line p-5"
    >
      <p className="text-sm font-semibold text-ink-2">Add a goal</p>
      <input type="hidden" name="brand" value={brand} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Number
          <select name="metric" value={metric} onChange={(e) => setMetric(e.target.value)} className="h-9 rounded-lg border border-line bg-page px-2 text-sm text-ink">
            {metrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        {chosen && chosen.platforms.length > 1 && (
          <label className="flex flex-col gap-1 text-xs text-muted">
            From
            <select key={chosen.key} name="platform" defaultValue={chosen.platforms[0].value} className="h-9 rounded-lg border border-line bg-page px-2 text-sm text-ink">
              {chosen.platforms.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {chosen && chosen.platforms.length === 1 && <input type="hidden" name="platform" value={chosen.platforms[0].value} />}
        <label className="flex flex-col gap-1 text-xs text-muted">
          Target
          <input name="target" required inputMode="decimal" placeholder="e.g. 15" className="h-9 w-28 rounded-lg border border-line bg-page px-3 text-sm text-ink" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          How often
          <select name="cadence" value={cadence} onChange={(e) => setCadence(e.target.value)} className="h-9 rounded-lg border border-line bg-page px-2 text-sm text-ink">
            <option value="week">Every week</option>
            <option value="month">Every month</option>
            <option value="deadline">Once, by a date</option>
          </select>
        </label>
        {cadence === "deadline" && (
          <label className="flex flex-col gap-1 text-xs text-muted">
            By
            <input name="deadline" type="date" required className="h-9 rounded-lg border border-line bg-page px-2 text-sm text-ink" />
          </label>
        )}
        <button type="submit" disabled={pending} className="h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60">
          {pending ? "Adding…" : "Add goal"}
        </button>
      </div>
      {chosen && <p className="text-xs text-muted">{chosen.hint}</p>}
      {error && <p className="text-sm text-bad">{error}</p>}
    </form>
  );
}
