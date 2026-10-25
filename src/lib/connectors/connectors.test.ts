import { describe, expect, it } from "vitest";
import { channelOf, contactUrl, dailyMetrics } from "./lead-rescue";
import { excludeSpikes, type CitySessions } from "./shopify";
import { dailyFromSnapshots } from "./tiktok";

describe("Shopify bot and test traffic", () => {
  const row = (city: string, country: string, sessions: number, date = "2026-10-15", referrer = "social"): CitySessions => ({
    date,
    city,
    country,
    referrer,
    sessions,
  });

  it("leaves out a one-day spike from one city outside Canada", () => {
    const rows = [row("San Jose", "United States", 174), row("Edmonton", "Canada", 3), row("New York", "United States", 1)];
    const { kept, excluded } = excludeSpikes(rows);
    expect(excluded.map((r) => r.city)).toEqual(["San Jose"]);
    expect(kept.reduce((s, r) => s + r.sessions, 0)).toBe(4);
  });

  it("adds a city's sources together before judging the spike", () => {
    const rows = [row("Boardman", "United States", 6, "2026-10-15", "social"), row("Boardman", "United States", 5, "2026-10-15", "direct")];
    expect(excludeSpikes(rows).excluded).toHaveLength(2);
  });

  it("never treats Canadian traffic as a spike", () => {
    expect(excludeSpikes([row("Calgary", "Canada", 400)]).excluded).toHaveLength(0);
  });

  it("always leaves out cities an admin listed, whatever the count", () => {
    expect(excludeSpikes([row("Haverhill", "United States", 2)], ["haverhill"]).excluded).toHaveLength(1);
  });
});

describe("Lead Rescue lead sources", () => {
  it("sorts lead sources into channels", () => {
    expect(channelOf("Form: Crew Hoodie Request Ad Landing")).toBe("meta_ads");
    expect(channelOf("Form: Custom Apparel Page")).toBe("direct");
    expect(channelOf("Jason Holt contact")).toBe("referral");
    expect(channelOf("inbound_email")).toBe("other");
    expect(channelOf(null)).toBe("unknown");
  });
});

describe("Lead Rescue daily pipeline numbers", () => {
  const stages = [
    { id: "new", position: 0, pipeline_id: "p" },
    { id: "quote", position: 5, pipeline_id: "p" },
    { id: "won", position: 9, pipeline_id: "p" },
  ];
  const firstPos = new Map([["p", 0]]);
  const base = { is_spam: false, quote_sent_at: null, won_at: null, lost_at: null };
  const leads = [
    { ...base, created_date: "2026-10-12", source_channel: "meta_ads" as const, stage_id: "won", value: 225, quote_sent_at: "2026-10-13T18:00:00Z", won_at: "2026-10-15T18:00:00Z" },
    { ...base, created_date: "2026-10-12", source_channel: "meta_ads" as const, stage_id: "new", value: 600 },
    { ...base, created_date: "2026-10-13", source_channel: "direct" as const, stage_id: "new", value: 4500 },
    { ...base, created_date: "2026-10-13", source_channel: "meta_ads" as const, stage_id: "new", value: 0, is_spam: true },
  ];
  const m = dailyMetrics(leads, stages, firstPos, "2026-10-12", "2026-10-16");
  const v = (date: string, metric: string) => m.find((x) => x.date === date && x.metric === metric)!.value;

  it("counts leads on the day they came in, and leaves spam out", () => {
    expect(v("2026-10-12", "leads")).toBe(2);
    expect(v("2026-10-12", "leads_from_ads")).toBe(2);
    expect(v("2026-10-13", "leads")).toBe(1);
    expect(v("2026-10-13", "spam_leads")).toBe(1);
  });

  it("counts quotes and wins on the day they happened", () => {
    expect(v("2026-10-13", "quotes_sent")).toBe(1);
    expect(v("2026-10-15", "deals_won")).toBe(1);
    expect(v("2026-10-15", "revenue_won")).toBe(225);
  });

  it("open pipeline counts deals from creation until they close", () => {
    expect(v("2026-10-12", "pipeline_value")).toBe(825);
    expect(v("2026-10-14", "pipeline_value")).toBe(5325);
    // Won on the 15th: no longer open that day.
    expect(v("2026-10-15", "pipeline_value")).toBe(5100);
  });

  it("only counts a lead as qualified once it has moved past the first stage", () => {
    expect(v("2026-10-12", "qualified_leads")).toBe(1);
    expect(v("2026-10-13", "qualified_leads")).toBe(0);
  });
});

describe("TikTok daily numbers from nightly snapshots", () => {
  const snap = (views: number, likes = 0) => ({ views, likes, comments: 0, shares: 0 });
  it("counts the change between consecutive nights", () => {
    const snaps = new Map([["v1", new Map([["2026-10-24", snap(100, 5)], ["2026-10-25", snap(160, 9)]])]]);
    const m = dailyFromSnapshots(snaps, new Map([["v1", "2026-10-03"]]), ["2026-10-24", "2026-10-25"]);
    // Oct 24 has no night before it and the video is old: no number rather than a made-up one.
    expect(m.filter((p) => p.date === "2026-10-24")).toEqual([]);
    expect(m.find((p) => p.date === "2026-10-25" && p.metric === "views")!.value).toBe(60);
    expect(m.find((p) => p.date === "2026-10-25" && p.metric === "engagements")!.value).toBe(4);
  });

  it("counts a brand-new video from zero", () => {
    const snaps = new Map([["v2", new Map([["2026-10-25", snap(40)]])]]);
    const m = dailyFromSnapshots(snaps, new Map([["v2", "2026-10-25"]]), ["2026-10-25"]);
    expect(m.find((p) => p.metric === "views")!.value).toBe(40);
  });

  it("never goes negative when TikTok trims a count", () => {
    const snaps = new Map([["v3", new Map([["2026-10-24", snap(100)], ["2026-10-25", snap(98)]])]]);
    expect(dailyFromSnapshots(snaps, new Map(), ["2026-10-25"]).find((p) => p.metric === "views")!.value).toBe(0);
  });
});

describe("lead rescue contact links", () => {
  it("builds the app link from the workspace and contact ids", () => {
    expect(contactUrl({ id: "c1", business_id: "w1" })).toBe("https://app.leadrescue.pro/workspace/w1/contacts/c1");
    expect(contactUrl({ id: "c1" })).toBeNull();
  });
});
