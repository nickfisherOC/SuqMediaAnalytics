import "server-only";
import { cache } from "react";
import { isPlatform } from "@/config/platforms";
import { addDays, minDate } from "@/lib/dates";
import { goalProgress, goalWindow, type Cadence, type Direction, type Goal, type GoalProgress } from "@/lib/goals";
import { MetricStore } from "@/lib/metrics/engine";
import { figureId } from "@/lib/pack";
import { createUserClient } from "@/lib/supabase/server";
import { getAppContext, getMetricRows } from "./source";

/** Every goal for the active brands. */
export const getGoals = cache(async (): Promise<Goal[]> => {
  const ctx = await getAppContext();
  if (ctx.mode === "preview") return [];
  const db = await createUserClient();
  const { data, error } = await db.from("goals").select("id, brand_id, metric_key, platform, label, target, cadence, direction, start_date, deadline").order("created_at");
  if (error) throw error;
  const slugById = new Map(ctx.brands.map((b) => [b.id, b.slug]));
  return data
    .filter((g) => slugById.has(g.brand_id))
    .map((g) => ({
      id: g.id,
      brand: slugById.get(g.brand_id)!,
      metric: g.metric_key,
      platform: g.platform === "all" || isPlatform(g.platform) ? g.platform : "all",
      label: g.label,
      target: Number(g.target),
      cadence: g.cadence as Cadence,
      direction: g.direction as Direction | null,
      startDate: g.start_date,
      deadline: g.deadline,
    }));
});

/** How every goal is going today, plus a lookup by figure id ("brand.metric.platform") for tiles. */
export const getGoalProgress = cache(async (): Promise<{ all: GoalProgress[]; byFigure: Record<string, GoalProgress> }> => {
  const ctx = await getAppContext();
  const goals = await getGoals();
  if (!goals.length) return { all: [], byFigure: {} };
  // Enough history for every goal's window, the one before it, and a follower starting point.
  const from = goals
    .map((g) => {
      const w = goalWindow(g, ctx.today);
      return addDays(w.previous?.from ?? w.from, -31);
    })
    .reduce(minDate);
  const rows = await getMetricRows([...new Set(goals.map((g) => g.brand))], from, ctx.today);
  const all = goals.map((g) => {
    const brand = ctx.brands.find((b) => b.slug === g.brand)!;
    return goalProgress(g, new MetricStore(rows.filter((r) => r.brand === g.brand)), brand.platforms, ctx.today);
  });
  const byFigure: Record<string, GoalProgress> = {};
  for (const p of all) byFigure[figureId(p.goal.brand, p.goal.metric, p.goal.platform)] ??= p;
  return { all, byFigure };
});
