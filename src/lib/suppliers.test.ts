import { describe, expect, it } from "vitest";
import { checkedLabel, cleanBreaks, fromPrice, moqLabel, priceFor, splitList } from "./suppliers";

const breaks = [
  { minQty: 72, price: 14.5 },
  { minQty: 12, price: 16.25 },
  { minQty: 144, price: 13.75 },
];

describe("price breaks", () => {
  it("sorts, de-duplicates and drops bad rows", () => {
    expect(cleanBreaks([...breaks, { minQty: 12, price: 16 }, { minQty: 0, price: 5 }, { minQty: 5, price: Number.NaN }])).toEqual([
      { minQty: 12, price: 16 },
      { minQty: 72, price: 14.5 },
      { minQty: 144, price: 13.75 },
    ]);
  });

  it("finds the unit price for a quantity", () => {
    expect(priceFor(5, breaks)).toBeNull();
    expect(priceFor(12, breaks)).toBe(16.25);
    expect(priceFor(100, breaks)).toBe(14.5);
    expect(priceFor(500, breaks)).toBe(13.75);
  });

  it("shows the lowest price", () => {
    expect(fromPrice(breaks)).toBe("From $13.75");
    expect(fromPrice([])).toBeNull();
  });
});

describe("labels", () => {
  it("describes minimum orders", () => {
    expect(moqLabel(1, "order")).toBe("No minimum");
    expect(moqLabel(50, "colour")).toBe("Min 50 per colour");
    expect(moqLabel(1000, "style")).toBe("Min 1,000 per style");
    expect(moqLabel(null, "order")).toBe("Minimum not set");
  });

  it("flags info that hasn't been checked in 90 days", () => {
    expect(checkedLabel("2026-10-28", "2026-11-01")).toEqual({ text: "Checked Oct 28", stale: false });
    expect(checkedLabel("2026-07-01", "2026-11-01").stale).toBe(true);
    expect(checkedLabel("2025-12-20", "2026-01-05")).toEqual({ text: "Checked Dec 20, 2025", stale: false });
    expect(checkedLabel(null, "2026-11-01")).toEqual({ text: "Never checked", stale: true });
  });

  it("splits comma lists", () => {
    expect(splitList(" Black, Navy , ,Black,Grey")).toEqual(["Black", "Navy", "Grey"]);
  });
});
