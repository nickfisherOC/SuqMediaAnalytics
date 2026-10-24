import type { BrandSettings } from "@/config/brands";
import type { Controls } from "@/lib/controls";
import type { ContentCard, ContentGroup } from "@/lib/content";
import type { Flag } from "@/lib/data/source";
import { buildHighlights, type Highlights } from "@/lib/highlights";
import type { WeekPack } from "@/lib/pack";

/**
 * Everything one brand's part of the Weekly Review shows, built live from the
 * database. The page, presentation mode and PDF all render from this.
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

export function compareLabel(c: Pick<Controls, "compareKey" | "periodKey">) {
  if (c.compareKey === "avg_4w") return "4-period avg";
  if (c.compareKey === "last_month") return "last month";
  switch (c.periodKey) {
    case "last_week":
    case "this_week":
      return "last week";
    case "last_7":
      return "previous 7 days";
    case "last_28":
      return "previous 28 days";
    case "last_90":
      return "previous 90 days";
    default:
      return "previous period";
  }
}

export function buildReview(
  week: { brand: BrandSettings; pack: WeekPack; groups: ContentGroup[]; best: ContentCard[]; flags: Flag[] },
  controls: Pick<Controls, "compareKey" | "periodKey">,
): BrandReview {
  return { ...week, highlights: buildHighlights(week.pack), compareLabel: compareLabel(controls) };
}

