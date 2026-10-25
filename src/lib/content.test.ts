import { describe, expect, it } from "vitest";
import { groupContent, titleFrom, type ContentCard } from "./content";

const card = (platform: ContentCard["platform"], date: string, views: number, caption: string): ContentCard => ({
  id: `${platform}-${date}`,
  platform,
  url: null,
  caption,
  publishedDate: date,
  format: "reel",
  thumbnailUrl: null,
  status: "published",
  views,
  likes: null,
  comments: null,
  shares: null,
  capturedOn: "2026-10-24",
});

describe("content grouping", () => {
  it("picks the hook from the shortest caption", () => {
    expect(titleFrom(["“I’m a burden.” That’s today’s stigma getting crushed. #31days", "“I’m a burden.”\nLong text"])).toBe("“I’m a burden.”");
    expect(titleFrom([null, ""])).toBe("Untitled post");
  });

  it("adds up the same day's video across platforms and labels the series day", () => {
    const groups = groupContent("peoplesuq", [
      card("youtube", "2026-10-08", 1092, "Mental health isn't a hole-in-one."),
      card("facebook", "2026-10-08", 250, "Mental health isn't a hole-in-one. Here's why."),
      card("instagram", "2026-10-08", 156, "Mental health isn't a hole-in-one."),
      card("tiktok", "2026-10-08", 156, "x"),
      card("tiktok", "2026-10-17", 666, "Reach out. You matter."),
    ]);
    expect(groups[0]).toMatchObject({ dayLabel: "Day 8", totalViews: 1654 });
    expect(groups[0].byPlatform[0]).toEqual({ platform: "youtube", views: 1092 });
    expect(groups[1]).toMatchObject({ dayLabel: "Day 17", totalViews: 666 });
  });
});

describe("same video across platforms", () => {
  const c = (platform: ContentCard["platform"], date: string, views: number, caption: string, id = `${platform}-${date}-${views}`): ContentCard => ({
    id, platform, url: null, caption, publishedDate: date, format: "reel", thumbnailUrl: null, status: "published",
    views, likes: null, comments: null, shares: null, capturedOn: "2026-10-24",
  });

  it("keeps a non-series post apart from that day's series video", () => {
    const groups = groupContent("peoplesuq", [
      c("facebook", "2026-10-23", 286, "“Same old.” Day 23 🎃"),
      c("youtube", "2026-10-23", 109, "“Same old.” | Day 23"),
      c("facebook", "2026-10-23", 618, "“Can’t you just quit?” Kerry shares…"),
      c("youtube", "2026-10-23", 300, "“Can’t You Just Quit?” | Kerry on Addiction"),
    ]);
    expect(groups.map((g) => [g.dayLabel, g.totalViews])).toEqual([
      [null, 918],
      ["Day 23", 395],
    ]);
  });

  it("joins a late upload to its tagged day, and an untagged post to a day its platform missed", () => {
    const groups = groupContent("peoplesuq", [
      c("facebook", "2026-10-02", 100, "You failed at something. Day 2"),
      c("tiktok", "2026-10-03", 40, "You failed at something. Day 2"),
      c("instagram", "2026-10-02", 30, ""),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ dayLabel: "Day 2", totalViews: 170, date: "2026-10-02" });
  });
});
