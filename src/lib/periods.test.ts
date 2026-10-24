import { describe, expect, it } from "vitest";
import { addMonths, edmontonDateOf, eachDay, isoWeekday, startOfWeek, todayInEdmonton } from "./dates";
import { rangeLength, resolveCompare, resolvePeriod } from "./periods";

// Friday, Oct 23 2026.
const TODAY = "2026-10-23";

describe("dates", () => {
  it("weeks start on Monday", () => {
    expect(isoWeekday("2026-10-19")).toBe(1);
    expect(isoWeekday("2026-10-25")).toBe(7);
    expect(startOfWeek("2026-10-25")).toBe("2026-10-19");
    expect(startOfWeek("2026-10-19")).toBe("2026-10-19");
  });

  it("buckets instants into Edmonton days, not UTC days", () => {
    // 03:00 UTC on Oct 24 is 21:00 on Oct 23 in Edmonton (MDT, UTC−6).
    expect(edmontonDateOf("2026-10-24T03:00:00Z")).toBe("2026-10-23");
    // After DST ends (Nov 1), Edmonton is UTC−7.
    expect(edmontonDateOf("2026-11-05T06:30:00Z")).toBe("2026-11-04");
    expect(todayInEdmonton(new Date("2026-10-23T18:00:00Z"))).toBe("2026-10-23");
  });

  it("handles DST changeover days as normal calendar days", () => {
    expect(eachDay("2026-10-31", "2026-11-02")).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("clamps month arithmetic to the end of the month", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2024-03-31", -1)).toBe("2024-02-29");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("resolvePeriod", () => {
  it("defaults the Monday meeting to the last complete Mon–Sun week", () => {
    const p = resolvePeriod("last_week", TODAY);
    expect(p).toMatchObject({ from: "2026-10-12", to: "2026-10-18", days: 7, partial: false });
    // On the Monday of the meeting itself, "last week" is the week just ended.
    expect(resolvePeriod("last_week", "2026-10-19")).toMatchObject({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("this week runs Monday to today and is partial", () => {
    expect(resolvePeriod("this_week", TODAY)).toMatchObject({ from: "2026-10-19", to: TODAY, days: 5, partial: true });
  });

  it("rolling windows end yesterday and have exactly N days", () => {
    for (const [key, n] of [["last_7", 7], ["last_28", 28], ["last_90", 90]] as const) {
      const p = resolvePeriod(key, TODAY);
      expect(p.to).toBe("2026-10-22");
      expect(p.days).toBe(n);
    }
  });

  it("falls back to the default for an invalid custom range", () => {
    expect(resolvePeriod("custom", TODAY, { from: "2026-10-10", to: "2026-10-01" }).key).toBe("last_week");
    expect(resolvePeriod("custom", TODAY, { from: "nope", to: "2026-10-01" }).key).toBe("last_week");
    expect(resolvePeriod("custom", TODAY, { from: "2026-10-01", to: "2026-10-31" })).toMatchObject({
      key: "custom",
      days: 31,
      partial: true,
    });
  });
});

describe("resolveCompare", () => {
  const week = { from: "2026-10-12", to: "2026-10-18" };

  it("previous period is the same length, immediately before", () => {
    expect(resolveCompare(week, "previous").windows).toEqual([{ from: "2026-10-05", to: "2026-10-11" }]);
    const partial = resolvePeriod("this_week", TODAY);
    expect(resolveCompare(partial, "previous").windows).toEqual([{ from: "2026-10-14", to: "2026-10-18" }]);
  });

  it("4-period average uses four back-to-back same-length windows", () => {
    const w = resolveCompare(week, "avg_4w").windows;
    expect(w).toEqual([
      { from: "2026-10-05", to: "2026-10-11" },
      { from: "2026-09-28", to: "2026-10-04" },
      { from: "2026-09-21", to: "2026-09-27" },
      { from: "2026-09-14", to: "2026-09-20" },
    ]);
    w.forEach((r) => expect(rangeLength(r)).toBe(7));
  });

  it("same period last month keeps the same length", () => {
    expect(resolveCompare(week, "last_month").windows).toEqual([{ from: "2026-09-12", to: "2026-09-18" }]);
    const oct = { from: "2026-10-01", to: "2026-10-31" };
    const [w] = resolveCompare(oct, "last_month").windows;
    expect(w).toEqual({ from: "2026-09-01", to: "2026-10-01" });
    expect(rangeLength(w)).toBe(31);
  });
});
