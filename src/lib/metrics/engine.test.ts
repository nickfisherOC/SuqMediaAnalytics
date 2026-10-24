import { describe, expect, it } from "vitest";
import type { Platform } from "@/config/platforms";
import { aggregate, compareValues, dailySeries, MetricStore, type MetricRow } from "./engine";

const B = "peoplesuq";
const ALL: Platform[] = ["instagram", "facebook", "tiktok", "youtube", "shopify", "meta_ads", "lead_rescue"];

function row(platform: Platform, metric: string, date: string, value: number): MetricRow {
  return { brand: B, platform, metric, date, value };
}

const week = { from: "2026-10-12", to: "2026-10-18" };
const prev = { from: "2026-10-05", to: "2026-10-11" };

describe("summed metrics", () => {
  const store = new MetricStore([
    row("instagram", "views", "2026-10-12", 100),
    row("instagram", "views", "2026-10-18", 50),
    row("instagram", "views", "2026-10-19", 999), // outside the week
    row("facebook", "views", "2026-10-15", 30),
  ]);

  it("adds daily totals inside the range only, across platforms", () => {
    expect(aggregate(store, B, "views", "all", ALL, [week])).toEqual({ value: 180, platforms: ["facebook", "instagram"] });
    expect(aggregate(store, B, "views", "instagram", ALL, [week]).value).toBe(150);
  });

  it("returns null, not zero, when there is no data", () => {
    expect(aggregate(store, B, "views", "tiktok", ALL, [week]).value).toBeNull();
    expect(aggregate(store, B, "views", "all", ALL, [prev]).value).toBeNull();
  });

  it("a reported zero is a real zero", () => {
    const s = new MetricStore([row("instagram", "comments", "2026-10-12", 0)]);
    expect(aggregate(s, B, "comments", "instagram", ALL, [week]).value).toBe(0);
  });

  it("ignores platforms the brand doesn't use", () => {
    const s = new MetricStore([row("tiktok", "views", "2026-10-12", 40), row("facebook", "views", "2026-10-12", 10)]);
    expect(aggregate(s, B, "views", "all", ["facebook", "instagram"], [week]).value).toBe(10);
  });
});

describe("running counters (followers)", () => {
  const store = new MetricStore([
    row("instagram", "followers", "2026-10-11", 14),
    row("instagram", "followers", "2026-10-12", 16),
    row("instagram", "followers", "2026-10-17", 29),
    row("facebook", "followers", "2026-10-11", 40),
    row("facebook", "followers", "2026-10-18", 44),
  ]);

  it("uses the last value in the range, never a sum of days", () => {
    expect(aggregate(store, B, "followers", "instagram", ALL, [week]).value).toBe(29);
    expect(aggregate(store, B, "followers", "all", ALL, [week]).value).toBe(73);
    expect(aggregate(store, B, "followers", "all", ALL, [prev]).value).toBe(54);
  });

  it("carries the last value forward across gaps in the daily series", () => {
    const s = dailySeries(store, B, "followers", "all", ALL, { from: "2026-10-12", to: "2026-10-14" });
    // Facebook has no value on the 12th–14th, so its Oct 11 value (40) carries forward.
    expect(s.map((p) => p.value)).toEqual([56, 56, 56]);
  });
});

