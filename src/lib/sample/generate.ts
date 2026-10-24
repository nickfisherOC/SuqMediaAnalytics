import type { Platform } from "@/config/platforms";
import { addDays, diffDays, eachDay, edmontonDateOf, type ISODate } from "@/lib/dates";
import type { MetricRow } from "@/lib/metrics/engine";

/**
 * Sample data calibrated to the hand-made Oct 19 reports (PeopleSuq and SUQ
 * Media, Oct 8–18 vs Sep 27–Oct 7). Every total the reports state is
 * reproduced exactly over those two 11-day windows, so the dashboard can be
 * checked against them line by line. Day-by-day splits inside a window, and
 * everything after Oct 18, are plausible fill, not real numbers.
 *
 * Every row is marked `isSample` and badged in the UI. Deterministic: no
 * randomness, so every screenshot and test sees the same numbers.
 */

export const SAMPLE_START: ISODate = "2026-09-27";

/** The two report windows. */
const A = { from: "2026-09-27", to: "2026-10-07" }; // "the 11 days before"
const B = { from: "2026-10-08", to: "2026-10-18" }; // "the last 11 days"

export interface SampleFlag {
  brand: string;
  platform: Platform | null;
  kind: string;
  severity: "info" | "warning" | "serious";
  dateFrom: ISODate;
  dateTo: ISODate;
  title: string;
  detail: string;
}

export interface SampleData {
  rows: MetricRow[];
  flags: SampleFlag[];
}

/** Splits an integer total across weights, exactly (largest remainder). */
export function spread(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0) || 1;
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  return out;
}

/** Gentle, deterministic day-to-day wobble so lines don't look ruled. */
const wobble = (date: ISODate, salt: number) => 1 + 0.18 * Math.sin(diffDays(SAMPLE_START, date) * 1.7 + salt);

/** A daily series: exact totals over windows A and B, then a per-day level after. */
interface SeriesSpec {
  /** Days in A with no data (account didn't exist yet) are left out. */
  startsOn?: ISODate;
  a?: { total: number; weights?: (days: ISODate[]) => number[] };
  b?: { total: number; weights?: (days: ISODate[]) => number[] };
  /** Level per day after Oct 18. */
  after?: number;
  /** Explicit values for particular days; the window total is spread over the remaining days. */
  fixed?: Record<ISODate, number>;
}

function buildSeries(spec: SeriesSpec, until: ISODate, salt: number): Map<ISODate, number> {
  const out = new Map<ISODate, number>();
  const start = spec.startsOn ?? SAMPLE_START;
  for (const [win, part] of [
    [A, spec.a],
    [B, spec.b],
  ] as const) {
    if (!part) continue;
    const days = eachDay(win.from, win.to).filter((d) => d >= start);
    const fixedDays = days.filter((d) => spec.fixed?.[d] !== undefined);
    const free = days.filter((d) => spec.fixed?.[d] === undefined);
    const fixedSum = fixedDays.reduce((s, d) => s + spec.fixed![d], 0);
    const weights = part.weights ? part.weights(free) : free.map((d) => wobble(d, salt));
    const values = spread(Math.max(0, part.total - fixedSum), weights);
    fixedDays.forEach((d) => out.set(d, spec.fixed![d]));
    free.forEach((d, i) => out.set(d, values[i]));
  }
  if (spec.after !== undefined) {
    for (const d of eachDay(addDays(B.to, 1), until)) out.set(d, Math.round(spec.after * wobble(d, salt)));
  }
  for (const d of [...out.keys()]) if (d > until || d < start) out.delete(d);
  return out;
}

/** Running total from a starting value plus daily gains. */
function cumulative(start: number, gains: Map<ISODate, number>): Map<ISODate, number> {
  const out = new Map<ISODate, number>();
  let v = start;
  for (const d of [...gains.keys()].sort()) {
    v += gains.get(d)!;
    out.set(d, v);
  }
  return out;
}

