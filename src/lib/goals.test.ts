import { describe, expect, it } from "vitest";
import { MetricStore, type MetricRow } from "@/lib/metrics/engine";
import { goalProgress, goalText, goalWindow, type Goal } from "./goals";

const rows = (metric: string, platform: MetricRow["platform"], values: Record<string, number>): MetricRow[] =>
  Object.entries(values).map(([date, value]) => ({ brand: "suq-media", platform, date, metric, value, isSample: false }));

const goal = (over: Partial<Goal>): Goal => ({
  id: "g",
  brand: "suq-media",
  metric: "leads",
  platform: "lead_rescue",
  label: "Leads",
  target: 14,
  cadence: "week",
  direction: null,
  startDate: "2026-10-01",
  deadline: null,
  ...over,
});

const platforms: MetricRow["platform"][] = ["lead_rescue", "meta_ads", "instagram"];

describe("goals", () => {
  it("works out this week and last week (Monday to Sunday)", () => {
    expect(goalWindow({ cadence: "week", startDate: "2026-10-01", deadline: null }, "2026-10-28")).toEqual({
      from: "2026-10-26",
      to: "2026-11-01",
      previous: { from: "2026-10-19", to: "2026-10-25" },
    });
    expect(goalWindow({ cadence: "month", startDate: "2026-10-01", deadline: null }, "2026-10-28")).toMatchObject({ from: "2026-10-01", to: "2026-10-31", previous: { from: "2026-09-01", to: "2026-09-30" } });
  });

  it("judges a weekly count against the pace so far", () => {
    // Wednesday: Mon + Tue counted (data runs to yesterday), 2/7 of 14 = 4 expected.
    const store = new MetricStore(rows("leads", "lead_rescue", { "2026-10-26": 2, "2026-10-27": 2, "2026-10-20": 9, "2026-10-21": 6 }));
    const p = goalProgress(goal({}), store, platforms, "2026-10-28");
    expect(p).toMatchObject({ value: 4, expected: 4, state: "on_track", remaining: 10, daysLeft: 5, through: "2026-10-27" });
    expect(p.previous).toEqual({ value: 15, met: true });

    const slow = goalProgress(goal({}), new MetricStore(rows("leads", "lead_rescue", { "2026-10-26": 1 })), platforms, "2026-10-28");
    expect(slow.state).toBe("behind");
  });

  it("marks a count goal hit as soon as it's reached", () => {
    const store = new MetricStore(rows("leads", "lead_rescue", { "2026-10-26": 10, "2026-10-27": 5 }));
    expect(goalProgress(goal({}), store, platforms, "2026-10-28").state).toBe("hit");
  });

  it("treats lower-is-better ratios as stay-under goals", () => {
    const store = new MetricStore([
      ...rows("ad_spend", "meta_ads", { "2026-10-26": 100 }),
      ...rows("leads_from_ads", "lead_rescue", { "2026-10-26": 5 }),
    ]);
    const p = goalProgress(goal({ metric: "cost_per_lead", platform: "all", target: 15 }), store, platforms, "2026-10-28");
    expect(p).toMatchObject({ direction: "at_most", value: 20, expected: null, state: "behind" });
  });

  it("paces a follower goal from its starting point to the deadline", () => {
    const store = new MetricStore([
      ...rows("followers", "instagram", { "2026-09-30": 40, "2026-10-15": 75 }).map((r) => ({ ...r, brand: "peoplesuq" })),
    ]);
    const p = goalProgress(
      goal({ brand: "peoplesuq", metric: "followers", platform: "instagram", target: 100, cadence: "deadline", startDate: "2026-10-01", deadline: "2026-10-31" }),
      store,
      platforms,
      "2026-10-16",
    );
    // Halfway through (15 of 31 days counted): expected ≈ 40 + 60 × 15/31.
    expect(p.value).toBe(75);
    expect(p.expected).toBeCloseTo(40 + (60 * 15) / 31);
    expect(p.state).toBe("on_track");
  });

  it("reports a finished window as hit or missed", () => {
    const store = new MetricStore(rows("leads", "lead_rescue", { "2026-10-26": 3 }));
    const p = goalProgress(goal({ cadence: "deadline", startDate: "2026-10-20", deadline: "2026-10-26" }), store, platforms, "2026-10-28");
    expect(p.state).toBe("missed");
  });

  it("counts followers gained, not the total, for weekly goals", () => {
    const store = new MetricStore(
      rows("followers", "facebook", { "2026-10-25": 114, "2026-10-26": 115, "2026-10-27": 117, "2026-10-18": 110 }).map((r) => ({ ...r, brand: "peoplesuq" })),
    );
    const p = goalProgress(goal({ brand: "peoplesuq", metric: "followers", platform: "facebook", label: "Facebook followers", target: 5 }), store, ["facebook"], "2026-10-28");
    expect(p).toMatchObject({ value: 3, state: "on_track", remaining: 2 });
    expect(p.previous).toEqual({ value: 4, met: false });
    expect(goalText(p)).toBe("5 new Facebook followers a week");
  });
});
