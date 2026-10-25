import "server-only";
import type { TargetOption } from "@/components/meeting/action-items";
import { parseControls, type Controls } from "@/lib/controls";
import { formatExact } from "@/lib/format";
import { buildReview, type BrandReview } from "@/lib/review";
import { searchLine, type SearchLine } from "@/lib/search";
import { createUserClient } from "@/lib/supabase/server";
import { aggregate, MetricStore } from "@/lib/metrics/engine";
import { getAiViews, type AiView } from "./ai-summary";
import { loadSearch } from "./search-site";
import { getActionItems, getNotes, type ActionItem, type Note } from "./meeting";
import { getAppContext, getMetricRows, userWeekReader, type AppContext } from "./source";
import { loadWeek } from "./week";

export interface ReviewPage {
  ctx: AppContext;
  controls: Controls;
  reviews: BrandReview[];
  actionItems: ActionItem[];
  notes: Note[];
  /** Figures an action item can aim to move, with their value now. */
  targets: TargetOption[];
  /** The AI summary and ideas per brand slug, when one was written for this period. */
  ai: Record<string, AiView>;
  /** One-line Google search summary per brand slug (brands with Search Console). */
  search: Record<string, SearchLine | null>;
  /** One-line ad summary per brand slug (brands running Meta ads). */
  ads: Record<string, AdsLine>;
}

export interface AdsLine {
  spend: number;
  results: number;
  /** "leads" for brands with a CRM, otherwise "link clicks". */
  resultLabel: string;
  costPerResult: number | null;
}

export async function loadReviewPage(params: Record<string, string | string[] | undefined>): Promise<ReviewPage> {
  const ctx = await getAppContext();
  const controls = parseControls(params, ctx.brands, ctx.today);
  const [weeks, actionItems, notes] = await Promise.all([loadWeek(controls, userWeekReader), getActionItems(), getNotes()]);
  const reviews = weeks.map((w) => buildReview(w, controls));
  const [ai, search, ads] = await Promise.all([getAiViews(reviews, controls), searchLines(reviews, controls, ctx), adsLines(reviews, controls)]);

  const targets: TargetOption[] = [];
  for (const r of reviews) {
    const seen = new Set<string>();
    for (const id of [...r.pack.scoreboard, ...r.pack.details]) {
      const f = r.pack.figures[id];
      if (!f || seen.has(id) || f.value === null) continue;
      seen.add(id);
      targets.push({ id, label: `${r.brand.shortName}: ${f.label}`, value: f.value, display: formatExact(f.value, f.unit), higherIsBetter: f.higherIsBetter });
    }
  }
  return { ctx, controls, reviews, actionItems, notes, targets, ai, search, ads };
}

async function adsLines(reviews: BrandReview[], controls: Controls): Promise<Record<string, AdsLine>> {
  const withAds = reviews.filter((r) => r.brand.platforms.includes("meta_ads"));
  if (!withAds.length) return {};
  const rows = await getMetricRows(
    withAds.map((r) => r.brand.slug),
    controls.period.from,
    controls.period.to,
  );
  const out: Record<string, AdsLine> = {};
  for (const r of withAds) {
    const store = new MetricStore(rows.filter((x) => x.brand === r.brand.slug));
    const value = (metric: string, platform: "meta_ads" | "lead_rescue") => aggregate(store, r.brand.slug, metric, platform, r.brand.platforms, [controls.period]).value ?? 0;
    const spend = value("ad_spend", "meta_ads");
    if (!spend) continue;
    const leadBrand = r.brand.platforms.includes("lead_rescue");
    const results = leadBrand ? value("leads_from_ads", "lead_rescue") : value("ad_clicks", "meta_ads");
    out[r.brand.slug] = { spend, results, resultLabel: leadBrand ? "leads" : "link clicks", costPerResult: results ? spend / results : null };
  }
  return out;
}

async function searchLines(reviews: BrandReview[], controls: Controls, ctx: AppContext): Promise<Record<string, SearchLine | null>> {
  const out: Record<string, SearchLine | null> = {};
  if (ctx.mode !== "live") return out;
  const db = await createUserClient();
  await Promise.all(
    reviews
      .filter((r) => r.brand.platforms.includes("search_console"))
      .map(async (r) => {
        const s = await loadSearch(db, r.brand, ctx.brands, controls.period, controls.compare.windows);
        out[r.brand.slug] = s ? searchLine(s.keywords, s.clicks) : null;
      }),
  );
  return out;
}