export function generateSampleData(until: ISODate): SampleData {
  const rows: MetricRow[] = [];
  let salt = 0;
  const emit = (brand: string, platform: Platform, metric: string, series: Map<ISODate, number>) => {
    for (const [date, value] of series) rows.push({ brand, platform, date, metric, value, isSample: true });
  };
  const put = (brand: string, platform: Platform, metric: string, spec: SeriesSpec) =>
    emit(brand, platform, metric, buildSeries(spec, until, ++salt));
  const zero = (brand: string, platform: Platform, metric: string, startsOn?: ISODate) =>
    put(brand, platform, metric, { startsOn, a: { total: 0 }, b: { total: 0 }, after: 0 });

  // ── PeopleSuq ────────────────────────────────────────────────────────────
  const ps = "peoplesuq";
  const TIKTOK_START = "2026-10-03";

  // Followers (end of day). Report: FB 105→114, IG 14→29, YT 4→7, TikTok new → 12.
  // FB gained 30 in the 11 days before, 19 of them on Oct 5.
  const fbGains = buildSeries({ a: { total: 30 }, b: { total: 9 }, after: 0.8, fixed: { "2026-10-05": 19 } }, until, ++salt);
  emit(ps, "facebook", "followers", cumulative(75, fbGains));
  emit(ps, "instagram", "followers", cumulative(9, buildSeries({ a: { total: 5 }, b: { total: 15 }, after: 1.2 }, until, ++salt)));
  emit(ps, "youtube", "followers", cumulative(2, buildSeries({ a: { total: 2 }, b: { total: 3 }, after: 0.4 }, until, ++salt)));
  emit(
    ps,
    "tiktok",
    "followers",
    cumulative(0, buildSeries({ startsOn: TIKTOK_START, a: { total: 3 }, b: { total: 9 }, after: 0.8 }, until, ++salt)),
  );

  // Views. FB 2,774 → 6,329 (passed 1,000/day Oct 15–18); IG 564 → 3,305 (400–670/day Oct 15–18).
  put(ps, "facebook", "views", {
    a: { total: 2774 },
    b: { total: 6329 },
    after: 950,
    fixed: { "2026-10-15": 1020, "2026-10-16": 1080, "2026-10-17": 1150, "2026-10-18": 1050 },
  });
  put(ps, "instagram", "views", {
    a: { total: 564 },
    b: { total: 3305 },
    after: 480,
    fixed: { "2026-10-15": 410, "2026-10-16": 520, "2026-10-17": 670, "2026-10-18": 560 },
  });
  // YouTube: ~4,634 views over the 28 days to Oct 18, driven by Day 8 and Day 12 Shorts.
  put(ps, "youtube", "views", {
    a: { total: 600, weights: (d) => d.map((x) => (x >= "2026-10-03" ? 4 : 1)) },
    b: {
      total: 4000,
      weights: (d) => d.map((x) => ({ "2026-10-08": 4, "2026-10-09": 3, "2026-10-12": 4, "2026-10-13": 3 })[x] ?? 1.3),
    },
    after: 300,
  });
  // TikTok: 17 videos since Oct 3, about 3,400 views in total; Day 17 got 666.
  put(ps, "tiktok", "views", {
    startsOn: TIKTOK_START,
    a: { total: 700 },
    b: { total: 2700, weights: (d) => d.map((x) => (x === "2026-10-17" ? 3 : x === "2026-10-18" ? 2 : 1)) },
    after: 220,
  });

  // Engagement. FB 132 → 237, IG 68 → 74. Comments: 6 in Oct 8–18, all on Facebook.
  const fbComments = { "2026-10-08": 1, "2026-10-10": 3, "2026-10-16": 2 };
  const engagement: Record<"facebook" | "instagram" | "youtube" | "tiktok", { a: number; b: number; after: number }> = {
    facebook: { a: 132, b: 237, after: 22 },
    instagram: { a: 68, b: 74, after: 8 },
    youtube: { a: 18, b: 110, after: 9 },
    tiktok: { a: 40, b: 150, after: 12 },
  };
  for (const [p, e] of Object.entries(engagement) as [keyof typeof engagement, (typeof engagement)["facebook"]][]) {
    const startsOn = p === "tiktok" ? TIKTOK_START : undefined;
    const total = buildSeries({ startsOn, a: { total: e.a }, b: { total: e.b }, after: e.after }, until, ++salt);
    const comments = new Map<ISODate, number>();
    const shares = new Map<ISODate, number>();
    const saves = new Map<ISODate, number>();
    const likes = new Map<ISODate, number>();
    for (const [d, t] of total) {
      const c = p === "facebook" ? ((fbComments as Record<string, number>)[d] ?? (d === "2026-10-03" ? 1 : 0)) : 0;
      const sh = Math.floor(t * 0.06);
      const sv = p === "instagram" || p === "tiktok" ? Math.floor(t * 0.05) : 0;
      comments.set(d, c);
      shares.set(d, sh);
      saves.set(d, sv);
      likes.set(d, Math.max(0, t - c - sh - sv));
      total.set(d, likes.get(d)! + c + sh + sv);
    }
    emit(ps, p, "engagements", total);
    emit(ps, p, "likes", likes);
    emit(ps, p, "comments", comments);
    emit(ps, p, "shares", shares);
    if (p === "instagram" || p === "tiktok") emit(ps, p, "saves", saves);
  }

  // Clicks to peoplesuq.com: FB 1 → 24, IG 0 → 10. Page/profile visits: FB 229 → 104, IG 70 → 75.
  put(ps, "facebook", "link_clicks", { a: { total: 1 }, b: { total: 24 }, after: 2.5 });
  put(ps, "instagram", "link_clicks", { a: { total: 0 }, b: { total: 10 }, after: 1 });
  put(ps, "facebook", "profile_visits", { a: { total: 229 }, b: { total: 104 }, after: 9 });
  put(ps, "instagram", "profile_visits", { a: { total: 70 }, b: { total: 75 }, after: 7 });

  // Facebook watch time: 10h 29m over the 28 days to Oct 18.
  put(ps, "facebook", "watch_minutes", {
    a: { total: 190 },
    b: { total: 400, weights: (d) => d.map((x) => (x >= "2026-10-15" ? 2 : 1)) },
    after: 40,
  });
  put(ps, "youtube", "watch_minutes", { a: { total: 210 }, b: { total: 1420 }, after: 105 });

  // Posts: Day N of the series went up on Oct N. Days 1–2 are missing from IG, TikTok and
  // YouTube; a stray caption-less Facebook reel went up on Oct 13 next to Day 13.
  const posts = (p: Platform) => {
    const m = new Map<ISODate, number>();
    for (const d of eachDay(SAMPLE_START, until)) {
      const day = d >= "2026-10-01" && d <= "2026-10-31" ? Number(d.slice(8)) : 0;
      let n = day > 0 ? 1 : 0;
      if (p !== "facebook" && day > 0 && day <= 2) n = 0;
      if (p === "tiktok" && d < TIKTOK_START) continue;
      if (p === "facebook" && d === "2026-10-13") n = 2;
      m.set(d, n);
    }
    return m;
  };
  for (const p of ["facebook", "instagram", "youtube", "tiktok"] as const) emit(ps, p, "posts_published", posts(p));

  // Store (Shopify, human sessions). The 11 days before had 54 visits, but 30 came from one
  // town in the US and are excluded as test traffic, leaving 24. Oct 8–18: 40 visits.
  // From social: FB 1 + IG 1 → FB 21 + IG 8. 5 added to cart, 3 reached checkout, 0 orders.
  // The Oct 7 order was a test and is excluded; the first real order came Oct 19 ($35.99).
  put(ps, "shopify", "store_sessions", { a: { total: 24 }, b: { total: 40 }, after: 4.5 });
  put(ps, "shopify", "store_sessions_social", { a: { total: 2 }, b: { total: 29 }, after: 3.2 });
  put(ps, "shopify", "add_to_cart", { a: { total: 1 }, b: { total: 5 }, after: 0.4 });
  put(ps, "shopify", "reached_checkout", { a: { total: 0 }, b: { total: 3 }, after: 0.25 });
  const orders = buildSeries({ a: { total: 0 }, b: { total: 0 }, after: 0 }, until, ++salt);
  if (orders.has("2026-10-19")) orders.set("2026-10-19", 1);
  emit(ps, "shopify", "orders", orders);
  emit(ps, "shopify", "store_revenue", new Map([...orders].map(([d, n]) => [d, n ? 35.99 : 0])));

  // GA4 and Search Console weren't in the reports: small placeholder levels.
  put(ps, "ga4", "site_sessions", { a: { total: 30 }, b: { total: 48 }, after: 5 });
  put(ps, "ga4", "site_sessions_social", { a: { total: 3 }, b: { total: 31 }, after: 3.5 });
  const impressions = buildSeries({ a: { total: 140 }, b: { total: 210 }, after: 22 }, until, ++salt);
  emit(ps, "search_console", "search_impressions", impressions);
  emit(ps, "search_console", "search_position_weighted", new Map([...impressions].map(([d, v]) => [d, v * 24.5])));
  put(ps, "search_console", "search_clicks", { a: { total: 3 }, b: { total: 6 }, after: 0.6 });

  // ── SUQ Media ────────────────────────────────────────────────────────────
  const sm = "suq-media";
  const ADS_START = "2026-10-05";

  // Page numbers. FB views 2,783 → 12,535 (about 1,000/day since the ads started Oct 5);
  // IG 552 → 1,531. No posts since Sep 22.
  put(sm, "facebook", "views", {
    a: { total: 2783, weights: (d) => d.map((x) => (x >= ADS_START ? 18 : 1)) },
    b: { total: 12535 },
    after: 1050,
  });
  put(sm, "instagram", "views", {
    a: { total: 552, weights: (d) => d.map((x) => (x >= ADS_START ? 8 : 1)) },
    b: { total: 1531 },
    after: 130,
  });
  // Followers: FB 46 → 48 (5 new in the 11 days before), IG 8 → 9.
  emit(sm, "facebook", "followers", cumulative(41, buildSeries({ a: { total: 5 }, b: { total: 2 }, after: 0.15 }, until, ++salt)));
  emit(sm, "instagram", "followers", cumulative(8, buildSeries({ a: { total: 0 }, b: { total: 1 }, after: 0.05 }, until, ++salt)));
  // Clicks to suqmedia.com: FB 26 → 109, IG 7 → 15. Likes/comments/shares: FB 6 → 13, IG 4 → 0.
  // Page/profile visits: FB 24 → 27, IG 11 → 12.
  const adsWeight = (d: ISODate[]) => d.map((x) => (x >= ADS_START ? 6 : 1));
  put(sm, "facebook", "link_clicks", { a: { total: 26, weights: adsWeight }, b: { total: 109 }, after: 9.5 });
  put(sm, "instagram", "link_clicks", { a: { total: 7, weights: adsWeight }, b: { total: 15 }, after: 1.3 });
  put(sm, "facebook", "engagements", { a: { total: 6 }, b: { total: 13 }, after: 1.1 });
  put(sm, "facebook", "likes", { a: { total: 6 }, b: { total: 13 }, after: 1.1 });
  put(sm, "instagram", "engagements", { a: { total: 4 }, b: { total: 0 }, after: 0 });
  put(sm, "instagram", "likes", { a: { total: 4 }, b: { total: 0 }, after: 0 });
  for (const p of ["facebook", "instagram"] as const) {
    zero(sm, p, "comments");
    zero(sm, p, "shares");
    zero(sm, p, "posts_published");
  }
  put(sm, "facebook", "profile_visits", { a: { total: 24 }, b: { total: 27 }, after: 2.4 });
  put(sm, "instagram", "profile_visits", { a: { total: 11 }, b: { total: 12 }, after: 1 });

  // Meta Ads: Crew Hoodies campaign from Oct 5 at $25/day. Oct 5–7: $71.89, 6 requests
  // (Meta's count), reach 1,946. Oct 8–18: $269.77, 18 requests. Spend is in cents to keep it exact.
  const spendCents = buildSeries({ startsOn: ADS_START, a: { total: 7189 }, b: { total: 26977 }, after: 2460 }, until, ++salt);
  emit(sm, "meta_ads", "ad_spend", new Map([...spendCents].map(([d, c]) => [d, c / 100])));
  put(sm, "meta_ads", "meta_leads", { startsOn: ADS_START, a: { total: 6 }, b: { total: 18 }, after: 1.5 });
  // Impressions and ad clicks weren't in the report: plausible levels for the reach it gave.
  put(sm, "meta_ads", "ad_impressions", { startsOn: ADS_START, a: { total: 2900 }, b: { total: 9100 }, after: 820 });
  put(sm, "meta_ads", "ad_clicks", { startsOn: ADS_START, a: { total: 24 }, b: { total: 98 }, after: 8.5 });
  put(sm, "ga4", "site_sessions", { a: { total: 32, weights: adsWeight }, b: { total: 104 }, after: 9 });

  // Lead Rescue: built from individual sample leads, the way the real connector will work.
  for (const [metric, series] of leadMetrics(until)) emit(sm, "lead_rescue", metric, series);

  return { rows, flags: sampleFlags(until) };
}

