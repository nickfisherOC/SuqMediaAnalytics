import { addDays, eachDay, edmontonDateOf, todayInEdmonton, type ISODate } from "@/lib/dates";
import { saveContent, type ContentInput } from "./content";
import { fetchJson } from "./http";
import { ConnectorConfigError, type Connector, type MetricPoint, type SyncContext } from "./types";

/**
 * Meta: Facebook Pages, Instagram professional accounts and ad accounts, read
 * with a never-expiring system-user token (Graph API v26).
 *
 * Meta buckets Page, Instagram and ad-account days in Pacific time (the ad
 * accounts are set to America/Los_Angeles), one hour behind Edmonton. We keep
 * Meta's own days rather than shifting numbers between days.
 */

const GRAPH = "https://graph.facebook.com/v26.0";
// Graph error codes that mean "slow down".
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008]);
const AUTH_CODES = new Set([102, 190, 200, 10]);

interface GraphError {
  error?: { message: string; code: number; error_subcode?: number };
}

async function graph<T>(ctx: SyncContext, path: string, params: Record<string, string>, token: string, forDate?: ISODate): Promise<T> {
  const url = new URL(GRAPH + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const { body } = await fetchJson<T & GraphError>(url.toString(), {}, {
    isRateLimited: (_s, b) => RATE_LIMIT_CODES.has((b as GraphError)?.error?.code ?? -1),
  });
  ctx.capture({ endpoint: path, params, forDate, payload: body });
  if (body?.error) {
    const msg = `Meta: ${body.error.message}`;
    throw AUTH_CODES.has(body.error.code) ? new ConnectorConfigError(msg) : new Error(msg);
  }
  return body;
}

/** Follows `paging.next` until done or `limit` pages. */
async function graphAll<T>(ctx: SyncContext, path: string, params: Record<string, string>, token: string, limit = 20): Promise<T[]> {
  const out: T[] = [];
  let page = await graph<{ data: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(ctx, path, params, token);
  for (let i = 0; ; i++) {
    out.push(...(page.data ?? []));
    const after = page.paging?.cursors?.after;
    if (!page.paging?.next || !after || i >= limit) break;
    page = await graph(ctx, path, { ...params, after }, token);
  }
  return out;
}

/** Insights `end_time` marks the end of the day it describes. */
const dayOfEndTime = (endTime: string): ISODate => addDays(endTime.slice(0, 10), -1);

function zeroFill(points: MetricPoint[], days: ISODate[], metrics: string[]): MetricPoint[] {
  const have = new Set(points.map((p) => `${p.date}|${p.metric}`));
  for (const d of days) for (const m of metrics) if (!have.has(`${d}|${m}`)) points.push({ date: d, metric: m, value: 0 });
  return points;
}

// ── Facebook Page ──────────────────────────────────────────────────────────

const PAGE_METRICS: Record<string, { metric: string; scale?: number }> = {
  page_follows: { metric: "followers" },
  page_media_view: { metric: "views" },
  // Reactions only; "post engagements" also counts clicks, including clicks on ads.
  page_actions_post_reactions_total: { metric: "likes" },
  page_views_total: { metric: "profile_visits" },
  page_video_view_time: { metric: "watch_minutes", scale: 1 / 60_000 },
};

export const facebookPage: Connector = async (ctx) => {
  const systemToken = await ctx.secret("access");
  const pageId = ctx.account.externalId;
  const { access_token: pageToken } = await graph<{ access_token: string }>(ctx, `/${pageId}`, { fields: "access_token" }, systemToken);
  if (!pageToken) throw new ConnectorConfigError("Meta: the Pulse system user can't get a token for this Page. Check its Page access.");

  const points: MetricPoint[] = [];
  // Insights accept up to 90 days per call.
  for (let start = ctx.from; start <= ctx.to; start = addDays(start, 90)) {
    const end = addDays(start, 89) < ctx.to ? addDays(start, 89) : ctx.to;
    const res = await graph<{ data: { name: string; values: { end_time: string; value: number | Record<string, number> }[] }[] }>(
      ctx,
      `/${pageId}/insights`,
      { metric: Object.keys(PAGE_METRICS).join(","), period: "day", since: start, until: addDays(end, 1) },
      pageToken,
    );
    for (const series of res.data) {
      const def = PAGE_METRICS[series.name];
      if (!def) continue;
      for (const v of series.values) {
        const date = dayOfEndTime(v.end_time);
        // Some metrics (reactions) come broken down by type: add the parts.
        const value = typeof v.value === "number" ? v.value : Object.values(v.value ?? {}).reduce((t, x) => t + (Number(x) || 0), 0);
        if (date < ctx.from || date > ctx.to) continue;
        points.push({ date, metric: def.metric, value: value * (def.scale ?? 1) });
      }
    }
  }

  // Posts and Reels (Facebook lists them separately) with their comments. Look back
  // 30 days so comments on recent posts count.
  type Item = { created_time: string; comments?: { data: { created_time: string }[] } };
  const listParams = { fields: "created_time,comments.limit(100){created_time}", since: addDays(ctx.from, -30), until: addDays(ctx.to, 1), limit: "50" };
  const posts = [
    ...(await graphAll<Item>(ctx, `/${pageId}/posts`, listParams, pageToken)),
    ...(await graphAll<Item>(ctx, `/${pageId}/video_reels`, listParams, pageToken)),
  ];
  const add = (date: ISODate, metric: string) => {
    if (date < ctx.from || date > ctx.to) return;
    points.push({ date, metric, value: 1 });
  };
  for (const p of posts) {
    add(edmontonDateOf(p.created_time), "posts_published");
    for (const c of p.comments?.data ?? []) add(edmontonDateOf(c.created_time), "comments");
  }

  // Each Reel's lifetime numbers, for "What's winning".
  type Reel = { id: string; description?: string; created_time: string; permalink_url?: string; length?: number; picture?: string };
  const reels = await graphAll<Reel>(
    ctx,
    `/${pageId}/video_reels`,
    { fields: "id,description,created_time,permalink_url,length,picture", since: addDays(todayInEdmonton(), -60), limit: "50" },
    pageToken,
  );
  const items: ContentInput[] = [];
  for (const r of reels) {
    const ins = await graph<{ data: { name: string; values: { value: number | Record<string, number> }[] }[] }>(
      ctx,
      `/${r.id}/video_insights`,
      { metric: "fb_reels_total_plays,post_video_avg_time_watched,post_video_likes_by_reaction_type,post_video_social_actions" },
      pageToken,
    ).catch(() => ({ data: [] }));
    const val = (name: string) => ins.data.find((d) => d.name === name)?.values?.[0]?.value;
    const total = (x: unknown) => (typeof x === "number" ? x : x && typeof x === "object" ? Object.values(x as Record<string, number>).reduce((a, b) => a + b, 0) : null);
    const social = val("post_video_social_actions") as Record<string, number> | undefined;
    const c = await graph<{ comments?: { summary?: { total_count: number } } }>(ctx, `/${r.id}`, { fields: "comments.summary(true).limit(0)" }, pageToken).catch(() => ({}) as { comments?: { summary?: { total_count: number } } });
    items.push({
      externalId: r.id,
      url: r.permalink_url ? (r.permalink_url.startsWith("http") ? r.permalink_url : `https://www.facebook.com${r.permalink_url}`) : null,
      caption: r.description ?? null,
      publishedAt: r.created_time,
      format: "reel",
      durationSeconds: r.length ?? null,
      thumbnailUrl: r.picture ?? null,
      snapshot: {
        views: total(val("fb_reels_total_plays")),
        likes: total(val("post_video_likes_by_reaction_type")),
        comments: c.comments?.summary?.total_count ?? null,
        shares: social?.SHARE ?? 0,
        extra: { avg_watch_ms: total(val("post_video_avg_time_watched")) },
      },
    });
  }
  await saveContent(ctx, items);

  const days = eachDay(ctx.from, ctx.to);
  const summed = sumPoints(zeroFill(points, days, ["posts_published", "comments", "likes"]));
  // Engagement = reactions + comments. Facebook doesn't report shares by day.
  const byKey = new Map(summed.map((p) => [`${p.date}|${p.metric}`, p.value]));
  for (const d of days) summed.push({ date: d, metric: "engagements", value: (byKey.get(`${d}|likes`) ?? 0) + (byKey.get(`${d}|comments`) ?? 0) });
  return { metrics: summed };
};

// ── Instagram ──────────────────────────────────────────────────────────────

const IG_METRICS: Record<string, string> = {
  views: "views",
  reach: "reach",
  total_interactions: "engagements",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  saves: "saves",
  profile_views: "profile_visits",
  website_clicks: "link_clicks",
};

export const instagram: Connector = async (ctx) => {
  const token = await ctx.secret("access");
  const igId = ctx.account.externalId;
  const points: MetricPoint[] = [];

  // Instagram only returns account totals one day at a time.
  for (const day of eachDay(ctx.from, ctx.to)) {
    const res = await graph<{ data: { name: string; total_value?: { value: number } }[] }>(
      ctx,
      `/${igId}/insights`,
      { metric: Object.keys(IG_METRICS).join(","), period: "day", metric_type: "total_value", since: day, until: addDays(day, 1) },
      token,
      day,
    );
    for (const m of res.data) {
      const key = IG_METRICS[m.name];
      if (key && typeof m.total_value?.value === "number") points.push({ date: day, metric: key, value: m.total_value.value });
    }
  }

  // Follower count is only available as "right now"; history builds from our daily snapshots.
  const today = todayInEdmonton();
  if (ctx.to >= addDays(today, -1)) {
    const acct = await graph<{ followers_count: number }>(ctx, `/${igId}`, { fields: "followers_count" }, token);
    points.push({ date: ctx.to < today ? ctx.to : today, metric: "followers", value: acct.followers_count });
  }

  type Media = {
    id: string;
    timestamp: string;
    caption?: string;
    media_type: string;
    media_product_type?: string;
    permalink?: string;
    thumbnail_url?: string;
    media_url?: string;
    like_count?: number;
    comments_count?: number;
  };
  const media = await graphAll<Media>(
    ctx,
    `/${igId}/media`,
    { fields: "id,timestamp,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,like_count,comments_count", limit: "50" },
    token,
    5,
  );
  for (const m of media) {
    const date = edmontonDateOf(m.timestamp);
    if (date >= ctx.from && date <= ctx.to) points.push({ date, metric: "posts_published", value: 1 });
  }

  // Each post's lifetime numbers, for "What's winning". Last 60 days is plenty: older posts barely move.
  const recent = media.filter((m) => edmontonDateOf(m.timestamp) >= addDays(today, -60));
  const items: ContentInput[] = [];
  for (const m of recent) {
    const isReel = m.media_product_type === "REELS";
    const metrics = isReel ? "views,reach,likes,comments,shares,saved,ig_reels_avg_watch_time" : "views,reach,likes,comments,shares,saved";
    const ins = await graph<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
      ctx,
      `/${m.id}/insights`,
      { metric: metrics },
      token,
    ).catch(() => ({ data: [] }));
    const v = (name: string) => {
      const d = ins.data.find((x) => x.name === name);
      return d?.values?.[0]?.value ?? d?.total_value?.value ?? null;
    };
    items.push({
      externalId: m.id,
      url: m.permalink ?? null,
      caption: m.caption ?? null,
      publishedAt: m.timestamp,
      format: isReel ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carousel" : "photo",
      thumbnailUrl: m.thumbnail_url ?? (m.media_type === "IMAGE" ? m.media_url : null) ?? null,
      snapshot: {
        views: v("views"),
        reach: v("reach"),
        likes: v("likes") ?? m.like_count ?? null,
        comments: v("comments") ?? m.comments_count ?? null,
        shares: v("shares"),
        saves: v("saved"),
        extra: isReel ? { avg_watch_ms: v("ig_reels_avg_watch_time") } : {},
      },
    });
  }
  await saveContent(ctx, items);

  return { metrics: sumPoints(zeroFill(points, eachDay(ctx.from, ctx.to), ["posts_published"])) };
};

// ── Ad account ─────────────────────────────────────────────────────────────

interface InsightRow {
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  frequency?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
}

const leadsOf = (r: InsightRow) => Number(r.actions?.find((a) => a.action_type === "lead")?.value ?? 0);

/** Meta's own count of an action, trying its names in order (pixel events have several). Exported for tests. */
export function actionCount(actions: { action_type: string; value: string }[] | undefined, types: string[]): number {
  for (const t of types) {
    const a = actions?.find((x) => x.action_type === t);
    if (a) return Number(a.value);
  }
  return 0;
}
const PURCHASE = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];
const ADD_TO_CART = ["add_to_cart", "omni_add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"];
const num = (v?: string) => (v ? Number(v) : 0);

