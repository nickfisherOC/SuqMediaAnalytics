import type { FunnelStepSpec, TileSpec } from "@/config/brands";
import { getMetric } from "@/config/metrics";
import { isPlatform, SOCIAL_PLATFORMS, type Platform } from "@/config/platforms";

/**
 * Brand settings edited in Settings: validating tiles and funnel steps, and
 * sensible starting tiles for a new brand from the platforms it uses.
 */

export const HEX = /^#[0-9a-fA-F]{6}$/;

/** "MKK Foundation" → "mkk-foundation". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // drop accents: é → e
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Keeps only tiles whose metric exists and whose platform the brand (and the metric) has. */
export function cleanSpecs<T extends TileSpec>(specs: unknown, platforms: Platform[], max: number): T[] {
  if (!Array.isArray(specs)) return [];
  const out: T[] = [];
  for (const raw of specs) {
    if (!raw || typeof raw !== "object") continue;
    const { metric, platform, label } = raw as Record<string, unknown>;
    if (typeof metric !== "string" || typeof platform !== "string") continue;
    let def;
    try {
      def = getMetric(metric);
    } catch {
      continue;
    }
    if (platform !== "all" && (!isPlatform(platform) || !platforms.includes(platform) || !def.platforms.includes(platform))) continue;
    if (platform === "all" && !def.platforms.some((p) => platforms.includes(p))) continue;
    const spec = { metric, platform, ...(typeof label === "string" && label.trim() ? { label: label.trim().slice(0, 40) } : {}) } as T;
    if (!out.some((s) => s.metric === spec.metric && s.platform === spec.platform)) out.push(spec);
    if (out.length >= max) break;
  }
  return out;
}

/** Starting Weekly Review tiles and funnel for a new brand, from its platforms. */
export function defaultTiles(platforms: Platform[]): { scoreboard: TileSpec[]; funnel: FunnelStepSpec[] } {
  const social = platforms.some((p) => (SOCIAL_PLATFORMS as readonly string[]).includes(p));
  const scoreboard: TileSpec[] = [];
  const funnel: FunnelStepSpec[] = [];
  if (social) {
    scoreboard.push({ metric: "followers", platform: "all", label: "Total followers" }, { metric: "views", platform: "all", label: "Total views" }, { metric: "engagements", platform: "all" });
    funnel.push({ metric: "views", platform: "all", label: "Views" });
  }
  if (platforms.includes("ga4")) {
    scoreboard.push({ metric: "site_sessions", platform: "ga4", label: "Website visits" });
    funnel.push({ metric: "site_sessions", platform: "ga4", label: "Website visits" });
  }
  if (platforms.includes("lead_rescue")) {
    scoreboard.push({ metric: "leads", platform: "lead_rescue" }, { metric: "deals_won", platform: "lead_rescue" });
    funnel.push({ metric: "leads", platform: "lead_rescue", label: "Leads" }, { metric: "quotes_sent", platform: "lead_rescue", label: "Quote sent" }, { metric: "deals_won", platform: "lead_rescue", label: "Won" });
  }
  if (platforms.includes("shopify")) {
    scoreboard.push({ metric: "orders", platform: "shopify" });
    funnel.push({ metric: "store_sessions_social", platform: "shopify", label: "Store visits from social" }, { metric: "add_to_cart", platform: "shopify", label: "Added to cart" }, { metric: "orders", platform: "shopify", label: "Orders" });
  }
  return { scoreboard: scoreboard.slice(0, 8), funnel: funnel.slice(0, 8) };
}
