"use client";

import { useEffect, useRef, useState } from "react";
import { saveNotes } from "@/app/(app)/review-actions";

/** The week's shared meeting notes. Saves a second after typing stops. */
export function MeetingNotes({ weekStart, initial, locked }: { weekStart: string; initial: string; locked: boolean }) {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(initial);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function onChange(v: string) {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (v === last.current) return;
      setStatus("saving");
      const r = await saveNotes(weekStart, v);
      if (r.ok) {
        last.current = v;
        setStatus("saved");
        setError(null);
      } else {
        setStatus("error");
        setError(r.message ?? "Couldn't save.");
      }
    }, 1000);
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor="meeting-notes" className="text-sm font-semibold tracking-wide text-muted uppercase">
          Meeting notes
        </label>
        <span className="text-xs text-muted" role="status">
          {locked ? "Locked" : status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? error : "Saves as you type"}
        </span>
      </div>
      {locked ? (
        <div className="min-h-24 whitespace-pre-wrap text-ink">{text || <span className="text-muted">No notes were taken.</span>}</div>
      ) : (
        <textarea
          id="meeting-notes"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          placeholder="Decisions, ideas, who's doing what…"
          className="w-full resize-y rounded-xl border border-line bg-page p-3 text-base leading-relaxed"
        />
      )}
    </div>
  );
}
