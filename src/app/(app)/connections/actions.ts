"use server";

import { refresh } from "next/cache";
import { getAppContext } from "@/lib/data/source";
import { syncAll } from "@/lib/sync/run-all";

export interface RefreshState {
  message: string | null;
}

/** "Refresh now": admins can re-pull the last few days for every connected account. */
export async function refreshNow(): Promise<RefreshState> {
  const ctx = await getAppContext();
  if (ctx.mode !== "live") return { message: "Preview mode has no live connections." };
  if (ctx.viewer.role !== "admin") return { message: "Only admins can refresh." };

  const results = await syncAll("manual");
  refresh();
  const failed = results.filter((r) => !r.ok);
  if (!results.length) return { message: "Nothing is connected yet." };
  return {
    message: failed.length
      ? `Refreshed ${results.length - failed.length} of ${results.length}. Problems: ${failed.map((f) => f.account).join(", ")}.`
      : `All ${results.length} accounts refreshed.`,
  };
}
