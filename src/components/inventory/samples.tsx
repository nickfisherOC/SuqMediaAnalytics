"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";

export function SampleBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--status-warning)] px-2 py-0.5 text-xs font-semibold text-ink"
      title="Made-up example data, to show how this works. Replace it with your real products."
    >
      <span aria-hidden className="size-1.5 rounded-full bg-[color:var(--status-warning)]" />
      Sample
    </span>
  );
}

/** "These are made up" with a Remove samples button for admins. */
export function SampleNotice({
  isAdmin,
  what,
  next,
  confirmText,
  onRemove,
}: {
  isAdmin: boolean;
  /** e.g. "Suppliers" */
  what: string;
  /** e.g. "Add your real suppliers" */
  next: string;
  confirmText: string;
  onRemove: () => Promise<{ ok: boolean; message?: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--status-warning)] p-4">
      <p className="text-sm text-ink">
        <span className="font-semibold">{what} marked Sample are made up</span>, to show how this works. {next}, then remove the samples.
      </p>
      {isAdmin && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            confirm(confirmText) &&
            start(async () => {
              const r = await onRemove();
              setError(r.ok ? null : (r.message ?? "That didn't work."));
            })
          }
          className="h-9 rounded-lg border border-line px-3 text-sm font-medium text-ink-2 hover:text-bad"
        >
          {pending ? "Removing…" : "Remove samples"}
        </button>
      )}
      {error && (
        <p className={clsx("text-sm text-bad")} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
