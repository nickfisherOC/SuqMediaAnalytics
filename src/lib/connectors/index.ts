import type { Platform } from "@/config/platforms";
import { leadRescue } from "./lead-rescue";
import { facebookPage, instagram, metaAds } from "./meta";
import { shopify } from "./shopify";
import type { Connector } from "./types";

/** One connector per data source. Google and TikTok arrive with their own connect flows. */
export const CONNECTORS: Partial<Record<Platform, Connector>> = {
  facebook: facebookPage,
  instagram,
  meta_ads: metaAds,
  shopify,
  lead_rescue: leadRescue,
};
