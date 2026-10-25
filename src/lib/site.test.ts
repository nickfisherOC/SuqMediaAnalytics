import { describe, expect, it } from "vitest";
import { isInternalSource, ownHosts } from "@/lib/connectors/google";
import { cityBreakdown } from "./site";

describe("site visits", () => {
  it("treats the brand's own shop and testing tools as internal", () => {
    const own = ownHosts("People Suq (https://peoplesuq.com)");
    expect(own).toEqual(["peoplesuq.com"]);
    expect(isInternalSource("0i9uvm-p2.myshopify.com / referral", own)).toBe(true);
    expect(isInternalSource("merch.peoplesuq.com / referral", own)).toBe(true);
    expect(isInternalSource("tagassistant.google.com / referral", own)).toBe(true);
    expect(isInternalSource("127.0.0.1:8767 / referral", own)).toBe(true);
    expect(isInternalSource("facebook.com / referral", own)).toBe(false);
    expect(isInternalSource("google / organic", own)).toBe(false);
  });

  it("leaves out data-centre towns and one-day spikes from outside Canada", () => {
    const r = cityBreakdown([
      { date: "2026-10-01", city: "Calgary", country: "Canada", sessions: 30 },
      { date: "2026-10-01", city: "Council Bluffs", country: "United States", sessions: 3 },
      { date: "2026-10-02", city: "Andover", country: "United States", sessions: 40 },
      { date: "2026-10-03", city: "Andover", country: "United States", sessions: 2 },
      { date: "2026-10-01", city: "Vancouver", country: "Canada", sessions: 12 },
      { date: "2026-10-01", city: "Old row", country: null, sessions: 15 },
    ]);
    expect(r.cities.map((c) => [c.label, c.sessions])).toEqual([
      ["Calgary", 30],
      ["Old row", 15],
      ["Vancouver", 12],
      ["Andover", 2],
    ]);
    expect(r.botVisits).toBe(43);
    expect(r.botCities).toEqual(["Andover", "Council Bluffs"]);
  });
});
