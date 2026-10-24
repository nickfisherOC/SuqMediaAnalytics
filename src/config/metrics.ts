import type { Platform } from "./platforms";

/**
 * The metric dictionary. Every number Pulse shows is defined here exactly
 * once: what it means in plain English, where it comes from, how it adds up
 * over days and across platforms, and what to be careful about.
 *
 * How a metric rolls up over a date range:
 *  - "sum"   daily totals, added up (views, link clicks, spend)
 *  - "last"  a running counter; the value on the last day with data (followers)
 *  - "ratio" built from other metrics' sums, so it is exact over any range
 *            (cost per lead = spend ÷ leads, never an average of daily CPLs)
 */

export type Unit = "count" | "currency" | "percent" | "minutes" | "position";

export type MetricKind =
  /** One value per day describing that day's activity. */
  | "daily_total"
  /** A running total the platform overwrites; we snapshot it daily. */
  | "lifetime_counter"
  /** Computed from other metrics. */
  | "derived";

export interface MetricRef {
  metric: string;
  /** Restrict to one platform's rows; omit to use every platform of the brand. */
  platform?: Platform;
}

interface BaseMetric {
  key: string;
  label: string;
  /** Plain-English definition, shown on hover next to every number. */
  definition: string;
  unit: Unit;
  kind: MetricKind;
  /** Null for numbers that are a choice rather than a result (ad spend): their changes are shown as neutral. */
  higherIsBetter: boolean | null;
  /** Where the number comes from. */
  platforms: Platform[];
  /**
   * Whether the same metric means the same thing on every platform. When
   * false, Pulse still shows a combined total but marks it as a rough sum and
   * never ranks one platform against another on it.
   */
  comparableAcrossPlatforms: boolean;
  /** General caveats. */
  caveats?: string[];
  /** Caveats that only apply to one platform's version of the number. */
  platformCaveats?: Partial<Record<Platform, string>>;
}

export interface SummedMetric extends BaseMetric {
  aggregation: "sum" | "last";
}

export interface RatioMetric extends BaseMetric {
  aggregation: "ratio";
  kind: "derived";
  numerator: MetricRef[];
  denominator: MetricRef[];
  /** 100 for percentages, 1000 for per-thousand. */
  multiplier?: number;
}

export type MetricDef = SummedMetric | RatioMetric;

const SOCIAL: Platform[] = ["facebook", "instagram", "tiktok", "youtube"];

const META_DAYS = "Meta counts days in Pacific time, one hour behind Edmonton.";

const VIEWS_CAVEATS: Partial<Record<Platform, string>> = {
  facebook: `Facebook counts every view of the Page that day, including old posts and views from ads. ${META_DAYS}`,
  instagram: `Instagram counts every view of the account that day, including old posts. ${META_DAYS}`,
  tiktok: "TikTok only reports lifetime views per video. Pulse works out daily views from the change in each video's total.",
  youtube: "Channel views per day from YouTube Analytics, which can revise the last 2–3 days.",
};

