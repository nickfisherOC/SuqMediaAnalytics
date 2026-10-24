import "server-only";
import type { TargetOption } from "@/components/meeting/action-items";
import { parseControls, type Controls } from "@/lib/controls";
import { formatExact } from "@/lib/format";
import { buildReview, meetingWeekStart, type BrandReview } from "@/lib/review";
import { getLockedReviews, getMeeting, type Meeting } from "./meetings";
import { getAppContext, type AppContext } from "./source";
import { loadWeek } from "./week";

export interface ReviewPage {
  ctx: AppContext;
  controls: Controls;
  /** Monday of the meeting week, when the period is a full Mon–Sun week. */
  weekStart: string | null;
  meeting: Meeting | null;
  locked: boolean;
  reviews: BrandReview[];
  /** Figures an action item can aim to move, with their value now. */
  targets: TargetOption[];
}

export async function loadReviewPage(params: Record<string, string | string[] | undefined>): Promise<ReviewPage> {
  const ctx = await getAppContext();
  const controls = parseControls(params, ctx.brands, ctx.today);
  const weekStart = meetingWeekStart(controls.period);
  const meeting = weekStart ? await getMeeting(weekStart) : null;
  const locked = Boolean(meeting?.lockedAt && meeting.id);
  const slugs = controls.brands.map((b) => b.slug);

  const reviews = locked
    ? (await getLockedReviews(meeting!.id!)).filter((r) => slugs.includes(r.brand.slug))
    : (await loadWeek(controls)).map((w) => buildReview(w, controls));

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
  return { ctx, controls, weekStart, meeting, locked, reviews, targets };
}
