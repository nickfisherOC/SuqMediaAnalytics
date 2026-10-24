import { todayInEdmonton, edmontonDateOf } from "@/lib/dates";
import type { SyncContext } from "./types";

/**
 * Shared writer for individual posts and videos: one row per item in
 * `content_items`, plus today's snapshot of its lifetime totals in
 * `content_metrics_snapshots`. Snapshots are kept forever, so Pulse can show
 * how each video grows and work out daily numbers where a platform only gives
 * lifetime totals.
 */

export interface ContentInput {
  externalId: string;
  url: string | null;
  caption: string | null;
  publishedAt: string; // ISO timestamp
  format: "reel" | "short" | "video" | "post" | "photo" | "carousel" | "story";
  durationSeconds?: number | null;
  thumbnailUrl?: string | null;
  status?: "published" | "under_review" | "private" | "unlisted";
  snapshot: {
    views?: number | null;
    reach?: number | null;
    likes?: number | null;
    comments?: number | null;
    shares?: number | null;
    saves?: number | null;
    watchSeconds?: number | null;
    avgViewPct?: number | null;
    extra?: Record<string, unknown>;
  };
}

/** Saves items and today's snapshot. Returns the stored ids by external id. */
export async function saveContent(ctx: SyncContext, items: ContentInput[]): Promise<Map<string, { id: string; publishedDate: string }>> {
  const out = new Map<string, { id: string; publishedDate: string }>();
  if (!items.length) return out;
  const now = new Date().toISOString();
  const { data, error } = await ctx.db
    .from("content_items")
    .upsert(
      items.map((i) => ({
        account_id: ctx.account.id,
        brand_id: ctx.account.brandId,
        platform: ctx.account.platform,
        external_id: i.externalId,
        url: i.url,
        caption: i.caption,
        published_at: i.publishedAt,
        published_date: edmontonDateOf(i.publishedAt),
        format: i.format,
        duration_seconds: i.durationSeconds ?? null,
        thumbnail_url: i.thumbnailUrl ?? null,
        status: i.status ?? "published",
        is_sample: false,
        updated_at: now,
      })),
      { onConflict: "account_id,external_id" },
    )
    .select("id, external_id, published_date");
  if (error) throw error;
  for (const r of data) out.set(r.external_id, { id: r.id, publishedDate: r.published_date });

  const today = todayInEdmonton();
  const byExt = new Map(items.map((i) => [i.externalId, i]));
  const { error: sErr } = await ctx.db.from("content_metrics_snapshots").upsert(
    data.map((r) => {
      const s = byExt.get(r.external_id)!.snapshot;
      return {
        content_item_id: r.id,
        captured_on: today,
        views: s.views ?? null,
        reach: s.reach ?? null,
        likes: s.likes ?? null,
        comments: s.comments ?? null,
        shares: s.shares ?? null,
        saves: s.saves ?? null,
        watch_seconds: s.watchSeconds ?? null,
        avg_view_pct: s.avgViewPct ?? null,
        extra: s.extra ?? {},
        is_sample: false,
      };
    }),
    { onConflict: "content_item_id,captured_on" },
  );
  if (sErr) throw sErr;
  return out;
}
