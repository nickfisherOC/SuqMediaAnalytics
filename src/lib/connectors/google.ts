import { addDays, eachDay, edmontonDateOf, todayInEdmonton, type ISODate } from "@/lib/dates";
import { saveContent, type ContentInput } from "./content";
import { fetchJson } from "./http";
import { dailyFromSnapshots } from "./tiktok";
import { ConnectorConfigError, type Connector, type MetricPoint, type SyncContext } from "./types";

/**
 * Google: Analytics 4 (Data API v1beta), Search Console (Webmasters v3) and
 * YouTube (Data API v3 + Analytics API v2). One Google sign-in with offline
 * access gives a refresh token, stored in Supabase Vault per account; each run
 * trades it for a short-lived access token.
 */

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

export function googleClient() {
  // Trim: values pasted into a dashboard easily pick up a stray newline.
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new ConnectorConfigError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.");
  return { id, secret };
}

export async function googleAccessToken(refreshToken: string): Promise<string> {
  const { id, secret } = googleClient();
  const { status, body } = await fetchJson<{ access_token?: string; error?: string; error_description?: string }>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: id, client_secret: secret }),
    },
  );
  if (!body?.access_token) {
    const msg = `Google: couldn't refresh access (${status} ${body?.error ?? ""}). Reconnect Google on the Connections page.`;
    throw body?.error === "invalid_grant" ? new ConnectorConfigError(msg) : new Error(msg);
  }
  return body.access_token;
}

