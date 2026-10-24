import { describe, expect, it } from "vitest";
import { DEFAULT_BRANDS } from "@/config/brands";
import { MetricStore, type MetricRow } from "@/lib/metrics/engine";
import { buildWeekPack } from "@/lib/pack";
import { resolveCompare, resolvePeriod } from "@/lib/periods";
import { buildHighlights, changeTitle, isMeaningful } from "./highlights";

const ps = DEFAULT_BRANDS.find((b) => b.slug === "peoplesuq")!;
const period = resolvePeriod("last_week", "2026-10-23"); // Oct 12–18 vs Oct 5–11
const compare = resolveCompare(period, "previous");

function rows(list: [string, string, string, number][]): MetricRow[] {
  return list.map(([platform, metric, date, value]) => ({ brand: "peoplesuq", platform: platform as MetricRow["platform"], metric, date, value }));
}

describe("changeTitle", () => {
  const pack = buildWeekPack(
    new MetricStore(
      rows([
        ["instagram", "followers", "2026-10-11", 14],
        ["instagram", "followers", "2026-10-18", 29],
        ["facebook", "views", "2026-10-08", 2783],
        ["facebook", "views", "2026-10-15", 12535],
        ["facebook", "profile_visits", "2026-10-08", 229],
        ["facebook", "profile_visits", "2026-10-15", 104],
      ]),
    ),
    ps,
    period,
    compare,
  );
  const f = (id: string) => pack.figures[`peoplesuq.${id}`];

  it("writes headlines the way the reports do", () => {
    expect(changeTitle(f("followers.instagram"))).toBe("Instagram followers doubled (14 → 29)");
    expect(changeTitle(f("views.facebook"))).toBe("Facebook views rose 4.5 times (2,783 → 12,535)");
    expect(changeTitle(f("profile_visits.facebook"))).toBe("Facebook profile visits halved (229 → 104)");
  });
});

describe("isMeaningful", () => {
  it("ignores tiny changes on small numbers", () => {
    const pack = buildWeekPack(
      new MetricStore(rows([["instagram", "link_clicks", "2026-10-08", 2], ["instagram", "link_clicks", "2026-10-15", 3]])),
      ps,
      period,
      compare,
    );
    expect(isMeaningful(pack.figures["peoplesuq.link_clicks.instagram"])).toBe(false);
  });
});

describe("buildHighlights", () => {
  const store = new MetricStore(
    rows([
      ["instagram", "views", "2026-10-08", 564],
      ["instagram", "views", "2026-10-15", 3305],
      ["instagram", "comments", "2026-10-15", 0],
      ["instagram", "posts_published", "2026-10-15", 7],
      ["tiktok", "views", "2026-10-15", 400],
      ["tiktok", "comments", "2026-10-15", 0],
      ["facebook", "comments", "2026-10-15", 6],
      ["facebook", "views", "2026-10-15", 1000],
      ["facebook", "posts_published", "2026-10-15", 3],
      ["shopify", "reached_checkout", "2026-10-15", 3],
      ["shopify", "orders", "2026-10-15", 0],
    ]),
  );
  const h = buildHighlights(buildWeekPack(store, ps, period, compare));

  it("leads with the biggest real improvement", () => {
    expect(h.improved[0].title).toBe("Instagram views rose 5.9 times (564 → 3,305)");
  });

  it("calls out silent platforms, missed cadence and checkout drop-off", () => {
    const titles = h.needsWork.map((x) => x.title);
    expect(titles).toContain("No comments on Instagram and TikTok");
    expect(titles).toContain("Behind on posting: Facebook 3 (target 7)");
    expect(titles).toContain("3 people reached checkout and none bought");
  });

  it("every highlight points at figures in the pack", () => {
    for (const x of [...h.improved, ...h.needsWork]) expect(x.figureIds.length).toBeGreaterThan(0);
  });
});
