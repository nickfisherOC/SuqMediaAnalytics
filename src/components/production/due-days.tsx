"use client";

import { useState, useTransition } from "react";
import { setShopifyDueDays } from "@/app/production/actions";

/** Admins: how many business days a new store order gets before it's due. */
export function DueDaysSetting({ days }: { days: number }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(new FormData(e.currentTarget).get("days"));
        start(async () => {
          const r = await setShopifyDueDays(n);
          setMessage(r.ok ? { ok: true, text: "Saved. New store orders use this." } : { ok: false, text: r.message ?? "That didn't save." });
        });
      }}
      className="flex flex-wrap items-center gap-2 text-sm text-ink-2"
    >
      <label className="flex items-center gap-2">
        Store orders are due
        <input name="days" type="number" min={0} max={60} defaultValue={days} className="h-8 w-16 rounded-lg border border-line bg-page px-2 text-center text-ink" />
        business days after they&apos;re placed.
      </label>
      <button type="submit" disabled={pending} className="h-8 rounded-lg border border-line px-3 font-medium text-ink disabled:opacity-60">
        Save
      </button>
      {message && <span className={message.ok ? "text-good" : "text-bad"}>{message.text}</span>}
    </form>
  );
}
