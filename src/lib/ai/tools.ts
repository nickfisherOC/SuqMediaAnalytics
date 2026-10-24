import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandSettings } from "@/config/brands";
import { caveatsFor, METRICS } from "@/config/metrics";
import { isPlatform, PLATFORM_INFO, type Platform } from "@/config/platforms";
import { groupByDay, type ContentCard } from "@/lib/content";
import { addDays, diffDays, isISODate, type ISODate } from "@/lib/dates";
import { aggregate, compareValues, dailySeries, MetricStore, type PlatformScope } from "@/lib/metrics/engine";

/**
 * The only way Ask Pulse can see data: a fixed set of read-only lookups that
 * return numbers computed by Pulse's own code. No SQL, no writes, no contact
 * details. Every number in an answer must come from one of these results.
 */

export interface ToolContext {
  db: SupabaseClient;
  brands: (BrandSettings & { id?: string })[];
  today: ISODate;
}

type Input = Record<string, unknown>;

const brandEnum = (ctx: ToolContext) => ctx.brands.map((b) => b.slug);

export function toolDefinitions(ctx: ToolContext): Anthropic.Beta.BetaTool[] {
  const brands = brandEnum(ctx);
  const date = { type: "string", description: "YYYY-MM-DD (Edmonton calendar day)" } as const;
  return [
    {
      name: "list_metrics",
      description: "List the metrics Pulse tracks, with their meaning, units and which platforms report them. Call this when unsure which metric key to use.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "get_metric",
      description:
        "One metric for a brand over a date range, optionally compared with another range, optionally with daily values. Use platform 'all' for the brand total. Returns null when there is no data, never zero.",
      input_schema: {
        type: "object",
        properties: {
          brand: { type: "string", enum: brands },
          metric: { type: "string", description: "Metric key from list_metrics, e.g. views, followers, leads, cost_per_lead" },
          platform: { type: "string", description: "'all' or one of: facebook, instagram, tiktok, youtube, meta_ads, ga4, search_console, shopify, lead_rescue" },
          from: date,
          to: date,
          compare_from: { ...date, description: "Optional start of the comparison range" },
          compare_to: { ...date, description: "Optional end of the comparison range" },
          by_day: { type: "boolean", description: "Include the value for each day (max 120 days)" },
        },
        required: ["brand", "metric", "platform", "from", "to"],
        additionalProperties: false,
      },
    },
    {
      name: "get_top_content",
      description:
        "Posts and videos published in a date range with their lifetime views, likes, comments and shares (as of the latest nightly snapshot). Also returns the same day's video added up across platforms.",
      input_schema: {
        type: "object",
        properties: {
          brand: { type: "string", enum: brands },
          from: date,
          to: date,
          platform: { type: "string", description: "Optional: facebook, instagram, tiktok or youtube" },
          sort_by: { type: "string", enum: ["views", "likes", "comments", "shares"] },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
        required: ["brand", "from", "to"],
        additionalProperties: false,
      },
    },
    {
      name: "get_pipeline",
      description:
        "SUQ Media's sales pipeline from Lead Rescue: open deals by stage with counts and value, deals that have sat longest in their stage, and new leads by source over the last 30 days. No customer names.",
      input_schema: { type: "object", properties: { stuck_days: { type: "integer", minimum: 1, maximum: 90 } }, additionalProperties: false },
    },
    {
      name: "get_flags",
      description: "Data-quality and housekeeping flags (stuck posts, missed posting days, bot traffic left out) overlapping a date range.",
      input_schema: {
        type: "object",
        properties: { brand: { type: "string", enum: brands }, from: date, to: date },
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
    {
      name: "get_notes_and_actions",
      description: "The team's dated notes and the current action items (open, and finished in the last two weeks).",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
  ];
}

class ToolInputError extends Error {}

function str(input: Input, key: string, required = true): string | undefined {
  const v = input[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolInputError(`Missing ${key}.`);
    return undefined;
  }
  if (typeof v !== "string") throw new ToolInputError(`${key} must be text.`);
  return v;
}

function dateArg(input: Input, key: string, required = true): ISODate | undefined {
  const v = str(input, key, required);
  if (v === undefined) return undefined;
  if (!isISODate(v)) throw new ToolInputError(`${key} must be YYYY-MM-DD.`);
  return v;
}

function brandOf(ctx: ToolContext, slug: string | undefined) {
  const b = ctx.brands.find((x) => x.slug === slug);
  if (!b) throw new ToolInputError(`Unknown brand. Use one of: ${brandEnum(ctx).join(", ")}.`);
  return b;
}

const round = (v: number | null, digits = 2) => (v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits);

async function metricRows(ctx: ToolContext, brand: BrandSettings & { id?: string }, from: ISODate, to: ISODate) {
  const rows: { platform: string; date: string; metric_key: string; value: number }[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await ctx.db
      .from("metric_daily")
      .select("platform, date, metric_key, value")
      .eq("brand_id", brand.id)
      .gte("date", from)
      .lte("date", to)
      .range(off, off + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return new MetricStore(
    rows.filter((r) => isPlatform(r.platform)).map((r) => ({ brand: brand.slug, platform: r.platform as Platform, date: r.date, metric: r.metric_key, value: Number(r.value) })),
  );
}

async function getMetricTool(ctx: ToolContext, input: Input) {
  const brand = brandOf(ctx, str(input, "brand"));
  const def = METRICS.find((m) => m.key === str(input, "metric"));
  if (!def) throw new ToolInputError("Unknown metric. Call list_metrics for the keys.");
  const platformArg = str(input, "platform") ?? "all";
  if (platformArg !== "all" && !isPlatform(platformArg)) throw new ToolInputError("Unknown platform.");
  const platform = platformArg as PlatformScope;
  const from = dateArg(input, "from")!;
  const to = dateArg(input, "to")!;
  if (from > to) throw new ToolInputError("from must be on or before to.");
  const cFrom = dateArg(input, "compare_from", false);
  const cTo = dateArg(input, "compare_to", false);
  const earliest = cFrom && cFrom < from ? cFrom : from;
  const latest = cTo && cTo > to ? cTo : to;
  const store = await metricRows(ctx, brand, earliest, latest);

  const cur = aggregate(store, brand.slug, def.key, platform, brand.platforms, [{ from, to }]);
  const out: Record<string, unknown> = {
    brand: brand.slug,
    metric: def.key,
    label: def.label,
    unit: def.unit,
    definition: def.definition,
    platform,
    range: { from, to },
    value: round(cur.value),
    platforms_with_data: cur.platforms,
    caveats: caveatsFor(def, platform),
  };
  if (cFrom && cTo) {
    const base = aggregate(store, brand.slug, def.key, platform, brand.platforms, [{ from: cFrom, to: cTo }]);
    const ch = compareValues(cur.value, base.value, def.higherIsBetter);
    out.compare = {
      range: { from: cFrom, to: cTo },
      value: round(base.value),
      change: round(ch.delta),
      change_pct: ch.pct === null ? null : round(ch.pct * 100, 1),
      direction: ch.direction,
      good_or_bad: ch.sentiment,
    };
  }
  if (input.by_day === true) {
    if (diffDays(from, to) > 120) throw new ToolInputError("by_day is limited to 120 days.");
    out.by_day = dailySeries(store, brand.slug, def.key, platform, brand.platforms, { from, to }).map((p) => ({ date: p.date, value: round(p.value) }));
  }
  return out;
}

async function getTopContentTool(ctx: ToolContext, input: Input) {
  const brand = brandOf(ctx, str(input, "brand"));
  const from = dateArg(input, "from")!;
  const to = dateArg(input, "to")!;
  const platform = str(input, "platform", false);
  const sortBy = (str(input, "sort_by", false) ?? "views") as "views" | "likes" | "comments" | "shares";
  const limit = Math.min(50, Math.max(1, Number(input.limit ?? 10)));

  let q = ctx.db
    .from("content_items")
    .select("id, platform, url, caption, published_date, format, status")
    .eq("brand_id", brand.id)
    .gte("published_date", from)
    .lte("published_date", to);
  if (platform) q = q.eq("platform", platform);
  const { data: items, error } = await q.limit(500);
  if (error) throw error;
  const latest = new Map<string, Record<string, number | string | null>>();
  for (let i = 0; i < items.length; i += 200) {
    const { data: snaps } = await ctx.db
      .from("content_metrics_snapshots")
      .select("content_item_id, captured_on, views, likes, comments, shares")
      .in("content_item_id", items.slice(i, i + 200).map((x) => x.id))
      .order("captured_on", { ascending: false });
    for (const s of snaps ?? []) if (!latest.has(s.content_item_id)) latest.set(s.content_item_id, s);
  }
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const cards: ContentCard[] = items
    .filter((it) => isPlatform(it.platform))
    .map((it) => {
      const s = latest.get(it.id);
      return {
        id: it.id,
        platform: it.platform as Platform,
        url: it.url,
        caption: it.caption,
        publishedDate: it.published_date,
        format: it.format,
        thumbnailUrl: null,
        status: it.status,
        views: num(s?.views),
        likes: num(s?.likes),
        comments: num(s?.comments),
        shares: num(s?.shares),
        capturedOn: (s?.captured_on as string) ?? null,
      };
    });
  const sorted = [...cards].sort((a, b) => (b[sortBy] ?? -1) - (a[sortBy] ?? -1)).slice(0, limit);
  return {
    brand: brand.slug,
    range: { from, to },
    note: "Lifetime totals per post as of the latest nightly snapshot; newer posts have had fewer days. Facebook counts Reel plays.",
    posts: sorted.map((c) => ({
      platform: PLATFORM_INFO[c.platform].label,
      published: c.publishedDate,
      caption: (c.caption ?? "").slice(0, 160),
      views: c.views,
      likes: c.likes,
      comments: c.comments,
      shares: c.shares,
      status: c.status,
      url: c.url,
    })),
    same_video_across_platforms: groupByDay(brand.slug, cards)
      .slice(0, limit)
      .map((g) => ({ day: g.dayLabel, date: g.date, title: g.title, total_views: g.totalViews, by_platform: g.byPlatform.map((b) => ({ platform: PLATFORM_INFO[b.platform].label, views: b.views })) })),
  };
}

async function getPipelineTool(ctx: ToolContext, input: Input) {
  const stuckDays = Math.min(90, Math.max(1, Number(input.stuck_days ?? 7)));
  const { data: stages } = await ctx.db.from("pipeline_stages").select("id, name, position, is_won, is_lost, pipeline_name").order("position");
  const { data: leads, error } = await ctx.db
    .from("leads")
    .select("id, created_date, source_channel, form, is_spam, stage_id, value, won_at, lost_at, quote_sent_at");
  if (error) throw error;
  const { data: events } = await ctx.db.from("lead_stage_events").select("lead_id, stage_id, entered_at").order("entered_at", { ascending: false });
  const enteredStage = new Map<string, string>();
  for (const e of events ?? []) if (!enteredStage.has(e.lead_id)) enteredStage.set(e.lead_id, e.entered_at);
  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));
  const real = leads.filter((l) => !l.is_spam);

  const byStage = (stages ?? []).map((s) => {
    const inStage = real.filter((l) => l.stage_id === s.id);
    return { stage: s.name, deals: inStage.length, value_cad: inStage.reduce((t, l) => t + Number(l.value ?? 0), 0) };
  });
  const open = real.filter((l) => {
    const s = l.stage_id ? stageById.get(l.stage_id) : undefined;
    return s && !s.is_won && !s.is_lost;
  });
  const stuck = open
    .map((l) => {
      const since = (enteredStage.get(l.id) ?? l.created_date).slice(0, 10);
      return { stage: stageById.get(l.stage_id!)!.name, days_in_stage: diffDays(since, ctx.today), value_cad: Number(l.value ?? 0), lead_created: l.created_date, source: l.form };
    })
    .filter((x) => x.days_in_stage >= stuckDays)
    .sort((a, b) => b.days_in_stage - a.days_in_stage)
    .slice(0, 25);
  const since30 = addDays(ctx.today, -30);
  const sources: Record<string, number> = {};
  for (const l of real.filter((x) => x.created_date >= since30)) sources[l.form ?? l.source_channel] = (sources[l.form ?? l.source_channel] ?? 0) + 1;

  return {
    note: "Days in stage count from when Pulse first saw the deal in that stage (Pulse connected on 2026-10-24; earlier dates are estimates). Deal values are entered in Lead Rescue.",
    open_deals: open.length,
    open_value_cad: open.reduce((t, l) => t + Number(l.value ?? 0), 0),
    by_stage: byStage,
    [`in_stage_${stuckDays}_days_or_more`]: stuck,
    new_leads_last_30_days_by_source: sources,
    spam_leads_left_out: leads.length - real.length,
  };
}

async function getFlagsTool(ctx: ToolContext, input: Input) {
  const from = dateArg(input, "from")!;
  const to = dateArg(input, "to")!;
  const brand = input.brand ? brandOf(ctx, str(input, "brand")) : null;
  let q = ctx.db.from("data_flags").select("brand_id, platform, kind, severity, date_from, date_to, title, detail").is("resolved_at", null);
  if (brand) q = q.eq("brand_id", brand.id);
  const { data, error } = await q;
  if (error) throw error;
  return data.filter((f) => (!f.date_from || f.date_from <= to) && (!f.date_to || f.date_to >= from));
}

async function getNotesAndActionsTool(ctx: ToolContext) {
  const since = addDays(ctx.today, -14);
  const [{ data: notes }, { data: items }] = await Promise.all([
    ctx.db.from("annotations").select("date, title, body").order("date", { ascending: false }).limit(30),
    ctx.db.from("action_items").select("title, owner_name, due_date, status, target_metric, target_platform, baseline_value, created_at").or(`status.eq.open,updated_at.gte.${since}`).limit(100),
  ]);
  return { notes: notes ?? [], action_items: items ?? [] };
}

/** Runs one tool call. Errors come back as text the model can act on. */
export async function runTool(ctx: ToolContext, name: string, input: Input): Promise<{ ok: boolean; result: unknown }> {
  try {
    switch (name) {
      case "list_metrics":
        return {
          ok: true,
          result: METRICS.filter((m) => !m.definition.startsWith("Internal helper")).map((m) => ({
            key: m.key,
            label: m.label,
            unit: m.unit,
            meaning: m.definition,
            platforms: m.platforms,
            comparable_across_platforms: m.comparableAcrossPlatforms,
            better_when: m.higherIsBetter === null ? "neither (a choice)" : m.higherIsBetter ? "higher" : "lower",
          })),
        };
      case "get_metric":
        return { ok: true, result: await getMetricTool(ctx, input) };
      case "get_top_content":
        return { ok: true, result: await getTopContentTool(ctx, input) };
      case "get_pipeline":
        return { ok: true, result: await getPipelineTool(ctx, input) };
      case "get_flags":
        return { ok: true, result: await getFlagsTool(ctx, input) };
      case "get_notes_and_actions":
        return { ok: true, result: await getNotesAndActionsTool(ctx) };
      default:
        return { ok: false, result: `Unknown tool ${name}.` };
    }
  } catch (e) {
    if (e instanceof ToolInputError) return { ok: false, result: e.message };
    return { ok: false, result: `Lookup failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

