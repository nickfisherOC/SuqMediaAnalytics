import type { BrandSettings, TileSpec } from "@/config/brands";
import { caveatsFor, getMetric, type Unit } from "@/config/metrics";
import type { Platform } from "@/config/platforms";
import { addDays, type ISODate } from "@/lib/dates";
import { aggregate, compareValues, MetricStore, type Change, type PlatformScope } from "@/lib/metrics/engine";
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
}

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

function buildFigure(
  store: MetricStore,
  brand: BrandSettings,
  spec: TileSpec,
  period: ResolvedPeriod,
  compare: ResolvedCompare,
): Figure {
  const def = getMetric(spec.metric);
  const current = aggregate(store, brand.slug, def.key, spec.platform, brand.platforms, [period]);
  const base = aggregate(store, brand.slug, def.key, spec.platform, brand.platforms, compare.windows);

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
  };
}
