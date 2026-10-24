import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { DEFAULT_BRANDS, type BrandSettings } from "@/config/brands";
import type { Platform } from "@/config/platforms";
import { addDays, todayInEdmonton, type ISODate } from "@/lib/dates";
import { isPreviewMode } from "@/lib/env";
import type { ContentCard } from "@/lib/content";
import type { MetricRow } from "@/lib/metrics/engine";
import { generateSampleData } from "@/lib/sample/generate";
import { createUserClient } from "@/lib/supabase/server";
import { queryBrands, queryContent, queryFlags, queryMetricRows, type Flag } from "./queries";

export type { Flag };

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

  return {
    mode: "live",
    viewer: { id: profile.id, email: profile.email, name: profile.full_name, role: profile.role as Role },
    brands: await queryBrands(supabase),
    today,
  };
});

/** Daily metric rows for the given brands and date range. */
export async function getMetricRows(brandSlugs: string[], from: ISODate, to: ISODate): Promise<MetricRow[]> {
  const ctx = await getAppContext();
  if (ctx.mode === "preview") {
    return sampleFor(ctx.today).rows.filter((r) => brandSlugs.includes(r.brand) && r.date >= from && r.date <= to);
  }
  return queryMetricRows(await createUserClient(), ctx.brands, brandSlugs, from, to);
}

/** Open data-quality flags overlapping the range. */
export async function getFlags(brandSlugs: string[], from: ISODate, to: ISODate): Promise<Flag[]> {
  const ctx = await getAppContext();
  if (ctx.mode === "preview") {
    return sampleFor(ctx.today)
      .flags.filter((f) => brandSlugs.includes(f.brand) && f.dateFrom <= to && f.dateTo >= from)
      .map((f, i) => ({ ...f, id: `sample-${i}`, isSample: true }));
  }
  return queryFlags(await createUserClient(), ctx.brands, brandSlugs, from, to);
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

/** Posts and videos published in the range, each with its latest lifetime numbers. */
export async function getContent(brandSlugs: string[], from: ISODate, to: ISODate): Promise<(ContentCard & { brand: string })[]> {
  const ctx = await getAppContext();
  if (ctx.mode === "preview") return [];
  return queryContent(await createUserClient(), ctx.brands, brandSlugs, from, to);
}

/** loadWeek's reader for pages: the signed-in user's view, or sample data in preview mode. */
export const userWeekReader = { metricRows: getMetricRows, flags: getFlags, content: getContent };
