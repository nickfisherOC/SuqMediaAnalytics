import type { BrandSettings } from "@/config/brands";
import type { ISODate } from "@/lib/dates";
import {
  parseCompareKey,
  parsePeriodKey,
  resolveCompare,
  resolvePeriod,
  type CompareKey,
  type PeriodKey,
  type ResolvedCompare,
  type ResolvedPeriod,
} from "@/lib/periods";

/** The global control bar's state, carried in the URL so any view can be shared or bookmarked. */
export interface Controls {
  brand: string | "all";
  periodKey: PeriodKey;
  compareKey: CompareKey;
  period: ResolvedPeriod;
  compare: ResolvedCompare;
  /** Brands in view: one, or every brand for "all". */
  brands: BrandSettings[];
}

type Params = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseControls(params: Params, brands: BrandSettings[], today: ISODate): Controls {
  const brandParam = one(params.brand);
  const brand = brandParam === "all" || brands.some((b) => b.slug === brandParam) ? brandParam! : (brands[0]?.slug ?? "all");
  const periodKey = parsePeriodKey(one(params.period));
  const compareKey = parseCompareKey(one(params.compare));
  const period = resolvePeriod(periodKey, today, { from: one(params.from), to: one(params.to) });
  return {
    brand,
    periodKey: period.key,
    compareKey,
    period,
    compare: resolveCompare(period, compareKey),
    brands: brand === "all" ? brands : brands.filter((b) => b.slug === brand),
  };
}
