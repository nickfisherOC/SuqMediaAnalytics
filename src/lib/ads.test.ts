import { describe, expect, it } from "vitest";
import { adsByDay, aggregateAds, bestAndWorst, isTiring, type AdDayRow } from "./ads";

const row = (over: Partial<AdDayRow>): AdDayRow => ({
  date: "2026-10-20",
  level: "ad",
  entity_id: "a1",
  parent_id: "s1",
  name: "Quote Process v2",
  status: "ACTIVE",
  thumbnail_url: null,
  spend: 0,
  impressions: 0,
  link_clicks: 0,
  leads: 0,
  frequency: null,
  extra: null,
  ...over,
});

describe("ads", () => {
  it("adds up an ad across days and works out rates", () => {
    const [a] = aggregateAds(
      [
        row({ spend: 20, impressions: 1000, link_clicks: 10, leads: 1, frequency: 1.5, thumbnail_url: "x" }),
        row({ date: "2026-10-21", spend: 30, impressions: 1000, link_clicks: 15, leads: 1, frequency: 2.5 }),
      ],
      "ad",
      "leads",
    );
    expect(a).toMatchObject({ spend: 50, impressions: 2000, linkClicks: 25, leads: 2, results: 2, costPerResult: 25, cpc: 2, ctr: 0.0125, frequency: 2, thumbnail: "x" });
  });

  it("marks best and worst only among ads that spent enough", () => {
    const ads = aggregateAds(
      [
        row({ entity_id: "cheap", spend: 20, leads: 4 }),
        row({ entity_id: "dear", spend: 60, leads: 1 }),
        row({ entity_id: "none", spend: 15, leads: 0 }),
        row({ entity_id: "tiny", spend: 2, leads: 2 }),
      ],
      "ad",
      "leads",
    );
    expect(bestAndWorst(ads)).toEqual({ best: "cheap", worst: "none" });
  });

  it("spots a tiring ad", () => {
    const [now] = aggregateAds([row({ impressions: 2000, link_clicks: 10, frequency: 3 })], "ad", "clicks");
    const [before] = aggregateAds([row({ impressions: 2000, link_clicks: 30, frequency: 1.8 })], "ad", "clicks");
    expect(isTiring(now, before)).toBe(true);
    expect(isTiring(before, now)).toBe(false);
  });

  it("sums campaigns per day", () => {
    const days = adsByDay(
      [row({ level: "campaign", spend: 10, leads: 1 }), row({ level: "campaign", entity_id: "c2", spend: 5, leads: 0 }), row({ level: "ad", spend: 99 })],
      ["2026-10-20", "2026-10-21"],
      "leads",
    );
    expect(days).toEqual([
      { date: "2026-10-20", spend: 15, results: 1 },
      { date: "2026-10-21", spend: 0, results: 0 },
    ]);
  });
});
