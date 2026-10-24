import "server-only";
import { getMetric } from "@/config/metrics";
import { PLATFORM_INFO, isPlatform } from "@/config/platforms";
import { figuresHash, type StoredNarrative } from "@/lib/ai/weekly";
import type { Controls } from "@/lib/controls";
import type { Outcome } from "@/lib/outcomes";
import type { BrandReview } from "@/lib/review";
import { createUserClient } from "@/lib/supabase/server";
import { getAppContext } from "./source";

/** What the Weekly Review shows from the AI for one brand and the period on screen. */
export interface AiView {
  narrative: StoredNarrative | null;
  /** The numbers have changed since the summary was written. */
  stale: boolean;
  ideas: Idea[];
}

export interface Idea {
  id: string;
  what: string;
  why: string;
  target: string;
  direction: "up" | "down";
  effort: "S" | "M" | "L";
  confidence: "low" | "medium" | "high";
  status: "proposed" | "accepted" | "rejected";
  outcome: Outcome | null;
}

const EMPTY: AiView = { narrative: null, stale: false, ideas: [] };

function targetLabel(metric: string, platform: string) {
  let label = metric;
  try {
    label = getMetric(metric).label;
  } catch {}
  return platform !== "all" && isPlatform(platform) ? `${PLATFORM_INFO[platform].label} ${label.toLowerCase()}` : label;
}

export async function getAiViews(reviews: BrandReview[], controls: Controls): Promise<Record<string, AiView>> {
  const ctx = await getAppContext();
  const out: Record<string, AiView> = Object.fromEntries(reviews.map((r) => [r.brand.slug, EMPTY]));
  if (ctx.mode === "preview" || !reviews.length) return out;

  const db = await createUserClient();
  const ids = reviews.map((r) => r.brand.id!);
  const [{ data: narratives }, { data: recs }] = await Promise.all([
    db.from("narratives").select("brand_id, output").in("brand_id", ids).eq("week_start", controls.period.from),
    db
      .from("recommendations")
      .select("id, brand_id, what, why, target_metric, target_platform, expected_direction, effort, confidence, status, created_at")
      .in("brand_id", ids)
      .eq("week_start", controls.period.from)
      .order("created_at"),
  ]);
  const recIds = (recs ?? []).filter((r) => r.status === "accepted").map((r) => r.id);
  const { data: items } = recIds.length ? await db.from("action_items").select("recommendation_id, outcome").in("recommendation_id", recIds) : { data: [] };
  const outcomeOf = new Map((items ?? []).map((i) => [i.recommendation_id as string, i.outcome as Outcome | null]));

  for (const r of reviews) {
    const n = (narratives ?? []).find((x) => x.brand_id === r.brand.id)?.output as StoredNarrative | undefined;
    // Only a summary written for exactly this period and comparison.
    const narrative = n && n.period.to === controls.period.to && n.period.compareKey === controls.compareKey ? n : null;
    out[r.brand.slug] = {
      narrative,
      stale: !!narrative && narrative.figuresHash !== figuresHash(r.pack),
      ideas: narrative
        ? (recs ?? [])
            .filter((x) => x.brand_id === r.brand.id)
            .map((x) => ({
              id: x.id,
              what: x.what,
              why: x.why,
              target: targetLabel(x.target_metric, x.target_platform),
              direction: x.expected_direction,
              effort: x.effort,
              confidence: x.confidence,
              status: x.status,
              outcome: outcomeOf.get(x.id) ?? null,
            }))
        : [],
    };
  }
  return out;
}
