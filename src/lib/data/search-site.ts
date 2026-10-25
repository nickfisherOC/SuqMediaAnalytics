import "server-only";
import type { BrandSettings, TileSpec } from "@/config/brands";
import { parseControls, type Controls } from "@/lib/controls";
import { addDays, minDate, type ISODate } from "@/lib/dates";
import { MetricStore } from "@/lib/metrics/engine";
import { buildFigure, type Figure } from "@/lib/pack";
import { rangeLength, type DateRange } from "@/lib/periods";
import { compareLabel } from "@/lib/review";
import { byQuery, crossoverQueries, crossovers, discovered, keywordResults, nameTerms, quickWins, type Crossovers, type Keyword, type KeywordResult, type QueryStats, type SearchRow } from "@/lib/search";
import { cityBreakdown } from "@/lib/site";
import { createUserClient } from "@/lib/supabase/server";
import { getAppContext, getMetricRows, type AppContext } from "./source";

export interface Breakdown {
  label: string;
  sessions: number;
}

export interface BrandSearchSite {
  brand: BrandSettings;
  searchTiles: Figure[];
  siteTiles: Figure[];
  hasSearch: boolean;
  hasSite: boolean;
  keywords: KeywordResult[];
  quickWins: QueryStats[];
  discovered: QueryStats[];
  /** Searches for the other brand's name, or a name both share. */
  crossovers: Crossovers;
  /** Latest day Search Console has data for (it runs 2-3 days behind). */
  searchDataTo: ISODate | null;
  site: { channels: Breakdown[]; pages: Breakdown[]; devices: Breakdown[]; cities: Breakdown[]; botVisits: number; botCities: string[] };
}

export interface SearchSitePage {
  ctx: AppContext;
  controls: Controls;
  compareLabel: string;
  brands: BrandSearchSite[];
}

const SEARCH_TILES: TileSpec[] = [
  { metric: "search_clicks", platform: "search_console", label: "Clicks from Google" },
  { metric: "search_impressions", platform: "search_console", label: "Times shown on Google" },
  { metric: "search_position", platform: "search_console", label: "Average position" },
  { metric: "search_ctr", platform: "search_console", label: "Click rate" },
];
const SITE_TILES: TileSpec[] = [
  { metric: "site_sessions", platform: "ga4", label: "Website visits" },
  { metric: "site_sessions_social", platform: "ga4", label: "Visits from social" },
];

const PAGE = 1000;

