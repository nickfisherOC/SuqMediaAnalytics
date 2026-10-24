import type { Platform } from "@/config/platforms";
import { ga4, searchConsole, youtube } from "./google";
import { leadRescue } from "./lead-rescue";
import { facebookPage, instagram, metaAds } from "./meta";
import { shopify } from "./shopify";
import type { Connector } from "./types";

/** One connector per data source. TikTok arrives with its own connect flow. */
export const CONNECTORS: Partial<Record<Platform, Connector>> = {
  facebook: facebookPage,
  instagram,
  meta_ads: metaAds,
  shopify,
  lead_rescue: leadRescue,
  ga4,
  search_console: searchConsole,
  youtube,
};
