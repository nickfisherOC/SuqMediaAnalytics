import { describe, expect, it } from "vitest";
import { lowCells, normalizeSize, sortSizes, stockGrid, totalUnits, type StockCell } from "./inventory";

const cell = (colour: string, size: string, quantity: number): StockCell => ({ id: `${colour}-${size}`, colour, size, quantity });

describe("sizes", () => {
  it("normalizes common ways of writing a size", () => {
    expect(normalizeSize(" xxl ")).toBe("2XL");
    expect(normalizeSize("m")).toBe("M");
    expect(normalizeSize("Large")).toBe("L");
    expect(normalizeSize("One size")).toBe("One size");
  });

  it("sorts sizes in wearing order", () => {
    expect(sortSizes(["XL", "S", "3XL", "M", "XS", "2XL", "L"])).toEqual(["XS", "S", "M", "L", "XL", "2XL", "3XL"]);
    expect(sortSizes(["One size", "32", "M", "30"])).toEqual(["M", "30", "32", "One size"]);
  });
});

describe("stock", () => {
  const stock = [cell("Black", "L", 4), cell("Black", "S", 0), cell("Grey", "M", 12), cell("Black", "M", 2)];

  it("builds a colour × size grid", () => {
    const g = stockGrid(stock);
    expect(g.colours).toEqual(["Black", "Grey"]);
    expect(g.sizes).toEqual(["S", "M", "L"]);
    expect(g.cell("Grey", "M")?.quantity).toBe(12);
    expect(g.cell("Grey", "S")).toBeUndefined();
  });

  it("totals units and finds low stock", () => {
    expect(totalUnits(stock)).toBe(18);
    expect(lowCells(stock, 2).map((c) => c.id)).toEqual(["Black-S", "Black-M"]);
    expect(lowCells(stock, 0)).toEqual([]);
  });
});
