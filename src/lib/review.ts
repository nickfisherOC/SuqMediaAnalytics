import type { BrandSettings } from "@/config/brands";
import type { Controls } from "@/lib/controls";
import type { ContentCard, ContentGroup } from "@/lib/content";
import type { Flag } from "@/lib/data/source";
import { addDays, isoWeekday, type ISODate } from "@/lib/dates";
import { buildHighlights, type Highlights } from "@/lib/highlights";
import type { WeekPack } from "@/lib/pack";

/**
 * Everything one brand's part of the Weekly Review shows. Built live from the
 * database, or read back from a locked week's snapshot, so a locked week
 * renders exactly what was discussed.
 */
export interface BrandReview {
  brand: BrandSettings;
  pack: WeekPack;
  highlights: Highlights;
  groups: ContentGroup[];
  best: ContentCard[];
  flags: Flag[];
  compareLabel: string;
}

export const REVIEW_VERSION = 1;

export function compareLabel(c: Pick<Controls, "compareKey" | "periodKey">) {
  if (c.compareKey === "avg_4w") return "4-period avg";
  if (c.compareKey === "last_month") return "last month";
  return c.periodKey === "last_week" || c.periodKey === "this_week" ? "last week" : "previous period";
}

export function buildReview(
  week: { brand: BrandSettings; pack: WeekPack; groups: ContentGroup[]; best: ContentCard[]; flags: Flag[] },
  controls: Pick<Controls, "compareKey" | "periodKey">,
): BrandReview {
  return { ...week, highlights: buildHighlights(week.pack), compareLabel: compareLabel(controls) };
}

/**
 * The meeting a period belongs to: only a full Monday-to-Sunday week has one
 * (notes, action items, locking). Returns its Monday, or null.
 */
export function meetingWeekStart(period: { from: ISODate; to: ISODate }): ISODate | null {
  return isoWeekday(period.from) === 1 && addDays(period.from, 6) === period.to ? period.from : null;
}
