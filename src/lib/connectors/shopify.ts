import { eachDay, edmontonDateOf, startOfWeek, type ISODate } from "@/lib/dates";
import { fetchJson } from "./http";
import { ConnectorConfigError, type Connector, type MetricPoint, type SyncContext } from "./types";

/**
 * Shopify (Admin GraphQL 2026-10), through a Dev Dashboard app installed on
 * the store. The app's client ID and secret buy a 24-hour token each run
 * (client credentials grant), so there is nothing for a person to renew.
 *
 * Sessions come from ShopifyQL, which counts bots too. Pulse leaves out
 * one-day spikes from a single city outside Canada (data-centre crawlers such
 * as the 174 "visits" from San Jose on Oct 15) and flags them.
 */

const API_VERSION = "2026-10";
/** A city outside Canada with at least this many sessions in one day is treated as bot or test traffic. */
export const SPIKE_SESSIONS = 10;

interface Settings {
  store?: string;
  client_id?: string;
  /** Order names to leave out, e.g. "#1001" for an order that was really a test. */
  excluded_orders?: string[];
  /** Cities always treated as test traffic, e.g. "Haverhill". */
  excluded_cities?: string[];
}

async function getToken(ctx: SyncContext, s: Settings): Promise<string> {
  const secret = await ctx.secret("access");
  const { status, body } = await fetchJson<{ access_token?: string; error_description?: string }>(
    `https://${s.store}.myshopify.com/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: s.client_id!, client_secret: secret }),
    },
  );
  if (!body?.access_token) throw new ConnectorConfigError(`Shopify: couldn't get a token (${status}). ${body?.error_description ?? ""}`.trim());
  return body.access_token;
}

async function gql<T>(ctx: SyncContext, s: Settings, token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const { body } = await fetchJson<{ data?: T; errors?: { message: string }[] }>(
    `https://${s.store}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
    { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({ query, variables }) },
    { isRateLimited: (_s, b) => JSON.stringify(b ?? "").includes("THROTTLED") },
  );
  ctx.capture({ endpoint: "graphql", params: variables, payload: body });
  if (body?.errors?.length) throw new Error(`Shopify: ${body.errors.map((e) => e.message).join("; ")}`);
  return body.data as T;
}

type Row = Record<string, string | null>;

async function shopifyql(ctx: SyncContext, s: Settings, token: string, q: string): Promise<Row[]> {
  const data = await gql<{ shopifyqlQuery: { tableData: { rows: Row[] } | null; parseErrors: string[] } }>(
    ctx,
    s,
    token,
    `query($q: String!) { shopifyqlQuery(query: $q) { tableData { rows } parseErrors } }`,
    { q },
  );
  if (data.shopifyqlQuery.parseErrors?.length) throw new Error(`ShopifyQL: ${data.shopifyqlQuery.parseErrors.join("; ")}`);
  return data.shopifyqlQuery.tableData?.rows ?? [];
}

const n = (v: string | null | undefined) => (v ? Number(v) : 0);
const dayOf = (v: string | null) => (v ?? "").slice(0, 10);

export interface CitySessions {
  date: ISODate;
  city: string | null;
  country: string | null;
  referrer: string | null;
  sessions: number;
}

/** Splits session rows into kept and excluded (bot/test) traffic. Exported for tests. */
export function excludeSpikes(rows: CitySessions[], excludedCities: string[] = []) {
  const perCityDay = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.date}|${r.city}|${r.country}`;
    perCityDay.set(k, (perCityDay.get(k) ?? 0) + r.sessions);
  }
  const always = new Set(excludedCities.map((c) => c.toLowerCase()));
  const isExcluded = (r: CitySessions) =>
    (r.city !== null && always.has(r.city.toLowerCase())) ||
    (r.country !== "Canada" && (perCityDay.get(`${r.date}|${r.city}|${r.country}`) ?? 0) >= SPIKE_SESSIONS);
  return { kept: rows.filter((r) => !isExcluded(r)), excluded: rows.filter(isExcluded) };
}

export const shopify: Connector = async (ctx) => {
  const s = ctx.account.settings as Settings;
  if (!s.store || !s.client_id) throw new ConnectorConfigError("Shopify: store or client ID missing from the account settings.");
  const token = await getToken(ctx, s);
  const days = eachDay(ctx.from, ctx.to);
  const points: MetricPoint[] = [];
  const range = `SINCE ${ctx.from} UNTIL ${ctx.to}`;

  // Funnel steps by day.
  const funnel = await shopifyql(ctx, s, token, `FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout GROUP BY day ${range}`);
  for (const r of funnel) {
    points.push(
      { date: dayOf(r.day), metric: "add_to_cart", value: n(r.sessions_with_cart_additions) },
      { date: dayOf(r.day), metric: "reached_checkout", value: n(r.sessions_that_reached_checkout) },
    );
  }

  // Sessions by city and source, so bot spikes can be left out.
  const detail = await shopifyql(
    ctx,
    s,
    token,
    `FROM sessions SHOW sessions GROUP BY day, session_country, session_city, referrer_source ${range}`,
  );
  const rows: CitySessions[] = detail.map((r) => ({
    date: dayOf(r.day),
    city: r.session_city,
    country: r.session_country,
    referrer: r.referrer_source,
    sessions: n(r.sessions),
  }));
  const { kept, excluded } = excludeSpikes(rows, s.excluded_cities);
  for (const r of kept) {
    points.push({ date: r.date, metric: "store_sessions", value: r.sessions });
    if (r.referrer === "social") points.push({ date: r.date, metric: "store_sessions_social", value: r.sessions });
  }

  // City-level rows for the Search & Site page (excluded traffic marked).
  const cityRows = new Map<string, { date: string; city: string; sessions: number; excluded: number }>();
  for (const r of rows) {
    const city = `${r.city ?? "Unknown"}, ${r.country ?? "Unknown"}`;
    const k = `${r.date}|${city}`;
    const cur = cityRows.get(k) ?? { date: r.date, city, sessions: 0, excluded: 0 };
    cur.sessions += r.sessions;
    if (excluded.includes(r)) cur.excluded += r.sessions;
    cityRows.set(k, cur);
  }
  if (cityRows.size) {
    const { error } = await ctx.db.from("site_daily").upsert(
      [...cityRows.values()].map((c) => ({
        account_id: ctx.account.id,
        date: c.date,
        dimension: "city",
        dim_value: c.city,
        sessions: c.sessions,
        extra: { excluded_sessions: c.excluded },
        is_sample: false,
      })),
      { onConflict: "account_id,date,dimension,dim_value" },
    );
    if (error) throw error;
  }

  // One flag per excluded city, for each week it shows up in.
  const flagged = new Map<string, { from: string; to: string; city: string; sessions: number }>();
  for (const r of excluded) {
    const city = r.city ?? "an unknown city";
    const k = `${startOfWeek(r.date)}|${city}`;
    const cur = flagged.get(k) ?? { from: r.date, to: r.date, city, sessions: 0 };
    cur.sessions += r.sessions;
    if (r.date < cur.from) cur.from = r.date;
    if (r.date > cur.to) cur.to = r.date;
    flagged.set(k, cur);
  }
  for (const [k, f] of flagged) {
    ctx.flag({
      key: `shopify-excluded-${k}`,
      kind: "test_traffic",
      severity: "info",
      dateFrom: f.from,
      dateTo: f.to,
      title: `${f.sessions} store visits from ${f.city} left out`,
      detail: "Far more visits from one place outside Canada than normal, most likely bots, Meta's link checker or testing. Not counted in store visits.",
    });
  }

  // Orders: paid, not test, not cancelled, not excluded by an admin.
  const excludedNames = new Set(s.excluded_orders ?? []);
  let cursor: string | null = null;
  for (let page = 0; page < 50; page++) {
    const data: {
      orders: {
        nodes: { name: string; createdAt: string; test: boolean; cancelledAt: string | null; totalPriceSet: { shopMoney: { amount: string } } }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await gql(ctx, s, token, `query($q: String!, $after: String) {
        orders(first: 100, after: $after, query: $q) {
          nodes { name createdAt test cancelledAt totalPriceSet { shopMoney { amount } } }
          pageInfo { hasNextPage endCursor }
        }
      }`, { q: `created_at:>=${ctx.from} created_at:<=${ctx.to}T23:59:59-07:00`, after: cursor });
    for (const o of data.orders.nodes) {
      const date = edmontonDateOf(o.createdAt);
      if (o.test || o.cancelledAt || excludedNames.has(o.name) || date < ctx.from || date > ctx.to) continue;
      points.push({ date, metric: "orders", value: 1 }, { date, metric: "store_revenue", value: Number(o.totalPriceSet.shopMoney.amount) });
    }
    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }

  // Sum, then fill quiet days with real zeros: Shopify leaves them out.
  const summed = new Map<string, MetricPoint>();
  for (const p of points) {
    const k = `${p.date}|${p.metric}`;
    const cur = summed.get(k);
    if (cur) cur.value += p.value;
    else summed.set(k, { ...p });
  }
  for (const d of days)
    for (const m of ["store_sessions", "store_sessions_social", "add_to_cart", "reached_checkout", "orders", "store_revenue"])
      if (!summed.has(`${d}|${m}`)) summed.set(`${d}|${m}`, { date: d, metric: m, value: 0 });

  return { metrics: [...summed.values()], extraRows: cityRows.size };
};
