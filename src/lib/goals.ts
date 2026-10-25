import { getMetric } from "@/config/metrics";
import type { Platform } from "@/config/platforms";
import { addDays, diffDays, formatShort, startOfWeek, type ISODate } from "@/lib/dates";
import { formatExact } from "@/lib/format";
import { aggregate, type MetricStore } from "@/lib/metrics/engine";

/**
 * Goals: a target for one metric, repeating weekly or monthly, or once by a
 * deadline. Progress is judged against where you'd expect to be by now, so a
 * weekly goal isn't "behind" on a Tuesday just because the week isn't over.
 */

export type Cadence = "week" | "month" | "deadline";
export type Direction = "at_least" | "at_most";
export type GoalState = "hit" | "on_track" | "behind" | "missed" | "no_data";

export interface Goal {
  id: string;
  brand: string;
  metric: string;
  platform: Platform | "all";
  label: string;
  target: number;
  cadence: Cadence;
  /** Null = from the metric: higher-is-better metrics aim at least, lower-is-better at most. */
  direction: Direction | null;
  startDate: ISODate;
  deadline: ISODate | null;
}

export interface GoalProgress {
  goal: Goal;
  direction: Direction;
  /** The window being judged: this week, this month, or start → deadline. */
  from: ISODate;
  to: ISODate;
  /** Data runs through yesterday (the nightly sync), so progress counts days up to then. */
  through: ISODate;
  value: number | null;
  /** Where you'd want to be by now (sums and counts towards a target); null when pace doesn't apply. */
  expected: number | null;
  state: GoalState;
  /** How much is still needed to reach the target (at-least goals). */
  remaining: number | null;
  daysLeft: number;
  /** The previous week or month's result, for repeating goals. */
  previous: { value: number | null; met: boolean | null } | null;
}

export function directionFor(goal: Pick<Goal, "metric" | "direction">): Direction {
  if (goal.direction) return goal.direction;
  return getMetric(goal.metric).higherIsBetter === false ? "at_most" : "at_least";
}

function monthStart(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}
function monthEnd(d: ISODate): ISODate {
  const [y, m] = d.split("-").map(Number);
  return addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1);
}

/** The window a goal is judged over today, and the one before it. */
export function goalWindow(goal: Pick<Goal, "cadence" | "startDate" | "deadline">, today: ISODate) {
  if (goal.cadence === "week") {
    const from = startOfWeek(today);
    return { from, to: addDays(from, 6), previous: { from: addDays(from, -7), to: addDays(from, -1) } };
  }
  if (goal.cadence === "month") {
    const from = monthStart(today);
    const prevEnd = addDays(from, -1);
    return { from, to: monthEnd(today), previous: { from: monthStart(prevEnd), to: prevEnd } };
  }
  return { from: goal.startDate, to: goal.deadline ?? today, previous: null };
}

const meets = (value: number, target: number, dir: Direction) => (dir === "at_least" ? value >= target : value <= target);

/** How a goal is going, from the brand's metric store. */
export function goalProgress(goal: Goal, store: MetricStore, brandPlatforms: Platform[], today: ISODate): GoalProgress {
  const def = getMetric(goal.metric);
  const dir = directionFor(goal);
  const win = goalWindow(goal, today);
  const yesterday = addDays(today, -1);
  const through = yesterday < win.to ? yesterday : win.to;
  const started = through >= win.from;
  // Running totals (followers) in a weekly or monthly goal mean growth: the total at the end of the
  // window minus the total just before it started ("+5 followers a week").
  const growth = isGrowthGoal(goal);
  const at = (from: ISODate, to: ISODate) => aggregate(store, goal.brand, goal.metric, goal.platform, brandPlatforms, [{ from, to }]).value;
  const gained = (from: ISODate, to: ISODate) => {
    const end = at(from, to);
    const start = at(addDays(from, -60), addDays(from, -1));
    return end === null || start === null ? null : end - start;
  };
  const value = !started ? null : growth ? gained(win.from, through) : at(win.from, through);

  const totalDays = diffDays(win.from, win.to) + 1;
  const elapsed = started ? diffDays(win.from, through) + 1 : 0;
  const daysLeft = Math.max(0, diffDays(today, win.to) + 1);
  const finished = through >= win.to;

  // Pace only makes sense for counts that build up over the window.
  let expected: number | null = null;
  if (def.aggregation === "sum" || growth) expected = (goal.target * elapsed) / totalDays;
  else if (def.aggregation === "last" && goal.cadence === "deadline") {
    // Followers and similar: a straight line from where it was at the start to the target.
    const base = aggregate(store, goal.brand, goal.metric, goal.platform, brandPlatforms, [{ from: addDays(win.from, -30), to: win.from }]).value;
    if (base !== null) expected = base + ((goal.target - base) * elapsed) / totalDays;
  }

  let state: GoalState;
  if (value === null) state = "no_data";
  else if (meets(value, goal.target, dir) && (dir === "at_least" || finished || (def.aggregation !== "sum" && !growth))) state = "hit";
  else if (finished) state = "missed";
  else if (expected === null) state = meets(value, goal.target, dir) ? "on_track" : "behind";
  else state = dir === "at_least" ? (value >= expected * 0.9 ? "on_track" : "behind") : value <= expected * 1.1 ? "on_track" : "behind";

  let previous: GoalProgress["previous"] = null;
  if (win.previous) {
    const v = growth ? gained(win.previous.from, win.previous.to) : at(win.previous.from, win.previous.to);
    previous = { value: v, met: v === null ? null : meets(v, goal.target, dir) };
  }

  return {
    goal,
    direction: dir,
    from: win.from,
    to: win.to,
    through,
    value,
    expected,
    state,
    remaining: dir === "at_least" && value !== null ? Math.max(0, goal.target - value) : null,
    daysLeft,
    previous,
  };
}

/** Weekly or monthly goals on a running total (followers) are about growth, not the total. */
export function isGrowthGoal(goal: Pick<Goal, "metric" | "cadence">): boolean {
  return goal.cadence !== "deadline" && getMetric(goal.metric).aggregation === "last";
}

/** "15 leads a week", "5 new Facebook followers a week", "Cost per lead under $15 a month", "100 Instagram followers by Oct 31". */
export function goalText(p: GoalProgress): string {
  const unit = getMetric(p.goal.metric).unit;
  const target = formatExact(p.goal.target, unit);
  const when = p.goal.cadence === "week" ? "a week" : p.goal.cadence === "month" ? "a month" : `by ${formatShort(p.goal.deadline ?? p.to)}`;
  // Platform names keep their capital ("Facebook followers"); a bare metric name reads in lower case ("leads").
  const label = p.goal.platform === "all" ? p.goal.label.toLowerCase() : p.goal.label;
  if (p.direction === "at_most") return `${p.goal.label} under ${target} ${when}`;
  return `${target} ${isGrowthGoal(p.goal) ? "new " : ""}${label} ${when}`;
}

export const GOAL_STATE_LABEL: Record<GoalState, string> = {
  hit: "Hit ✓",
  on_track: "On track",
  behind: "Behind",
  missed: "Missed",
  no_data: "No data yet",
};

export const CADENCE_LABEL: Record<Cadence, string> = { week: "a week", month: "a month", deadline: "by" };
