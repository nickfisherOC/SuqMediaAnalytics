import { seriesDay } from "@/config/series";
import type { Platform } from "@/config/platforms";
import type { ISODate } from "@/lib/dates";

/** One post or video with its latest lifetime numbers. */
export interface ContentCard {
  id: string;
  platform: Platform;
  url: string | null;
  caption: string | null;
  publishedDate: ISODate;
  format: string | null;
  thumbnailUrl: string | null;
  status: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** The night these totals were captured. */
  capturedOn: ISODate | null;
}

/** The same piece of content across platforms: grouped by brand and publish day. */
export interface ContentGroup {
  key: string;
  date: ISODate;
  /** "Day 17" when the date is in a series. */
  dayLabel: string | null;
  title: string;
  items: ContentCard[];
  totalViews: number;
  /** Views per platform, largest first. */
  byPlatform: { platform: Platform; views: number }[];
}

/**
 * A short title from the captions: the first line or sentence of the shortest
 * caption, which is usually the hook ("“I'm a burden.”"). Exported for tests.
 */
export function titleFrom(captions: (string | null)[]): string {
  const clean = captions
    .filter((c): c is string => Boolean(c?.trim()))
    .map((c) => c.split(/\n/)[0].replace(/#\S+/g, "").trim())
    .filter(Boolean);
  if (!clean.length) return "Untitled post";
  const shortest = clean.sort((a, b) => a.length - b.length)[0];
  const sentence = shortest.match(/^.*?[.!?”"](?=\s|$)/)?.[0] ?? shortest;
  return sentence.length > 80 ? `${sentence.slice(0, 77).trimEnd()}…` : sentence;
}

export function groupByDay(brand: string, items: ContentCard[]): ContentGroup[] {
  const byDate = new Map<ISODate, ContentCard[]>();
  for (const it of items) {
    const list = byDate.get(it.publishedDate) ?? [];
    list.push(it);
    byDate.set(it.publishedDate, list);
  }
  const groups: ContentGroup[] = [];
  for (const [date, list] of byDate) {
    const byPlatform = new Map<Platform, number>();
    for (const it of list) byPlatform.set(it.platform, (byPlatform.get(it.platform) ?? 0) + (it.views ?? 0));
    const sd = seriesDay(brand, date);
    groups.push({
      key: `${brand}-${date}`,
      date,
      dayLabel: sd ? `Day ${sd.day}` : null,
      title: titleFrom(list.map((i) => i.caption)),
      items: list.sort((a, b) => (b.views ?? 0) - (a.views ?? 0)),
      totalViews: [...byPlatform.values()].reduce((a, b) => a + b, 0),
      byPlatform: [...byPlatform].map(([platform, views]) => ({ platform, views })).sort((a, b) => b.views - a.views),
    });
  }
  return groups.sort((a, b) => b.totalViews - a.totalViews);
}

/** The most-viewed post on each platform. */
export function bestPerPlatform(items: ContentCard[]): ContentCard[] {
  const best = new Map<Platform, ContentCard>();
  for (const it of items) {
    const cur = best.get(it.platform);
    if (!cur || (it.views ?? 0) > (cur.views ?? 0)) best.set(it.platform, it);
  }
  return [...best.values()].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
}
