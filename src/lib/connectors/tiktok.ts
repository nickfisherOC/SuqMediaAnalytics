import { addDays, eachDay, edmontonDateOf, todayInEdmonton, type ISODate } from "@/lib/dates";
import { fetchJson } from "./http";
import { ConnectorConfigError, type Connector, type MetricPoint, type SyncContext } from "./types";

/**
 * TikTok (Login Kit + Display API v2, open.tiktokapis.com). The API only gives
 * each video's lifetime totals and the account's current follower count, so
 * Pulse snapshots every video nightly and works out each day's views, likes,
 * comments and shares from the change since the day before. Daily numbers
 * therefore start the day after TikTok is connected.
 *
 * Access tokens last 24 hours; the refresh token can change on every refresh,
 * so the new one is saved each run.
 */

export const TIKTOK_SCOPES = ["user.info.basic", "user.info.stats", "video.list"];
const API = "https://open.tiktokapis.com/v2";

export function tiktokClient() {
  const key = process.env.TIKTOK_CLIENT_KEY?.trim();
  const secret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  if (!key || !secret) throw new ConnectorConfigError("TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET must be set.");
  return { key, secret };
}

export interface TikTokTokens {
  access_token: string;
  refresh_token: string;
  open_id: string;
  scope: string;
}

export async function tiktokToken(params: Record<string, string>): Promise<TikTokTokens> {
  const { key, secret } = tiktokClient();
  const { status, body } = await fetchJson<Partial<TikTokTokens> & { error?: string; error_description?: string }>(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: key, client_secret: secret, ...params }),
  });
  if (!body?.access_token || !body.refresh_token) {
    const msg = `TikTok: token request failed (${status} ${body?.error ?? ""} ${body?.error_description ?? ""}). Reconnect TikTok on the Connections page.`.trim();
    throw body?.error === "invalid_grant" ? new ConnectorConfigError(msg) : new Error(msg);
  }
  return body as TikTokTokens;
}

