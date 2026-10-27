import type { BrandSettings, TileSpec } from "@/config/brands";
import { caveatsFor, getMetric, type Unit } from "@/config/metrics";
import { PLATFORM_INFO, SOCIAL_PLATFORMS, type Platform } from "@/config/platforms";
import { addDays, type ISODate } from "@/lib/dates";
import { historyStartsAfter, aggregate, compareValues, MetricStore, type Change, type PlatformScope } from "@/lib/metrics/engine";
import { rangeLength, type DateRange, type ResolvedCompare, type ResolvedPeriod } from "@/lib/periods";

/**
 * The week pack: every number for one brand and period, computed once by our
 * code. The Weekly Review renders from it, the AI writes from it (and may only
 * cite figures that exist in it), and locking a week freezes it.
 */

export const PACK_VERSION = 1;

export interface Figure {
  /** Stable id, e.g. "peoplesuq.followers.all". The AI cites figures by this id. */
  id: string;
  metric: string;
  platform: PlatformScope;
  label: string;
  definition: string;
  unit: Unit;
  higherIsBetter: boolean | null;
  value: number | null;
  /** The comparison value (previous period, 4-period average, …). */
  base: number | null;
  change: Change;
  /** The same metric over the trailing periods, oldest first; the last point is the current period. */
  trend: { from: ISODate; to: ISODate; value: number | null }[];
  platformsUsed: Platform[];
  /** Set when the comparison was left out because Pulse's data only starts on this day. */
  historyFrom: ISODate | null;
  /** Platforms that should report this metric but have no data in the period. */
  platformsMissing: Platform[];
  comparableAcrossPlatforms: boolean;
  caveats: string[];
}

export interface WeekPack {
  version: number;
  brand: { slug: string; name: string };
  period: ResolvedPeriod;
  compare: ResolvedCompare;
  generatedAt: string;
  /** True when any number in the pack comes from sample data. */
  isSample: boolean;
  figures: Record<string, Figure>;
  scoreboard: string[];
  funnel: { label: string; figureId: string }[];
  /** Per-platform and supporting figures the summary ranks ("Instagram views up 153%"). */
  details: string[];
  /** Posts each platform should publish in this period, from the brand's weekly cadence. */
  cadenceTarget: number;
}

/** Per-platform metrics worth calling out. */
const SOCIAL_DETAIL_METRICS = ["followers", "views", "engagements", "comments", "link_clicks", "profile_visits", "posts_published"];
/** Brand-level metrics worth calling out, when the brand has the platform. */
const BRAND_DETAIL_METRICS: { metric: string; platform: Platform | "all" }[] = [
  { metric: "store_sessions_social", platform: "shopify" },
  { metric: "add_to_cart", platform: "shopify" },
  { metric: "reached_checkout", platform: "shopify" },
  { metric: "orders", platform: "shopify" },
  { metric: "store_revenue", platform: "shopify" },
  { metric: "site_sessions", platform: "ga4" },
  { metric: "site_sessions_social", platform: "ga4" },
  { metric: "leads", platform: "lead_rescue" },
  { metric: "quotes_sent", platform: "lead_rescue" },
  { metric: "deals_won", platform: "lead_rescue" },
  { metric: "revenue_won", platform: "lead_rescue" },
  { metric: "pipeline_value", platform: "lead_rescue" },
];

export function figureId(brand: string, metric: string, platform: PlatformScope) {
  return `${brand}.${metric}.${platform}`;
}

const TREND_POINTS = 12;

function trailingWindows(period: DateRange, count: number): DateRange[] {
  const len = rangeLength(period);
  return Array.from({ length: count }, (_, i) => {
    const back = (count - 1 - i) * len;
    return { from: addDays(period.from, -back), to: addDays(period.to, -back) };
  });
}

export function buildFigure(
  store: MetricStore,
  brand: BrandSettings,
  spec: TileSpec,
  period: ResolvedPeriod,
  compare: ResolvedCompare,
): Figure {
  const def = getMetric(spec.metric);
  const current = aggregate(store, brand.slug, def.key, spec.platform, brand.platforms, [period]);
  // Leave the comparison out when Pulse's data starts partway through the comparison window.
  const historyFrom = compare.windows
    .map((w) => historyStartsAfter(store, brand.slug, def.key, spec.platform, brand.platforms, w.from))
    .find((d) => d !== null) ?? null;
  const base = historyFrom ? { value: null, platforms: [] } : aggregate(store, brand.slug, def.key, spec.platform, brand.platforms, compare.windows);

  const expected =
    def.aggregation === "ratio"
      ? []
      : spec.platform === "all"
        ? def.platforms.filter((p) => brand.platforms.includes(p))
        : [spec.platform];

  return {
    id: figureId(brand.slug, def.key, spec.platform),
    metric: def.key,
    platform: spec.platform,
    label: spec.label ?? def.label,
    definition: def.definition,
    unit: def.unit,
    higherIsBetter: def.higherIsBetter,
    value: current.value,
    base: base.value,
    change: compareValues(current.value, base.value, def.higherIsBetter),
    historyFrom,
    trend: trailingWindows(period, TREND_POINTS).map((w) => ({
      ...w,
      value: aggregate(store, brand.slug, def.key, spec.platform, brand.platforms, [w]).value,
    })),
    platformsUsed: current.platforms,
    platformsMissing: expected.filter((p) => !current.platforms.includes(p)),
    comparableAcrossPlatforms: def.comparableAcrossPlatforms,
    caveats: caveatsFor(def, spec.platform),
  };
}

export function buildWeekPack(
  store: MetricStore,
  brand: BrandSettings,
  period: ResolvedPeriod,
  compare: ResolvedCompare,
  now: Date = new Date(),
): WeekPack {
  const figures: Record<string, Figure> = {};
  const add = (spec: TileSpec) => {
    const f = buildFigure(store, brand, spec, period, compare);
    figures[f.id] ??= f;
    return f;
  };

  const scoreboard = brand.scoreboard.map((t) => add(t).id);
  const funnel = brand.funnel.map((s) => ({ label: s.label, figureId: add(s).id }));

  const details: string[] = [];
  for (const p of brand.platforms) {
    if (!(SOCIAL_PLATFORMS as readonly string[]).includes(p)) continue;
    for (const m of SOCIAL_DETAIL_METRICS) {
      if (!getMetric(m).platforms.includes(p)) continue;
      details.push(add({ metric: m, platform: p, label: `${PLATFORM_INFO[p].label} ${getMetric(m).label.toLowerCase()}` }).id);
    }
  }
  for (const d of BRAND_DETAIL_METRICS) {
    const needs = d.platform === "all" ? getMetric(d.metric).platforms : [d.platform];
    if (needs.every((p) => brand.platforms.includes(p))) details.push(add(d).id);
  }

  return {
    version: PACK_VERSION,
    brand: { slug: brand.slug, name: brand.name },
    period,
    compare,
    generatedAt: now.toISOString(),
    isSample: store.hasSample,
    figures,
    scoreboard,
    funnel,
    details,
    cadenceTarget: Math.round((brand.cadence.postsPerWeek * period.days) / 7),
  };
}
