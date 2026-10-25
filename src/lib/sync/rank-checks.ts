import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandSettings } from "@/config/brands";
import { addDays, type ISODate } from "@/lib/dates";
import { brandHosts, RANK_CITIES, RANK_DEPTH, readSerp, type SerpItem } from "@/lib/rank";

/**
 * Exact Google positions through DataForSEO's standard queue (the cheap
 * one): checks are posted, then collected on a later run once Google has
 * been searched. Posting happens weekly from the nightly job, or on demand.
 */

const BASE = "https://api.dataforseo.com/v3/serp/google/organic";

export const rankCheckerConfigured = () => Boolean(process.env.DATAFORSEO_AUTH?.trim());

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    ...init,
    headers: { Authorization: `Basic ${process.env.DATAFORSEO_AUTH!.trim()}`, "Content-Type": "application/json" },
  });
  const body = (await res.json()) as T & { status_code?: number; status_message?: string };
  if (body.status_code !== 20000) throw new Error(`DataForSEO: ${body.status_message ?? res.status}`);
  return body;
}

interface Task<R> {
  id: string;
  status_code: number;
  status_message: string;
  cost?: number;
  data?: { tag?: string };
  result?: R[] | null;
}

/** Queues a check of every tracked keyword, from each city, for these brands. Returns how many were posted. */
export async function postRankChecks(db: SupabaseClient, brands: BrandSettings[], today: ISODate): Promise<number> {
  const { data: keywords, error } = await db.from("search_keywords").select("brand_id, keyword").in("brand_id", brands.map((b) => b.id));
  if (error) throw error;
  const rows = (keywords ?? []).flatMap((k) => RANK_CITIES.map((city) => ({ brand_id: k.brand_id, keyword: k.keyword, city, checked_on: today })));
  let posted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const { data: saved, error: insErr } = await db.from("rank_checks").insert(rows.slice(i, i + 100)).select("id, keyword, city");
    if (insErr) throw insErr;
    try {
      const res = await api<{ tasks: Task<never>[] }>("task_post", {
        method: "POST",
        body: JSON.stringify(saved.map((r) => ({ keyword: r.keyword, location_name: r.city, language_code: "en", depth: RANK_DEPTH, tag: r.id }))),
      });
      for (const t of res.tasks) {
        const id = t.data?.tag;
        if (!id) continue;
        const ok = t.status_code === 20100 || t.status_code === 20000;
        await db
          .from("rank_checks")
          .update(ok ? { task_id: t.id, cost_usd: t.cost ?? null } : { status: "error", error: t.status_message, finished_at: new Date().toISOString() })
          .eq("id", id);
        if (ok) posted++;
      }
    } catch (e) {
      await db
        .from("rank_checks")
        .update({ status: "error", error: e instanceof Error ? e.message : String(e), finished_at: new Date().toISOString() })
        .in("id", saved.map((r) => r.id));
      throw e;
    }
  }
  return posted;
}

/** Collects finished checks. Ones still queued are left for the next run; anything older than two days is given up on. */
export async function collectRankChecks(db: SupabaseClient, brands: BrandSettings[], today: ISODate): Promise<number> {
  const { data: pending, error } = await db
    .from("rank_checks")
    .select("id, brand_id, task_id, checked_on")
    .eq("status", "pending")
    .not("task_id", "is", null)
    .limit(300);
  if (error) throw error;
  let done = 0;
  for (const row of pending ?? []) {
    const brand = brands.find((b) => b.id === row.brand_id);
    let task: Task<{ items?: SerpItem[] }> | undefined;
    try {
      task = (await api<{ tasks: Task<{ items?: SerpItem[] }>[] }>(`task_get/advanced/${row.task_id}`)).tasks[0];
    } catch {
      continue; // try again next run
    }
    if (task?.status_code === 20000 && task.result?.[0] && brand) {
      const r = readSerp(task.result[0].items ?? [], brandHosts(brand.website), brand.name);
      await db
        .from("rank_checks")
        .update({ status: "done", position: r.position, url: r.url, above: r.above, map_pack: r.mapPack, map_rank: r.mapRank, finished_at: new Date().toISOString() })
        .eq("id", row.id);
      done++;
    } else if (row.checked_on < addDays(today, -2)) {
      await db
        .from("rank_checks")
        .update({ status: "error", error: task?.status_message ?? "No result", finished_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }
  return done;
}

/** Saturday: the weekly check, so Monday's meeting has fresh positions. */
export const RANK_CHECK_WEEKDAY = 6;
