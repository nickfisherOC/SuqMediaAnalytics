import { SERIES, seriesDay, type Series } from "@/config/series";
import type { Platform } from "@/config/platforms";
import { addDays, type ISODate } from "@/lib/dates";

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

/** The same piece of content across platforms (see groupContent). */
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

const DAY_TAG = /\bday\s*(\d{1,2})\b/i;

/** The series day a caption names ("… Day 17 🎃" → 17), or null. */
export function taggedDay(caption: string | null): number | null {
  const m = caption?.match(DAY_TAG);
  return m ? Number(m[1]) : null;
}

/**
 * The same piece of content across platforms. Series videos group by the
 * "Day N" in their caption (so a late upload still joins its day). Other
 * posts group by publish day, apart from that day's series video. An
 * untagged post on a series day joins the day only when its platform has no
 * tagged post for it (a series video someone forgot to tag).
 */
export function groupContent(brand: string, items: ContentCard[], series: Series[] = SERIES): ContentGroup[] {
  const dayOf = (it: ContentCard) => {
    const sd = seriesDay(brand, it.publishedDate, series) ?? seriesDay(brand, addDays(it.publishedDate, -1), series);
    const tag = taggedDay(it.caption);
    return sd && tag !== null && tag >= 1 && tag <= sd.series.days ? tag : null;
  };
  const taggedFor = new Set(items.map((it) => (dayOf(it) !== null ? `${it.platform}:${dayOf(it)}` : "")));

  const byKey = new Map<string, ContentCard[]>();
  const labels = new Map<string, string | null>();
  for (const it of items) {
    let day = dayOf(it);
    if (day === null) {
      const sd = seriesDay(brand, it.publishedDate, series);
      if (sd && taggedDay(it.caption) === null && !taggedFor.has(`${it.platform}:${sd.day}`)) day = sd.day;
    }
    const key = day !== null ? `${brand}-day-${day}` : `${brand}-${it.publishedDate}`;
    labels.set(key, day !== null ? `Day ${day}` : null);
    byKey.set(key, [...(byKey.get(key) ?? []), it]);
  }

  const groups: ContentGroup[] = [];
  for (const [key, list] of byKey) {
    const byPlatform = new Map<Platform, number>();
    for (const it of list) byPlatform.set(it.platform, (byPlatform.get(it.platform) ?? 0) + (it.views ?? 0));
    groups.push({
      key,
      date: list.map((i) => i.publishedDate).sort()[0],
      dayLabel: labels.get(key) ?? null,
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
