import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandSettings } from "@/config/brands";
import { isPlatform, type Platform } from "@/config/platforms";
import type { ContentCard } from "@/lib/content";
import type { ISODate } from "@/lib/dates";
import type { MetricRow } from "@/lib/metrics/engine";

/**
 * The database reads behind the reporting pages, taking any Supabase client:
 * the signed-in user's (RLS applies) for pages, or the service client for
 * nightly jobs such as the AI summary.
 */

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

export async function queryBrands(db: SupabaseClient): Promise<BrandSettings[]> {
  const { data, error } = await db.from("brands").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return (data as BrandRow[]).map(toBrand);
}

const PAGE = 1000;

/** Daily metric rows for the given brands and date range. */
export async function queryMetricRows(db: SupabaseClient, brands: BrandSettings[], brandSlugs: string[], from: ISODate, to: ISODate): Promise<MetricRow[]> {
  const idToSlug = new Map(brands.filter((b) => brandSlugs.includes(b.slug)).map((b) => [b.id, b.slug]));
  const out: MetricRow[] = [];
  // PostgREST caps responses, so page through.
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
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
export async function queryFlags(db: SupabaseClient, brands: BrandSettings[], brandSlugs: string[], from: ISODate, to: ISODate): Promise<Flag[]> {
  const slugById = new Map(brands.map((b) => [b.id, b.slug]));
  const { data, error } = await db
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

/** Posts and videos published in the range, each with its latest lifetime numbers. */
export async function queryContent(db: SupabaseClient, brands: BrandSettings[], brandSlugs: string[], from: ISODate, to: ISODate): Promise<(ContentCard & { brand: string })[]> {
  const slugById = new Map(brands.filter((b) => brandSlugs.includes(b.slug)).map((b) => [b.id!, b.slug]));
  const { data: items, error } = await db
    .from("content_items")
    .select("id, brand_id, platform, url, caption, published_date, format, thumbnail_url, status")
    .in("brand_id", [...slugById.keys()])
    .gte("published_date", from)
    .lte("published_date", to)
    .limit(1000);
  if (error) throw error;
  if (!items.length) return [];

  const latest = new Map<string, { captured_on: string; views: number | null; likes: number | null; comments: number | null; shares: number | null }>();
  for (let i = 0; i < items.length; i += 200) {
    const { data: snaps, error: sErr } = await db
      .from("content_metrics_snapshots")
      .select("content_item_id, captured_on, views, likes, comments, shares")
      .in("content_item_id", items.slice(i, i + 200).map((x) => x.id))
      .order("captured_on", { ascending: false })
      .limit(5000);
    if (sErr) throw sErr;
    for (const s of snaps) if (!latest.has(s.content_item_id)) latest.set(s.content_item_id, s);
  }

  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return items
    .filter((it) => isPlatform(it.platform))
    .map((it) => {
      const s = latest.get(it.id);
      return {
        brand: slugById.get(it.brand_id)!,
        id: it.id,
        platform: it.platform as Platform,
        url: it.url,
        caption: it.caption,
        publishedDate: it.published_date,
        format: it.format,
        thumbnailUrl: it.thumbnail_url,
        status: it.status,
        views: num(s?.views),
        likes: num(s?.likes),
        comments: num(s?.comments),
        shares: num(s?.shares),
        capturedOn: s?.captured_on ?? null,
      };
    });
}
