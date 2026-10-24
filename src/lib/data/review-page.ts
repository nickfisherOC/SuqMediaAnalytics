import "server-only";
import type { TargetOption } from "@/components/meeting/action-items";
import { parseControls, type Controls } from "@/lib/controls";
import { formatExact } from "@/lib/format";
import { buildReview, type BrandReview } from "@/lib/review";
import { getAiViews, type AiView } from "./ai-summary";
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
}

export async function loadReviewPage(params: Record<string, string | string[] | undefined>): Promise<ReviewPage> {
  const ctx = await getAppContext();
  const controls = parseControls(params, ctx.brands, ctx.today);
  const [weeks, actionItems, notes] = await Promise.all([loadWeek(controls, userWeekReader), getActionItems(), getNotes()]);
  const reviews = weeks.map((w) => buildReview(w, controls));
  const ai = await getAiViews(reviews, controls);

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
  return { ctx, controls, reviews, actionItems, notes, targets, ai };
}