async function api<T>(ctx: SyncContext | null, token: string, path: string, init: RequestInit = {}): Promise<T> {
  const { status, body } = await fetchJson<{ data?: T; error?: { code: string; message: string } }>(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  ctx?.capture({ endpoint: path.split("?")[0], params: { path, body: init.body ? JSON.parse(String(init.body)) : undefined }, payload: body });
  if (body?.error && body.error.code !== "ok") {
    const msg = `TikTok: ${body.error.message || body.error.code}`;
    throw status === 401 || body.error.code.includes("access_token") || body.error.code.includes("scope") ? new ConnectorConfigError(msg) : new Error(msg);
  }
  return body?.data as T;
}

export interface TikTokUser {
  open_id: string;
  display_name: string;
  follower_count?: number;
  likes_count?: number;
  video_count?: number;
}

export async function tiktokUser(ctx: SyncContext | null, token: string): Promise<TikTokUser> {
  const data = await api<{ user: TikTokUser }>(ctx, token, `/user/info/?fields=open_id,display_name,follower_count,likes_count,video_count`);
  return data.user;
}

interface Video {
  id: string;
  create_time: number;
  title?: string;
  video_description?: string;
  duration?: number;
  cover_image_url?: string;
  share_url?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}

const VIDEO_FIELDS = "id,create_time,title,video_description,duration,cover_image_url,share_url,view_count,like_count,comment_count,share_count";

async function allVideos(ctx: SyncContext, token: string): Promise<Video[]> {
  const out: Video[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < 25; page++) {
    const data = await api<{ videos: Video[]; cursor: number; has_more: boolean }>(ctx, token, `/video/list/?fields=${VIDEO_FIELDS}`, {
      method: "POST",
      body: JSON.stringify(cursor ? { max_count: 20, cursor } : { max_count: 20 }),
    });
    out.push(...(data?.videos ?? []));
    if (!data?.has_more) break;
    cursor = data.cursor;
  }
  return out;
}

const COUNTERS = ["views", "likes", "comments", "shares"] as const;
type Counter = (typeof COUNTERS)[number];
type Snapshot = Record<Counter, number>;

/**
 * Daily totals from consecutive per-video snapshots. A day counts only when
 * there is a snapshot for it and for the day before; a video first seen within
 * a day of being posted counts from zero. Exported for tests.
 */
export function dailyFromSnapshots(
  snaps: Map<string, Map<ISODate, Snapshot>>,
  publishedOn: Map<string, ISODate>,
  days: ISODate[],
): MetricPoint[] {
  const totals = new Map<string, number>();
  const counted = new Set<ISODate>();
  for (const [video, byDay] of snaps) {
    for (const d of days) {
      const today = byDay.get(d);
      if (!today) continue;
      const pub = publishedOn.get(video);
      const prev = byDay.get(addDays(d, -1)) ?? (pub && pub >= addDays(d, -1) ? { views: 0, likes: 0, comments: 0, shares: 0 } : null);
      if (!prev) continue;
      counted.add(d);
      for (const c of COUNTERS) {
        const k = `${d}|${c}`;
        // Counters can dip slightly when TikTok removes spam; never go below zero.
        totals.set(k, (totals.get(k) ?? 0) + Math.max(0, today[c] - prev[c]));
      }
    }
  }
  const out: MetricPoint[] = [];
  for (const d of counted) {
    let engagement = 0;
    for (const c of COUNTERS) {
      const v = totals.get(`${d}|${c}`) ?? 0;
      out.push({ date: d, metric: c, value: v });
      if (c !== "views") engagement += v;
    }
    out.push({ date: d, metric: "engagements", value: engagement });
  }
  return out;
}

export const tiktok: Connector = async (ctx) => {
  const tokens = await tiktokToken({ grant_type: "refresh_token", refresh_token: await ctx.secret("refresh") });
  // The refresh token may have rotated: keep the new one.
  const { error: vErr } = await ctx.db.rpc("set_account_token", { p_account_id: ctx.account.id, p_kind: "refresh", p_secret: tokens.refresh_token });
  if (vErr) throw vErr;
  const token = tokens.access_token;

  const user = await tiktokUser(ctx, token);
  const videos = await allVideos(ctx, token);
  const today = todayInEdmonton();
  const points: MetricPoint[] = [];
  if (typeof user.follower_count === "number" && ctx.to >= addDays(today, -1)) {
    points.push({ date: ctx.to < today ? ctx.to : today, metric: "followers", value: user.follower_count });
  }

  // Videos and today's snapshot of their lifetime totals.
  const items = videos.map((v) => {
    const published = new Date(v.create_time * 1000).toISOString();
    return {
      account_id: ctx.account.id,
      brand_id: ctx.account.brandId,
      platform: "tiktok",
      external_id: v.id,
      url: v.share_url ?? null,
      caption: v.video_description || v.title || null,
      published_at: published,
      published_date: edmontonDateOf(published),
      format: (v.duration ?? 0) <= 180 ? "short" : "video",
      duration_seconds: v.duration ?? null,
      thumbnail_url: v.cover_image_url ?? null,
      status: "published",
      is_sample: false,
      updated_at: new Date().toISOString(),
    };
  });
  let saved: { id: string; external_id: string; published_date: string }[] = [];
  if (items.length) {
    const { data, error } = await ctx.db.from("content_items").upsert(items, { onConflict: "account_id,external_id" }).select("id, external_id, published_date");
    if (error) throw error;
    saved = data;
    const byExt = new Map(videos.map((v) => [v.id, v]));
    const { error: sErr } = await ctx.db.from("content_metrics_snapshots").upsert(
      saved.map((s) => {
        const v = byExt.get(s.external_id)!;
        return { content_item_id: s.id, captured_on: today, views: v.view_count ?? 0, likes: v.like_count ?? 0, comments: v.comment_count ?? 0, shares: v.share_count ?? 0, is_sample: false };
      }),
      { onConflict: "content_item_id,captured_on" },
    );
    if (sErr) throw sErr;
  }

  // Daily numbers from the snapshots we have.
  const days = eachDay(ctx.from, ctx.to);
  const ids = saved.map((s) => s.id);
  const snaps = new Map<string, Map<ISODate, Snapshot>>();
  if (ids.length) {
    const { data, error } = await ctx.db
      .from("content_metrics_snapshots")
      .select("content_item_id, captured_on, views, likes, comments, shares")
      .in("content_item_id", ids)
      .gte("captured_on", addDays(ctx.from, -1))
      .lte("captured_on", ctx.to);
    if (error) throw error;
    for (const r of data) {
      let m = snaps.get(r.content_item_id);
      if (!m) snaps.set(r.content_item_id, (m = new Map()));
      m.set(r.captured_on, { views: Number(r.views), likes: Number(r.likes), comments: Number(r.comments), shares: Number(r.shares) });
    }
  }
  points.push(...dailyFromSnapshots(snaps, new Map(saved.map((s) => [s.id, s.published_date])), days));

  // Posting history is known from each video's publish time.
  const posted = new Map<ISODate, number>(days.map((d) => [d, 0]));
  for (const it of items) if (posted.has(it.published_date)) posted.set(it.published_date, posted.get(it.published_date)! + 1);
  for (const [date, value] of posted) points.push({ date, metric: "posts_published", value });

  return { metrics: points, extraRows: items.length };
};
