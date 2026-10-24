import { describe, expect, it } from "vitest";
import { DEFAULT_BRANDS } from "@/config/brands";
import type { Platform } from "@/config/platforms";
import { aggregate, MetricStore } from "@/lib/metrics/engine";
import { generateSampleData, spread } from "./generate";

// The sample data must reproduce the Oct 19 hand-made reports exactly.
const { rows } = generateSampleData("2026-10-22");
const store = new MetricStore(rows);
const A = { from: "2026-09-27", to: "2026-10-07" };
const B = { from: "2026-10-08", to: "2026-10-18" };
const brand = (slug: string) => DEFAULT_BRANDS.find((b) => b.slug === slug)!;
const v = (slug: string, metric: string, p: Platform | "all", r: { from: string; to: string }) =>
  aggregate(store, slug, metric, p, brand(slug).platforms, [r]).value;

describe("spread", () => {
  it("splits a total exactly", () => {
    expect(spread(10, [1, 1, 1]).reduce((a, b) => a + b)).toBe(10);
    expect(spread(7, [3, 1])).toEqual([5, 2]);
  });
});

describe("PeopleSuq sample matches the Oct 8–18 report", () => {
  const ps = "peoplesuq";
  it("followers then and now", () => {
    expect(v(ps, "followers", "facebook", { from: "2026-10-07", to: "2026-10-07" })).toBe(105);
    expect(v(ps, "followers", "facebook", B)).toBe(114);
    expect(v(ps, "followers", "instagram", { from: "2026-10-07", to: "2026-10-07" })).toBe(14);
    expect(v(ps, "followers", "instagram", B)).toBe(29);
    expect(v(ps, "followers", "youtube", B)).toBe(7);
    expect(v(ps, "followers", "tiktok", B)).toBe(12);
    expect(v(ps, "followers", "all", B)).toBe(162);
  });
  it("views, engagement, clicks and visits", () => {
    expect([v(ps, "views", "facebook", A), v(ps, "views", "facebook", B)]).toEqual([2774, 6329]);
    expect([v(ps, "views", "instagram", A), v(ps, "views", "instagram", B)]).toEqual([564, 3305]);
    expect([v(ps, "engagements", "facebook", A), v(ps, "engagements", "facebook", B)]).toEqual([132, 237]);
    expect([v(ps, "engagements", "instagram", A), v(ps, "engagements", "instagram", B)]).toEqual([68, 74]);
    expect([v(ps, "link_clicks", "facebook", A), v(ps, "link_clicks", "facebook", B)]).toEqual([1, 24]);
    expect([v(ps, "link_clicks", "instagram", A), v(ps, "link_clicks", "instagram", B)]).toEqual([0, 10]);
    expect([v(ps, "profile_visits", "facebook", A), v(ps, "profile_visits", "facebook", B)]).toEqual([229, 104]);
    expect([v(ps, "profile_visits", "instagram", A), v(ps, "profile_visits", "instagram", B)]).toEqual([70, 75]);
  });
  it("comments: 6 in Oct 8–18, all on Facebook", () => {
    expect(v(ps, "comments", "facebook", B)).toBe(6);
    for (const p of ["instagram", "youtube", "tiktok"] as const) expect(v(ps, "comments", p, B)).toBe(0);
  });
  it("store funnel", () => {
    expect([v(ps, "store_sessions", "shopify", A), v(ps, "store_sessions", "shopify", B)]).toEqual([24, 40]);
    expect([v(ps, "store_sessions_social", "shopify", A), v(ps, "store_sessions_social", "shopify", B)]).toEqual([2, 29]);
    expect(v(ps, "add_to_cart", "shopify", B)).toBe(5);
    expect(v(ps, "reached_checkout", "shopify", B)).toBe(3);
    expect(v(ps, "orders", "shopify", B)).toBe(0);
    expect(v(ps, "store_revenue", "shopify", { from: "2026-10-19", to: "2026-10-19" })).toBe(35.99);
  });
});

describe("SUQ Media sample matches the Oct 8–18 report", () => {
  const sm = "suq-media";
  it("ads", () => {
    expect(v(sm, "ad_spend", "meta_ads", { from: "2026-10-05", to: "2026-10-07" })).toBeCloseTo(71.89, 2);
    expect(v(sm, "ad_spend", "meta_ads", B)).toBeCloseTo(269.77, 2);
    expect(v(sm, "meta_leads", "meta_ads", { from: "2026-10-05", to: "2026-10-07" })).toBe(6);
    expect(v(sm, "meta_leads", "meta_ads", B)).toBe(18);
  });
  it("real leads, cost per lead and the pipeline", () => {
    expect(v(sm, "leads_from_ads", "lead_rescue", B)).toBe(14);
    expect(v(sm, "leads_from_ads", "lead_rescue", { from: "2026-10-05", to: "2026-10-18" })).toBe(17);
    expect(v(sm, "cost_per_lead", "all", B)).toBeCloseTo(19.27, 2); // "about $19 each"
    expect(v(sm, "deals_won", "lead_rescue", B)).toBe(1);
    expect(v(sm, "revenue_won", "lead_rescue", B)).toBe(225);
    expect(v(sm, "spam_leads", "lead_rescue", B)).toBe(1);
    // 19 real deals worth about $25,500, less the $225 won.
    expect(v(sm, "pipeline_value", "lead_rescue", B)).toBe(25755 - 225);
  });
  it("page numbers", () => {
    expect([v(sm, "views", "facebook", A), v(sm, "views", "facebook", B)]).toEqual([2783, 12535]);
    expect([v(sm, "views", "instagram", A), v(sm, "views", "instagram", B)]).toEqual([552, 1531]);
    expect([v(sm, "link_clicks", "facebook", A), v(sm, "link_clicks", "facebook", B)]).toEqual([26, 109]);
    expect(v(sm, "followers", "facebook", B)).toBe(48);
    expect(v(sm, "followers", "instagram", B)).toBe(9);
    expect(v(sm, "posts_published", "all", B)).toBe(0);
  });
});
