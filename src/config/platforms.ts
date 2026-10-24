/**
 * Every data source Pulse can connect. Social platforms get a fixed chart
 * colour slot (validated as a set for colour-blind separation in both themes);
 * a platform keeps its colour on every chart, whatever else is on screen.
 */

export const PLATFORMS = [
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
  "meta_ads",
  "ga4",
  "search_console",
  "shopify",
  "lead_rescue",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const SOCIAL_PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"] as const satisfies readonly Platform[];
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export interface PlatformInfo {
  label: string;
  /** What the source is, in one line, for the Connections page. */
  description: string;
  /** Index into the categorical chart palette (1-based), social platforms only. */
  seriesSlot?: 1 | 2 | 3 | 4;
}

export const PLATFORM_INFO: Record<Platform, PlatformInfo> = {
  facebook: { label: "Facebook", description: "Page followers, views, engagement and posts", seriesSlot: 1 },
  instagram: { label: "Instagram", description: "Followers, reels, views, interactions and profile visits", seriesSlot: 2 },
  tiktok: { label: "TikTok", description: "Followers and per-video views, likes, comments and shares", seriesSlot: 3 },
  youtube: { label: "YouTube", description: "Subscribers, Shorts and videos, views and retention", seriesSlot: 4 },
  meta_ads: { label: "Meta Ads", description: "Spend, reach, clicks and leads by campaign, ad set and ad" },
  ga4: { label: "Google Analytics", description: "Site sessions by source, landing page, device and location" },
  search_console: { label: "Search Console", description: "Google search clicks, impressions and positions" },
  shopify: { label: "Shopify", description: "Store sessions, add to cart, checkout and orders" },
  lead_rescue: { label: "Lead Rescue", description: "Quote leads, pipeline stages and deals won" },
};

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}
