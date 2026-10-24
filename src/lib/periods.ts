import {
  addDays,
  addMonths,
  diffDays,
  formatRange,
  isISODate,
  startOfWeek,
  type ISODate,
} from "./dates";

export interface DateRange {
  from: ISODate;
  /** Inclusive. */
  to: ISODate;
}

export const PERIOD_KEYS = ["last_week", "this_week", "last_7", "last_28", "last_90", "custom"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const COMPARE_KEYS = ["previous", "avg_4w", "last_month"] as const;
export type CompareKey = (typeof COMPARE_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  last_week: "Last week",
  this_week: "This week",
  last_7: "Last 7 days",
  last_28: "Last 28 days",
  last_90: "Last 90 days",
  custom: "Custom",
};

export const COMPARE_LABELS: Record<CompareKey, string> = {
  previous: "Previous period",
  avg_4w: "4-period average",
  last_month: "Same period last month",
};

/**
 * Meetings move around, so the default is the latest seven complete days
 * (up to yesterday), compared with the seven days before.
 */
export const DEFAULT_PERIOD: PeriodKey = "last_7";
export const DEFAULT_COMPARE: CompareKey = "previous";

export interface ResolvedPeriod extends DateRange {
  key: PeriodKey;
  label: string;
  /** True when the window includes today, so its numbers are still moving. */
  partial: boolean;
  days: number;
}

export function rangeLength(r: DateRange): number {
  return diffDays(r.from, r.to) + 1;
}

/**
 * Turns a period key into concrete dates. Rolling windows (last 7/28/90) end
 * yesterday, because today's numbers aren't synced until tonight.
 */
export function resolvePeriod(
  key: PeriodKey,
  today: ISODate,
  custom?: Partial<DateRange>,
): ResolvedPeriod {
  let range: DateRange;
  let partial = false;
  const yesterday = addDays(today, -1);

  switch (key) {
    case "this_week":
      range = { from: startOfWeek(today), to: today };
      partial = true;
      break;
    case "last_week": {
      const monday = addDays(startOfWeek(today), -7);
      range = { from: monday, to: addDays(monday, 6) };
      break;
    }
    case "last_7":
      range = { from: addDays(today, -7), to: yesterday };
      break;
    case "last_28":
      range = { from: addDays(today, -28), to: yesterday };
      break;
    case "last_90":
      range = { from: addDays(today, -90), to: yesterday };
      break;
    case "custom": {
      const from = custom?.from && isISODate(custom.from) ? custom.from : undefined;
      const to = custom?.to && isISODate(custom.to) ? custom.to : undefined;
      if (!from || !to || from > to) return resolvePeriod(DEFAULT_PERIOD, today);
      range = { from, to };
      partial = to >= today;
      break;
    }
  }

  return {
    ...range,
    key,
    label: key === "custom" ? formatRange(range.from, range.to) : PERIOD_LABELS[key],
    partial,
    days: rangeLength(range),
  };
}

export interface ResolvedCompare {
  key: CompareKey;
  label: string;
  /**
   * One window for "previous" and "last_month"; four for "avg_4w". Each
   * window is the same length as the current period.
   */
  windows: DateRange[];
}

export function resolveCompare(period: DateRange, key: CompareKey): ResolvedCompare {
  const len = rangeLength(period);
  let windows: DateRange[];

  switch (key) {
    case "previous":
      windows = [{ from: addDays(period.from, -len), to: addDays(period.from, -1) }];
      break;
    case "avg_4w":
      windows = [1, 2, 3, 4].map((i) => ({
        from: addDays(period.from, -len * i),
        to: addDays(period.from, -len * (i - 1) - 1),
      }));
      break;
    case "last_month": {
      // Shift the start back a month and keep the same length, so the two
      // windows are always comparable even across 30/31-day months.
      const from = addMonths(period.from, -1);
      windows = [{ from, to: addDays(from, len - 1) }];
      break;
    }
  }

  return { key, label: COMPARE_LABELS[key], windows };
}

export function parsePeriodKey(value: string | undefined): PeriodKey {
  return (PERIOD_KEYS as readonly string[]).includes(value ?? "") ? (value as PeriodKey) : DEFAULT_PERIOD;
}

export function parseCompareKey(value: string | undefined): CompareKey {
  return (COMPARE_KEYS as readonly string[]).includes(value ?? "") ? (value as CompareKey) : DEFAULT_COMPARE;
}
