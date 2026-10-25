import { describe, expect, it } from "vitest";
import type { ContentCard } from "./content";
import { buildSeriesGrid, taggedDay } from "./series-grid";

const series = { brand: "peoplesuq", name: "Test", start: "2026-10-01", days: 5 };
const post = (platform: ContentCard["platform"], date: string, caption: string, views: number): ContentCard => ({
  id: `${platform}-${date}-${views}`,
  platform,
  url: null,
  caption,
  publishedDate: date,
  format: null,
  thumbnailUrl: null,
  status: "published",
  views,
  likes: null,
  comments: null,
  shares: null,
  capturedOn: "2026-10-04",
});

describe("series grid", () => {
  it("reads the day from captions", () => {
    expect(taggedDay("Smash the stigma. Day 3 🎃")).toBe(3);
    expect(taggedDay("DAY17 of 31")).toBe(17);
    expect(taggedDay("Today we rest")).toBeNull();
  });

  it("places posts by their Day tag, keeps the best of duplicates, and finds gaps", () => {
    const grid = buildSeriesGrid(
      series,
      ["facebook", "instagram", "shopify"],
      [
        post("facebook", "2026-10-01", "Hook one. Day 1", 100),
        post("facebook", "2026-10-03", "Late upload. Day 2", 50), // tagged Day 2, posted a day late
        post("facebook", "2026-10-03", "Hook three. Day 3", 30),
        post("facebook", "2026-10-03", "Hook three again. Day 3", 70),
        post("instagram", "2026-10-01", "Hook one.", 40), // untagged: falls back to date
        post("instagram", "2026-10-03", "Behind the scenes", 999), // untagged, but Day 3 has no IG tag → used
      ],
      "2026-10-04",
    );
    expect(grid.platforms).toEqual(["facebook", "instagram"]);
    expect(grid.days.map((d) => d.status)).toEqual(["posted", "posted", "posted", "today", "upcoming"]);
    expect(grid.days[1].cells.facebook?.views).toBe(50);
    expect(grid.days[2].cells.facebook?.views).toBe(70);
    expect(grid.days[0].totalViews).toBe(140);
    expect(grid.daysSoFar).toBe(3);
    expect(grid.coverage).toEqual([
      { platform: "facebook", posted: 3, missed: [] },
      { platform: "instagram", posted: 2, missed: [2] },
    ]);
  });
});
