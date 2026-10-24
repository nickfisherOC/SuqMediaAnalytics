import "server-only";
import type { BrandSettings } from "@/config/brands";
import type { Controls } from "@/lib/controls";
import { addDays, minDate } from "@/lib/dates";
import { MetricStore } from "@/lib/metrics/engine";
import { buildWeekPack, type WeekPack } from "@/lib/pack";
import { rangeLength } from "@/lib/periods";
import { getFlags, getMetricRows, type Flag } from "./source";

export interface BrandWeek {
  brand: BrandSettings;
  pack: WeekPack;
  flags: Flag[];
}

/** Loads exactly the rows the packs need (current period, comparison windows, sparkline history) and builds them. */
export async function loadWeek(controls: Controls): Promise<BrandWeek[]> {
  const { period, compare, brands } = controls;
  const trendStart = addDays(period.from, -rangeLength(period) * 11);
  const from = [trendStart, ...compare.windows.map((w) => w.from)].reduce(minDate);
  const slugs = brands.map((b) => b.slug);

  const [rows, flags] = await Promise.all([getMetricRows(slugs, from, period.to), getFlags(slugs, period.from, period.to)]);

  return brands.map((brand) => {
    const store = new MetricStore(rows.filter((r) => r.brand === brand.slug));
    return {
      brand,
      pack: buildWeekPack(store, brand, period, compare),
      flags: flags.filter((f) => f.brand === brand.slug),
    };
  });
}
