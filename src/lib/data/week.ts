import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandSettings } from "@/config/brands";
import type { Controls } from "@/lib/controls";
import { addDays, minDate } from "@/lib/dates";
import { MetricStore } from "@/lib/metrics/engine";
import { buildWeekPack, type WeekPack } from "@/lib/pack";
import { rangeLength } from "@/lib/periods";
import { bestPerPlatform, groupContent, type ContentCard, type ContentGroup } from "@/lib/content";
import type { ISODate } from "@/lib/dates";
import type { MetricRow } from "@/lib/metrics/engine";
import { queryContent, queryFlags, queryMetricRows, type Flag } from "./queries";

export interface BrandWeek {
  brand: BrandSettings;
  pack: WeekPack;
  flags: Flag[];
  /** Content published in the period, grouped by day across platforms, most viewed first. */
  groups: ContentGroup[];
  best: ContentCard[];
}

type Read<T> = (brandSlugs: string[], from: ISODate, to: ISODate) => Promise<T[]>;

/** Where loadWeek reads from: the signed-in user's view (see source.ts) or a service-client reader for nightly jobs. */
export interface WeekReader {
  metricRows: Read<MetricRow>;
  flags: Read<Flag>;
  content: Read<ContentCard & { brand: string }>;
}

export function serviceReader(db: SupabaseClient, brands: BrandSettings[]): WeekReader {
  return {
    metricRows: (slugs, from, to) => queryMetricRows(db, brands, slugs, from, to),
    flags: (slugs, from, to) => queryFlags(db, brands, slugs, from, to),
    content: (slugs, from, to) => queryContent(db, brands, slugs, from, to),
  };
}

/** Loads exactly the rows the packs need (current period, comparison windows, sparkline history) and builds them. */
export async function loadWeek(controls: Controls, reader: WeekReader): Promise<BrandWeek[]> {
  const { period, compare, brands } = controls;
  const trendStart = addDays(period.from, -rangeLength(period) * 11);
  const from = [trendStart, ...compare.windows.map((w) => w.from)].reduce(minDate);
  const slugs = brands.map((b) => b.slug);

  const [rows, flags, content] = await Promise.all([
    reader.metricRows(slugs, from, period.to),
    reader.flags(slugs, period.from, period.to),
    reader.content(slugs, period.from, period.to),
  ]);

  return brands.map((brand) => {
    const store = new MetricStore(rows.filter((r) => r.brand === brand.slug));
    return {
      brand,
      pack: buildWeekPack(store, brand, period, compare),
      flags: flags.filter((f) => f.brand === brand.slug),
      groups: groupContent(brand.slug, content.filter((c) => c.brand === brand.slug)),
      best: bestPerPlatform(content.filter((c) => c.brand === brand.slug)),
    };
  });
}
