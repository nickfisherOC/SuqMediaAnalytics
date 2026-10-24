import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { DEFAULT_BRANDS, type BrandSettings } from "@/config/brands";
import { isPlatform, type Platform } from "@/config/platforms";
import { addDays, todayInEdmonton, type ISODate } from "@/lib/dates";
import { isPreviewMode } from "@/lib/env";
import type { MetricRow } from "@/lib/metrics/engine";
import { generateSampleData } from "@/lib/sample/generate";
import { createUserClient } from "@/lib/supabase/server";

/**
 * Where the app's data comes from. In preview mode (no Supabase configured,
 * local dev only) it's the built-in sample data; otherwise Supabase, read as
 * the signed-in user so RLS applies.
 */

export type Role = "admin" | "viewer";

export interface Viewer {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export interface AppContext {
  mode: "preview" | "live";
  viewer: Viewer;
  brands: BrandSettings[];
  today: ISODate;
}

export interface Flag {
  id: string;
  brand: string;
  platform: Platform | null;
  kind: string;
  severity: "info" | "warning" | "serious";
  dateFrom: ISODate | null;
  dateTo: ISODate | null;
  title: string;
  detail: string | null;
  isSample: boolean;
}

export interface AccountStatus {
  accountId: string | null;
  brand: string;
  platform: Platform;
  displayName: string | null;
  status: "not_connected" | "connected" | "expiring" | "broken" | "sample";
  lastSyncedAt: string | null;
  lastError: string | null;
  rowsLastSync: number | null;
}

const PREVIEW_VIEWER: Viewer = { id: "preview", email: "preview@localhost", name: "Preview", role: "admin" };

const sampleFor = cache((today: ISODate) => generateSampleData(addDays(today, -1)));

interface BrandRow {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  website: string | null;
  accent_light: string;
  accent_dark: string;
  platforms: string[];
  cadence_posts_per_week: number;
  scoreboard: BrandSettings["scoreboard"];
  funnel: BrandSettings["funnel"];
  active: boolean;
}

function toBrand(r: BrandRow): BrandSettings {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    shortName: r.short_name,
    website: r.website,
    accent: { light: r.accent_light, dark: r.accent_dark },
    platforms: r.platforms.filter(isPlatform),
    cadence: { postsPerWeek: Number(r.cadence_posts_per_week) },
    scoreboard: r.scoreboard,
    funnel: r.funnel,
    active: r.active,
  };
}

/** Who's signed in and which brands exist. Cached for the request. */
export const getAppContext = cache(async (): Promise<AppContext> => {
  // Per-request: "today" and the signed-in user must never be baked into a prerender.
  await connection();
  const today = todayInEdmonton();
  if (isPreviewMode) return { mode: "preview", viewer: PREVIEW_VIEWER, brands: DEFAULT_BRANDS, today };

  const supabase = await createUserClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("id, email, full_name, role").eq("id", userId).maybeSingle();
  if (!profile) redirect("/login?error=not_invited");

  const { data: brandRows, error } = await supabase
    .from("brands")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;

  return {
    mode: "live",
    viewer: { id: profile.id, email: profile.email, name: profile.full_name, role: profile.role as Role },
    brands: (brandRows as BrandRow[]).map(toBrand),
    today,
  };
});

const PAGE = 1000;

