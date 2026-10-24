import { getMetric, type MetricDef, type MetricRef } from "@/config/metrics";
import type { Platform } from "@/config/platforms";
import { eachDay, type ISODate } from "@/lib/dates";
import type { DateRange } from "@/lib/periods";

/** One row of the long fact table (`metric_daily`), already summed across a brand's accounts. */
export interface MetricRow {
  brand: string;
  platform: Platform;
  date: ISODate;
  metric: string;
  value: number;
  isSample?: boolean;
}

export type PlatformScope = Platform | "all";

/**
 * In-memory index over metric rows. All metric maths goes through here so the
 * screen, the week pack and the AI always agree.
 */
export class MetricStore {
  private index = new Map<string, Map<ISODate, number>>();
  private platformsByBrandMetric = new Map<string, Set<Platform>>();
  readonly hasSample: boolean;

  constructor(rows: MetricRow[]) {
    let sample = false;
    for (const r of rows) {
      if (!Number.isFinite(r.value)) continue;
      const k = key(r.brand, r.platform, r.metric);
      let byDate = this.index.get(k);
      if (!byDate) this.index.set(k, (byDate = new Map()));
      // Two accounts on the same platform (rare, but possible) add together.
      byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.value);

      const bm = `${r.brand}|${r.metric}`;
      let set = this.platformsByBrandMetric.get(bm);
      if (!set) this.platformsByBrandMetric.set(bm, (set = new Set()));
      set.add(r.platform);
      if (r.isSample) sample = true;
    }
    this.hasSample = sample;
  }

  /** Platforms that have ever reported this metric for this brand. */
  platformsWith(brand: string, metric: string): Platform[] {
    return [...(this.platformsByBrandMetric.get(`${brand}|${metric}`) ?? [])];
  }

  get(brand: string, platform: Platform, metric: string): Map<ISODate, number> | undefined {
    return this.index.get(key(brand, platform, metric));
  }
}

function key(brand: string, platform: Platform, metric: string) {
  return `${brand}|${platform}|${metric}`;
}

export interface Aggregate {
  value: number | null;
  /** Platforms whose data went into the value. */
  platforms: Platform[];
}

/** Which platforms a metric draws on, for a brand, given a scope. */
function platformsFor(def: MetricDef, scope: PlatformScope, brandPlatforms: Platform[]): Platform[] {
  if (scope !== "all") return [scope];
  return def.platforms.filter((p) => brandPlatforms.includes(p));
}

/** Sum of a summed/last metric over one date range. */
function aggregateBase(
  store: MetricStore,
  brand: string,
  def: MetricDef,
  platforms: Platform[],
  range: DateRange,
): Aggregate {
  let total = 0;
  const used: Platform[] = [];

  for (const p of platforms) {
    const byDate = store.get(brand, p, def.key);
    if (!byDate) continue;

    if (def.aggregation === "last") {
      // The value on the last day in range that has one.
      let lastDate: ISODate | null = null;
      for (const d of byDate.keys()) {
        if (d >= range.from && d <= range.to && (lastDate === null || d > lastDate)) lastDate = d;
      }
      if (lastDate !== null) {
        total += byDate.get(lastDate)!;
        used.push(p);
      }
    } else {
      let any = false;
      for (const [d, v] of byDate) {
        if (d >= range.from && d <= range.to) {
          total += v;
          any = true;
        }
      }
      if (any) used.push(p);
    }
  }

  return { value: used.length ? total : null, platforms: used };
}

function sumRefs(
  store: MetricStore,
  brand: string,
  refs: MetricRef[],
  scope: PlatformScope,
  brandPlatforms: Platform[],
  ranges: DateRange[],
): Aggregate {
  let total = 0;
  const used = new Set<Platform>();
  let any = false;
  for (const ref of refs) {
    const def = getMetric(ref.metric);
    // A ref pinned to a platform (e.g. ad spend from Meta Ads) ignores the scope.
    const platforms = ref.platform ? [ref.platform] : platformsFor(def, scope, brandPlatforms);
    for (const range of ranges) {
      const agg = aggregateBase(store, brand, def, platforms, range);
      if (agg.value !== null) {
        total += agg.value;
        any = true;
        agg.platforms.forEach((p) => used.add(p));
      }
    }
  }
  return { value: any ? total : null, platforms: [...used] };
}

