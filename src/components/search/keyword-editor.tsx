"use client";

import { useRef, useState, useTransition } from "react";
import { addKeyword, removeKeyword } from "@/app/(app)/search/actions";

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

/** Admins: add a search to track, into an existing group or a new one. */
export function AddKeyword({ brand, groups }: { brand: string; groups: string[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      action={(fd) =>
        start(async () => {
          const r = await addKeyword(fd);
          if (r.ok) {
            form.current?.reset();
            setError(null);
          } else setError(r.message ?? "Couldn't add it.");
        })
      }
      className="no-print mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4"
    >
      <input type="hidden" name="brand" value={brand} />
      <input name="keyword" required placeholder="Add a search to track, e.g. custom jackets edmonton" aria-label="Search to track" className="h-9 min-w-64 flex-1 rounded-lg border border-line bg-page px-3 text-sm" />
      <input name="group" list={`groups-${brand}`} placeholder="Group" aria-label="Group" defaultValue={groups[0] ?? ""} className="h-9 w-48 rounded-lg border border-line bg-page px-3 text-sm" />
      <datalist id={`groups-${brand}`}>
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <button type="submit" disabled={pending} className="h-9 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60">
        {pending ? "Adding…" : "Track it"}
      </button>
      {error && <p className="w-full text-sm text-bad">{error}</p>}
    </form>
  );
}
