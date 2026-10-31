import { describe, expect, it } from "vitest";
import { NO_FILTERS, activeCount, filterableFields, matches, type Filterable, type Filters } from "./filters";
import type { ProductType } from "./product-types";
import { priceFor } from "./suppliers";

const hoodie: ProductType = {
  id: "hoodie",
  slug: "hoodie",
  name: "Hoodies",
  icon: "hoodie",
  fields: [
    { key: "fabric", label: "Fabric", kind: "text" },
    { key: "gsm", label: "GSM", kind: "number" },
    { key: "pilling", label: "Pilling", kind: "choice", options: ["5 – No pilling", "4 – Slight pilling"] },
    { key: "stretch", label: "Stretch", kind: "yesno" },
  ],
};
const types = [hoodie];

const breaks = [
  { minQty: 12, price: 16 },
  { minQty: 72, price: 14 },
];
const item = (over: Partial<Filterable> = {}): Filterable => ({
  typeId: "hoodie",
  specs: { gsm: 320, pilling: "4 – Slight pilling", stretch: "No", season: "Winter" },
  brandingMethods: ["Embroidery", "DTF transfer"],
  priceAt: (qty) => (qty === null ? 14 : priceFor(qty, breaks)),
  moq: 12,
  ...over,
});
const f = (over: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...over });

describe("matches", () => {
  it("passes everything with no filters", () => {
    expect(matches(item(), NO_FILTERS, types)).toBe(true);
    expect(activeCount(NO_FILTERS)).toBe(0);
  });

  it("filters by type, season and branding method", () => {
    expect(matches(item(), f({ typeId: "tshirt" }), types)).toBe(false);
    expect(matches(item(), f({ season: "Winter" }), types)).toBe(true);
    expect(matches(item(), f({ season: "Summer" }), types)).toBe(false);
    expect(matches(item({ specs: { season: "All-season" } }), f({ season: "Summer" }), types)).toBe(true);
    expect(matches(item(), f({ method: "Laser engraving" }), types)).toBe(false);
  });

  it("uses the price for the quantity, and checks the minimum order", () => {
    expect(matches(item(), f({ maxPrice: 15 }), types)).toBe(true); // cheapest is 14
    expect(matches(item(), f({ maxPrice: 15, qty: 24 }), types)).toBe(false); // 24 pay 16
    expect(matches(item(), f({ maxPrice: 15, qty: 100 }), types)).toBe(true);
    expect(matches(item(), f({ qty: 6 }), types)).toBe(false); // below the minimum of 12
    expect(matches(item({ priceAt: () => null }), f({ maxPrice: 50 }), types)).toBe(false);
  });

  it("filters stock", () => {
    expect(matches(item({ units: 0 }), f({ inStock: true }), types)).toBe(false);
    expect(matches(item({ units: 5, isLow: true }), f({ inStock: true, lowOnly: true }), types)).toBe(true);
  });

  it("filters on the chosen type's specs", () => {
    const heavy = f({ typeId: "hoodie", specs: { gsm: { min: 300 } } });
    expect(matches(item(), heavy, types)).toBe(true);
    expect(matches(item({ specs: { gsm: 250 } }), heavy, types)).toBe(false);
    expect(matches(item({ specs: {} }), heavy, types)).toBe(false);
    expect(matches(item(), f({ typeId: "hoodie", specs: { pilling: { equals: "5 – No pilling" } } }), types)).toBe(false);
    expect(matches(item(), f({ typeId: "hoodie", specs: { stretch: { yes: true } } }), types)).toBe(false);
    expect(activeCount(heavy)).toBe(2);
  });

  it("offers numbers, pick-lists and yes/no as spec filters", () => {
    expect(filterableFields(hoodie).map((x) => x.key)).toEqual(["gsm", "pilling", "stretch"]);
  });
});
