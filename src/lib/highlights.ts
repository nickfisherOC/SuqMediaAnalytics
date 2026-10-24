import { PLATFORM_INFO, SOCIAL_PLATFORMS, type Platform } from "@/config/platforms";
import { formatExact } from "@/lib/format";
import type { Figure, WeekPack } from "@/lib/pack";

/**
 * "What improved" and "What needs work": the biggest real changes in the week
 * pack, written as short bold headlines with the numbers behind them, in the
 * style of the hand-made reports ("Instagram followers doubled (14 → 29)").
 *
 * Rule-based and deterministic: every number comes straight from a figure in
 * the pack. The AI-written version arrives in phase 5 and will cite the same
 * figure ids.
 */

export interface Highlight {
  /** Short bold headline. */
  title: string;
  /** One supporting sentence, optional. */
  detail?: string;
  /** Figures the numbers come from. */
  figureIds: string[];
}

export interface Highlights {
  headline: string;
  improved: Highlight[];
  needsWork: Highlight[];
}

/** Metrics that matter most in the meeting rank higher. */
const WEIGHT: Record<string, number> = {
  followers: 1.4,
  views: 1.3,
  leads: 1.5,
  leads_from_ads: 1.3,
  orders: 1.5,
  deals_won: 1.5,
  revenue_won: 1.5,
  store_revenue: 1.4,
  cost_per_lead: 1.3,
  quotes_sent: 1.3,
  store_sessions_social: 1.2,
  link_clicks: 1.1,
  comments: 1.1,
};

/** Changes too small to talk about. */
export function isMeaningful(f: Figure): boolean {
  const { delta, pct } = f.change;
  if (delta === null || f.value === null || f.base === null || f.change.sentiment !== "good" && f.change.sentiment !== "bad") return false;
  if (f.unit === "count") {
    // Small accounts: "+3 followers" matters even when the percent is huge or undefined.
    return Math.abs(delta) >= 3 && (pct === null || Math.abs(pct) >= 0.1);
  }
  return pct !== null && Math.abs(pct) >= 0.1;
}

function score(f: Figure): number {
  const pct = f.change.pct;
  // Log of the ratio treats ×2 and ÷2 alike; changes from zero get a fixed strong score.
  const size = pct === null ? 1.5 : Math.min(Math.abs(Math.log(Math.max(1 + pct, 0.01))), 3);
  return size * (WEIGHT[f.metric] ?? 1);
}

const fmt = (f: Figure, v: number | null) => formatExact(v, f.unit);

/** "Instagram followers doubled (14 → 29)". Exported for tests. */
export function changeTitle(f: Figure): string {
  const from = fmt(f, f.base);
  const to = fmt(f, f.value);
  const pct = f.change.pct;
  const up = f.change.direction === "up";
  const name = f.label;
  let verb: string;
  const ratio = pct === null ? null : 1 + pct;
  if (pct === null || ratio === null) verb = up ? "went from zero" : "fell to zero";
  else if (up && ratio >= 2.2) verb = `rose ${Math.round(ratio * 10) / 10} times`;
  else if (up && ratio >= 1.9) verb = "doubled";
  else if (!up && pct <= -0.5) verb = "halved";
  else verb = `${up ? "up" : "down"} ${Math.round(Math.abs(pct) * 100)}%`;
  if (verb === "halved" && pct !== null && pct <= -0.95) verb = "fell to zero";
  return `${name} ${verb} (${from} → ${to})`;
}

function listNames(names: string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function buildHighlights(pack: WeekPack, max = 5): Highlights {
  const figs = pack.details.map((id) => pack.figures[id]).filter(Boolean);
  // Skip numbers that are a choice, not a result, and the combined social totals (each platform counts differently).
  const ranked = figs.filter(isMeaningful).sort((a, b) => score(b) - score(a));

  const improved: Highlight[] = ranked
    .filter((f) => f.change.sentiment === "good")
    .slice(0, max)
    .map((f) => ({ title: changeTitle(f), figureIds: [f.id] }));

  const needsWork: Highlight[] = [];

  // Platforms with real reach but no conversation.
  const silent = SOCIAL_PLATFORMS.filter((p) => {
    const comments = pack.figures[`${pack.brand.slug}.comments.${p}`];
    const views = pack.figures[`${pack.brand.slug}.views.${p}`];
    return comments?.value === 0 && (views?.value ?? 0) >= 100;
  });
  if (silent.length) {
    needsWork.push({
      title: `No comments on ${listNames(silent.map((p) => PLATFORM_INFO[p].label))}`,
      detail: "People are watching but not talking back yet.",
      figureIds: silent.map((p) => `${pack.brand.slug}.comments.${p}`),
    });
  }

  // Posting cadence.
  const behind: { p: Platform; posts: number }[] = [];
  for (const p of SOCIAL_PLATFORMS) {
    const f = pack.figures[`${pack.brand.slug}.posts_published.${p}`];
    if (f?.value !== null && f?.value !== undefined && f.value < pack.cadenceTarget) behind.push({ p, posts: f.value });
  }
  if (behind.length && pack.cadenceTarget > 0) {
    const allZero = behind.every((b) => b.posts === 0);
    needsWork.push({
      title: allZero
        ? `No posts on ${listNames(behind.map((b) => PLATFORM_INFO[b.p].label))} (target ${pack.cadenceTarget})`
        : `Behind on posting: ${behind.map((b) => `${PLATFORM_INFO[b.p].label} ${b.posts}`).join(", ")} (target ${pack.cadenceTarget})`,
      figureIds: behind.map((b) => `${pack.brand.slug}.posts_published.${b.p}`),
    });
  }

  // Shoppers who got to checkout but didn't buy.
  const checkout = pack.figures[`${pack.brand.slug}.reached_checkout.shopify`];
  const orders = pack.figures[`${pack.brand.slug}.orders.shopify`];
  if ((checkout?.value ?? 0) > 0 && orders?.value === 0) {
    needsWork.push({
      title: `${fmt(checkout, checkout.value)} ${checkout.value === 1 ? "person" : "people"} reached checkout and none bought`,
      detail: "Worth checking shipping cost and checkout on a phone.",
      figureIds: [checkout.id, orders.id],
    });
  }

  // Biggest declines fill the rest.
  for (const f of ranked.filter((x) => x.change.sentiment === "bad")) {
    if (needsWork.length >= max) break;
    if (needsWork.some((h) => h.figureIds.includes(f.id))) continue;
    needsWork.push({ title: changeTitle(f), figureIds: [f.id] });
  }

  const headline = [improved[0]?.title, needsWork[0]?.title].filter(Boolean).join(". ") + (improved[0] || needsWork[0] ? "." : "");
  return { headline: headline || "A quiet week: no big changes either way.", improved, needsWork };
}
