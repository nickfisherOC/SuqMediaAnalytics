import "server-only";
import type { BrandSettings } from "@/config/brands";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/config/platforms";
import { groupContent, type ContentGroup } from "@/lib/content";
import { parseControls, type Controls } from "@/lib/controls";
import { addDays } from "@/lib/dates";
import { buildSeriesGrid, type SeriesGrid } from "@/lib/series-grid";
import { getAppContext, getContent, getSeries, type AppContext } from "./source";

export interface BrandPosts {
  brand: BrandSettings;
  platforms: SocialPlatform[];
  /** Every piece of content published in the period, matched across platforms. */
  pieces: ContentGroup[];
}

export interface ContentLabPage {
  ctx: AppContext;
  controls: Controls;
  sort: "views" | "newest";
  posts: BrandPosts[];
  series: { brand: BrandSettings; grid: SeriesGrid }[];
}

export async function loadContentLab(params: Record<string, string | string[] | undefined>): Promise<ContentLabPage> {
  const ctx = await getAppContext();
  const controls = parseControls(params, ctx.brands, ctx.today);
  const sort = params.sort === "newest" ? "newest" : "views";
  const { period } = controls;
  const social = controls.brands.filter((b) => b.platforms.some((p) => (SOCIAL_PLATFORMS as readonly string[]).includes(p)));

  const allSeries = await getSeries();
  const [content, series] = await Promise.all([
    getContent(
      social.map((b) => b.slug),
      period.from,
      period.to,
    ),
    Promise.all(
      allSeries.flatMap((s) => {
        const brand = controls.brands.find((b) => b.slug === s.brand);
        if (!brand) return [];
        return [getContent([brand.slug], s.start, addDays(s.start, s.days - 1)).then((cards) => ({ brand, grid: buildSeriesGrid(s, brand.platforms, cards, ctx.today) }))];
      }),
    ),
  ]);

  const posts = social.map((brand) => {
    const pieces = groupContent(
      brand.slug,
      content.filter((c) => c.brand === brand.slug),
      allSeries,
    );
    if (sort === "newest") pieces.sort((a, b) => b.date.localeCompare(a.date) || b.totalViews - a.totalViews);
    return { brand, platforms: SOCIAL_PLATFORMS.filter((p) => brand.platforms.includes(p)), pieces };
  });
  return { ctx, controls, sort, posts, series };
}
