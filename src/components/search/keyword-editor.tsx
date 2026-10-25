"use client";

import { useRef, useState, useTransition } from "react";
import { addKeyword, checkRanksNow, removeKeyword } from "@/app/(app)/search/actions";

/** Admins: remove one keyword (the × on its row). */
export function RemoveKeyword({ id, keyword }: { id: string; keyword: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => void removeKeyword(id))}
      aria-label={`Stop tracking ${keyword}`}
      title="Stop tracking"
      className="no-print rounded px-1.5 text-muted hover:bg-surface-2 hover:text-bad disabled:opacity-50"
    >
      ×
    </button>
  );
}

const NEW = "__new__";

/** Admins: add a search to track, into an existing group or a new one. */
export function AddKeyword({ brand, groups }: { brand: string; groups: string[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState(groups[0] ?? NEW);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      action={(fd) =>
        start(async () => {
          const r = await addKeyword(fd);
          if (r.ok) {
            form.current?.reset();
            setGroup(groups[0] ?? NEW);
            setError(null);
          } else setError(r.message ?? "Couldn't add it.");
        })
      }
      className="no-print mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4"
    >
      <input type="hidden" name="brand" value={brand} />
      <input name="keyword" required placeholder="Add a search to track, e.g. custom jackets edmonton" aria-label="Search to track" className="h-9 min-w-64 flex-1 rounded-lg border border-line bg-page px-3 text-sm" />
      <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Group" className="h-9 rounded-lg border border-line bg-page px-2 text-sm">
        {groups.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
        <option value={NEW}>New group…</option>
      </select>
      {group === NEW ? (
        <input name="group" required placeholder="New group name" aria-label="New group name" className="h-9 w-44 rounded-lg border border-line bg-page px-3 text-sm" />
      ) : (
        <input type="hidden" name="group" value={group} />
      )}
      <button type="submit" disabled={pending} className="h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60">
        {pending ? "Adding…" : "Track it"}
      </button>
      {error && <p className="w-full text-sm text-bad">{error}</p>}
    </form>
  );
}

/** Admins: queue an exact-position check now instead of waiting for Saturday. */
export function CheckRanksNow({ brand }: { brand: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="no-print inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await checkRanksNow(brand);
            setMessage(r.message ?? null);
          })
        }
        className="rounded-md border border-line px-2 py-0.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-60"
      >
        {pending ? "Queuing…" : "Check now"}
      </button>
      {message && <span className="text-xs text-ink-2">{message}</span>}
    </span>
  );
}
