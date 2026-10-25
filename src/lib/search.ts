/**
 * Search & Site: Google Search Console queries matched to the keywords a
 * brand tracks. Positions are impression-weighted averages, as Search
 * Console reports them.
 */

export interface SearchRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface QueryStats {
  query: string;
  clicks: number;
  impressions: number;
  /** Average position, weighted by impressions. */
  position: number;
  /** The page that got the most impressions for it. */
  topPage: string;
}

export interface Keyword {
  id: string;
  keyword: string;
  group: string;
}

export type Badge = "top3" | "page1" | "page2" | "deeper" | "none";

export interface KeywordResult extends Keyword {
  clicks: number;
  impressions: number;
  position: number | null;
  previousPosition: number | null;
  /** Positive = moved up (a smaller position number). */
  movedUp: number | null;
  badge: Badge;
  topPage: string | null;
  /** Searches that counted towards this keyword, e.g. "calgary custom apparel". */
  variants: string[];
}

const STOPWORDS = new Set(["a", "an", "the", "in", "for", "of", "near", "me", "and", "&", "to"]);

/** Same words, any order, ignoring little words: "custom apparel in Calgary" = "calgary custom apparel". */
export function queryKey(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .sort()
    .join(" ");
}

export function byQuery(rows: SearchRow[]): QueryStats[] {
  const map = new Map<string, { clicks: number; impressions: number; weighted: number; pages: Map<string, number> }>();
  for (const r of rows) {
    const s = map.get(r.query) ?? { clicks: 0, impressions: 0, weighted: 0, pages: new Map() };
    s.clicks += r.clicks;
    s.impressions += r.impressions;
    s.weighted += r.position * r.impressions;
    s.pages.set(r.page, (s.pages.get(r.page) ?? 0) + r.impressions);
    map.set(r.query, s);
  }
  return [...map].map(([query, s]) => ({
    query,
    clicks: s.clicks,
    impressions: s.impressions,
    position: s.impressions ? s.weighted / s.impressions : 0,
    topPage: [...s.pages].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
  }));
}

export function badgeFor(position: number | null): Badge {
  if (position === null) return "none";
  if (position <= 3.5) return "top3";
  if (position <= 10.5) return "page1";
  if (position <= 20.5) return "page2";
  return "deeper";
}

function combine(list: QueryStats[]) {
  const impressions = list.reduce((t, q) => t + q.impressions, 0);
  if (!impressions) return null;
  const top = [...list].sort((a, b) => b.impressions - a.impressions)[0];
  return {
    clicks: list.reduce((t, q) => t + q.clicks, 0),
    impressions,
    position: list.reduce((t, q) => t + q.position * q.impressions, 0) / impressions,
    topPage: top.topPage,
  };
}

/** Each tracked keyword's numbers this period and its position last period. */
export function keywordResults(keywords: Keyword[], current: QueryStats[], previous: QueryStats[]): KeywordResult[] {
  return keywords.map((k) => {
    const key = queryKey(k.keyword);
    const cur = current.filter((q) => queryKey(q.query) === key);
    const now = combine(cur);
    const before = combine(previous.filter((q) => queryKey(q.query) === key));
    const position = now ? now.position : null;
    const previousPosition = before ? before.position : null;
    return {
      ...k,
      clicks: now?.clicks ?? 0,
      impressions: now?.impressions ?? 0,
      position,
      previousPosition,
      movedUp: position !== null && previousPosition !== null ? previousPosition - position : null,
      badge: badgeFor(position),
      topPage: now?.topPage ?? null,
      variants: cur.map((q) => q.query).filter((q) => q.toLowerCase() !== k.keyword.toLowerCase()),
    };
  });
}

/** Searches on page 2 (positions 11-20) that people actually saw: the easiest to push onto page 1. */
export function quickWins(current: QueryStats[], minImpressions = 5, limit = 8, exclude: Set<string> = new Set()): QueryStats[] {
  return current
    .filter((q) => !exclude.has(q.query))
    .filter((q) => q.position > 10.5 && q.position <= 20.5 && q.impressions >= minImpressions)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}

/** The searches Google showed the site for most that aren't on the keyword list. */
export function discovered(current: QueryStats[], keywords: Keyword[], limit = 12, exclude: Set<string> = new Set()): QueryStats[] {
  const tracked = new Set(keywords.map((k) => queryKey(k.keyword)));
  return current
    .filter((q) => !tracked.has(queryKey(q.query)) && !exclude.has(q.query))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}

/** "https://suqmedia.com/custom-apparel.html" → "/custom-apparel.html". */
export function shortPage(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || "") || "/";
  } catch {
    return url;
  }
}

/** The Weekly Review's one-line search summary. */
export interface SearchLine {
  clicks: number;
  tracked: number;
  onPage1: number;
  close: number;
  movedUp: number;
  movedDown: number;
}

export function searchLine(keywords: KeywordResult[], clicks: number): SearchLine {
  return {
    clicks,
    tracked: keywords.length,
    onPage1: keywords.filter((k) => k.badge === "top3" || k.badge === "page1").length,
    close: keywords.filter((k) => k.badge === "page2").length,
    movedUp: keywords.filter((k) => (k.movedUp ?? 0) >= 0.5).length,
    movedDown: keywords.filter((k) => (k.movedUp ?? 0) <= -0.5).length,
  };
}

/** Ways people type a brand name: "PeopleSuq" → "people suq", "peoplesuq"; "SUQ Media" → "suq media", "suqmedia". */
export function nameTerms(name: string): string[] {
  const spaced = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().trim();
  return [...new Set([queryKey(spaced), spaced.replace(/\s+/g, "")])].filter(Boolean);
}

function hasTerm(query: string, term: string) {
  const words = new Set(queryKey(query).split(" "));
  const termWords = term.split(" ");
  return termWords.every((w) => words.has(w)) || query.toLowerCase().replace(/\s+/g, "").includes(term.replace(/\s+/g, ""));
}

export interface Crossovers {
  /** Searches for another brand's name that showed this site. */
  otherBrand: { brand: string; queries: QueryStats[] }[];
  /** Searches only for a word both brand names share ("suq"): could be either. */
  shared: QueryStats[];
}

/**
 * Splits out searches meant for the other brand, so each brand's lists only
 * show searches meant for it. `others` maps brand name → its name terms.
 */
export function crossovers(current: QueryStats[], own: string[], others: { brand: string; terms: string[] }[]): Crossovers {
  const sharedWords = new Set(
    own.flatMap((t) => t.split(" ")).filter((w) => others.some((o) => o.terms.some((t) => t.split(" ").includes(w)))),
  );
  const isShared = (q: QueryStats) => {
    const words = queryKey(q.query).split(" ").filter(Boolean);
    return words.length > 0 && words.every((w) => sharedWords.has(w));
  };
  const isOwn = (q: QueryStats) => own.some((t) => hasTerm(q.query, t));
  const byImpressions = (a: QueryStats, b: QueryStats) => b.impressions - a.impressions;
  return {
    otherBrand: others
      .map((o) => ({ brand: o.brand, queries: current.filter((q) => !isShared(q) && !isOwn(q) && o.terms.some((t) => hasTerm(q.query, t))).sort(byImpressions) }))
      .filter((o) => o.queries.length),
    shared: current.filter(isShared).sort(byImpressions),
  };
}

/** Every query in a Crossovers result, for leaving them out of other lists. */
export function crossoverQueries(c: Crossovers): Set<string> {
  return new Set([...c.shared, ...c.otherBrand.flatMap((o) => o.queries)].map((q) => q.query));
}
