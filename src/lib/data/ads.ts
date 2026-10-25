import "server-only";
import type { BrandSettings, TileSpec } from "@/config/brands";
import { adsByDay, aggregateAds, bestAndWorst, isTiring, type AdDayRow, type AdStats, type ResultKind } from "@/lib/ads";
import { parseControls, type Controls } from "@/lib/controls";
import { addDays, eachDay, minDate } from "@/lib/dates";
import { MetricStore } from "@/lib/metrics/engine";
import { buildFigure, type Figure } from "@/lib/pack";
import { rangeLength, type DateRange } from "@/lib/periods";
import { compareLabel } from "@/lib/review";
import { createUserClient } from "@/lib/supabase/server";
import { getAppContext, getMetricRows, type AppContext } from "./source";

export interface AdRow extends AdStats {
  campaign: string | null;
  badge: "best" | "worst" | null;
  tiring: boolean;
}

export interface BrandAds {
  brand: BrandSettings;
  result: ResultKind;
  spendTiles: Figure[];
  resultTiles: Figure[];
  funnel: { label: string; figure: Figure }[];
  campaigns: AdStats[];
  ads: AdRow[];
  days: { date: string; spend: number; results: number }[];
  /** Meta's pixel saw no purchases in the period (for sales brands). */
  noPixelSales: boolean;
}

export interface AdsPage {
  ctx: AppContext;
  controls: Controls;
  compareLabel: string;
  brands: BrandAds[];
}

const SPEND_TILES: TileSpec[] = [
  { metric: "ad_spend", platform: "meta_ads" },
  { metric: "ad_impressions", platform: "meta_ads", label: "Times ads were shown" },
  { metric: "ad_clicks", platform: "meta_ads", label: "Link clicks" },
  { metric: "ad_ctr", platform: "meta_ads", label: "Click rate" },
  { metric: "cpc", platform: "meta_ads" },
  { metric: "cpm", platform: "meta_ads" },
];
// Lead brands (with a CRM): leads and what they cost.
const LEAD_TILES: TileSpec[] = [
  { metric: "meta_leads", platform: "meta_ads", label: "Leads (Meta's count)" },
  { metric: "leads_from_ads", platform: "lead_rescue", label: "Leads from ads (Lead Rescue)" },
  { metric: "cost_per_lead", platform: "all" },
];
// Sales brands (with a store): what happened in the shop. Includes non-ad social visits.
const SALES_TILES: TileSpec[] = [
  { metric: "store_sessions_social", platform: "shopify", label: "Store visits from social and ads" },
  { metric: "add_to_cart", platform: "shopify", label: "Added to cart" },
  { metric: "orders", platform: "shopify" },
];
const LEAD_FUNNEL: TileSpec[] = [
  { metric: "ad_impressions", platform: "meta_ads", label: "Ad views" },
  { metric: "ad_clicks", platform: "meta_ads", label: "Ad clicks" },
  { metric: "site_sessions", platform: "ga4", label: "Landing page visits" },
  { metric: "leads", platform: "lead_rescue", label: "Leads" },
  { metric: "quotes_sent", platform: "lead_rescue", label: "Quote sent" },
  { metric: "deals_won", platform: "lead_rescue", label: "Won" },
];
const SALES_FUNNEL: TileSpec[] = [
  { metric: "ad_impressions", platform: "meta_ads", label: "Ad views" },
  { metric: "ad_clicks", platform: "meta_ads", label: "Ad clicks" },
  { metric: "store_sessions_social", platform: "shopify", label: "Store visits from social and ads" },
  { metric: "add_to_cart", platform: "shopify", label: "Added to cart" },
  { metric: "orders", platform: "shopify", label: "Orders" },
];

const fits = (brand: BrandSettings, s: TileSpec) => s.platform === "all" || brand.platforms.includes(s.platform);

export async function loadAdsPage(params: Record<string, string | string[] | undefined>): Promise<AdsPage> {
  const ctx = await getAppContext();
  const controls = parseControls(params, ctx.brands, ctx.today);
  const { period, compare } = controls;
  const brands = controls.brands.filter((b) => b.platforms.includes("meta_ads"));
  const page: AdsPage = { ctx, controls, compareLabel: compareLabel(controls), brands: [] };
  if (!brands.length) return page;

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
      const leadBrand = brand.platforms.includes("lead_rescue");
      const result: ResultKind = leadBrand ? "leads" : "clicks";
      const out: BrandAds = {
        brand,
        result,
        spendTiles: SPEND_TILES.map(fig),
        resultTiles: (leadBrand ? LEAD_TILES : SALES_TILES).filter((s) => fits(brand, s)).map(fig),
        funnel: (leadBrand ? LEAD_FUNNEL : SALES_FUNNEL).filter((s) => fits(brand, s)).map((s) => ({ label: s.label ?? s.metric, figure: fig(s) })),
        campaigns: [],
        ads: [],
        days: [],
        noPixelSales: false,
      };
      if (!db) return out;

      const { data: accounts } = await db.from("accounts").select("id").eq("brand_id", brand.id).eq("platform", "meta_ads").neq("status", "sample");
      const ids = (accounts ?? []).map((a) => a.id);
      if (!ids.length) return out;
      const load = async (r: DateRange) => {
        const { data, error } = await db
          .from("ads_daily")
          .select("date, level, entity_id, parent_id, name, status, thumbnail_url, spend, impressions, link_clicks, leads, frequency, extra")
          .in("account_id", ids)
          .gte("date", r.from)
          .lte("date", r.to)
          .limit(20000);
        if (error) throw error;
        return (data ?? []).map((d) => ({
          ...d,
          spend: Number(d.spend),
          impressions: Number(d.impressions),
          link_clicks: Number(d.link_clicks),
          leads: Number(d.leads),
          frequency: d.frequency === null ? null : Number(d.frequency),
        })) as AdDayRow[];
      };
      const [cur, ...prev] = await Promise.all([load(period), ...compare.windows.map(load)]);

      const adsets = new Map(aggregateAds(cur, "adset", result).map((a) => [a.id, a]));
      const campaigns = aggregateAds(cur, "campaign", result).sort((a, b) => b.spend - a.spend);
      const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
      const ads = aggregateAds(cur, "ad", result).filter((a) => a.spend > 0 || a.impressions > 0);
      const before = new Map(aggregateAds(prev.flat(), "ad", result).map((a) => [a.id, a]));
      const { best, worst } = bestAndWorst(ads);
      out.campaigns = campaigns;
      out.ads = ads
        .map((a) => {
          const adset = a.parentId ? adsets.get(a.parentId) : undefined;
          return {
            ...a,
            campaign: adset?.parentId ? (campaignName.get(adset.parentId) ?? null) : null,
            badge: a.id === best ? ("best" as const) : a.id === worst ? ("worst" as const) : null,
            tiring: isTiring(a, before.get(a.id)),
          };
        })
        .sort((a, b) => b.spend - a.spend);
      out.days = adsByDay(cur, eachDay(period.from, period.to), result);
      out.noPixelSales = !leadBrand && ads.reduce((t, a) => t + a.purchases, 0) === 0 && ads.some((a) => a.spend > 0);
      return out;
    }),
  );
  return page;
}