export const metaAds: Connector = async (ctx) => {
  const token = await ctx.secret("access");
  const act = ctx.account.externalId;
  const timeRange = JSON.stringify({ since: ctx.from, until: ctx.to });
  const fields = "date_start,spend,impressions,reach,clicks,inline_link_clicks,frequency,actions,action_values";

  const daily = await graphAll<InsightRow>(ctx, `/${act}/insights`, { level: "account", time_increment: "1", time_range: timeRange, fields, limit: "100" }, token);
  const points: MetricPoint[] = [];
  for (const r of daily) {
    points.push(
      { date: r.date_start, metric: "ad_spend", value: num(r.spend) },
      { date: r.date_start, metric: "ad_impressions", value: num(r.impressions) },
      { date: r.date_start, metric: "ad_clicks", value: num(r.inline_link_clicks) },
      { date: r.date_start, metric: "meta_leads", value: leadsOf(r) },
    );
  }

  // Each ad's picture and whether it's running, for the Ads page.
  const adInfo = new Map<string, { status: string | null; thumbnail: string | null }>();
  try {
    const ads = await graphAll<{ id: string; effective_status?: string; creative?: { thumbnail_url?: string } }>(
      ctx,
      `/${act}/ads`,
      { fields: "id,effective_status,creative{thumbnail_url}", limit: "200" },
      token,
    );
    for (const a of ads) adInfo.set(a.id, { status: a.effective_status ?? null, thumbnail: a.creative?.thumbnail_url ?? null });
  } catch {
    // Pictures are a nice-to-have; the numbers still sync without them.
  }

  // Campaign → ad set → ad detail, names kept exactly as in Meta.
  let extraRows = 0;
  for (const level of ["campaign", "adset", "ad"] as const) {
    const idField = `${level === "adset" ? "adset" : level}_id`;
    const rows = await graphAll<InsightRow>(
      ctx,
      `/${act}/insights`,
      {
        level,
        time_increment: "1",
        time_range: timeRange,
        fields: `${fields},campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name`,
        limit: "200",
      },
      token,
    );
    const upserts = rows.map((r) => ({
      account_id: ctx.account.id,
      date: r.date_start,
      level,
      entity_id: (r as unknown as Record<string, string>)[idField],
      parent_id: level === "ad" ? r.adset_id : level === "adset" ? r.campaign_id : null,
      name: level === "ad" ? r.ad_name : level === "adset" ? r.adset_name : r.campaign_name,
      spend: num(r.spend),
      impressions: num(r.impressions),
      reach: r.reach ? num(r.reach) : null,
      clicks: num(r.clicks),
      link_clicks: num(r.inline_link_clicks),
      leads: leadsOf(r),
      frequency: r.frequency ? num(r.frequency) : null,
      ...(level === "ad" && r.ad_id && adInfo.has(r.ad_id) ? { status: adInfo.get(r.ad_id)!.status, thumbnail_url: adInfo.get(r.ad_id)!.thumbnail } : {}),
      // Meta's pixel counts for sales campaigns (zero when the site has no pixel events).
      extra: {
        purchases: actionCount(r.actions, PURCHASE),
        add_to_cart: actionCount(r.actions, ADD_TO_CART),
        purchase_value: actionCount(r.action_values, PURCHASE),
      },
      is_sample: false,
    }));
    if (upserts.length) {
      const { error } = await ctx.db.from("ads_daily").upsert(upserts, { onConflict: "account_id,date,level,entity_id" });
      if (error) throw error;
      extraRows += upserts.length;
    }
  }

  const days = eachDay(ctx.from, ctx.to);
  return { metrics: zeroFill(points, days, ["ad_spend", "ad_impressions", "ad_clicks", "meta_leads"]), extraRows };
};

/** Adds together points for the same day and metric (one per post, comment, …). */
function sumPoints(points: MetricPoint[]): MetricPoint[] {
  const m = new Map<string, MetricPoint>();
  for (const p of points) {
    const k = `${p.date}|${p.metric}`;
    const cur = m.get(k);
    if (cur) cur.value += p.value;
    else m.set(k, { ...p });
  }
  return [...m.values()];
}
