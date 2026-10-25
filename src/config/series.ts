import { diffDays, type ISODate } from "@/lib/dates";

/**
 * Content series, so a day's video can be labelled "Day 17". One video a day
 * from `start`. Series are edited in Settings and stored in the database;
 * this list is only the fallback for preview mode and tests.
 */
export interface Series {
  id?: string;
  brand: string;
  name: string;
  start: ISODate;
  days: number;
}

export const SERIES: Series[] = [{ brand: "peoplesuq", name: "31 Days of Crushing Pumpkins", start: "2026-10-01", days: 31 }];

/** "Day 17" if the date falls in one of the brand's series. */
export function seriesDay(brand: string, date: ISODate, list: Series[] = SERIES): { series: Series; day: number } | null {
  for (const s of list) {
    if (s.brand !== brand) continue;
    const day = diffDays(s.start, date) + 1;
    if (day >= 1 && day <= s.days) return { series: s, day };
  }
  return null;
}