async function pagedRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 50 * PAGE; offset += PAGE) {
    const { data, error } = await fetchPage(offset, offset + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

type Db = Awaited<ReturnType<typeof createUserClient>>;

/** Tracked keywords, quick wins and discovered searches for one brand and period. */
export async function loadSearch(db: Db, brand: BrandSettings, allBrands: BrandSettings[], period: DateRange, compareWindows: DateRange[], accountIds?: string[]) {
  let searchIds = accountIds;
  if (!searchIds) {
    const { data } = await db.from("accounts").select("id").eq("brand_id", brand.id).eq("platform", "search_console").neq("status", "sample");
    searchIds = (data ?? []).map((a) => a.id);
  }
  if (!searchIds.length) return null;
  const ids = searchIds;
  const range = (r: DateRange) =>
    pagedRows<SearchRow & { date: string }>((a, b) =>
      db.from("search_daily").select("date, query, page, clicks, impressions, position").in("account_id", ids).gte("date", r.from).lte("date", r.to).range(a, b),
    );
  const [cur, ...prev] = await Promise.all([range(period), ...compareWindows.map(range)]);
  const num = (r: SearchRow) => ({ ...r, clicks: Number(r.clicks), impressions: Number(r.impressions), position: Number(r.position) });
  const current = byQuery(cur.map(num));
  const previous = byQuery(prev.flat().map(num));
  const { data: kw } = await db.from("search_keywords").select("id, keyword, group_name").eq("brand_id", brand.id).order("created_at");
  const keywords: Keyword[] = (kw ?? []).map((k) => ({ id: k.id, keyword: k.keyword, group: k.group_name }));
  const cross = crossovers(
    current,
    nameTerms(brand.name),
    allBrands.filter((b) => b.slug !== brand.slug).map((b) => ({ brand: b.name, terms: nameTerms(b.name) })),
  );
  const exclude = crossoverQueries(cross);
  return {
    keywords: keywordResults(keywords, current, previous),
    quickWins: quickWins(current, 5, 8, exclude),
    discovered: discovered(current, keywords, 12, exclude),
    crossovers: cross,
    searchDataTo: cur.map((r) => r.date).sort().at(-1) ?? null,
    clicks: current.reduce((t, q) => t + q.clicks, 0),
  };
}

export async function loadSearchSite(params: Record<string, string | string[] | undefined>): Promise<SearchSitePage> {
  const ctx = await getAppContext();
  const controls = parseControls(params, ctx.brands, ctx.today);
  const { period, compare } = controls;
  const brands = controls.brands.filter((b) => b.platforms.includes("search_console") || b.platforms.includes("ga4"));
  const page: SearchSitePage = { ctx, controls, compareLabel: compareLabel(controls), brands: [] };
  if (!brands.length) return page;

  // Tiles use the same figures as everywhere else (with sparkline history).
  const trendStart = [addDays(period.from, -rangeLength(period) * 11), ...compare.windows.map((w) => w.from)].reduce(minDate);
  const rows = await getMetricRows(
    brands.map((b) => b.slug),
    trendStart,
    period.to,
  );
  const db = ctx.mode === "live" ? await createUserClient() : null;

  page.brands = await Promise.all(
    brands.map(async (brand) => {
      const store = new MetricStore(rows.filter((r) => r.brand === brand.slug));
      const fig = (s: TileSpec) => buildFigure(store, brand, s, period, compare);
      const hasSearch = brand.platforms.includes("search_console");
      const hasSite = brand.platforms.includes("ga4");
      const result: BrandSearchSite = {
        brand,
        searchTiles: hasSearch ? SEARCH_TILES.map(fig) : [],
        siteTiles: hasSite ? SITE_TILES.map(fig) : [],
        hasSearch,
        hasSite,
        keywords: [],
        quickWins: [],
        discovered: [],
        crossovers: { otherBrand: [], shared: [] },
        searchDataTo: null,
        site: { channels: [], pages: [], devices: [], cities: [], botVisits: 0, botCities: [] },
      };
      if (!db) return result;

      const { data: accounts } = await db.from("accounts").select("id, platform, settings").eq("brand_id", brand.id).in("platform", ["search_console", "ga4"]).neq("status", "sample");
      const ids = (p: string) => (accounts ?? []).filter((a) => a.platform === p).map((a) => a.id);

      const search = await loadSearch(db, brand, ctx.brands, period, compare.windows, ids("search_console"));
      if (search) Object.assign(result, search);

      const siteIds = ids("ga4");
      if (siteIds.length) {
        const siteRows = await pagedRows<{ date: string; dimension: string; dim_value: string; sessions: number; extra: { country?: string } | null }>((a, b) =>
          db.from("site_daily").select("date, dimension, dim_value, sessions, extra").in("account_id", siteIds).in("dimension", ["channel", "landing_page", "device", "city"]).gte("date", period.from).lte("date", period.to).range(a, b),
        );
        const top = (dimension: string, limit: number): Breakdown[] => {
          const m = new Map<string, number>();
          for (const r of siteRows) if (r.dimension === dimension) m.set(r.dim_value, (m.get(r.dim_value) ?? 0) + Number(r.sessions));
          return [...m]
            .map(([label, sessions]) => ({ label, sessions }))
            .filter((x) => x.sessions > 0)
            .sort((a, b) => b.sessions - a.sessions)
            .slice(0, limit);
        };
        const city = cityBreakdown(
          siteRows.filter((r) => r.dimension === "city").map((r) => ({ date: r.date, city: r.dim_value, country: r.extra?.country ?? null, sessions: Number(r.sessions) })),
          8,
          (accounts ?? []).filter((a) => a.platform === "ga4").flatMap((a) => ((a.settings as { excluded_cities?: string[] } | null)?.excluded_cities ?? [])),
        );
        result.site = { channels: top("channel", 8), pages: top("landing_page", 8), devices: top("device", 4), cities: city.cities, botVisits: city.botVisits, botCities: city.botCities };
      }
      return result;
    }),
  );
  return page;
}
