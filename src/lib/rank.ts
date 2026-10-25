/**
 * Reading a Google results page from DataForSEO: where the brand's site
 * ranks, who is above it, and whether it shows in the Google Maps box.
 */

export const RANK_CITIES = ["Edmonton,Alberta,Canada", "Calgary,Alberta,Canada"] as const;
export const cityLabel = (location: string) => location.split(",")[0];

/** How deep each check looks: positions past this show as "not in the top 100". */
export const RANK_DEPTH = 100;

export interface SerpItem {
  type: string;
  rank_group?: number;
  domain?: string;
  url?: string;
  title?: string;
  items?: { type?: string; rank_group?: number; domain?: string; title?: string; url?: string }[];
}

export interface RankResult {
  position: number | null;
  url: string | null;
  above: { rank: number; domain: string; title: string; url: string }[];
  mapPack: boolean;
  mapRank: number | null;
}

const isOwn = (domain: string | undefined, hosts: string[]) => {
  const d = (domain ?? "").toLowerCase().replace(/^www\./, "");
  return hosts.some((h) => d === h || d.endsWith(`.${h}`));
};

/** `hosts`: the brand's site, e.g. ["suqmedia.com"]. `name`: matched against Maps listings, e.g. "SUQ Media". */
export function readSerp(items: SerpItem[], hosts: string[], name: string): RankResult {
  const organic = items.filter((i) => i.type === "organic" && i.rank_group);
  const own = organic.find((i) => isOwn(i.domain, hosts));
  const position = own?.rank_group ?? null;
  const above = organic
    .filter((i) => !isOwn(i.domain, hosts) && (position === null || (i.rank_group ?? 0) < position))
    .slice(0, 5)
    .map((i) => ({ rank: i.rank_group ?? 0, domain: i.domain ?? "", title: i.title ?? "", url: i.url ?? "" }));

  const pack = items.find((i) => i.type === "local_pack" || i.type === "maps");
  const packItems = items.filter((i) => i.type === "local_pack");
  const listings = packItems.length ? packItems : (pack?.items ?? []);
  const target = name.toLowerCase().replace(/\s+/g, "");
  const ours = listings.find((l) => isOwn(l.domain, hosts) || (l.title ?? "").toLowerCase().replace(/\s+/g, "").includes(target));
  return { position, url: own?.url ?? null, above, mapPack: listings.length > 0, mapRank: ours?.rank_group ?? null };
}

/** The site's host from a brand's website setting: "https://suqmedia.com" → ["suqmedia.com"]. */
export function brandHosts(website: string | null): string[] {
  if (!website) return [];
  try {
    return [new URL(website).host.replace(/^www\./, "")];
  } catch {
    return [];
  }
}

export interface CityRank {
  city: string;
  position: number | null;
  previous: number | null | undefined;
  mapPack: boolean;
  mapRank: number | null;
  above: RankResult["above"];
  url: string | null;
}

export interface RankCheckRow {
  keyword: string;
  city: string;
  checked_on: string;
  position: number | null;
  url: string | null;
  above: RankResult["above"] | null;
  map_pack: boolean | null;
  map_rank: number | null;
}

/** Latest check per keyword and city, with the position from the check before it (undefined = no earlier check). */
export function latestRanks(rows: RankCheckRow[]): { byKeyword: Map<string, CityRank[]>; checkedOn: string | null } {
  const sorted = [...rows].sort((a, b) => b.checked_on.localeCompare(a.checked_on));
  const byKeyword = new Map<string, CityRank[]>();
  for (const city of RANK_CITIES) {
    const keys = new Set(sorted.filter((r) => r.city === city).map((r) => r.keyword.toLowerCase()));
    for (const k of keys) {
      const mine = sorted.filter((r) => r.city === city && r.keyword.toLowerCase() === k);
      const [now, ...older] = mine;
      const before = older.find((r) => r.checked_on !== now.checked_on);
      byKeyword.set(k, [
        ...(byKeyword.get(k) ?? []),
        { city: cityLabel(city), position: now.position, previous: before ? before.position : undefined, mapPack: !!now.map_pack, mapRank: now.map_rank, above: now.above ?? [], url: now.url },
      ]);
    }
  }
  return { byKeyword, checkedOn: sorted[0]?.checked_on ?? null };
}
