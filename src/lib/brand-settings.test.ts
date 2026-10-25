import { describe, expect, it } from "vitest";
import { cleanSpecs, defaultTiles, slugify } from "./brand-settings";

describe("brand settings", () => {
  it("makes web-safe slugs", () => {
    expect(slugify("MKK Foundation")).toBe("mkk-foundation");
    expect(slugify("  Suq Média!! ")).toBe("suq-media");
  });

  it("keeps only tiles the brand can show, without duplicates", () => {
    const tiles = cleanSpecs(
      [
        { metric: "leads", platform: "lead_rescue" },
        { metric: "leads", platform: "lead_rescue" },
        { metric: "orders", platform: "shopify" }, // brand has no store
        { metric: "nope", platform: "all" },
        { metric: "followers", platform: "all", label: "  Total followers " },
        { metric: "followers", platform: "tiktok" }, // brand has no TikTok
      ],
      ["lead_rescue", "facebook", "instagram"],
      8,
    );
    expect(tiles).toEqual([
      { metric: "leads", platform: "lead_rescue" },
      { metric: "followers", platform: "all", label: "Total followers" },
    ]);
  });

  it("starts a new brand with tiles that fit its platforms", () => {
    const { scoreboard, funnel } = defaultTiles(["instagram", "facebook", "ga4"]);
    expect(scoreboard.map((t) => t.metric)).toEqual(["followers", "views", "engagements", "site_sessions"]);
    expect(funnel.map((t) => t.metric)).toEqual(["views", "site_sessions"]);
    expect(defaultTiles([]).scoreboard).toEqual([]);
  });
});
