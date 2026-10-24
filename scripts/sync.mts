/**
 * Runs a sync by hand, e.g. a first backfill.
 *
 *   npm run sync                          last 4 days, every connected account
 *   npm run sync -- --from 2026-10-01     backfill from a date
 *   npm run sync -- --platform shopify    one platform only
 */
import { addDays, isISODate, todayInEdmonton } from "@/lib/dates";
import { loadAccounts, syncAccount } from "@/lib/sync/engine";
import { createServiceClient } from "@/lib/supabase/service";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const today = todayInEdmonton();
const from = arg("from") ?? addDays(today, -4);
const to = arg("to") ?? today;
if (!isISODate(from) || !isISODate(to)) throw new Error("Dates must be YYYY-MM-DD.");

const db = createServiceClient();
const accounts = (await loadAccounts(db)).filter((a) => !arg("platform") || a.platform === arg("platform"));
console.log(`Syncing ${accounts.length} accounts, ${from} to ${to}`);
let failed = 0;
for (const a of accounts) {
  const started = Date.now();
  const r = await syncAccount(db, a, from, to, arg("from") ? "backfill" : "manual");
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.account}: ${r.ok ? `${r.rows} rows` : r.error} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  if (!r.ok) failed++;
}
process.exit(failed ? 1 : 0);
