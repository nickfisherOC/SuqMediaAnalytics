import { describe, expect, it } from "vitest";
import { fieldsFor, formatSpec, gsmToOz, keyFor, parseCustomFields, parseSpecs, specHighlights, type ProductType } from "./product-types";

const hoodie: ProductType = {
  id: "t1",
  slug: "hoodie",
  name: "Hoodies",
  icon: "hoodie",
  fields: [
    { key: "gsm", label: "GSM", kind: "number", unit: "GSM" },
    { key: "pilling", label: "Pilling", kind: "choice", options: ["5 – No pilling", "4 – Slight pilling"] },
    { key: "stretch", label: "Stretch", kind: "yesno" },
    { key: "fabric", label: "Fabric", kind: "text" },
    { key: "fit", label: "Fit", kind: "choice", options: ["Classic"] },
  ],
};

describe("fields", () => {
  it("adds the common fields after the type's own", () => {
    expect(fieldsFor(hoodie).map((f) => f.key)).toEqual(["gsm", "pilling", "stretch", "fabric", "fit", "season"]);
    expect(fieldsFor(null).map((f) => f.key)).toEqual(["season"]);
  });

  it("makes keys from labels", () => {
    expect(keyFor("Zipper brand")).toBe("zipper_brand");
    expect(keyFor("  Lead-free? ")).toBe("lead_free");
    expect(keyFor("!!!")).toBe("field");
  });
});

describe("parseSpecs", () => {
  const fields = fieldsFor(hoodie);
  it("keeps valid values of each kind and drops the rest", () => {
    const specs = parseSpecs(
      [
        ["spec:gsm", "1,320"],
        ["spec:pilling", "4 – Slight pilling"],
        ["spec:stretch", "Yes"],
        ["spec:fabric", "  80/20 cotton poly "],
        ["spec:fit", "Made up"],
        ["spec:season", ""],
        ["spec:unknown", "x"],
        ["name", "Hoodie"],
      ],
      fields,
    );
    expect(specs).toEqual({ gsm: 1320, pilling: "4 – Slight pilling", stretch: "Yes", fabric: "80/20 cotton poly" });
  });

  it("keeps an old choice that isn't in the list any more", () => {
    expect(parseSpecs([["spec:fit", "Women's"]], fields, { fit: "Women's" })).toEqual({ fit: "Women's" });
  });
});

describe("custom fields", () => {
  it("pairs labels with values and drops unlabelled rows", () => {
    expect(parseCustomFields(["Zipper", "", " Lead-free "], ["YKK", "orphan", "Yes"])).toEqual([
      { label: "Zipper", value: "YKK" },
      { label: "Lead-free", value: "Yes" },
    ]);
  });
});

describe("display", () => {
  it("formats GSM with ounces and numbers with units", () => {
    expect(gsmToOz(271)).toBe(8);
    expect(formatSpec(hoodie.fields[0], 320)).toBe("320 GSM (9.4 oz)");
    expect(formatSpec({ key: "capacity_l", label: "Capacity", kind: "number", unit: "L" }, 25)).toBe("25 L");
    expect(formatSpec(hoodie.fields[3], undefined)).toBeNull();
  });

  it("picks short highlights for cards", () => {
    expect(specHighlights(hoodie, { gsm: 320, fabric: "cotton", stretch: "Yes", pilling: "5 – No pilling", season: "Winter" })).toEqual([
      "320 GSM",
      "5 – No pilling",
      "Stretch",
    ]);
  });
});
