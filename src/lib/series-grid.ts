import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/config/platforms";
import type { Series } from "@/config/series";
import { titleFrom, type ContentCard } from "@/lib/content";
import { addDays, type ISODate } from "@/lib/dates";

/**
 * The series tracker: one row per day of a series, one cell per platform.
 * A post belongs to Day N when its caption says "Day N"; a platform with no
 * tagged post that day falls back to its post published on that date.
 */

export interface SeriesCell {
  id: string;
  views: number | null;
  comments: number | null;
  url: string | null;
}

export interface SeriesDayRow {
  day: number;
  date: ISODate;
  status: "posted" | "today" | "upcoming";
  title: string | null;
  cells: Partial<Record<SocialPlatform, SeriesCell>>;
  totalViews: number;
}

export interface SeriesGrid {
  series: Series;
  platforms: SocialPlatform[];
  days: SeriesDayRow[];
  /** Days that have happened (today counts once anything is posted). */
  daysSoFar: number;
  /** Per platform: posts found and days missed so far. */
  coverage: { platform: SocialPlatform; posted: number; missed: number[] }[];
  totalViews: number;
  asOf: ISODate | null;
}

const DAY_TAG = /\bday\s*(\d{1,2})\b/i;

export function taggedDay(caption: string | null): number | null {
  const m = caption?.match(DAY_TAG);
  return m ? Number(m[1]) : null;
}

export function buildSeriesGrid(series: Series, brandPlatforms: string[], cards: ContentCard[], today: ISODate): SeriesGrid {
  const platforms = SOCIAL_PLATFORMS.filter((p) => brandPlatforms.includes(p));
  const last = addDays(series.start, series.days - 1);
  const inRange = cards.filter((c) => c.publishedDate >= series.start && c.publishedDate <= last);

  const days: SeriesDayRow[] = Array.from({ length: series.days }, (_, i) => {
    const day = i + 1;
    const date = addDays(series.start, i);
    const cells: SeriesDayRow["cells"] = {};
    const used: ContentCard[] = [];
    for (const p of platforms) {
      const mine = inRange.filter((c) => c.platform === p);
      const tagged = mine.filter((c) => taggedDay(c.caption) === day);
      const candidates = tagged.length ? tagged : mine.filter((c) => c.publishedDate === date && taggedDay(c.caption) === null);
      // Two posts for one day (a re-post, a photo and a reel): the most viewed one is the day's video.
      const best = candidates.sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
      if (best) {
        cells[p] = { id: best.id, views: best.views, comments: best.comments, url: best.url };
        used.push(best);
      }
    }
    const status = date < today ? "posted" : date === today ? "today" : "upcoming";
    return {
      day,
      date,
      status,
      title: used.length ? titleFrom(used.map((c) => c.caption)) : null,
      cells,
      totalViews: used.reduce((t, c) => t + (c.views ?? 0), 0),
    };
  });

  // Today only counts once something is up, so a morning view doesn't show misses.
  const counted = days.filter((d) => d.status === "posted" || (d.status === "today" && Object.keys(d.cells).length > 0));
  return {
    series,
    platforms,
    days,
    daysSoFar: counted.length,
    coverage: platforms.map((p) => ({
      platform: p,
      posted: counted.filter((d) => d.cells[p]).length,
      missed: counted.filter((d) => !d.cells[p]).map((d) => d.day),
    })),
    totalViews: days.reduce((t, d) => t + d.totalViews, 0),
    asOf: inRange.map((c) => c.capturedOn).filter((x): x is string => !!x).sort().at(-1) ?? null,
  };
}
