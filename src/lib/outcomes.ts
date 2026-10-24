import { addDays, diffDays, type ISODate } from "@/lib/dates";

/**
 * Closing the loop on action items: two weeks after an item with a target
 * number was added, compare that number over a fresh window of the same
 * length with its value when the item was added.
 */

export type Outcome = "worked" | "no_change" | "worse" | "too_early";

/** Days after adding an item before its outcome is judged. */
export const OUTCOME_AFTER_DAYS = 14;
/** Changes smaller than this (either way) count as no change. */
export const NO_CHANGE_BAND = 0.05;

/** The window to measure now: same length as the baseline window, ending yesterday. */
export function outcomeWindow(baseline: { from: ISODate | null; to: ISODate | null }, today: ISODate) {
  const days = baseline.from && baseline.to ? diffDays(baseline.from, baseline.to) + 1 : 7;
  const to = addDays(today, -1);
  return { from: addDays(to, -(days - 1)), to };
}

export function judgeOutcome(baseline: number, now: number | null, direction: "up" | "down"): Outcome {
  if (now === null) return "too_early";
  if (baseline === 0) {
    if (now === 0) return "no_change";
    return (now > 0) === (direction === "up") ? "worked" : "worse";
  }
  const change = (now - baseline) / Math.abs(baseline);
  if (Math.abs(change) < NO_CHANGE_BAND) return "no_change";
  return (change > 0) === (direction === "up") ? "worked" : "worse";
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  worked: "Worked",
  no_change: "No change",
  worse: "Got worse",
  too_early: "Too early to tell",
};
