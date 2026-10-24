"use client";

import { useRef, useState, useTransition } from "react";
import { addActionItem, setActionStatus } from "@/app/(app)/review-actions";
import type { ActionItem } from "@/lib/data/meetings";

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
      {t.label}: {before === null ? "" : `${before.toLocaleString("en-CA")} → `}
      <span className="font-semibold">{t.display}</span>
      {moved === "good" && <span className="text-good"> · moved the right way</span>}
      {moved === "bad" && <span className="text-bad"> · moved the wrong way</span>}
      {moved === "flat" && <span className="text-muted"> · no change yet</span>}
    </p>
  );
}

function ItemRow({ item, targets, locked }: { item: ActionItem; targets: Map<string, TargetOption>; locked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <li className={`flex flex-wrap items-start justify-between gap-3 py-3 ${pending ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        <p className={`font-semibold ${item.status === "dropped" ? "text-muted line-through" : ""}`}>{item.title}</p>
        <p className="text-xs text-muted">
          {[item.ownerName, item.dueDate ? `due ${item.dueDate}` : null].filter(Boolean).join(" · ") || "No owner yet"}
        </p>
        <Progress item={item} targets={targets} />
      </div>
      <div className="flex gap-1" role="group" aria-label={`Status of ${item.title}`}>
        {(["open", "done", "dropped"] as const).map((s) => (
          <button
            key={s}
            type="button"
            disabled={locked || pending}
            aria-pressed={item.status === s}
            onClick={() => start(() => void setActionStatus(item.id, s))}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${item.status === s ? "bg-ink text-page" : "bg-surface-2 text-ink-2 hover:text-ink"} disabled:cursor-default`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
    </li>
  );
}

export function ActionItems({
  weekStart,
  items,
  previousItems,
  targets,
  locked,
}: {
  weekStart: string;
  items: ActionItem[];
  previousItems: ActionItem[];
  targets: TargetOption[];
  locked: boolean;
}) {
  const byId = new Map(targets.map((t) => [t.id, t]));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div>
        <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">Last week&apos;s action items</h3>
        {previousItems.length ? (
          <ul className="divide-y divide-line">
            {previousItems.map((i) => (
              <ItemRow key={i.id} item={i} targets={byId} locked={false} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-2">None were set last week.</p>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">This week&apos;s action items</h3>
        {items.length > 0 && (
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <ItemRow key={i.id} item={i} targets={byId} locked={locked} />
            ))}
          </ul>
        )}
        {!locked && (
          <form
            ref={form}
            action={(fd) => {
              const target = byId.get(String(fd.get("target") ?? ""));
              if (target?.value !== null && target?.value !== undefined) fd.set("baseline", String(target.value));
              start(async () => {
                const r = await addActionItem(weekStart, fd);
                if (r.ok) {
                  form.current?.reset();
                  setError(null);
                } else setError(r.message ?? "Couldn't add it.");
              });
            }}
            className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_auto_1.5fr_auto]"
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
        )}
        {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      </div>
    </div>
  );
}
