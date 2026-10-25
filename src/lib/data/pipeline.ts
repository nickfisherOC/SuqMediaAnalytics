import "server-only";
import type { BrandSettings } from "@/config/brands";
import { parseControls, type Controls } from "@/lib/controls";
import { edmontonDateOf, type ISODate } from "@/lib/dates";
import type { Figure } from "@/lib/pack";
import {
  byStage,
  bySource,
  waitingDeals,
  weekly,
  type LeadRow,
  type SourceSummary,
  type StageRow,
  type StageSummary,
  type WaitingDeal,
  type WeekSummary,
} from "@/lib/pipeline";
import { compareLabel } from "@/lib/review";
import { createUserClient } from "@/lib/supabase/server";
import { getAppContext, userWeekReader, type AppContext } from "./source";
import { loadWeek } from "./week";

export interface BrandPipeline {
  brand: BrandSettings;
  /** Period figures for the scoreboard, in display order. */
  tiles: Figure[];
  stages: StageSummary[];
  waiting: WaitingDeal[];
  sources: SourceSummary[];
  weeks: WeekSummary[];
  firstSyncDate: ISODate | null;
}

export interface PipelinePage {
  ctx: AppContext;
  controls: Controls;
  compareLabel: string;
  pipelines: BrandPipeline[];
}

const TILE_METRICS = [
  ["leads", "lead_rescue"],
  ["leads_from_ads", "lead_rescue"],
  ["cost_per_lead", "all"],
  ["quotes_sent", "lead_rescue"],
  ["deals_won", "lead_rescue"],
  ["revenue_won", "lead_rescue"],
] as const;

/** Data starts here; the weekly chart begins on this week. */
const DATA_START: ISODate = "2026-10-01";

export async function loadPipelinePage(params: Record<string, string | string[] | undefined>): Promise<PipelinePage> {
  const ctx = await getAppContext();
  const controls = parseControls(params, ctx.brands, ctx.today);
  // Every brand with a CRM connected, whatever the brand picker says.
  const brands = ctx.brands.filter((b) => b.platforms.includes("lead_rescue"));
  const page = { ctx, controls, compareLabel: compareLabel(controls), pipelines: [] as BrandPipeline[] };
  if (!brands.length) return page;

  const weeks = await loadWeek({ ...controls, brands }, userWeekReader);
  if (ctx.mode === "preview") {
    page.pipelines = weeks.map((w) => ({ brand: w.brand, tiles: tilesOf(w.brand, w.pack.figures), stages: [], waiting: [], sources: [], weeks: [], firstSyncDate: null }));
    return page;
  }

  const db = await createUserClient();
  page.pipelines = await Promise.all(
    weeks.map(async (w) => {
      const brand = w.brand;
      const { data: accounts } = await db.from("accounts").select("id, created_at").eq("brand_id", brand.id).eq("platform", "lead_rescue").neq("status", "sample");
      const accountIds = (accounts ?? []).map((a) => a.id);
      const firstSyncDate = accounts?.length ? accounts.map((a) => edmontonDateOf(a.created_at)).sort()[0] : null;
      if (!accountIds.length) return { brand, tiles: tilesOf(brand, w.pack.figures), stages: [], waiting: [], sources: [], weeks: [], firstSyncDate };

      const [{ data: stageRows, error: sErr }, { data: leadRows, error: lErr }] = await Promise.all([
        db.from("pipeline_stages").select("id, name, position, is_won, is_lost").in("account_id", accountIds),
        db
          .from("leads")
          .select("id, created_date, form, source_channel, is_spam, stage_id, value, quote_sent_at, won_at, lost_at")
          .eq("brand_id", brand.id)
          .eq("is_sample", false)
          .limit(5000),
      ]);
      if (sErr) throw sErr;
      if (lErr) throw lErr;
      const stages: StageRow[] = stageRows.map((s) => ({ id: s.id, name: s.name, position: s.position, isWon: s.is_won, isLost: s.is_lost }));
      const leads: LeadRow[] = leadRows.map((l) => ({
        id: l.id,
        createdDate: l.created_date,
        form: l.form,
        sourceChannel: l.source_channel,
        isSpam: l.is_spam,
        stageId: l.stage_id,
        value: Number(l.value ?? 0),
        quoteSentAt: l.quote_sent_at,
        wonAt: l.won_at,
        lostAt: l.lost_at,
      }));

      // When each deal entered its current stage: the latest stage event for it.
      const enteredAt = new Map<string, string>();
      const ids = leads.map((l) => l.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { data: events } = await db
          .from("lead_stage_events")
          .select("lead_id, stage_id, entered_at")
          .in("lead_id", ids.slice(i, i + 200))
          .order("entered_at", { ascending: false });
        for (const e of events ?? []) {
          const lead = leads.find((l) => l.id === e.lead_id);
          if (lead && e.stage_id === lead.stageId && !enteredAt.has(e.lead_id)) enteredAt.set(e.lead_id, e.entered_at);
        }
      }

      return {
        brand,
        tiles: tilesOf(brand, w.pack.figures),
        stages: byStage(stages, leads),
        waiting: waitingDeals(stages, leads, enteredAt, firstSyncDate ?? ctx.today, ctx.today),
        sources: bySource(leads, controls.period),
        weeks: weekly(leads, DATA_START, ctx.today),
        firstSyncDate,
      };
    }),
  );
  return page;
}

function tilesOf(brand: BrandSettings, figures: Record<string, Figure>) {
  return TILE_METRICS.map(([m, p]) => figures[`${brand.slug}.${m}.${p}`]).filter(Boolean);
}