export const METRICS: MetricDef[] = [
  // ── Audience ────────────────────────────────────────────────────────────
  {
    key: "followers",
    label: "Followers",
    definition: "People following the account at the end of the day (subscribers on YouTube).",
    unit: "count",
    kind: "lifetime_counter",
    aggregation: "last",
    higherIsBetter: true,
    platforms: SOCIAL,
    comparableAcrossPlatforms: true,
    caveats: ["Instagram and TikTok don't report lost followers until an account passes 100 followers."],
    platformCaveats: {
      instagram: "Instagram doesn't share past follower counts, so its history starts the day Pulse connected (Oct 24, 2026).",
    },
  },

  // ── Reach and attention ─────────────────────────────────────────────────
  {
    key: "views",
    label: "Views",
    definition: "Times your content was seen that day.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: SOCIAL,
    comparableAcrossPlatforms: false,
    caveats: ["Each platform counts a view differently, so the combined total is a rough sum."],
    platformCaveats: VIEWS_CAVEATS,
  },
  {
    key: "watch_minutes",
    label: "Watch time",
    definition: "Total minutes people spent watching your videos that day.",
    unit: "minutes",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["facebook", "youtube"],
    comparableAcrossPlatforms: true,
    caveats: ["Instagram and TikTok don't report account-level watch time."],
  },

  // ── Engagement ─────────────────────────────────────────────────────────
  {
    key: "engagements",
    label: "Engagement",
    definition: "Likes, comments, shares and saves added together.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: SOCIAL,
    comparableAcrossPlatforms: true,
    platformCaveats: {
      youtube: "YouTube doesn't report saves.",
      facebook: "Facebook is reactions plus comments. It doesn't report shares by day, so this runs below Meta Business Suite.",
    },
  },
  {
    key: "likes",
    label: "Likes",
    definition: "Likes (and reactions on Facebook).",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: SOCIAL,
    comparableAcrossPlatforms: true,
  },
  {
    key: "comments",
    label: "Comments",
    definition: "New comments on your posts.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: SOCIAL,
    comparableAcrossPlatforms: true,
  },
  {
    key: "shares",
    label: "Shares",
    definition: "Times people shared or sent your posts.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: SOCIAL,
    comparableAcrossPlatforms: true,
  },
  {
    key: "saves",
    label: "Saves",
    definition: "Times people saved your posts.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["instagram", "tiktok"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "engagement_rate",
    label: "Engagement rate",
    definition: "Engagement as a share of views.",
    unit: "percent",
    kind: "derived",
    aggregation: "ratio",
    numerator: [{ metric: "engagements" }],
    denominator: [{ metric: "views" }],
    multiplier: 100,
    higherIsBetter: true,
    platforms: SOCIAL,
    comparableAcrossPlatforms: false,
    caveats: ["Depends on views, which each platform counts differently."],
  },

  // ── Social → site ──────────────────────────────────────────────────────
  {
    key: "profile_visits",
    label: "Profile visits",
    definition: "Times people opened your profile or Page.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["facebook", "instagram"],
    caveats: ["TikTok's API doesn't report profile views."],
    comparableAcrossPlatforms: true,
  },
  {
    key: "link_clicks",
    label: "Link clicks",
    definition: "Taps on the link in your bio, profile or post.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["instagram"],
    comparableAcrossPlatforms: true,
    caveats: [
      "Instagram only: Facebook doesn't report link clicks for Pages any more. Use store visits from social to see the full picture.",
      "Counts taps on the website link in the profile. Meta Business Suite also counts clicks from ads, so its number is higher.",
    ],
  },
  {
    key: "posts_published",
    label: "Posts published",
    definition: "Posts, reels, Shorts and videos published that day.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: SOCIAL,
    comparableAcrossPlatforms: true,
  },

  // ── Site (GA4) ─────────────────────────────────────────────────────────
  {
    key: "site_sessions",
    label: "Site sessions",
    definition: "Visits to the website, from Google Analytics.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["ga4"],
    comparableAcrossPlatforms: true,
    caveats: ["Excludes traffic Pulse has flagged as likely test or bot visits, unless you include it."],
  },
  {
    key: "site_sessions_social",
    label: "Site sessions from social",
    definition: "Website visits that came from Facebook, Instagram, TikTok or YouTube.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["ga4"],
    comparableAcrossPlatforms: true,
  },

  // ── Store (Shopify) ────────────────────────────────────────────────────
  {
    key: "store_sessions",
    label: "Store sessions",
    definition: "Visits to the online store, from Shopify.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["shopify"],
    comparableAcrossPlatforms: true,
    caveats: [
      "Shopify and Google Analytics count visits differently, so they won't match exactly.",
      "Pulse leaves out sudden spikes from one city outside Canada (bots and Meta's link checker). They're listed under Still to fix.",
    ],
  },
  {
    key: "store_sessions_social",
    label: "Store sessions from social",
    definition: "Store visits that came from a social platform.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["shopify"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "add_to_cart",
    label: "Added to cart",
    definition: "Store sessions where someone added a product to their cart.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["shopify"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "reached_checkout",
    label: "Reached checkout",
    definition: "Store sessions that got to the checkout page.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["shopify"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "orders",
    label: "Orders",
    definition: "Paid store orders. Test orders are left out.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["shopify"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "store_revenue",
    label: "Store revenue",
    definition: "Total sales from store orders, before refunds, in CAD.",
    unit: "currency",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["shopify"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "store_conversion_rate",
    label: "Store conversion rate",
    definition: "Orders as a share of store sessions.",
    unit: "percent",
    kind: "derived",
    aggregation: "ratio",
    numerator: [{ metric: "orders" }],
    denominator: [{ metric: "store_sessions" }],
    multiplier: 100,
    higherIsBetter: true,
    platforms: ["shopify"],
    comparableAcrossPlatforms: true,
  },

  // ── Search (Search Console) ────────────────────────────────────────────
  {
    key: "search_clicks",
    label: "Search clicks",
    definition: "Clicks to your site from Google search results.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["search_console"],
    comparableAcrossPlatforms: true,
    caveats: ["Google reports search data 2–3 days late."],
  },
  {
    key: "search_impressions",
    label: "Search impressions",
    definition: "Times your site appeared in Google search results.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["search_console"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "search_ctr",
    label: "Search click rate",
    definition: "Search clicks as a share of search impressions.",
    unit: "percent",
    kind: "derived",
    aggregation: "ratio",
    numerator: [{ metric: "search_clicks" }],
    denominator: [{ metric: "search_impressions" }],
    multiplier: 100,
    higherIsBetter: true,
    platforms: ["search_console"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "search_position_weighted",
    label: "Position × impressions",
    definition: "Internal helper: average position multiplied by impressions, so position averages correctly.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: false,
    platforms: ["search_console"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "search_position",
    label: "Average position",
    definition: "Where your site usually shows up in Google results. 1 is the top; 11 and up is page 2.",
    unit: "position",
    kind: "derived",
    aggregation: "ratio",
    numerator: [{ metric: "search_position_weighted" }],
    denominator: [{ metric: "search_impressions" }],
    higherIsBetter: false,
    platforms: ["search_console"],
    comparableAcrossPlatforms: true,
  },

  // ── Ads (Meta) ─────────────────────────────────────────────────────────
  {
    key: "ad_spend",
    label: "Ad spend",
    definition: "Money spent on Meta ads, in CAD.",
    unit: "currency",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: null,
    platforms: ["meta_ads"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "ad_impressions",
    label: "Ad impressions",
    definition: "Times your ads were shown.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["meta_ads"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "ad_clicks",
    label: "Ad link clicks",
    definition: "Clicks on your ads that led to your site or form.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["meta_ads"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "meta_leads",
    label: "Leads (Meta's count)",
    definition: "Leads Meta says its ads produced.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["meta_ads"],
    comparableAcrossPlatforms: true,
    caveats: ["Meta's count usually differs from Lead Rescue's. Cost per lead uses Lead Rescue."],
  },
  {
    key: "cpm",
    label: "Cost per 1,000 views",
    definition: "Ad spend for every 1,000 times your ads were shown (CPM).",
    unit: "currency",
    kind: "derived",
    aggregation: "ratio",
    numerator: [{ metric: "ad_spend" }],
    denominator: [{ metric: "ad_impressions" }],
    multiplier: 1000,
    higherIsBetter: false,
    platforms: ["meta_ads"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "ad_ctr",
    label: "Ad click rate",
    definition: "Link clicks as a share of ad impressions (CTR).",
    unit: "percent",
    kind: "derived",
    aggregation: "ratio",
    numerator: [{ metric: "ad_clicks" }],
    denominator: [{ metric: "ad_impressions" }],
    multiplier: 100,
    higherIsBetter: true,
    platforms: ["meta_ads"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "cpc",
    label: "Cost per click",
    definition: "Ad spend divided by link clicks (CPC).",
    unit: "currency",
    kind: "derived",
    aggregation: "ratio",
    numerator: [{ metric: "ad_spend" }],
    denominator: [{ metric: "ad_clicks" }],
    higherIsBetter: false,
    platforms: ["meta_ads"],
    comparableAcrossPlatforms: true,
  },

  // ── Pipeline (Lead Rescue) ─────────────────────────────────────────────
  {
    key: "leads",
    label: "Leads",
    definition: "New quote requests in Lead Rescue. Spam and bot leads are left out.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "leads_from_ads",
    label: "Leads from Meta ads",
    definition: "New leads whose source or answer to \"How did you find us?\" points to a Meta ad.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
    caveats: ["\"How did you find us?\" is self-reported, so some ad leads may be counted as organic."],
  },
  {
    key: "qualified_leads",
    label: "Qualified leads",
    definition: "Leads that moved past New Request (someone real, with a real job).",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "qualified_leads_from_ads",
    label: "Qualified leads from Meta ads",
    definition: "Qualified leads attributed to a Meta ad.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "spam_leads",
    label: "Spam leads",
    definition: "Leads flagged as spam or bots and left out of every other number.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: false,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "cost_per_lead",
    label: "Cost per lead",
    definition: "Meta ad spend divided by leads from Meta ads.",
    unit: "currency",
    kind: "derived",
    aggregation: "ratio",
    numerator: [{ metric: "ad_spend", platform: "meta_ads" }],
    denominator: [{ metric: "leads_from_ads", platform: "lead_rescue" }],
    higherIsBetter: false,
    platforms: ["meta_ads", "lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "cost_per_qualified_lead",
    label: "Cost per qualified lead",
    definition: "Meta ad spend divided by qualified leads from Meta ads.",
    unit: "currency",
    kind: "derived",
    aggregation: "ratio",
    numerator: [{ metric: "ad_spend", platform: "meta_ads" }],
    denominator: [{ metric: "qualified_leads_from_ads", platform: "lead_rescue" }],
    higherIsBetter: false,
    platforms: ["meta_ads", "lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "leads_contacted",
    label: "Leads contacted",
    definition: "New leads that got a first reply (call, text or email).",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "first_contact_minutes",
    label: "Minutes to first contact (total)",
    definition: "Internal helper: total minutes from lead to first reply, across contacted leads.",
    unit: "minutes",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: false,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "speed_to_first_contact",
    label: "Speed to first contact",
    definition: "Average time from a lead coming in to our first reply.",
    unit: "minutes",
    kind: "derived",
    aggregation: "ratio",
    numerator: [{ metric: "first_contact_minutes" }],
    denominator: [{ metric: "leads_contacted" }],
    higherIsBetter: false,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
    caveats: ["Counts clock time, including nights and weekends."],
  },
  {
    key: "quotes_sent",
    label: "Quotes sent",
    definition: "Deals that moved into Quote Sent.",
    caveats: ["Lead Rescue only shows each deal's current stage, so dates before Pulse connected (Oct 24, 2026) are estimates."],
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "deals_won",
    label: "Deals won",
    definition: "Deals marked Won.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "deals_lost",
    label: "Deals lost",
    definition: "Deals marked Lost.",
    unit: "count",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: false,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "win_rate",
    label: "Win rate",
    definition: "Deals won as a share of deals closed (won plus lost).",
    unit: "percent",
    kind: "derived",
    aggregation: "ratio",
    numerator: [{ metric: "deals_won" }],
    denominator: [{ metric: "deals_won" }, { metric: "deals_lost" }],
    multiplier: 100,
    higherIsBetter: true,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "revenue_won",
    label: "Revenue won",
    definition: "Value of deals marked Won, in CAD.",
    unit: "currency",
    kind: "daily_total",
    aggregation: "sum",
    higherIsBetter: true,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "pipeline_value",
    label: "Open pipeline",
    definition: "Value of all open deals at the end of the day, in CAD.",
    unit: "currency",
    kind: "lifetime_counter",
    aggregation: "last",
    higherIsBetter: true,
    platforms: ["lead_rescue"],
    comparableAcrossPlatforms: true,
  },
  {
    key: "cost_per_won_deal",
    label: "Cost per won deal",
    definition: "Meta ad spend divided by deals won.",
    unit: "currency",
    kind: "derived",
    aggregation: "ratio",
    numerator: [{ metric: "ad_spend", platform: "meta_ads" }],
    denominator: [{ metric: "deals_won", platform: "lead_rescue" }],
    higherIsBetter: false,
    platforms: ["meta_ads", "lead_rescue"],
    comparableAcrossPlatforms: true,
    caveats: ["Counts every won deal, not only ones that came from ads, until attribution is connected."],
  },
];

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

export function getMetric(key: string): MetricDef {
  const def = METRIC_BY_KEY[key];
  if (!def) throw new Error(`Unknown metric "${key}". Add it to src/config/metrics.ts.`);
  return def;
}

/** All caveats that apply to a metric, optionally narrowed to one platform. */
export function caveatsFor(def: MetricDef, platform?: Platform | "all"): string[] {
  const out = [...(def.caveats ?? [])];
  if (def.platformCaveats) {
    if (platform && platform !== "all") {
      const c = def.platformCaveats[platform];
      if (c) out.push(c);
    } else {
      out.push(...Object.values(def.platformCaveats).filter((c): c is string => Boolean(c)));
    }
  }
  return out;
}
