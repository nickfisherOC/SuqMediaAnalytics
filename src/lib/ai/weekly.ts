import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandSettings } from "@/config/brands";
import { getMetric } from "@/config/metrics";
import type { Controls } from "@/lib/controls";
import { loadWeek, serviceReader } from "@/lib/data/week";
import { addDays, type ISODate } from "@/lib/dates";
import { aggregate, MetricStore } from "@/lib/metrics/engine";
import { judgeOutcome, OUTCOME_AFTER_DAYS, outcomeWindow } from "@/lib/outcomes";
import type { WeekPack } from "@/lib/pack";
import { queryMetricRows } from "@/lib/data/queries";
import { buildReview } from "@/lib/review";
import { cost, hashInput } from "./ask";
import { generateSummary, type PastRecommendation, type Summary, type SummaryExtras } from "./summary";
import { runTool } from "./tools";

/**
 * The AI summary's life cycle: generate and store it (nightly after the sync,
 * or on "Rewrite"), and score accepted recommendations two weeks later.
 * Runs with the service client; callers check who's asking.
 */

export interface StoredNarrative extends Summary {
  period: { from: ISODate; to: ISODate; periodKey: string; compareKey: string; compareLabel: string };
  /** Figure values the summary was written from, for baselines when a recommendation is accepted. */
  values: Record<string, number | null>;
  /** Hash of the figures, to tell when the numbers have moved on since writing. */
  figuresHash: string;
  generatedAt: string;
  model: string;
  promptVersion: string;
}

