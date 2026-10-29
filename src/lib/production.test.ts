import { describe, expect, it } from "vitest";
import { dueLabel, dueState, jobsInStep, orderBetween, placeJob, type ProductionJob } from "./production";

const job = (id: string, over: Partial<ProductionJob> = {}): ProductionJob => ({
  id,
  title: id,
  url: null,
  dueDate: null,
  rush: false,
  stepId: "queued",
  sortOrder: 0,
  fromDeal: false,
  ...over,
});

describe("jobsInStep", () => {
  it("puts rush jobs first, then sorts by position", () => {
    const jobs = [job("a", { sortOrder: 1 }), job("b", { sortOrder: 2, rush: true }), job("c", { sortOrder: 0 }), job("d", { stepId: "prep" })];
    expect(jobsInStep(jobs, "queued").map((j) => j.id)).toEqual(["b", "c", "a"]);
  });
});

describe("orderBetween", () => {
  it("lands between, after, before, or at zero", () => {
    expect(orderBetween(1, 2)).toBe(1.5);
    expect(orderBetween(5, undefined)).toBe(6);
    expect(orderBetween(undefined, 5)).toBe(4);
    expect(orderBetween(undefined, undefined)).toBe(0);
  });
});

describe("placeJob", () => {
  const jobs = [job("a", { sortOrder: 1 }), job("b", { sortOrder: 2 }), job("c", { sortOrder: 3 }), job("x", { stepId: "prep", sortOrder: 9 })];

  it("moves a job to the top, middle and bottom of its own step", () => {
    expect(placeJob(jobs, "c", "queued", 0)).toEqual({ stepId: "queued", sortOrder: 0 });
    expect(placeJob(jobs, "c", "queued", 1)).toEqual({ stepId: "queued", sortOrder: 1.5 });
    expect(placeJob(jobs, "a", "queued", 2)).toEqual({ stepId: "queued", sortOrder: 4 });
  });

  it("moves a job into another step", () => {
    expect(placeJob(jobs, "a", "prep", 0)).toEqual({ stepId: "prep", sortOrder: 8 });
    expect(placeJob(jobs, "a", "printing", 0)).toEqual({ stepId: "printing", sortOrder: 0 });
  });

  it("keeps rush jobs above the rest", () => {
    const mixed = [job("r1", { rush: true, sortOrder: 10 }), job("r2", { rush: true, sortOrder: 20 }), job("n1", { sortOrder: 1 }), job("n2", { sortOrder: 2 })];
    // Dropping a normal job at the very top still places it first among normal jobs.
    expect(placeJob(mixed, "n2", "queued", 0).sortOrder).toBe(0);
    // Board index 3 (after r1, r2, n1) is the end of the normal jobs.
    expect(placeJob(mixed, "n1", "queued", 3).sortOrder).toBe(3);
    // A rush job dropped below the normal jobs stays last among rush jobs.
    expect(placeJob(mixed, "r1", "queued", 3).sortOrder).toBe(21);
  });
});

describe("due dates", () => {
  const today = "2026-10-29";
  it("says how urgent a job is", () => {
    expect(dueState("2026-10-28", today, false)).toBe("overdue");
    expect(dueState("2026-10-29", today, false)).toBe("today");
    expect(dueState("2026-11-01", today, false)).toBe("soon");
    expect(dueState("2026-11-10", today, false)).toBe("later");
    expect(dueState("2026-10-20", today, true)).toBe("none");
    expect(dueState(null, today, false)).toBe("none");
  });

  it("labels the due date in plain words", () => {
    expect(dueLabel("2026-10-29", today)).toBe("Due today");
    expect(dueLabel("2026-10-30", today)).toBe("Due tomorrow");
    expect(dueLabel("2026-10-28", today)).toBe("1 day late");
    expect(dueLabel("2026-10-26", today)).toBe("3 days late");
    expect(dueLabel("2026-11-05", today)).toBe("Due Nov 5");
    expect(dueLabel(null, today)).toBe("No due date");
  });
});