describe("ratio metrics", () => {
  const SUQ: Platform[] = ["meta_ads", "lead_rescue", "facebook", "instagram"];
  const store = new MetricStore([
    row("meta_ads", "ad_spend", "2026-10-12", 25),
    row("meta_ads", "ad_spend", "2026-10-13", 25),
    row("meta_ads", "ad_spend", "2026-10-14", 50),
    row("lead_rescue", "leads_from_ads", "2026-10-12", 1),
    row("lead_rescue", "leads_from_ads", "2026-10-14", 3),
    row("meta_ads", "ad_impressions", "2026-10-12", 2000),
    row("meta_ads", "ad_clicks", "2026-10-12", 30),
  ]);

  it("divides the sums, not the average of daily ratios", () => {
    // (25+25+50) / (1+3) = 25. Averaging daily CPLs would give (25 + 16.67) / 2.
    expect(aggregate(store, B, "cost_per_lead", "all", SUQ, [week]).value).toBe(25);
  });

  it("applies multipliers", () => {
    expect(aggregate(store, B, "ad_ctr", "meta_ads", SUQ, [{ from: "2026-10-12", to: "2026-10-12" }]).value).toBeCloseTo(1.5);
    expect(aggregate(store, B, "cpm", "meta_ads", SUQ, [{ from: "2026-10-12", to: "2026-10-12" }]).value).toBeCloseTo(12.5);
  });

  it("is null when the denominator is zero or missing", () => {
    expect(aggregate(store, B, "cost_per_lead", "all", SUQ, [{ from: "2026-10-13", to: "2026-10-13" }]).value).toBeNull();
    expect(aggregate(store, B, "cost_per_lead", "all", SUQ, [prev]).value).toBeNull();
  });

  it("sums a multi-metric denominator (win rate = won / (won + lost))", () => {
    const s = new MetricStore([
      row("lead_rescue", "deals_won", "2026-10-12", 1),
      row("lead_rescue", "deals_lost", "2026-10-13", 3),
    ]);
    expect(aggregate(s, B, "win_rate", "all", SUQ, [week]).value).toBe(25);
  });
});

describe("multi-window comparisons (4-period average)", () => {
  const w1 = { from: "2026-10-05", to: "2026-10-11" };
  const w2 = { from: "2026-09-28", to: "2026-10-04" };
  const store = new MetricStore([
    row("instagram", "views", "2026-10-06", 100),
    row("instagram", "views", "2026-09-30", 300),
    row("meta_ads", "ad_spend", "2026-10-06", 10),
    row("meta_ads", "ad_spend", "2026-09-30", 90),
    row("lead_rescue", "leads_from_ads", "2026-10-06", 1),
    row("lead_rescue", "leads_from_ads", "2026-09-30", 4),
  ]);

  it("averages per-window totals, skipping windows with no data", () => {
    const empty = { from: "2026-09-21", to: "2026-09-27" };
    expect(aggregate(store, B, "views", "instagram", ALL, [w1, w2, empty]).value).toBe(200);
  });

  it("pools ratios across windows", () => {
    // (10 + 90) / (1 + 4) = 20, not the average of 10 and 22.5.
    expect(aggregate(store, B, "cost_per_lead", "all", ALL, [w1, w2]).value).toBe(20);
  });
});

describe("compareValues", () => {
  it("reports delta, percent and whether it's good news", () => {
    expect(compareValues(29, 14, true)).toEqual({ delta: 15, pct: 15 / 14, direction: "up", sentiment: "good" });
    expect(compareValues(30, 40, false)).toMatchObject({ delta: -10, pct: -0.25, direction: "down", sentiment: "good" });
    expect(compareValues(30, 40, true)).toMatchObject({ sentiment: "bad" });
  });

  it("is neutral for metrics that are a choice, like ad spend", () => {
    expect(compareValues(30, 25, null)).toMatchObject({ direction: "up", sentiment: "neutral" });
  });

  it("has no percent change from a zero baseline", () => {
    expect(compareValues(6, 0, true)).toEqual({ delta: 6, pct: null, direction: "up", sentiment: "good" });
  });

  it("is flat when equal, including float noise", () => {
    expect(compareValues(0.1 + 0.2, 0.3, true)).toMatchObject({ delta: 0, direction: "flat", sentiment: "neutral" });
  });

  it("is empty when either side has no data", () => {
    expect(compareValues(null, 4, true).direction).toBeNull();
    expect(compareValues(4, null, true).pct).toBeNull();
  });
});