/** Changes whenever any figure in the pack changes. */
export function figuresHash(pack: WeekPack) {
  return hashInput(
    Object.values(pack.figures)
      .map((f) => [f.id, f.value, f.base])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

export async function extrasFor(db: SupabaseClient, brands: BrandSettings[], brand: BrandSettings, today: ISODate): Promise<SummaryExtras> {
  const brandOrAll = `brand_id.eq.${brand.id},brand_id.is.null`;
  const [{ data: notes }, { data: open }, { data: recs }] = await Promise.all([
    db.from("annotations").select("date, title, body").or(brandOrAll).gte("date", addDays(today, -30)).order("date", { ascending: false }).limit(15),
    db.from("action_items").select("title").or(brandOrAll).eq("status", "open").limit(50),
    db
      .from("recommendations")
      .select("id, what, target_metric, target_platform, status")
      .eq("brand_id", brand.id)
      .neq("status", "proposed")
      .gte("created_at", addDays(today, -90))
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const ids = (recs ?? []).map((r) => r.id);
  const { data: items } = ids.length
    ? await db.from("action_items").select("recommendation_id, outcome").in("recommendation_id", ids)
    : { data: [] as { recommendation_id: string; outcome: PastRecommendation["outcome"] }[] };
  const outcomeOf = new Map((items ?? []).map((i) => [i.recommendation_id, i.outcome]));

  let pipeline: unknown;
  if (brand.platforms.includes("lead_rescue")) {
    const r = await runTool({ db, brands, today }, "get_pipeline", {});
    if (r.ok) pipeline = r.result;
  }

  return {
    notes: (notes ?? []).map((n) => ({ date: n.date, text: n.body ? `${n.title}\n${n.body}` : n.title })),
    openActions: (open ?? []).map((a) => a.title),
    pastRecommendations: (recs ?? []).map((r) => ({
      what: r.what,
      target: `${brand.slug}.${r.target_metric}.${r.target_platform}`,
      status: r.status,
      outcome: outcomeOf.get(r.id) ?? null,
    })),
    pipeline,
  };
}

export interface GenerateOutcome {
  brand: string;
  ok: boolean;
  message: string;
  costUsd?: number;
}

/** Writes and stores one brand's summary and recommendations for the controls' period. */
export async function generateForBrand(
  db: SupabaseClient,
  brands: BrandSettings[],
  controls: Controls,
  brand: BrandSettings,
  today: ISODate,
  requestedBy: string,
): Promise<GenerateOutcome> {
  const [week] = await loadWeek({ ...controls, brand: brand.slug, brands: [brand] }, serviceReader(db, brands));
  const review = buildReview(week, controls);
  const extras = await extrasFor(db, brands, brand, today);
  const started = Date.now();

  let result;
  try {
    result = await generateSummary(review, extras);
  } catch (e) {
    await db.from("ai_calls").insert({
      feature: "summary",
      prompt_version: "summary",
      model: process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5",
      input_hash: figuresHash(week.pack),
      input: { brand: brand.slug, period: controls.period, requested_by: requestedBy },
      status: "error",
      error: e instanceof Error ? e.message.slice(0, 1000) : String(e),
    });
    throw e;
  }

  const costUsd = Math.round(cost(result.usage) * 10000) / 10000;
  const { data: call } = await db
    .from("ai_calls")
    .insert({
      feature: "summary",
      prompt_version: result.promptVersion,
      model: result.model,
      input_hash: result.inputHash,
      input: { ...result.pack, requested_by: requestedBy },
      output: { summary: result.summary, unverified: result.unverified, ms: Date.now() - started },
      input_tokens: result.usage.input + result.usage.cacheRead + result.usage.cacheWrite,
      output_tokens: result.usage.output,
      cost_usd: costUsd,
      status: result.summary ? "ok" : "rejected",
    })
    .select("id")
    .single();

  if (!result.summary) {
    return { brand: brand.slug, ok: false, costUsd, message: result.unverified.length ? `Numbers couldn't be checked (${result.unverified.join(", ")}), so it wasn't saved.` : "No summary came back." };
  }

  const { pack } = week;
  const output: StoredNarrative = {
    ...result.summary,
    period: { from: pack.period.from, to: pack.period.to, periodKey: controls.periodKey, compareKey: controls.compareKey, compareLabel: review.compareLabel },
    values: Object.fromEntries(Object.values(pack.figures).map((f) => [f.id, f.value])),
    figuresHash: figuresHash(pack),
    generatedAt: new Date().toISOString(),
    model: result.model,
    promptVersion: result.promptVersion,
  };
  const { error: nErr } = await db
    .from("narratives")
    .upsert({ brand_id: brand.id, week_start: pack.period.from, pack_hash: output.figuresHash, output, ai_call_id: call?.id ?? null, created_at: output.generatedAt });
  if (nErr) throw nErr;

  // Undecided ideas from an earlier version of this period are replaced; decided ones stay.
  await db.from("recommendations").delete().eq("brand_id", brand.id).eq("week_start", pack.period.from).eq("status", "proposed");
  if (result.summary.recommendations.length) {
    const { error: rErr } = await db.from("recommendations").insert(
      result.summary.recommendations.map((r) => {
        const [, metric, platform] = r.target_figure_id.split(".");
        return {
          brand_id: brand.id,
          week_start: pack.period.from,
          what: r.what,
          why: r.why,
          target_metric: metric,
          target_platform: platform ?? "all",
          expected_direction: r.expected_direction,
          effort: r.effort,
          confidence: r.confidence,
          category: r.category,
          ai_call_id: call?.id ?? null,
        };
      }),
    );
    if (rErr) throw rErr;
  }
  return { brand: brand.slug, ok: true, costUsd, message: "Written." };
}

/** Scores action items whose target number has had two weeks to move. Returns how many were scored. */
export async function checkOutcomes(db: SupabaseClient, brands: BrandSettings[], today: ISODate): Promise<number> {
  const { data: items, error } = await db
    .from("action_items")
    .select("id, brand_id, target_metric, target_platform, expected_direction, baseline_value, baseline_from, baseline_to, outcome")
    .not("target_metric", "is", null)
    .not("baseline_value", "is", null)
    .neq("status", "dropped")
    .or("outcome.is.null,outcome.eq.too_early")
    .lte("created_at", addDays(today, -OUTCOME_AFTER_DAYS));
  if (error) throw error;

  let scored = 0;
  for (const item of items ?? []) {
    const brand = brands.find((b) => b.id === item.brand_id);
    if (!brand) continue;
    const window = outcomeWindow({ from: item.baseline_from, to: item.baseline_to }, today);
    const rows = await queryMetricRows(db, brands, [brand.slug], window.from, window.to);
    const now = aggregate(new MetricStore(rows), brand.slug, item.target_metric, item.target_platform ?? "all", brand.platforms, [window]).value;
    const direction = (item.expected_direction as "up" | "down" | null) ?? (getMetric(item.target_metric).higherIsBetter === false ? "down" : "up");
    const outcome = judgeOutcome(Number(item.baseline_value), now, direction);
    await db
      .from("action_items")
      .update({ outcome, outcome_value: now, outcome_checked_at: new Date().toISOString() })
      .eq("id", item.id);
    scored++;
  }
  return scored;
}