/** Daily metric rows for the given brands and date range. */
export async function getMetricRows(brandSlugs: string[], from: ISODate, to: ISODate): Promise<MetricRow[]> {
  const ctx = await getAppContext();
  if (ctx.mode === "preview") {
    return sampleFor(ctx.today).rows.filter((r) => brandSlugs.includes(r.brand) && r.date >= from && r.date <= to);
  }

  const supabase = await createUserClient();
  const idToSlug = new Map(
    ctx.brands.filter((b) => brandSlugs.includes(b.slug)).map((b) => [b.id, b.slug]),
  );
  const out: MetricRow[] = [];
  // PostgREST caps responses, so page through.
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("metric_daily")
      .select("brand_id, platform, date, metric_key, value, is_sample")
      .in("brand_id", [...idToSlug.keys()])
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("account_id")
      .order("metric_key")
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    for (const r of data) {
      if (!isPlatform(r.platform)) continue;
      out.push({
        brand: idToSlug.get(r.brand_id)!,
        platform: r.platform,
        date: r.date,
        metric: r.metric_key,
        value: Number(r.value),
        isSample: r.is_sample,
      });
    }
    if (data.length < PAGE) break;
  }
  return out;
}

/** Open data-quality flags overlapping the range. */
export async function getFlags(brandSlugs: string[], from: ISODate, to: ISODate): Promise<Flag[]> {
  const ctx = await getAppContext();
  if (ctx.mode === "preview") {
    return sampleFor(ctx.today)
      .flags.filter((f) => brandSlugs.includes(f.brand) && f.dateFrom <= to && f.dateTo >= from)
      .map((f, i) => ({ ...f, id: `sample-${i}`, isSample: true }));
  }

  const supabase = await createUserClient();
  const slugById = new Map(ctx.brands.map((b) => [b.id, b.slug]));
  const { data, error } = await supabase
    .from("data_flags")
    .select("id, brand_id, platform, kind, severity, date_from, date_to, title, detail, is_sample")
    .is("resolved_at", null);
  if (error) throw error;
  return data
    .filter((f) => !f.brand_id || brandSlugs.includes(slugById.get(f.brand_id) ?? ""))
    .filter((f) => (!f.date_from || f.date_from <= to) && (!f.date_to || f.date_to >= from))
    .map((f) => ({
      id: f.id,
      brand: slugById.get(f.brand_id) ?? "",
      platform: f.platform && isPlatform(f.platform) ? f.platform : null,
      kind: f.kind,
      severity: f.severity,
      dateFrom: f.date_from,
      dateTo: f.date_to,
      title: f.title,
      detail: f.detail,
      isSample: f.is_sample,
    }));
}

/** Connection status for every brand × platform the brands use. */
export async function getAccountStatuses(): Promise<AccountStatus[]> {
  const ctx = await getAppContext();
  const expected = ctx.brands.flatMap((b) => b.platforms.map((platform) => ({ brand: b.slug, platform })));

  if (ctx.mode === "preview") {
    return expected.map((e) => ({
      ...e,
      accountId: null,
      displayName: null,
      status: "sample",
      lastSyncedAt: null,
      lastError: null,
      rowsLastSync: null,
    }));
  }

  const supabase = await createUserClient();
  const slugById = new Map(ctx.brands.map((b) => [b.id, b.slug]));
  const { data, error } = await supabase
    .from("accounts")
    .select("id, brand_id, platform, display_name, status, last_synced_at, last_error");
  if (error) throw error;

  // Rows written by each account's most recent successful sync.
  const { data: runs } = await supabase
    .from("sync_runs")
    .select("account_id, rows_written")
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(200);
  const rowsByAccount = new Map<string, number>();
  for (const r of runs ?? []) if (!rowsByAccount.has(r.account_id)) rowsByAccount.set(r.account_id, r.rows_written ?? 0);

  return expected.map((e) => {
    const accounts = data.filter((a) => slugById.get(a.brand_id) === e.brand && a.platform === e.platform);
    // A real connection wins over sample rows.
    const a = accounts.find((x) => x.status !== "sample") ?? accounts[0];
    return {
      ...e,
      accountId: a?.id ?? null,
      displayName: a?.display_name ?? null,
      status: a?.status ?? "not_connected",
      lastSyncedAt: a?.last_synced_at ?? null,
      lastError: a?.last_error ?? null,
      rowsLastSync: a ? (rowsByAccount.get(a.id) ?? null) : null,
    };
  });
}
