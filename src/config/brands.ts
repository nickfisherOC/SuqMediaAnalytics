import type { Platform } from "./platforms";

/**
 * Brand settings. These are the defaults the database is seeded with; once
 * seeded, the `brands` table is the source of truth and admins edit brands
 * there. Adding a brand (e.g. MKK Foundation) is a new row, not a code change.
 */

export interface TileSpec {
  metric: string;
  /** "all" combines every platform of the brand that reports this metric. */
  platform: Platform | "all";
  /** Overrides the metric's label on the tile. */
  label?: string;
}

export interface FunnelStepSpec {
  metric: string;
  platform: Platform | "all";
  label: string;
}

export interface BrandSettings {
  /** Database id; absent for the built-in defaults. */
  id?: string;
  slug: string;
  name: string;
  /** Used where space is tight (phone control bar). */
  shortName: string;
  website: string | null;
  /** Accent for UI chrome (brand chip, headings). Never used as a chart series colour. */
  accent: { light: string; dark: string };
  /** Platforms this brand uses, in display order. */
  platforms: Platform[];
  cadence: { postsPerWeek: number };
  scoreboard: TileSpec[];
  funnel: FunnelStepSpec[];
  active: boolean;
}

export const DEFAULT_BRANDS: BrandSettings[] = [
  {
    slug: "peoplesuq",
    name: "PeopleSuq",
    shortName: "PeopleSuq",
    website: "https://peoplesuq.com",
    // From peoplesuq.com: purple-500 on bone, purple-400 on ink.
    accent: { light: "#7b2ff0", dark: "#9257f7" },
    platforms: ["instagram", "facebook", "tiktok", "youtube", "ga4", "search_console", "shopify"],
    cadence: { postsPerWeek: 7 },
    scoreboard: [
      { metric: "followers", platform: "all", label: "Total followers" },
      { metric: "views", platform: "all", label: "Total views" },
      { metric: "engagements", platform: "all" },
      { metric: "link_clicks", platform: "all", label: "Link clicks to site" },
      { metric: "store_sessions_social", platform: "shopify", label: "Store visits from social" },
      { metric: "orders", platform: "shopify" },
    ],
    funnel: [
      { metric: "views", platform: "all", label: "Views" },
      { metric: "profile_visits", platform: "all", label: "Profile visits" },
      { metric: "link_clicks", platform: "all", label: "Link clicks" },
      { metric: "store_sessions_social", platform: "shopify", label: "Store visits from social" },
      { metric: "add_to_cart", platform: "shopify", label: "Added to cart" },
      { metric: "reached_checkout", platform: "shopify", label: "Reached checkout" },
      { metric: "orders", platform: "shopify", label: "Orders" },
    ],
    active: true,
  },
  {
    slug: "suq-media",
    name: "SUQ Media",
    shortName: "SUQ",
    website: "https://suqmedia.com",
    // suqmedia.com is black and bone; teal is a placeholder accent until we pick one together.
    accent: { light: "#0f766e", dark: "#2dd4bf" },
    platforms: ["facebook", "instagram", "meta_ads", "ga4", "search_console", "lead_rescue"],
    cadence: { postsPerWeek: 3 },
    scoreboard: [
      { metric: "ad_spend", platform: "meta_ads" },
      { metric: "leads", platform: "lead_rescue" },
      { metric: "cost_per_lead", platform: "all" },
      { metric: "quotes_sent", platform: "lead_rescue" },
      { metric: "deals_won", platform: "lead_rescue" },
      { metric: "revenue_won", platform: "lead_rescue" },
      { metric: "speed_to_first_contact", platform: "lead_rescue" },
      { metric: "followers", platform: "all" },
    ],
    funnel: [
      { metric: "ad_impressions", platform: "meta_ads", label: "Ad impressions" },
      { metric: "ad_clicks", platform: "meta_ads", label: "Ad clicks" },
      { metric: "site_sessions", platform: "ga4", label: "Landing page visits" },
      { metric: "leads", platform: "lead_rescue", label: "Leads" },
      { metric: "leads_contacted", platform: "lead_rescue", label: "Contacted" },
      { metric: "quotes_sent", platform: "lead_rescue", label: "Quote sent" },
      { metric: "deals_won", platform: "lead_rescue", label: "Won" },
    ],
    active: true,
  },
];
