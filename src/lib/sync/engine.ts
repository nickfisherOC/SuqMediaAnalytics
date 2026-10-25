import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONNECTORS } from "@/lib/connectors";
import {
  ConnectorConfigError,
  type AccountRecord,
  type FlagInput,
  type MetricPoint,
  type RawCapture,
} from "@/lib/connectors/types";
import { isPlatform } from "@/config/platforms";
import type { ISODate } from "@/lib/dates";

/**
 * Runs one account's connector for a date range and writes the results.
 * Idempotent: re-running a day overwrites that day's numbers. Every run is
 * logged in `sync_runs`, and every API response is kept in `raw_ingest`.
 */

export interface SyncOutcome {
  account: string;
  ok: boolean;
  rows: number;
  error?: string;
}

const CHUNK = 500;

export async function loadAccounts(db: SupabaseClient, filter?: { ids?: string[] }): Promise<AccountRecord[]> {
  let q = db
    .from("accounts")
    .select("id, brand_id, platform, external_id, display_name, settings, brands!inner(slug)")
    .eq("is_sample", false)
    .in("status", ["connected", "expiring", "broken"]);
  if (filter?.ids) q = q.in("id", filter.ids);
  const { data, error } = await q;
  if (error) throw error;
  return data
    .filter((a) => isPlatform(a.platform) && CONNECTORS[a.platform as keyof typeof CONNECTORS])
    .map((a) => ({
      id: a.id,
      brandId: a.brand_id,
      brandSlug: (a.brands as unknown as { slug: string }).slug,
      platform: a.platform,
      externalId: a.external_id,
      displayName: a.display_name,
      settings: (a.settings ?? {}) as Record<string, unknown>,
    }));
}

export async function syncAccount(
  db: SupabaseClient,
  account: AccountRecord,
  from: ISODate,
  to: ISODate,
  job: "backfill" | "daily" | "manual",
): Promise<SyncOutcome> {
  const label = `${account.brandSlug}/${account.platform}`;
  const connector = CONNECTORS[account.platform as keyof typeof CONNECTORS];
  if (!connector) return { account: label, ok: false, rows: 0, error: "No connector for this platform yet." };

  const { data: run, error: runErr } = await db
    .from("sync_runs")
    .insert({ account_id: account.id, job, from_date: from, to_date: to, status: "running", attempts: 1, started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (runErr) throw runErr;

  const raws: RawCapture[] = [];
  const flags: FlagInput[] = [];

  try {
    const result = await connector({
      db,
      account,
      from,
      to,
      syncRunId: run.id,
      capture: (r) => raws.push(r),
      flag: (f) => flags.push(f),
      secret: async (kind) => {
        const { data, error } = await db.rpc("get_account_token", { p_account_id: account.id, p_kind: kind });
        if (error) throw error;
        if (!data) throw new ConnectorConfigError(`No ${kind} credential stored for ${label}.`);
        return data as string;
      },
    });

    await writeRaw(db, account.id, run.id, raws);
    const rows = await writeMetrics(db, account, run.id, result.metrics);
    await writeFlags(db, account, flags);
    await retireSample(db, account);

    const total = rows + (result.extraRows ?? 0);
    await db.from("sync_runs").update({ status: "succeeded", finished_at: new Date().toISOString(), rows_written: total }).eq("id", run.id);
    await db
      .from("accounts")
      .update({ status: "connected", last_synced_at: new Date().toISOString(), last_error: null, consecutive_failures: 0 })
      .eq("id", account.id);
    return { account: label, ok: true, rows: total };
  } catch (e) {
    // Supabase errors are plain objects with a message, not Error instances.
    const message = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
    // Keep whatever was captured: it helps diagnose the failure.
    await writeRaw(db, account.id, run.id, raws).catch(() => {});
    await db.from("sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), error: message }).eq("id", run.id);
    const { data: acc } = await db.from("accounts").select("consecutive_failures").eq("id", account.id).single();
    const failures = (acc?.consecutive_failures ?? 0) + 1;
    await db
      .from("accounts")
      .update({
        last_error: message.slice(0, 500),
        consecutive_failures: failures,
        status: e instanceof ConnectorConfigError || failures >= 2 ? "broken" : "connected",
      })
      .eq("id", account.id);
    return { account: label, ok: false, rows: 0, error: message };
  }
}

async function writeRaw(db: SupabaseClient, accountId: string, runId: number, raws: RawCapture[]) {
  const rows = raws.map((r) => {
    const json = JSON.stringify(r.payload ?? null);
    return {
      account_id: accountId,
      sync_run_id: runId,
      endpoint: r.endpoint,
      params: r.params ?? {},
      for_date: r.forDate ?? null,
      payload: r.payload ?? null,
      payload_hash: createHash("sha256").update(r.endpoint + json).digest("hex"),
    };
  });
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db
      .from("raw_ingest")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "account_id,endpoint,payload_hash", ignoreDuplicates: true });
    if (error) throw error;
  }
}

async function writeMetrics(db: SupabaseClient, account: AccountRecord, runId: number, metrics: MetricPoint[]) {
  // Last write wins if a connector emits the same metric twice for a day.
  const byKey = new Map<string, MetricPoint>();
  for (const m of metrics) if (Number.isFinite(m.value)) byKey.set(`${m.date}|${m.metric}`, m);
  const rows = [...byKey.values()].map((m) => ({
    account_id: account.id,
    brand_id: account.brandId,
    platform: account.platform,
    date: m.date,
    metric_key: m.metric,
    value: m.value,
    is_sample: false,
    sync_run_id: runId,
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("metric_daily").upsert(rows.slice(i, i + CHUNK), { onConflict: "account_id,date,metric_key" });
    if (error) throw error;
  }
  return rows.length;
}

async function writeFlags(db: SupabaseClient, account: AccountRecord, flags: FlagInput[]) {
  for (const f of flags) {
    const ref = { key: f.key, account_id: account.id };
    const { data: existing } = await db.from("data_flags").select("id").contains("ref", ref).maybeSingle();
    const row = {
      brand_id: account.brandId,
      platform: account.platform,
      kind: f.kind,
      severity: f.severity,
      date_from: f.dateFrom,
      date_to: f.dateTo,
      title: f.title,
      detail: f.detail,
      ref,
      is_sample: false,
    };
    const { error } = existing
      ? await db.from("data_flags").update(row).eq("id", existing.id)
      : await db.from("data_flags").insert(row);
    if (error) throw error;
  }
}

/** Once real data flows for a brand and platform, its sample data goes. */
async function retireSample(db: SupabaseClient, account: AccountRecord) {
  await db.from("accounts").delete().eq("brand_id", account.brandId).eq("platform", account.platform).eq("is_sample", true);
  await db.from("data_flags").delete().eq("brand_id", account.brandId).eq("platform", account.platform).eq("is_sample", true);
}
