/**
 * The Ads page's numbers, from Meta's campaign / ad set / ad rows. Spend,
 * clicks and results add up across days; frequency is averaged weighted by
 * impressions.
 */

export interface AdDayRow {
  date: string;
  level: "campaign" | "adset" | "ad";
  entity_id: string;
  parent_id: string | null;
  name: string;
  status: string | null;
  thumbnail_url: string | null;
  spend: number;
  impressions: number;
  link_clicks: number;
  leads: number;
  frequency: number | null;
  extra: { purchases?: number; add_to_cart?: number; purchase_value?: number } | null;
}

export interface AdStats {
  id: string;
  name: string;
  level: AdDayRow["level"];
  parentId: string | null;
  status: string | null;
  thumbnail: string | null;
  spend: number;
  impressions: number;
  linkClicks: number;
  leads: number;
  purchases: number;
  frequency: number | null;
  /** Link clicks per impression. */
  ctr: number | null;
  cpc: number | null;
  /** Spend per result (lead for lead campaigns, link click otherwise). */
  costPerResult: number | null;
  results: number;
}

export type ResultKind = "leads" | "clicks";

export function aggregateAds(rows: AdDayRow[], level: AdDayRow["level"], result: ResultKind): AdStats[] {
  const map = new Map<string, AdDayRow[]>();
  for (const r of rows) if (r.level === level) map.set(r.entity_id, [...(map.get(r.entity_id) ?? []), r]);
  return [...map].map(([id, list]) => {
    const latest = [...list].sort((a, b) => b.date.localeCompare(a.date))[0];
    const sum = (f: (r: AdDayRow) => number) => list.reduce((t, r) => t + f(r), 0);
    const spend = sum((r) => r.spend);
    const impressions = sum((r) => r.impressions);
    const linkClicks = sum((r) => r.link_clicks);
    const leads = sum((r) => r.leads);
    const weighted = list.filter((r) => r.frequency !== null);
    const fImpr = weighted.reduce((t, r) => t + r.impressions, 0);
    const results = result === "leads" ? leads : linkClicks;
    return {
      id,
      name: latest.name,
      level,
      parentId: latest.parent_id,
      status: latest.status,
      thumbnail: list.find((r) => r.thumbnail_url)?.thumbnail_url ?? null,
      spend,
      impressions,
      linkClicks,
      leads,
      purchases: sum((r) => r.extra?.purchases ?? 0),
      frequency: fImpr ? weighted.reduce((t, r) => t + (r.frequency ?? 0) * r.impressions, 0) / fImpr : null,
      ctr: impressions ? linkClicks / impressions : null,
      cpc: linkClicks ? spend / linkClicks : null,
      costPerResult: results ? spend / results : null,
      results,
    };
  });
}

/** Ads worth calling out: spent enough to judge (at least this much). */
export const JUDGE_MIN_SPEND = 10;

/** The best and worst cost per result among ads that spent enough to judge. */
export function bestAndWorst(ads: AdStats[]): { best: string | null; worst: string | null } {
  const judged = ads.filter((a) => a.spend >= JUDGE_MIN_SPEND);
  if (judged.length < 2) return { best: null, worst: null };
  // No results at all is the worst outcome; otherwise compare cost per result.
  const cost = (a: AdStats) => a.costPerResult ?? Infinity;
  const sorted = [...judged].sort((a, b) => cost(a) - cost(b) || b.results - a.results);
  const best = sorted[0];
  const worst = sorted.at(-1)!;
  return { best: best.costPerResult === null ? null : best.id, worst: worst.id === best.id ? null : worst.id };
}

/** Ad fatigue: people have seen it a lot and fewer of them click than before. */
export function isTiring(now: AdStats, before: AdStats | undefined): boolean {
  if (!before || now.frequency === null || now.ctr === null || before.ctr === null || before.ctr === 0) return false;
  return now.frequency >= 2.5 && now.impressions >= 500 && now.ctr <= before.ctr * 0.75;
}

/** Spend and results per day, for the trend charts. */
export function adsByDay(rows: AdDayRow[], days: string[], result: ResultKind) {
  const camp = rows.filter((r) => r.level === "campaign");
  return days.map((date) => {
    const today = camp.filter((r) => r.date === date);
    return {
      date,
      spend: today.reduce((t, r) => t + r.spend, 0),
      results: today.reduce((t, r) => t + (result === "leads" ? r.leads : r.link_clicks), 0),
    };
  });
}
