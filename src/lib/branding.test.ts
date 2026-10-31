import { describe, expect, it } from "vitest";
import { locationSuggestions, methodsLabel, parseBranding, readAreas } from "./branding";

describe("parseBranding", () => {
  it("reads methods and logo spots, dropping rows without a location", () => {
    const fd = new FormData();
    for (const m of ["Embroidery", "DTF transfer", "Embroidery", " "]) fd.append("branding_method", m);
    for (const [l, s, m] of [
      ["Left chest", "4 × 4 in", "Embroidery"],
      ["", "12 × 14 in", ""],
      [" Full back ", " 12 × 14 in ", ""],
    ]) {
      fd.append("imprint_location", l);
      fd.append("imprint_size", s);
      fd.append("imprint_method", m);
    }
    expect(parseBranding(fd)).toEqual({
      methods: ["Embroidery", "DTF transfer"],
      areas: [
        { location: "Left chest", maxSize: "4 × 4 in", method: "Embroidery" },
        { location: "Full back", maxSize: "12 × 14 in", method: "" },
      ],
    });
  });
});

describe("helpers", () => {
  it("reads saved areas defensively", () => {
    expect(readAreas([{ location: "Barrel", maxSize: "40 × 8 mm" }, { nope: 1 }, null])).toEqual([{ location: "Barrel", maxSize: "40 × 8 mm", method: "" }]);
    expect(readAreas("x")).toEqual([]);
  });

  it("suggests spots by type", () => {
    expect(locationSuggestions("pen")).toEqual(["Barrel", "Clip", "Cap"]);
    expect(locationSuggestions("blankets")).toEqual(["Front", "Back", "Side", "Top"]);
  });

  it("shortens method lists for cards", () => {
    expect(methodsLabel([])).toBeNull();
    expect(methodsLabel(["Embroidery", "DTG (direct to garment)"])).toBe("Embroidery, DTG");
    expect(methodsLabel(["Embroidery", "Screen print", "DTF transfer", "Patch (woven, leather, PVC)"])).toBe("Embroidery, Screen print +2 more");
  });
});
