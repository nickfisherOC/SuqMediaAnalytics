import { SPIKE_SESSIONS } from "@/lib/connectors/shopify";

/**
 * Website visits by city, with bot traffic left out: towns that host big
 * data centres (Google, Meta, Amazon), and one-day spikes from a city
 * outside Canada (the same rule Pulse uses for Shopify visits).
 */

export const DATA_CENTRE_CITIES = new Set([
  "Council Bluffs", // Google
  "The Dalles", // Google
  "Moncks Corner", // Google
  "Lenoir", // Google
  "Prineville", // Meta
  "Forest City", // Meta
  "Altoona", // Meta
  "Papillion", // Meta
  "Boardman", // Amazon
  "Ashburn", // Amazon
]);

export interface CityDay {
  date: string;
  city: string;
  /** Unknown for rows synced before countries were recorded. */
  country: string | null;
  sessions: number;
}

/** `excluded`: cities an admin marked as bots for this site (account settings.excluded_cities). */
export function cityBreakdown(rows: CityDay[], limit = 8, excluded: string[] = []) {
  const always = new Set(excluded);
  const isBot = (r: CityDay) =>
    DATA_CENTRE_CITIES.has(r.city) ||
    always.has(r.city) || (r.country !== null && r.country !== "Canada" && r.sessions >= SPIKE_SESSIONS);
  const kept = new Map<string, number>();
  const leftOut = new Map<string, number>();
  for (const r of rows) {
    const target = isBot(r) ? leftOut : kept;
    target.set(r.city, (target.get(r.city) ?? 0) + r.sessions);
  }
  const ranked = (m: Map<string, number>) => [...m].map(([label, sessions]) => ({ label, sessions })).filter((x) => x.sessions > 0).sort((a, b) => b.sessions - a.sessions);
  const out = ranked(leftOut);
  return { cities: ranked(kept).slice(0, limit), botVisits: out.reduce((t, c) => t + c.sessions, 0), botCities: out.map((c) => c.label) };
}
