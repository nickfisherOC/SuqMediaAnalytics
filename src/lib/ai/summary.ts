import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { PLATFORM_INFO } from "@/config/platforms";
import type { BrandReview } from "@/lib/review";
import { hashInput, type Usage } from "./ask";
import { SUMMARY_PROMPT_VERSION, summarySystemPrompt } from "./prompts/summary";
import { unsupportedNumbers } from "./verify";

/**
 * The weekly written summary and recommendations for one brand and period.
 * Claude sees only the pack below and must cite only its numbers; output is
 * structured JSON rendered by the UI. A summary whose numbers can't all be
 * traced to the pack (after one correction round) is rejected.
 */

export interface PastRecommendation {
  what: string;
  target: string;
  outcome: "worked" | "no_change" | "worse" | "too_early" | null;
  status: string;
}

export interface SummaryExtras {
  notes: { date: string; text: string }[];
  openActions: string[];
  pastRecommendations: PastRecommendation[];
  pipeline?: unknown;
  goals?: { goal: string; window: string; value: number | null; target: number; status: string }[];
}

const round = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);

/** The JSON pack: everything Claude may write from, all computed by Pulse. */
export function buildAiPack(r: BrandReview, extras: SummaryExtras) {
  const { pack } = r;
  const ids = [...new Set([...pack.scoreboard, ...pack.details])];
  return {
    brand: r.brand.name,
    period: { from: pack.period.from, to: pack.period.to, days: pack.period.days, compared_with: pack.compare.label, compare_windows: pack.compare.windows },
    posting_target_per_platform_this_period: pack.cadenceTarget,
    figures: ids
      .map((id) => pack.figures[id])
      .filter((f) => f && (f.value !== null || f.base !== null))
      .map((f) => ({
        id: f.id,
        label: f.label,
        unit: f.unit,
        value: round(f.value),
        compare_value: round(f.base),
        change: round(f.change.delta),
        change_pct: f.change.pct === null ? null : Math.round(f.change.pct * 1000) / 10,
        good_or_bad: f.change.sentiment,
        not_counted_yet: f.platformsMissing.map((p) => PLATFORM_INFO[p].label),
        caveats: f.caveats,
      })),
    rule_based_highlights: { improved: r.highlights.improved.map((h) => h.title), needs_work: r.highlights.needsWork.map((h) => h.title) },
    top_content_same_day_across_platforms: r.groups.slice(0, 8).map((g) => ({
      day: g.dayLabel,
      date: g.date,
      title: g.title,
      total_views: g.totalViews,
      by_platform: g.byPlatform.map((b) => ({ platform: PLATFORM_INFO[b.platform].label, views: b.views })),
      captions: g.items.map((i) => ({ platform: PLATFORM_INFO[i.platform].label, caption: (i.caption ?? "").slice(0, 220), views: i.views, comments: i.comments })),
    })),
    best_post_per_platform: r.best.map((c) => ({ platform: PLATFORM_INFO[c.platform].label, date: c.publishedDate, caption: (c.caption ?? "").slice(0, 160), views: c.views, comments: c.comments })),
    content_note: "Content numbers are lifetime totals per post as of the latest nightly snapshot; newer posts have had fewer days.",
    flags: r.flags.map((f) => ({ title: f.title, detail: f.detail, severity: f.severity })),
    team_notes: extras.notes.slice(0, 15),
    open_action_items: extras.openActions,
    past_recommendations_and_outcomes: extras.pastRecommendations,
    ...(extras.pipeline ? { sales_pipeline: extras.pipeline } : {}),
    ...(extras.goals?.length ? { goals: extras.goals.map((g) => ({ ...g, value: round(g.value) })) } : {}),
  };
}

function schemaFor(figureIds: [string, ...string[]]) {
  const item = z.object({ title: z.string(), detail: z.string() });
  return z.object({
    headline: z.string(),
    improved: z.array(item),
    needs_work: z.array(item),
    patterns: z.array(z.object({ finding: z.string(), evidence: z.string() })),
    recommendations: z.array(
      z.object({
        what: z.string(),
        why: z.string(),
        target_figure_id: z.enum(figureIds),
        expected_direction: z.enum(["up", "down"]),
        effort: z.enum(["S", "M", "L"]),
        confidence: z.enum(["low", "medium", "high"]),
        category: z.enum(["content", "schedule", "platform_mix", "store", "community", "pipeline", "other"]),
      }),
    ),
  });
}

export type Summary = z.infer<ReturnType<typeof schemaFor>>;

export interface SummaryResult {
  summary: Summary | null;
  unverified: string[];
  usage: Usage;
  model: string;
  inputHash: string;
  promptVersion: string;
  pack: ReturnType<typeof buildAiPack>;
}

const textOf = (s: Summary) =>
  [
    s.headline,
    ...s.improved.flatMap((i) => [i.title, i.detail]),
    ...s.needs_work.flatMap((i) => [i.title, i.detail]),
    ...s.patterns.flatMap((p) => [p.finding, p.evidence]),
    ...s.recommendations.flatMap((r) => [r.what, r.why]),
  ].join("\n");

export async function generateSummary(r: BrandReview, extras: SummaryExtras): Promise<SummaryResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() });
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
  const pack = buildAiPack(r, extras);
  const ids = pack.figures.map((f) => f.id);
  if (!ids.length) throw new Error("No figures to write about yet.");
  const format = betaZodOutputFormat(schemaFor(ids as [string, ...string[]]));
  const usage: Usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Here is this period's pack. Write the review.\n\n${JSON.stringify(pack)}` },
  ];
  let summary: Summary | null = null;
  let unverified: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system: summarySystemPrompt(r.brand.name),
      messages,
      output_config: { format, effort: "high" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    usage.input += response.usage.input_tokens ?? 0;
    usage.output += response.usage.output_tokens ?? 0;
    usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    if (response.stop_reason === "refusal" || !response.parsed_output) break;

    const candidate = response.parsed_output as Summary;
    unverified = unsupportedNumbers(textOf(candidate), [pack], "");
    if (!unverified.length) {
      summary = candidate;
      break;
    }
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: `These numbers in your review don't appear in the pack: ${unverified.join(", ")}. Use only numbers from the pack (or leave them out) and write the full review again.`,
    });
  }

  return { summary, unverified: summary ? [] : unverified, usage, model, inputHash: hashInput(pack), promptVersion: SUMMARY_PROMPT_VERSION, pack };
}
