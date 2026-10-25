import "server-only";
import type { BrandSettings } from "@/config/brands";
import { SERIES } from "@/config/series";
import { addDays } from "@/lib/dates";
import { buildSeriesGrid, type SeriesGrid } from "@/lib/series-grid";
import { getAppContext, getContent, type AppContext } from "./source";

export interface ContentLabPage {
  ctx: AppContext;
  series: { brand: BrandSettings; grid: SeriesGrid }[];
}

/** Every content series of the active brands, as a day-by-platform grid. */
export async function loadContentLab(): Promise<ContentLabPage> {
  const ctx = await getAppContext();
  const series = await Promise.all(
    SERIES.flatMap((s) => {
      const brand = ctx.brands.find((b) => b.slug === s.brand);
      if (!brand) return [];
      return [
        getContent([brand.slug], s.start, addDays(s.start, s.days - 1)).then((cards) => ({
          brand,
          grid: buildSeriesGrid(s, brand.platforms, cards, ctx.today),
        })),
      ];
    }),
  );
  return { ctx, series };
}
