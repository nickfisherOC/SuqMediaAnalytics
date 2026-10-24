"use client";

import Link from "next/link";

/** Present and Export PDF, above the Weekly Review. */
export function WeekControls({ presentHref }: { presentHref: string }) {
  const btn = "rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface-2";
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Link href={presentHref} className={btn}>
        Present
      </Link>
      <button type="button" className={btn} onClick={() => window.print()}>
        Export PDF
      </button>
    </div>
  );
}
