import { addDays, diffDays, edmontonDateOf, startOfWeek, type ISODate } from "@/lib/dates";
import type { DateRange } from "@/lib/periods";

/**
 * The Sales Pipeline page's numbers, computed from Lead Rescue deals as
 * stored by Pulse. No names or contact details: deals are described by
 * stage, value, form and dates only.
 */

export interface StageRow {
  id: string;
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
}

export interface LeadRow {
  id: string;
  createdDate: ISODate;
  form: string | null;
  sourceChannel: string;
  isSpam: boolean;
  stageId: string | null;
  value: number;
  quoteSentAt: string | null;
  wonAt: string | null;
  lostAt: string | null;
}

export interface StageSummary {
  name: string;
  kind: "open" | "won" | "lost";
  deals: number;
  value: number;
}

export interface WaitingDeal {
  id: string;
  stage: string;
  daysInStage: number;
  /** True when the stage date comes from the deal's last update, not a change Pulse saw. */
  estimated: boolean;
  value: number;
  source: string;
  createdDate: ISODate;
  /** Admins only: who it is, and their page in Lead Rescue. */
  contact?: { name: string | null; company: string | null; url: string | null };
}

export interface SourceSummary {
  source: string;
  leads: number;
  quotes: number;
  won: number;
  revenue: number;
}

export interface WeekSummary {
  weekStart: ISODate;
  leads: number;
  won: number;
}

/** Days in stage at or above this are "waiting"; double it is "stuck". */
export const WAITING_DAYS = 7;

/** "Form: Crew Hoodie Request Ad Landing" → "Crew Hoodie Request Ad Landing". */
export function sourceLabel(form: string | null, channel: string): string {
  const raw = form ? form.replace(/^form:\s*/i, "").trim() || form : channel.replace(/_/g, " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function byStage(stages: StageRow[], leads: LeadRow[]): StageSummary[] {
  const real = leads.filter((l) => !l.isSpam);
  return [...stages]
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const inStage = real.filter((l) => l.stageId === s.id);
      return {
        name: s.name,
        kind: s.isWon ? "won" : s.isLost ? "lost" : "open",
        deals: inStage.length,
        value: inStage.reduce((t, l) => t + l.value, 0),
      };
    });
}

/** Open deals, longest in their stage first. */
export function waitingDeals(
  stages: StageRow[],
  leads: LeadRow[],
  enteredAt: Map<string, string>,
  firstSyncDate: ISODate,
  today: ISODate,
): WaitingDeal[] {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  return leads
    .filter((l) => {
      const s = l.stageId ? stageById.get(l.stageId) : undefined;
      return !l.isSpam && s && !s.isWon && !s.isLost;
    })
    .map((l) => {
      const entered = enteredAt.get(l.id);
      const since = entered ? edmontonDateOf(entered) : l.createdDate;
      return {
        id: l.id,
        stage: stageById.get(l.stageId!)!.name,
        daysInStage: Math.max(0, diffDays(since, today)),
        estimated: since < firstSyncDate,
        value: l.value,
        source: sourceLabel(l.form, l.sourceChannel),
        createdDate: l.createdDate,
      };
    })
    .sort((a, b) => b.daysInStage - a.daysInStage || b.value - a.value);
}

/** The follow-up list: deals that haven't moved in a week, most valuable first. */
export function needsNudge(waiting: WaitingDeal[], top = 5) {
  const all = waiting.filter((d) => d.daysInStage >= WAITING_DAYS).sort((a, b) => b.value - a.value || b.daysInStage - a.daysInStage);
  return { top: all.slice(0, top), count: all.length, value: all.reduce((t, d) => t + d.value, 0) };
}

/** Leads created in the period, by where they came from, with how far they got. */
export function bySource(leads: LeadRow[], period: DateRange): SourceSummary[] {
  const map = new Map<string, SourceSummary>();
  for (const l of leads) {
    if (l.isSpam || l.createdDate < period.from || l.createdDate > period.to) continue;
    const key = sourceLabel(l.form, l.sourceChannel);
    const s = map.get(key) ?? { source: key, leads: 0, quotes: 0, won: 0, revenue: 0 };
    s.leads++;
    if (l.quoteSentAt) s.quotes++;
    if (l.wonAt) {
      s.won++;
      s.revenue += l.value;
    }
    map.set(key, s);
  }
  return [...map.values()].sort((a, b) => b.leads - a.leads);
}

/** New leads and deals won per Monday-to-Sunday week, oldest first. */
export function weekly(leads: LeadRow[], from: ISODate, today: ISODate): WeekSummary[] {
  const weeks: WeekSummary[] = [];
  for (let w = startOfWeek(from); w <= today; w = addDays(w, 7)) weeks.push({ weekStart: w, leads: 0, won: 0 });
  const index = new Map(weeks.map((w, i) => [w.weekStart, i]));
  for (const l of leads) {
    if (l.isSpam) continue;
    if (l.createdDate >= from) {
      const i = index.get(startOfWeek(l.createdDate));
      if (i !== undefined) weeks[i].leads++;
    }
    if (l.wonAt) {
      const d = edmontonDateOf(l.wonAt);
      const i = d >= from ? index.get(startOfWeek(d)) : undefined;
      if (i !== undefined) weeks[i].won++;
    }
  }
  return weeks;
}