/**
 * The value of a metric over one or more same-length windows.
 *  - One window: the value for that window.
 *  - Several windows (4-period average): the average window. Summed and
 *    "last" metrics average the per-window values; ratios divide the pooled
 *    sums, so a quiet week doesn't count as much as a busy one.
 */
export function aggregate(
  store: MetricStore,
  brand: string,
  metricKey: string,
  scope: PlatformScope,
  brandPlatforms: Platform[],
  ranges: DateRange[],
): Aggregate {
  const def = getMetric(metricKey);

  if (def.aggregation === "ratio") {
    const num = sumRefs(store, brand, def.numerator, scope, brandPlatforms, ranges);
    const den = sumRefs(store, brand, def.denominator, scope, brandPlatforms, ranges);
    const platforms = [...new Set([...num.platforms, ...den.platforms])];
    if (num.value === null || den.value === null || den.value === 0) return { value: null, platforms };
    return { value: (num.value / den.value) * (def.multiplier ?? 1), platforms };
  }

  const platforms = platformsFor(def, scope, brandPlatforms);
  const perWindow = ranges.map((r) => aggregateBase(store, brand, def, platforms, r));
  const withData = perWindow.filter((a) => a.value !== null);
  if (!withData.length) return { value: null, platforms: [] };
  const used = [...new Set(withData.flatMap((a) => a.platforms))];
  const mean = withData.reduce((s, a) => s + a.value!, 0) / withData.length;
  return { value: mean, platforms: used };
}

export interface Change {
  delta: number | null;
  /** Fractional change (0.5 = +50%). Null when the baseline is 0 or missing. */
  pct: number | null;
  direction: "up" | "down" | "flat" | null;
  /** Whether the change is good news, given the metric's direction. */
  sentiment: "good" | "bad" | "neutral" | null;
}

/** Tolerance for treating a floating-point change as no change. */
const EPSILON = 1e-9;

export function compareValues(current: number | null, base: number | null, higherIsBetter: boolean | null): Change {
  if (current === null || base === null) return { delta: null, pct: null, direction: null, sentiment: null };
  const delta = current - base;
  const flat = Math.abs(delta) < EPSILON;
  const direction = flat ? "flat" : delta > 0 ? "up" : "down";
  const pct = Math.abs(base) < EPSILON ? null : delta / Math.abs(base);
  const sentiment = flat || higherIsBetter === null ? "neutral" : (delta > 0) === higherIsBetter ? "good" : "bad";
  return { delta: flat ? 0 : delta, pct, direction, sentiment };
}

export interface SeriesPoint {
  date: ISODate;
  value: number | null;
}

/**
 * Daily values for charts and sparklines. "Last" metrics carry the previous
 * day's value forward across gaps, so a combined follower line doesn't dip
 * when one platform misses a day.
 */
export function dailySeries(
  store: MetricStore,
  brand: string,
  metricKey: string,
  scope: PlatformScope,
  brandPlatforms: Platform[],
  range: DateRange,
): SeriesPoint[] {
  const def = getMetric(metricKey);
  const days = eachDay(range.from, range.to);

  if (def.aggregation === "ratio") {
    return days.map((d) => ({
      date: d,
      value: aggregate(store, brand, metricKey, scope, brandPlatforms, [{ from: d, to: d }]).value,
    }));
  }

  const platforms = platformsFor(def, scope, brandPlatforms);
  const totals: (number | null)[] = days.map(() => null);

  for (const p of platforms) {
    const byDate = store.get(brand, p, def.key);
    if (!byDate) continue;
    let carry: number | null = null;
    if (def.aggregation === "last") {
      // Seed with the latest value before the range starts.
      let before: ISODate | null = null;
      for (const d of byDate.keys()) if (d < range.from && (before === null || d > before)) before = d;
      if (before !== null) carry = byDate.get(before)!;
    }
    days.forEach((d, i) => {
      let v = byDate.get(d);
      if (v === undefined && def.aggregation === "last" && carry !== null) v = carry;
      if (v !== undefined) {
        totals[i] = (totals[i] ?? 0) + v;
        if (def.aggregation === "last") carry = v;
      }
    });
  }

  return days.map((d, i) => ({ date: d, value: totals[i] }));
}
