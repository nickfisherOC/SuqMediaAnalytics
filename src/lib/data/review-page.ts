import "server-only";
import type { TargetOption } from "@/components/meeting/action-items";
import { parseControls, type Controls } from "@/lib/controls";
import { formatExact } from "@/lib/format";
import { buildReview, type BrandReview } from "@/lib/review";
import { searchLine, type SearchLine } from "@/lib/search";
import { createUserClient } from "@/lib/supabase/server";
import { getAiViews, type AiView } from "./ai-summary";
import { loadSearch } from "./search-site";
import { getActionItems, getNotes, type ActionItem, type Note } from "./meeting";
import { getAppContext, userWeekReader, type AppContext } from "./source";
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
}

export async function loadReviewPage(params: Record<string, string | string[] | undefined>): Promise<ReviewPage> {
  const ctx = await getAppContext();
  const controls = parseControls(params, ctx.brands, ctx.today);
  const [weeks, actionItems, notes] = await Promise.all([loadWeek(controls, userWeekReader), getActionItems(), getNotes()]);
  const reviews = weeks.map((w) => buildReview(w, controls));
  const [ai, search] = await Promise.all([getAiViews(reviews, controls), searchLines(reviews, controls, ctx)]);

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
  return { ctx, controls, reviews, actionItems, notes, targets, ai, search };
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
