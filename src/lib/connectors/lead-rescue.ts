import { eachDay, edmontonDateOf, type ISODate } from "@/lib/dates";
import { fetchJson } from "./http";
import { ConnectorConfigError, type Connector, type MetricPoint, type SyncContext } from "./types";

/**
 * Lead Rescue (Growtheon) workspace API: https://api.workspaceconnector.com/v1,
 * authenticated with an `x-api-key` header.
 *
 * Pulse stores deals (no names, emails or phone numbers) and their stage
 * changes. The API only exposes each deal's current stage, so stage history
 * starts the day Pulse first synced; dates before that are estimated from
 * each deal's last update.
 */

const BASE = "https://api.workspaceconnector.com/v1";

interface Stage {
  id: string;
  name: string;
  stage_order?: number;
  sort_order?: number;
  is_won?: boolean;
  is_closed?: boolean;
}
interface Pipeline {
  id: string;
  name: string;
  stages?: Stage[];
}
interface Deal {
  id: string;
  contact_id: string | null;
  pipeline_id: string;
  pipeline_stage_id: string;
  stage: string;
  value: number | null;
  lead_source: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  archived_at?: string | null;
  closed_at?: string | null;
}
interface Contact {
  id: string;
  lead_source: string | null;
  status?: string;
}

async function api<T>(ctx: SyncContext, key: string, path: string): Promise<T> {
  const { status, body } = await fetchJson<{ success?: boolean; data?: T; error?: string; meta?: { total?: number } }>(`${BASE}/${path}`, {
    headers: { "x-api-key": key, Accept: "application/json" },
  });
  if (status === 401 || status === 403) throw new ConnectorConfigError(`Lead Rescue: the API key was refused (${status}).`);
  if (!body?.success) throw new Error(`Lead Rescue: ${path} failed (${status}) ${body?.error ?? ""}`.trim());
  ctx.capture({ endpoint: path.split("?")[0], params: { path }, payload: body });
  return body.data as T;
}

