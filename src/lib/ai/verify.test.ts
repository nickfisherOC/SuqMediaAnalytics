import { describe, expect, it } from "vitest";
import { unsupportedNumbers } from "./verify";

const tools = [{ value: 8024, compare: { value: 3174, change_pct: 152.8 }, cpl: 15.4672 }, { posts: [{ views: 669, published: "2026-10-17" }] }];

describe("unsupportedNumbers", () => {
  it("accepts numbers that come from tool results, with rounding and formatting", () => {
    const answer = "Views reached 8,024, up 153% from 3,174. Cost per lead was $15.47. Day 17's TikTok got 669 views on Oct 17.";
    expect(unsupportedNumbers(answer, tools, "How did views do?")).toEqual([]);
  });

  it("flags a made-up figure", () => {
    expect(unsupportedNumbers("Views reached 9,500 this week.", tools, "")).toEqual(["9,500"]);
  });

  it("ignores dates, series days, durations and small counting words", () => {
    expect(unsupportedNumbers("Over the last 7 days, Day 12 on 2026-10-12 beat 3 other videos (Oct 8–18).", tools, "")).toEqual([]);
  });

  it("allows numbers the person asked about", () => {
    expect(unsupportedNumbers("You'd need 1,000 followers; you're at 8,024 views.", tools, "Can we hit 1,000 followers?")).toEqual([]);
  });
});
