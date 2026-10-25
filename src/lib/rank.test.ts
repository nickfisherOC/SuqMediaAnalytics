import { describe, expect, it } from "vitest";
import { brandHosts, latestRanks, readSerp, type SerpItem } from "./rank";

const organic = (rank: number, domain: string): SerpItem => ({ type: "organic", rank_group: rank, domain, url: `https://${domain}/`, title: domain });

describe("rank checks", () => {
  it("finds the brand's position and who is above it", () => {
    const r = readSerp(
      [
        { type: "local_pack", rank_group: 1, title: "Garment Express", domain: "garmentexpress.ca" },
        { type: "local_pack", rank_group: 2, title: "Suq Media", domain: "suqmedia.com" },
        organic(1, "www.merchexpresscanada.ca"),
        organic(2, "madmonkeyapparel.ca"),
        organic(3, "www.suqmedia.com"),
        organic(4, "other.ca"),
      ],
      ["suqmedia.com"],
      "SUQ Media",
    );
    expect(r.position).toBe(3);
    expect(r.above.map((a) => a.domain)).toEqual(["www.merchexpresscanada.ca", "madmonkeyapparel.ca"]);
    expect(r).toMatchObject({ mapPack: true, mapRank: 2 });
  });

  it("lists the top results when the brand isn't in the top 100", () => {
    const r = readSerp([organic(1, "a.ca"), organic(2, "b.ca")], ["suqmedia.com"], "SUQ Media");
    expect(r).toMatchObject({ position: null, url: null, mapPack: false, mapRank: null });
    expect(r.above).toHaveLength(2);
  });

  it("reads the brand's host", () => {
    expect(brandHosts("https://www.suqmedia.com")).toEqual(["suqmedia.com"]);
    expect(brandHosts(null)).toEqual([]);
  });

  it("keeps the latest check per keyword and city, with the one before for movement", () => {
    const row = (keyword: string, city: string, checked_on: string, position: number | null) => ({ keyword, city, checked_on, position, url: null, above: [], map_pack: false, map_rank: null });
    const { byKeyword, checkedOn } = latestRanks([
      row("Custom Hoodies Calgary", "Calgary,Alberta,Canada", "2026-10-24", 60),
      row("custom hoodies calgary", "Calgary,Alberta,Canada", "2026-10-31", 52),
      row("custom hoodies calgary", "Edmonton,Alberta,Canada", "2026-10-31", null),
    ]);
    expect(checkedOn).toBe("2026-10-31");
    expect(byKeyword.get("custom hoodies calgary")).toEqual([
      expect.objectContaining({ city: "Edmonton", position: null, previous: undefined }),
      expect.objectContaining({ city: "Calgary", position: 52, previous: 60 }),
    ]);
  });
});