// ── Lead Rescue sample leads ───────────────────────────────────────────────
// Report: 17 real crew hoodie requests from the ad page since Oct 5 (3 on Oct 5–7, 8 on
// Oct 8–13, 6 on Oct 14–17), plus two custom apparel deals from the website ($10,000 and
// a $4,500 one on Oct 18). Stages: 12 New Request ($9,500), 3 Quote Sent ($1,305),
// 1 Mockup Approved ($225), 1 Won ($225; came in Oct 12, closed within days).
// One spam entry and one test entry are left out of every count.

interface SampleLead {
  created: string; // ISO timestamp
  source: "meta_ads" | "website";
  value: number;
  firstContactHours?: number;
  quoteSent?: ISODate;
  won?: ISODate;
  spam?: boolean;
}

const NEW_REQUEST_VALUES = [600, 900, 750, 1200, 450, 800, 650, 1100, 700, 850, 500, 1000];
const newRequestDates = [
  "2026-10-05", "2026-10-08", "2026-10-09", "2026-10-11", "2026-10-13", "2026-10-14",
  "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-16", "2026-10-17", "2026-10-09",
];

export const SAMPLE_LEADS: SampleLead[] = [
  { created: "2026-09-30T16:20:00-06:00", source: "website", value: 10000, firstContactHours: 18 },
  { created: "2026-10-06T09:10:00-06:00", source: "meta_ads", value: 435, firstContactHours: 26, quoteSent: "2026-10-09" },
  { created: "2026-10-07T19:45:00-06:00", source: "meta_ads", value: 435, firstContactHours: 20, quoteSent: "2026-10-10" },
  { created: "2026-10-10T11:30:00-06:00", source: "meta_ads", value: 435, firstContactHours: 5, quoteSent: "2026-10-14" },
  { created: "2026-10-12T08:05:00-06:00", source: "meta_ads", value: 225, firstContactHours: 3, quoteSent: "2026-10-13" },
  { created: "2026-10-12T14:40:00-06:00", source: "meta_ads", value: 225, firstContactHours: 1.5, quoteSent: "2026-10-13", won: "2026-10-15" },
  ...NEW_REQUEST_VALUES.map<SampleLead>((value, i) => ({
    created: `${newRequestDates[i]}T${String(9 + (i % 9)).padStart(2, "0")}:00:00-06:00`,
    source: "meta_ads",
    value,
  })),
  { created: "2026-10-18T15:00:00-06:00", source: "website", value: 4500 },
  { created: "2026-10-11T03:12:00-06:00", source: "meta_ads", value: 0, spam: true },
];

