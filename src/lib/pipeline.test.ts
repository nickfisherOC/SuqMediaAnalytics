import { describe, expect, it } from "vitest";
import { byStage, bySource, sourceLabel, waitingDeals, weekly, type LeadRow, type StageRow } from "./pipeline";

const stages: StageRow[] = [
  { id: "new", name: "New", position: 1, isWon: false, isLost: false },
  { id: "quote", name: "Quote Sent", position: 2, isWon: false, isLost: false },
  { id: "won", name: "Won", position: 3, isWon: true, isLost: false },
  { id: "lost", name: "Lost", position: 4, isWon: false, isLost: true },
];

const lead = (over: Partial<LeadRow>): LeadRow => ({
  id: Math.random().toString(36),
  createdDate: "2026-10-10",
  form: "Form: Crew Hoodie Request Ad Landing",
  sourceChannel: "meta_ads",
  isSpam: false,
  stageId: "new",
  value: 0,
  quoteSentAt: null,
  wonAt: null,
  lostAt: null,
  ...over,
});

describe("pipeline", () => {
  it("cleans form names", () => {
    expect(sourceLabel("Form: Custom Apparel Page", "direct")).toBe("Custom Apparel Page");
    expect(sourceLabel(null, "other")).toBe("Other");
    expect(sourceLabel("staff", "other")).toBe("Staff");
    expect(sourceLabel(null, "unknown")).toBe("Unknown");
  });

  it("counts deals and value per stage, leaving out spam", () => {
    const rows = byStage(stages, [lead({ value: 100 }), lead({ value: 50 }), lead({ stageId: "won", value: 225 }), lead({ isSpam: true })]);
    expect(rows.map((r) => [r.name, r.deals, r.value, r.kind])).toEqual([
      ["New", 2, 150, "open"],
      ["Quote Sent", 0, 0, "open"],
      ["Won", 1, 225, "won"],
      ["Lost", 0, 0, "lost"],
    ]);
  });

  it("lists open deals longest-waiting first and marks estimates", () => {
    const a = lead({ id: "a", stageId: "quote" });
    const b = lead({ id: "b" });
    const c = lead({ id: "c", stageId: "won" });
    const entered = new Map([
      ["a", "2026-10-15T16:00:00Z"],
      ["b", "2026-10-25T16:00:00Z"],
    ]);
    const rows = waitingDeals(stages, [a, b, c], entered, "2026-10-24", "2026-10-30");
    expect(rows.map((r) => [r.id, r.daysInStage, r.estimated])).toEqual([
      ["a", 15, true],
      ["b", 5, false],
    ]);
  });

  it("groups the period's leads by source with what happened since", () => {
    const rows = bySource(
      [
        lead({ quoteSentAt: "x", wonAt: "2026-10-15T00:00:00Z", value: 225 }),
        lead({}),
        lead({ form: "Form: Custom Apparel Page", sourceChannel: "direct" }),
        lead({ createdDate: "2026-09-30" }),
      ],
      { from: "2026-10-01", to: "2026-10-31" },
    );
    expect(rows).toEqual([
      { source: "Crew Hoodie Request Ad Landing", leads: 2, quotes: 1, won: 1, revenue: 225 },
      { source: "Custom Apparel Page", leads: 1, quotes: 0, won: 0, revenue: 0 },
    ]);
  });

  it("buckets leads and wins into Monday weeks", () => {
    const weeks = weekly([lead({ createdDate: "2026-10-02" }), lead({ createdDate: "2026-10-06", wonAt: "2026-10-15T14:55:09Z" })], "2026-10-01", "2026-10-16");
    expect(weeks).toEqual([
      { weekStart: "2026-09-28", leads: 1, won: 0 },
      { weekStart: "2026-10-05", leads: 1, won: 0 },
      { weekStart: "2026-10-12", leads: 0, won: 1 },
    ]);
  });
});
