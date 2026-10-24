"use client";

import { useRef, useState, useTransition } from "react";
import { addNote, deleteNote } from "@/app/(app)/review-actions";
import type { Note } from "@/lib/data/meeting";
import { formatShort } from "@/lib/dates";

/** A dated log of notes and decisions. Each note also marks that date on the charts. */
export function NotesLog({
  notes,
  today,
  brands,
  isAdmin,
}: {
  notes: Note[];
  today: string;
  brands: { slug: string; name: string }[];
  isAdmin: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const brandName = new Map(brands.map((b) => [b.slug, b.name]));

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">Notes</h3>
      <form
        ref={form}
        action={(fd) =>
          start(async () => {
            const r = await addNote(fd);
            if (r.ok) {
              form.current?.reset();
              setError(null);
            } else setError(r.message ?? "Couldn't save the note.");
          })
        }
        className="no-print flex flex-col gap-2"
      >
        <textarea
          name="text"
          required
          rows={3}
          placeholder="A decision, an idea, or something that happened (e.g. “Started pinning a question on every reel”)"
          aria-label="Note"
          className="w-full resize-y rounded-xl border border-line bg-page p-3"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input name="date" type="date" defaultValue={today} aria-label="Date" className="h-10 rounded-lg border border-line bg-page px-2" />
          <select name="brand" defaultValue="" aria-label="Brand" className="h-10 rounded-lg border border-line bg-page px-2">
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={pending} className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-page disabled:opacity-60">
            {pending ? "Saving…" : "Add note"}
          </button>
          {error && <span className="text-sm text-bad">{error}</span>}
        </div>
      </form>

      {notes.length ? (
        <ol className="divide-y divide-line">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted">
                  {formatShort(n.date)}
                  {n.brand ? ` · ${brandName.get(n.brand) ?? n.brand}` : ""}
                  {n.author ? ` · ${n.author}` : ""}
                </p>
                <p className="whitespace-pre-wrap">{n.text}</p>
              </div>
              {(n.mine || isAdmin) && (
                <button
                  type="button"
                  className="no-print shrink-0 text-xs text-muted hover:text-bad"
                  onClick={() => confirm("Delete this note?") && start(() => void deleteNote(n.id))}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-2">No notes yet.</p>
      )}
    </div>
  );
}