function leadMetrics(until: ISODate): Map<string, Map<ISODate, number>> {
  const metrics = new Map<string, Map<ISODate, number>>();
  const days = eachDay(SAMPLE_START, until);
  for (const key of [
    "leads", "leads_from_ads", "qualified_leads", "qualified_leads_from_ads", "spam_leads",
    "leads_contacted", "first_contact_minutes", "quotes_sent", "deals_won", "deals_lost", "revenue_won", "pipeline_value",
  ]) {
    metrics.set(key, new Map(days.map((d) => [d, 0])));
  }
  const add = (key: string, d: ISODate, v: number) => {
    const m = metrics.get(key)!;
    if (m.has(d)) m.set(d, m.get(d)! + v);
  };

  for (const l of SAMPLE_LEADS) {
    const day = edmontonDateOf(l.created);
    if (l.spam) {
      add("spam_leads", day, 1);
      continue;
    }
    const fromAds = l.source === "meta_ads" ? 1 : 0;
    const contacted = l.firstContactHours !== undefined;
    add("leads", day, 1);
    add("leads_from_ads", day, fromAds);
    if (contacted) {
      add("qualified_leads", day, 1);
      add("qualified_leads_from_ads", day, fromAds);
      add("leads_contacted", day, 1);
      add("first_contact_minutes", day, l.firstContactHours! * 60);
    }
    if (l.quoteSent) add("quotes_sent", l.quoteSent, 1);
    if (l.won) {
      add("deals_won", l.won, 1);
      add("revenue_won", l.won, l.value);
    }
    for (const d of days) if (d >= day && !(l.won && d >= l.won)) add("pipeline_value", d, l.value);
  }
  return metrics;
}