async function all<T>(ctx: SyncContext, key: string, resource: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 100; page++) {
    const rows = await api<T[]>(ctx, key, `${resource}?limit=100&page=${page}`);
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

export type SourceChannel = "meta_ads" | "organic_social" | "google" | "referral" | "direct" | "other" | "unknown";

/** Where a lead came from, from Lead Rescue's lead source text. Exported for tests. */
export function channelOf(source: string | null | undefined): SourceChannel {
  const s = (source ?? "").toLowerCase();
  if (!s) return "unknown";
  if (s.includes("ad landing") || s.includes("facebook ad") || s.includes("meta ad")) return "meta_ads";
  if (s.includes("google")) return "google";
  if (s.includes("instagram") || s.includes("facebook") || s.includes("tiktok")) return "organic_social";
  if (s.includes("referral") || s.endsWith(" contact")) return "referral";
  if (s.startsWith("form:")) return "direct";
  return "other";
}

const order = (s: Stage) => s.stage_order ?? s.sort_order ?? 0;

export const leadRescue: Connector = async (ctx) => {
  const key = await ctx.secret("access");
  const pipelines = await api<Pipeline[]>(ctx, key, "pipelines");
  if (!pipelines.length) throw new ConnectorConfigError("Lead Rescue: no pipelines found in this workspace.");

  // Stages, read from the API (names change).
  const stageRows: { pipeline: Pipeline; stage: Stage }[] = [];
  for (const p of pipelines) {
    const detail = await api<Pipeline>(ctx, key, `pipelines/${p.id}`);
    for (const st of detail.stages ?? []) stageRows.push({ pipeline: p, stage: st });
  }
  const { data: savedStages, error: stErr } = await ctx.db
    .from("pipeline_stages")
    .upsert(
      stageRows.map(({ pipeline, stage }) => ({
        account_id: ctx.account.id,
        external_id: stage.id,
        pipeline_id: pipeline.id,
        pipeline_name: pipeline.name,
        name: stage.name,
        position: order(stage),
        is_won: Boolean(stage.is_won),
        is_lost: Boolean(stage.is_closed && !stage.is_won),
      })),
      { onConflict: "account_id,external_id" },
    )
    .select("id, external_id, name, position, is_won, is_lost, pipeline_id");
  if (stErr) throw stErr;
  const stageByExt = new Map(savedStages.map((s) => [s.external_id, s]));
  // Per pipeline: the first stage (new requests) and the Quote Sent stage.
  const firstPos = new Map<string, number>();
  const quotePos = new Map<string, number>();
  for (const s of savedStages) {
    firstPos.set(s.pipeline_id, Math.min(firstPos.get(s.pipeline_id) ?? Infinity, s.position));
    if (/quote sent/i.test(s.name)) quotePos.set(s.pipeline_id, s.position);
  }

  const [deals, contacts] = await Promise.all([all<Deal>(ctx, key, "deals"), all<Contact>(ctx, key, "contacts")]);
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const live = deals.filter((d) => !d.deleted_at && !d.archived_at);

  // Closed deals: fetch detail for the close date.
  for (const d of live) {
    const st = stageByExt.get(d.pipeline_stage_id);
    if (st && (st.is_won || st.is_lost) && !d.closed_at) {
      const detail = await api<Deal>(ctx, key, `deals/${d.id}`);
      d.closed_at = detail.closed_at ?? null;
    }
  }

  // Existing leads, to detect stage changes.
  const { data: existing, error: exErr } = await ctx.db
    .from("leads")
    .select("id, external_id, stage_id, quote_sent_at")
    .eq("account_id", ctx.account.id);
  if (exErr) throw exErr;
  const existingByExt = new Map(existing.map((l) => [l.external_id, l]));
  const now = new Date().toISOString();

  const leadRows = live.map((d) => {
    const st = stageByExt.get(d.pipeline_stage_id);
    const contact = d.contact_id ? contactById.get(d.contact_id) : undefined;
    const source = contact?.lead_source ?? d.lead_source;
    const prev = existingByExt.get(d.id);
    const qp = quotePos.get(d.pipeline_id);
    const reachedQuote = st && qp !== undefined && st.position >= qp && !st.is_lost;
    return {
      account_id: ctx.account.id,
      brand_id: ctx.account.brandId,
      external_id: d.id,
      created_at_source: d.created_at,
      created_date: edmontonDateOf(d.created_at),
      form: source,
      source_channel: channelOf(source),
      is_spam: contact?.status === "spam",
      stage_id: st?.id ?? null,
      value: d.value ?? 0,
      // First time seen at/after Quote Sent: estimate from its last update; later, the day the change was seen.
      quote_sent_at: prev?.quote_sent_at ?? (reachedQuote ? (prev ? now : d.updated_at) : null),
      won_at: st?.is_won ? (d.closed_at ?? d.updated_at) : null,
      lost_at: st?.is_lost ? (d.closed_at ?? d.updated_at) : null,
      is_sample: false,
      updated_at: now,
    };
  });

  const { data: saved, error: lErr } = await ctx.db
    .from("leads")
    .upsert(leadRows, { onConflict: "account_id,external_id" })
    .select("id, external_id, stage_id");
  if (lErr) throw lErr;

  // Stage history: one event whenever the stage differs from what we last saw.
  const events = saved
    .filter((l) => l.stage_id && existingByExt.get(l.external_id)?.stage_id !== l.stage_id)
    .map((l) => {
      const d = live.find((x) => x.id === l.external_id)!;
      return { lead_id: l.id, stage_id: l.stage_id, entered_at: existingByExt.has(l.external_id) ? now : d.updated_at };
    });
  if (events.length) {
    const { error } = await ctx.db.from("lead_stage_events").upsert(events, { onConflict: "lead_id,stage_id,entered_at", ignoreDuplicates: true });
    if (error) throw error;
  }

  return { metrics: dailyMetrics(leadRows, savedStages, firstPos, ctx.from, ctx.to), extraRows: leadRows.length + events.length };
};

type LeadRow = {
  created_date: ISODate;
  source_channel: SourceChannel;
  is_spam: boolean;
  stage_id: string | null;
  value: number;
  quote_sent_at: string | null;
  won_at: string | null;
  lost_at: string | null;
};

/** Daily pipeline numbers from the full list of deals. Exported for tests. */
export function dailyMetrics(
  leads: LeadRow[],
  stages: { id: string; position: number; pipeline_id: string }[],
  firstPos: Map<string, number>,
  from: ISODate,
  to: ISODate,
): MetricPoint[] {
  const stageById = new Map(stages.map((s) => [s.id, s]));
  const days = eachDay(from, to);
  const keys = ["leads", "leads_from_ads", "qualified_leads", "qualified_leads_from_ads", "spam_leads", "quotes_sent", "deals_won", "deals_lost", "revenue_won", "pipeline_value"];
  const v = new Map<string, number>();
  for (const d of days) for (const k of keys) v.set(`${d}|${k}`, 0);
  const add = (date: ISODate, k: string, n: number) => {
    const key = `${date}|${k}`;
    if (v.has(key)) v.set(key, v.get(key)! + n);
  };

  for (const l of leads) {
    if (l.is_spam) {
      add(l.created_date, "spam_leads", 1);
      continue;
    }
    const st = l.stage_id ? stageById.get(l.stage_id) : undefined;
    const fromAds = l.source_channel === "meta_ads" ? 1 : 0;
    add(l.created_date, "leads", 1);
    add(l.created_date, "leads_from_ads", fromAds);
    const qualified = st ? st.position > (firstPos.get(st.pipeline_id) ?? 0) : false;
    if (qualified) {
      add(l.created_date, "qualified_leads", 1);
      add(l.created_date, "qualified_leads_from_ads", fromAds);
    }
    if (l.quote_sent_at) add(edmontonDateOf(l.quote_sent_at), "quotes_sent", 1);
    const wonDay = l.won_at ? edmontonDateOf(l.won_at) : null;
    const lostDay = l.lost_at ? edmontonDateOf(l.lost_at) : null;
    if (wonDay) {
      add(wonDay, "deals_won", 1);
      add(wonDay, "revenue_won", l.value);
    }
    if (lostDay) add(lostDay, "deals_lost", 1);
    // Open on a day: created by then and not yet closed.
    const closed = wonDay ?? lostDay;
    for (const d of days) if (d >= l.created_date && (!closed || d < closed)) add(d, "pipeline_value", l.value);
  }

  return [...v].map(([k, value]) => {
    const [date, metric] = k.split("|");
    return { date, metric, value };
  });
}