async function call<T>(ctx: SyncContext, token: string, url: string, init: RequestInit = {}): Promise<T> {
  const { status, body } = await fetchJson<T & { error?: { message: string; code: number } }>(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  ctx.capture({ endpoint: url.replace(/\?.*$/, ""), params: { url, body: init.body ? JSON.parse(String(init.body)) : undefined }, payload: body });
  if (status === 401 || status === 403) throw new ConnectorConfigError(`Google: access refused (${status}). ${body?.error?.message ?? ""}`.trim());
  if (status >= 400) throw new Error(`Google: ${status} ${body?.error?.message ?? ""}`.trim());
  return body;
}

const zeros = (days: ISODate[], metrics: string[]) => days.flatMap((date) => metrics.map((metric) => ({ date, metric, value: 0 })));

function sum(points: MetricPoint[]): MetricPoint[] {
  const m = new Map<string, MetricPoint>();
  for (const p of points) {
    const k = `${p.date}|${p.metric}`;
    const cur = m.get(k);
    if (cur) cur.value += p.value;
    else m.set(k, { ...p });
  }
  return [...m.values()];
}

// ── Google Analytics 4 ─────────────────────────────────────────────────────

const SOCIAL_CHANNELS = new Set(["Organic Social", "Paid Social"]);

export const ga4: Connector = async (ctx) => {
  const token = await googleAccessToken(await ctx.secret("refresh"));
  const property = ctx.account.externalId; // "properties/123"
  type Report = { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] };
  const run = (body: object) =>
    call<Report>(ctx, token, `https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, { method: "POST", body: JSON.stringify(body) });
  const dateRanges = [{ startDate: ctx.from, endDate: ctx.to }];
  const ymd = (v: string): ISODate => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;

  const byChannel = await run({
    dateRanges,
    dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "keyEvents" }],
    limit: 10000,
  });
  const points: MetricPoint[] = zeros(eachDay(ctx.from, ctx.to), ["site_sessions", "site_sessions_social", "site_key_events"]);
  const channelRows: Record<string, unknown>[] = [];
  for (const r of byChannel.rows ?? []) {
    const date = ymd(r.dimensionValues[0].value);
    const channel = r.dimensionValues[1].value;
    const sessions = Number(r.metricValues[0].value);
    points.push({ date, metric: "site_sessions", value: sessions }, { date, metric: "site_key_events", value: Number(r.metricValues[1].value) });
    if (SOCIAL_CHANNELS.has(channel)) points.push({ date, metric: "site_sessions_social", value: sessions });
    channelRows.push({ date, dimension: "channel", dim_value: channel, sessions, key_events: Number(r.metricValues[1].value) });
  }

  // Breakdowns for the Search & Site page.
  for (const [dimension, gaDim] of [
    ["landing_page", "landingPage"],
    ["device", "deviceCategory"],
    ["city", "city"],
    ["source_medium", "sessionSourceMedium"],
  ] as const) {
    const rep = await run({ dateRanges, dimensions: [{ name: "date" }, { name: gaDim }], metrics: [{ name: "sessions" }], limit: 10000 });
    for (const r of rep.rows ?? []) {
      channelRows.push({ date: ymd(r.dimensionValues[0].value), dimension, dim_value: r.dimensionValues[1].value || "(not set)", sessions: Number(r.metricValues[0].value) });
    }
  }
  if (channelRows.length) {
    const { error } = await ctx.db
      .from("site_daily")
      .upsert(channelRows.map((r) => ({ ...r, account_id: ctx.account.id, is_sample: false })), { onConflict: "account_id,date,dimension,dim_value" });
    if (error) throw error;
  }
  return { metrics: sum(points), extraRows: channelRows.length };
};

// ── Search Console ─────────────────────────────────────────────────────────

export const searchConsole: Connector = async (ctx) => {
  const token = await googleAccessToken(await ctx.secret("refresh"));
  const site = encodeURIComponent(ctx.account.externalId); // "sc-domain:peoplesuq.com"
  type Res = { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] };
  const query = (body: object) =>
    call<Res>(ctx, token, `https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, { method: "POST", body: JSON.stringify(body) });

  const daily = await query({ startDate: ctx.from, endDate: ctx.to, dimensions: ["date"], dataState: "all" });
  const points: MetricPoint[] = [];
  // Google reports search 2–3 days late: only zero-fill days it has reached.
  const lastReported = (daily.rows ?? []).reduce((m, r) => (r.keys[0] > m ? r.keys[0] : m), "");
  if (lastReported) points.push(...zeros(eachDay(ctx.from, lastReported), ["search_clicks", "search_impressions", "search_position_weighted"]));
  for (const r of daily.rows ?? []) {
    const date = r.keys[0];
    points.push(
      { date, metric: "search_clicks", value: r.clicks },
      { date, metric: "search_impressions", value: r.impressions },
      { date, metric: "search_position_weighted", value: r.position * r.impressions },
    );
  }

  // Query × page detail for quick wins and rising queries.
  const detail = await query({ startDate: ctx.from, endDate: ctx.to, dimensions: ["date", "query", "page"], rowLimit: 25000, dataState: "all" });
  const rows = (detail.rows ?? []).map((r) => ({
    account_id: ctx.account.id,
    date: r.keys[0],
    query: r.keys[1].slice(0, 500),
    page: r.keys[2].slice(0, 1000),
    clicks: r.clicks,
    impressions: r.impressions,
    position: r.position,
    is_sample: false,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await ctx.db.from("search_daily").upsert(rows.slice(i, i + 500), { onConflict: "account_id,date,query,page" });
    if (error) throw error;
  }
  return { metrics: sum(points), extraRows: rows.length };
};

// ── YouTube ────────────────────────────────────────────────────────────────
//
// Two modes. With the channel owner's login, YouTube Analytics gives daily
// views, watch time and subscriber changes. With anyone else's login (or
// before the owner connects), only public numbers are available: each video's
// lifetime views, likes and comments and the current subscriber count. Daily
// views then come from nightly snapshots, like TikTok. Both modes snapshot
// every recent video for "What's winning".

export const youtube: Connector = async (ctx) => {
  const token = await googleAccessToken(await ctx.secret("refresh"));
  const channelId = ctx.account.externalId;
  const days = eachDay(ctx.from, ctx.to);
  const today = todayInEdmonton();
  const points: MetricPoint[] = [];

  const ch = await call<{
    items?: { statistics: { subscriberCount?: string; hiddenSubscriberCount?: boolean }; contentDetails: { relatedPlaylists: { uploads: string } } }[];
  }>(ctx, token, `https://www.googleapis.com/youtube/v3/channels?part=statistics,contentDetails&id=${channelId}`);
  const item = ch.items?.[0];
  if (!item) throw new ConnectorConfigError("YouTube: channel not found.");
  const subscribers = item.statistics.hiddenSubscriberCount ? null : Number(item.statistics.subscriberCount ?? 0);

  // Owner analytics, if this login is allowed to see them.
  type Report = { columnHeaders: { name: string }[]; rows?: (string | number)[][] };
  const metrics = ["views", "estimatedMinutesWatched", "likes", "comments", "shares", "subscribersGained", "subscribersLost"];
  let report: Report | null = null;
  if (!ctx.account.settings.public_only) {
    report = await call<Report>(
      ctx,
      token,
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channelId}&startDate=${ctx.from}&endDate=${ctx.to}&dimensions=day&metrics=${metrics.join(",")}&sort=day`,
    ).catch((e) => {
      if (e instanceof ConnectorConfigError) return null; // not the owner: fall back to public numbers
      throw e;
    });
  }

  if (report) {
    const idx = Object.fromEntries(report.columnHeaders.map((h, i) => [h.name, i]));
    const netSubs = new Map<ISODate, number>();
    for (const r of report.rows ?? []) {
      const date = String(r[idx.day]);
      const v = (name: string) => Number(r[idx[name]] ?? 0);
      points.push(
        { date, metric: "views", value: v("views") },
        { date, metric: "watch_minutes", value: v("estimatedMinutesWatched") },
        { date, metric: "likes", value: v("likes") },
        { date, metric: "comments", value: v("comments") },
        { date, metric: "shares", value: v("shares") },
        { date, metric: "engagements", value: v("likes") + v("comments") + v("shares") },
      );
      netSubs.set(date, v("subscribersGained") - v("subscribersLost"));
    }
    // YouTube Analytics lags a day or two; only zero-fill up to the last day it reported.
    const lastReported = (report.rows ?? []).reduce((m, r) => (String(r[idx.day]) > m ? String(r[idx.day]) : m), "");
    if (lastReported) points.push(...zeros(eachDay(ctx.from, lastReported), ["views", "watch_minutes", "likes", "comments", "shares", "engagements"]));
    // Subscriber history: today's count walked back through each day's net change.
    if (subscribers !== null) {
      let subs = subscribers;
      for (let d = today; d >= ctx.from; d = addDays(d, -1)) {
        if (d <= ctx.to) points.push({ date: d, metric: "followers", value: subs });
        subs -= netSubs.get(d) ?? 0;
      }
    }
  } else if (subscribers !== null && ctx.to >= addDays(today, -1)) {
    points.push({ date: ctx.to < today ? ctx.to : today, metric: "followers", value: subscribers });
  }

  // Uploads (Shorts and long-form), newest first.
  const uploads: { id: string; publishedAt: string }[] = [];
  let pageToken = "";
  for (let i = 0; i < 10; i++) {
    const pl = await call<{ items?: { contentDetails: { videoId: string; videoPublishedAt?: string } }[]; nextPageToken?: string }>(
      ctx,
      token,
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${item.contentDetails.relatedPlaylists.uploads}${pageToken ? `&pageToken=${pageToken}` : ""}`,
    );
    for (const it of pl.items ?? []) {
      if (it.contentDetails.videoPublishedAt) uploads.push({ id: it.contentDetails.videoId, publishedAt: it.contentDetails.videoPublishedAt });
    }
    const oldest = uploads.at(-1)?.publishedAt;
    if (!pl.nextPageToken || (oldest && edmontonDateOf(oldest) < addDays(ctx.from, -60))) break;
    pageToken = pl.nextPageToken;
  }
  const posted = new Map<ISODate, number>(days.map((d) => [d, 0]));
  for (const u of uploads) {
    const d = edmontonDateOf(u.publishedAt);
    if (posted.has(d)) posted.set(d, posted.get(d)! + 1);
  }
  for (const [date, value] of posted) points.push({ date, metric: "posts_published", value });

  // Each recent video's public totals, 50 at a time.
  type Video = {
    id: string;
    snippet: { title: string; publishedAt: string; thumbnails?: Record<string, { url: string }> };
    statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
    contentDetails: { duration: string };
    status?: { privacyStatus?: string };
  };
  const recent = uploads.filter((u) => edmontonDateOf(u.publishedAt) >= addDays(today, -60));
  const items: ContentInput[] = [];
  for (let i = 0; i < recent.length; i += 50) {
    const ids = recent.slice(i, i + 50).map((b) => b.id).join(",");
    const vids = await call<{ items?: Video[] }>(ctx, token, `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails,status&id=${ids}`);
    for (const v of vids.items ?? []) {
      const secs = isoDurationSeconds(v.contentDetails.duration);
      const privacy = v.status?.privacyStatus;
      items.push({
        externalId: v.id,
        url: secs <= 180 ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`,
        caption: v.snippet.title,
        publishedAt: v.snippet.publishedAt,
        format: secs <= 180 ? "short" : "video",
        durationSeconds: secs,
        thumbnailUrl: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.default?.url ?? null,
        status: privacy === "unlisted" ? "unlisted" : privacy === "private" ? "private" : "published",
        snapshot: { views: Number(v.statistics.viewCount ?? 0), likes: Number(v.statistics.likeCount ?? 0), comments: Number(v.statistics.commentCount ?? 0) },
      });
    }
  }
  const saved = await saveContent(ctx, items);

  // Public mode: daily numbers from the change between nightly snapshots.
  if (!report && saved.size) {
    const ids = [...saved.values()].map((s) => s.id);
    const { data, error } = await ctx.db
      .from("content_metrics_snapshots")
      .select("content_item_id, captured_on, views, likes, comments, shares")
      .in("content_item_id", ids)
      .gte("captured_on", addDays(ctx.from, -1))
      .lte("captured_on", ctx.to);
    if (error) throw error;
    const snaps = new Map<string, Map<ISODate, { views: number; likes: number; comments: number; shares: number }>>();
    for (const r of data) {
      let m = snaps.get(r.content_item_id);
      if (!m) snaps.set(r.content_item_id, (m = new Map()));
      m.set(r.captured_on, { views: Number(r.views ?? 0), likes: Number(r.likes ?? 0), comments: Number(r.comments ?? 0), shares: Number(r.shares ?? 0) });
    }
    points.push(...dailyFromSnapshots(snaps, new Map([...saved.values()].map((s) => [s.id, s.publishedDate])), days));
  }

  return { metrics: sum(points), extraRows: items.length };
};

/** "PT1M5S" → 65. */
export function isoDurationSeconds(d: string): number {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}
