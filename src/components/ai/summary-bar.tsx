"use client";

import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { rewriteSummary } from "@/app/(app)/review-actions";

/** Under the headline: who wrote it and when, a staleness note, and a button to (re)write it. */
export function SummaryBar({ brand, generatedAt, stale }: { brand: string; generatedAt: string | null; stale: boolean }) {
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const write = () =>
    start(async () => {
      setMessage(null);
      const r = await rewriteSummary(brand, Object.fromEntries(params.entries()));
      if (!r.ok) setMessage(r.message ?? "Couldn't write it.");
    });

  const when = generatedAt
    ? new Date(generatedAt).toLocaleString("en-CA", { timeZone: "America/Edmonton", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      {when ? (
        <span>Written by Pulse AI from this period&apos;s numbers · {when}</span>
      ) : (
        <span>Picked from the biggest changes. Pulse AI hasn&apos;t written this period yet.</span>
      )}
      {stale && <span className="text-ink-2">The numbers have updated since it was written.</span>}
      <button
        type="button"
        onClick={write}
        disabled={pending}
        className="no-print rounded-md border border-line px-2 py-0.5 font-medium text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-60"
      >
        {pending ? "Writing… (about a minute)" : when ? "Rewrite" : "Write it now"}
      </button>
      {message && <span className="text-bad">{message}</span>}
    </div>
  );
}
