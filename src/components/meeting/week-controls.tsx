"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createShareLink, lockWeek } from "@/app/(app)/review-actions";

/** Present · PDF · Lock · Share, above the Weekly Review. */
export function WeekControls({
  weekStart,
  presentHref,
  locked,
  isAdmin,
  weekOver,
  shareToken,
  shareExpiresAt,
}: {
  weekStart: string | null;
  presentHref: string;
  locked: boolean;
  isAdmin: boolean;
  weekOver: boolean;
  shareToken: string | null;
  shareExpiresAt: string | null;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(
    shareToken && shareExpiresAt && new Date(shareExpiresAt) > new Date() ? `/share/${shareToken}` : null,
  );
  const full = (path: string) => (typeof window === "undefined" ? path : `${window.location.origin}${path}`);
  const btn = "rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-60";

  return (
    <div className="no-print flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={presentHref} className={btn}>
          Present
        </Link>
        <button type="button" className={btn} onClick={() => window.print()}>
          Export PDF
        </button>
        {isAdmin && weekStart && !locked && (
          <button
            type="button"
            className={btn}
            disabled={pending || !weekOver}
            title={weekOver ? "Freeze this week's numbers, summary and notes" : "You can lock a week once it's over"}
            onClick={() => {
              if (!confirm("Lock this week? The numbers, summary and notes will be frozen exactly as they are now.")) return;
              start(async () => setMessage((await lockWeek(weekStart)).message ?? null));
            }}
          >
            {pending ? "Locking…" : "Lock week"}
          </button>
        )}
        {isAdmin && weekStart && locked && (
          <button
            type="button"
            className={btn}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await createShareLink(weekStart);
                setMessage(r.message ?? null);
                if (r.url) setShareUrl(r.url);
              })
            }
          >
            {shareUrl ? "New share link" : "Share link"}
          </button>
        )}
      </div>
      {shareUrl && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          Read-only link:
          <code className="rounded bg-surface-2 px-2 py-0.5 text-xs">{full(shareUrl)}</code>
          <button type="button" className="text-xs underline" onClick={() => void navigator.clipboard.writeText(full(shareUrl))}>
            Copy
          </button>
        </p>
      )}
      {message && (
        <p className="text-sm text-ink-2" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
