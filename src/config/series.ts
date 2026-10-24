import { diffDays, type ISODate } from "@/lib/dates";

/**
 * Content series, so a day's video can be labelled "Day 17". One video a day
 * from `start`. Adding a series is one entry here (Content Lab will make this
 * editable).
 */
export interface Series {
  brand: string;
  name: string;
  start: ISODate;
  days: number;
}

export const SERIES: Series[] = [{ brand: "peoplesuq", name: "31 Days of Crushing Pumpkins", start: "2026-10-01", days: 31 }];

/** "Day 17" if the date falls in one of the brand's series. */
export function seriesDay(brand: string, date: ISODate): { series: Series; day: number } | null {
  for (const s of SERIES) {
    if (s.brand !== brand) continue;
    const day = diffDays(s.start, date) + 1;
    if (day >= 1 && day <= s.days) return { series: s, day };
  }
  return null;
}
