import { describe, expect, it } from "vitest";
import { badgeFor, byQuery, crossoverQueries, crossovers, discovered, nameTerms, keywordResults, queryKey, quickWins, searchLine, shortPage } from "./search";

const row = (query: string, impressions: number, position: number, clicks = 0, page = "https://suqmedia.com/") => ({ query, page, clicks, impressions, position });

describe("search", () => {
  it("treats word order and little words as the same search", () => {
    expect(queryKey("Custom apparel in Calgary")).toBe(queryKey("calgary custom apparel"));
    expect(queryKey("custom hoodies near me")).toBe(queryKey("custom hoodies"));
    expect(queryKey("custom apparel edmonton")).not.toBe(queryKey("custom apparel calgary"));
  });

  it("weights positions by impressions and finds the top page", () => {
    const [q] = byQuery([row("suq media", 10, 1), row("suq media", 30, 3, 2, "https://suqmedia.com/about")]);
    expect(q).toMatchObject({ clicks: 2, impressions: 40, position: 2.5, topPage: "https://suqmedia.com/about" });
  });

  it("badges positions", () => {
    expect([badgeFor(1.2), badgeFor(7), badgeFor(14), badgeFor(52), badgeFor(null)]).toEqual(["top3", "page1", "page2", "deeper", "none"]);
  });

  it("matches tracked keywords, including variants, and compares with last period", () => {
    const current = byQuery([row("custom apparel calgary", 20, 12), row("calgary custom apparel", 20, 8, 1)]);
    const previous = byQuery([row("custom apparel calgary", 10, 15)]);
    const [k, missing] = keywordResults(
      [
        { id: "1", keyword: "custom apparel calgary", group: "Local" },
        { id: "2", keyword: "custom apparel alberta", group: "Local" },
      ],
      current,
      previous,
    );
    expect(k).toMatchObject({ position: 10, previousPosition: 15, movedUp: 5, badge: "page1", impressions: 40, clicks: 1, variants: ["calgary custom apparel"] });
    expect(missing).toMatchObject({ position: null, badge: "none", impressions: 0 });
  });

  it("finds page-2 quick wins and untracked searches", () => {
    const current = byQuery([row("custom hoodies calgary", 37, 15), row("rare search", 2, 14), row("suq media", 278, 1.3), row("podcast studio calgary", 29, 55)]);
    expect(quickWins(current).map((q) => q.query)).toEqual(["custom hoodies calgary"]);
    expect(discovered(current, [{ id: "1", keyword: "Suq Media", group: "Brand" }]).map((q) => q.query)).toEqual(["custom hoodies calgary", "podcast studio calgary", "rare search"]);
  });

  it("summarizes for the Weekly Review", () => {
    const ks = keywordResults(
      [
        { id: "1", keyword: "a b", group: "x" },
        { id: "2", keyword: "c d", group: "x" },
        { id: "3", keyword: "e f", group: "x" },
      ],
      byQuery([row("a b", 5, 2), row("c d", 5, 15)]),
      byQuery([row("a b", 5, 4), row("c d", 5, 12)]),
    );
    expect(searchLine(ks, 7)).toEqual({ clicks: 7, tracked: 3, onPage1: 1, close: 1, movedUp: 1, movedDown: 1 });
  });

  it("shortens page links", () => {
    expect(shortPage("https://suqmedia.com/custom-apparel.html")).toBe("/custom-apparel.html");
    expect(shortPage("https://suqmedia.com/")).toBe("/");
  });
});

describe("brand name crossover", () => {
  it("splits out searches for the other brand and the shared name", () => {
    const current = byQuery([row("suq media", 278, 1.3), row("suq", 219, 8), row("people suq", 25, 7.6), row("peoplesuq podcast", 3, 9), row("custom hoodies calgary", 37, 52)]);
    const c = crossovers(current, nameTerms("SUQ Media"), [{ brand: "PeopleSuq", terms: nameTerms("PeopleSuq") }]);
    expect(c.otherBrand).toHaveLength(1);
    expect(c.otherBrand[0].brand).toBe("PeopleSuq");
    expect(c.otherBrand[0].queries.map((q) => q.query)).toEqual(["people suq", "peoplesuq podcast"]);
    expect(c.shared.map((q) => q.query)).toEqual(["suq"]);
    const ex = crossoverQueries(c);
    expect(discovered(current, [{ id: "1", keyword: "suq media", group: "Brand" }], 12, ex).map((q) => q.query)).toEqual(["custom hoodies calgary"]);
  });

  it("reads brand names both ways", () => {
    expect(nameTerms("PeopleSuq")).toEqual(["people suq", "peoplesuq"]);
    expect(nameTerms("SUQ Media")).toContain("suqmedia");
  });
});
