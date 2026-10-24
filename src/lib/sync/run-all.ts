import { addDays, todayInEdmonton } from "@/lib/dates";
import { createServiceClient } from "@/lib/supabase/service";
import { loadAccounts, syncAccount, type SyncOutcome } from "./engine";

/** Platforms revise the last couple of days, so every run re-pulls a few. */
export const DAILY_LOOKBACK_DAYS = 4;

/** Syncs every connected account for the last few days. Used by the nightly cron and "Refresh now". */
export async function syncAll(job: "daily" | "manual", accountIds?: string[]): Promise<SyncOutcome[]> {
  const db = createServiceClient();
  const today = todayInEdmonton();
  const from = addDays(today, -DAILY_LOOKBACK_DAYS);
  const accounts = await loadAccounts(db, accountIds ? { ids: accountIds } : undefined);
  // One at a time: gentle on rate limits, and the whole run takes well under a minute.
  const results: SyncOutcome[] = [];
  for (const a of accounts) results.push(await syncAccount(db, a, from, today, job));
  return results;
}