// ── Flags: the "still to fix" items from the reports ────────────────────────

function sampleFlags(until: ISODate): SampleFlag[] {
  const ps = "peoplesuq";
  const sm = "suq-media";
  return [
    {
      brand: ps,
      platform: "tiktok",
      kind: "stuck_content",
      severity: "serious",
      dateFrom: "2026-10-07",
      dateTo: until,
      title: "TikTok Day 7 \"Can we talk?\" is stuck in review",
      detail: "It's marked Content under review and set to Only me, so it has 0 views. Appeal it or re-upload it.",
    },
    {
      brand: ps,
      platform: null,
      kind: "missing_post",
      severity: "warning",
      dateFrom: "2026-10-01",
      dateTo: until,
      title: "Days 1 and 2 are missing from Instagram, TikTok and YouTube",
      detail: "They only went up on Facebook.",
    },
    {
      brand: ps,
      platform: "facebook",
      kind: "insights_disabled",
      severity: "warning",
      dateFrom: SAMPLE_START,
      dateTo: until,
      title: "Facebook story insights are switched off",
      detail: "Stories go up most days but show 0 views. Turn on story insights in Meta Business Suite.",
    },
    {
      brand: ps,
      platform: "facebook",
      kind: "duplicate_post",
      severity: "info",
      dateFrom: "2026-10-13",
      dateTo: until,
      title: "A stray Facebook reel with no caption (Oct 13)",
      detail: "It went up next to the real Day 13 video and has 25 views. Delete it or add a caption.",
    },
    {
      brand: ps,
      platform: "shopify",
      kind: "test_traffic",
      severity: "info",
      dateFrom: "2026-09-27",
      dateTo: "2026-10-07",
      title: "30 store visits from Haverhill, MA left out",
      detail: "Far above normal for one place outside the target market; most likely testing. Excluded from totals.",
    },
    {
      brand: ps,
      platform: "shopify",
      kind: "other",
      severity: "info",
      dateFrom: "2026-10-07",
      dateTo: "2026-10-07",
      title: "The Oct 7 order was a test",
      detail: "Left out of orders and revenue.",
    },
    {
      brand: sm,
      platform: null,
      kind: "cadence_missed",
      severity: "serious",
      dateFrom: "2026-09-22",
      dateTo: until,
      title: "No Facebook or Instagram posts since Sep 22",
      detail: "The target is 3 a week. Business owners who click an ad and check the page find it quiet.",
    },
    {
      brand: sm,
      platform: "lead_rescue",
      kind: "other",
      severity: "warning",
      dateFrom: "2026-10-05",
      dateTo: until,
      title: "12 crew hoodie deals are still in New Request",
      detail: "Worth about $9,500. Move each to Contacted after the first call, or mark it spam.",
    },
  ];
}
