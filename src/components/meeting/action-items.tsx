"use client";

import { useRef, useState, useTransition } from "react";
import { addActionItem, setActionStatus } from "@/app/(app)/review-actions";
import type { ActionItem } from "@/lib/data/meeting";

export interface TargetOption {
  id: string;
  label: string;
  value: number | null;
  /** Display string for the value now. */
  display: string;
  higherIsBetter: boolean | null;
}

const STATUS_LABEL = { open: "Open", done: "Done", dropped: "Dropped" } as const;

function Progress({ item, targets }: { item: ActionItem; targets: Map<string, TargetOption> }) {
  if (!item.targetFigure) return null;
  const t = targets.get(item.targetFigure);
  if (!t) return null;
  const before = item.baselineValue;
  const moved =
    before === null || t.value === null ? null : t.value === before ? "flat" : (t.value > before) === (t.higherIsBetter !== false) ? "good" : "bad";
  return (
    <p className="text-xs text-ink-2">
      {t.label}: {before === null ? "" : `${before.toLocaleString("en-CA")} when added → `}
      <span className="font-semibold">{t.display} now</span>
      {moved === "good" && <span className="text-good"> · moving the right way</span>}
      {moved === "bad" && <span className="text-bad"> · moving the wrong way</span>}
      {moved === "flat" && <span className="text-muted"> · no change yet</span>}
    </p>
  );
}

function ItemRow({ item, targets }: { item: ActionItem; targets: Map<string, TargetOption> }) {
  const [pending, start] = useTransition();
  return (
    <li className={`flex flex-wrap items-start justify-between gap-3 py-3 ${pending ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        <p className={`font-semibold ${item.status === "dropped" ? "text-muted line-through" : ""}`}>{item.title}</p>
        <p className="text-xs text-muted">
          {[item.ownerName ?? "No owner yet", item.dueDate ? `due ${item.dueDate}` : null, `added ${item.createdOn}`].filter(Boolean).join(" · ")}
        </p>
        <Progress item={item} targets={targets} />
      </div>
      <div className="flex gap-1" role="group" aria-label={`Status of ${item.title}`}>
        {(["open", "done", "dropped"] as const).map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending}
            aria-pressed={item.status === s}
            onClick={() => start(() => void setActionStatus(item.id, s))}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${item.status === s ? "bg-ink text-page" : "bg-surface-2 text-ink-2 hover:text-ink"}`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
    </li>
  );
}

/** One running list: open items until they're done, plus what was finished in the last two weeks. */
export function ActionItems({ items, targets }: { items: ActionItem[]; targets: TargetOption[] }) {
  const byId = new Map(targets.map((t) => [t.id, t]));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const open = items.filter((i) => i.status === "open");
  const finished = items.filter((i) => i.status !== "open");

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">Action items · open</h3>
        {open.length ? (
          <ul className="divide-y divide-line">
            {open.map((i) => (
              <ItemRow key={i.id} item={i} targets={byId} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-2">Nothing open. Add one below.</p>
        )}
      </div>

      <form
        ref={form}
        action={(fd) => {
          const target = byId.get(String(fd.get("target") ?? ""));
          if (target?.value !== null && target?.value !== undefined) fd.set("baseline", String(target.value));
          start(async () => {
            const r = await addActionItem(fd);
            if (r.ok) {
              form.current?.reset();
              setError(null);
            } else setError(r.message ?? "Couldn't add it.");
          });
        }}
        className="no-print grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_auto_1.5fr_auto]"
      >
        <input name="title" required placeholder="What will we do?" aria-label="Action item" className="h-10 rounded-lg border border-line bg-page px-3" />
        <input name="owner" placeholder="Who" aria-label="Owner" className="h-10 rounded-lg border border-line bg-page px-3" />
        <input name="due" type="date" aria-label="Due date" className="h-10 rounded-lg border border-line bg-page px-2" />
        <select name="target" aria-label="Number it should move (optional)" defaultValue="" className="h-10 rounded-lg border border-line bg-page px-2">
          <option value="">Number it should move (optional)</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} (now {t.display})
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60">
          {pending ? "Adding…" : "Add"}
        </button>
      </form>
      {error && <p className="text-sm text-bad">{error}</p>}

      {finished.length > 0 && (
        <div className="border-t border-line pt-4">
          <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">Finished in the last two weeks</h3>
          <ul className="divide-y divide-line">
            {finished.map((i) => (
              <ItemRow key={i.id} item={i} targets={byId} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
