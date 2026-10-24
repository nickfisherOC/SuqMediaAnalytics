import { describe, expect, it } from "vitest";
import { judgeOutcome, outcomeWindow } from "./outcomes";

describe("judgeOutcome", () => {
  it("counts a move in the expected direction as worked", () => {
    expect(judgeOutcome(100, 130, "up")).toBe("worked");
    expect(judgeOutcome(20, 15, "down")).toBe("worked");
  });
  it("counts a move the wrong way as worse", () => {
    expect(judgeOutcome(100, 80, "up")).toBe("worse");
    expect(judgeOutcome(20, 25, "down")).toBe("worse");
  });
  it("treats small changes as no change", () => {
    expect(judgeOutcome(100, 104, "up")).toBe("no_change");
    expect(judgeOutcome(100, 96, "up")).toBe("no_change");
  });
  it("handles a zero baseline", () => {
    expect(judgeOutcome(0, 3, "up")).toBe("worked");
    expect(judgeOutcome(0, 0, "up")).toBe("no_change");
    expect(judgeOutcome(0, 3, "down")).toBe("worse");
  });
  it("is too early without a current value", () => {
    expect(judgeOutcome(10, null, "up")).toBe("too_early");
  });
});

describe("outcomeWindow", () => {
  it("matches the baseline window's length, ending yesterday", () => {
    expect(outcomeWindow({ from: "2026-10-17", to: "2026-10-23" }, "2026-11-08")).toEqual({ from: "2026-11-01", to: "2026-11-07" });
    expect(outcomeWindow({ from: "2026-10-01", to: "2026-10-28" }, "2026-11-08")).toEqual({ from: "2026-10-11", to: "2026-11-07" });
  });
  it("falls back to 7 days", () => {
    expect(outcomeWindow({ from: null, to: null }, "2026-11-08")).toEqual({ from: "2026-11-01", to: "2026-11-07" });
  });
});
