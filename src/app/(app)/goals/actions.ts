"use server";

import { refresh } from "next/cache";
import { getMetric } from "@/config/metrics";
import { isPlatform, PLATFORM_INFO } from "@/config/platforms";
import { getAppContext } from "@/lib/data/source";
import { isISODate } from "@/lib/dates";
import { createUserClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

async function admin() {
  const ctx = await getAppContext();
  if (ctx.mode !== "live") throw new Error("Preview mode doesn't save anything.");
  if (ctx.viewer.role !== "admin") throw new Error("Only admins can set goals.");
  return ctx;
}

const fail = (e: unknown): ActionResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) });

export async function addGoal(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await admin();
    const brand = ctx.brands.find((b) => b.slug === String(formData.get("brand") ?? ""));
    if (!brand) return { ok: false, message: "Pick a brand." };
    const metricKey = String(formData.get("metric") ?? "");
    let def;
    try {
      def = getMetric(metricKey);
    } catch {
      return { ok: false, message: "Pick a number to aim for." };
    }
    const platform = String(formData.get("platform") ?? "all");
    if (platform !== "all" && (!isPlatform(platform) || !def.platforms.includes(platform))) return { ok: false, message: "That platform doesn't have this number." };
    const target = Number(String(formData.get("target") ?? "").replace(/[$,%\s]/g, ""));
    if (!Number.isFinite(target) || target < 0) return { ok: false, message: "Type the target as a number." };
    const cadence = String(formData.get("cadence") ?? "week");
    if (!["week", "month", "deadline"].includes(cadence)) return { ok: false, message: "Pick how often." };
    const deadline = String(formData.get("deadline") ?? "");
    if (cadence === "deadline" && (!isISODate(deadline) || deadline <= ctx.today)) return { ok: false, message: "Pick a deadline in the future." };
    const label = platform === "all" || def.platforms.length === 1 ? def.label : `${PLATFORM_INFO[platform as keyof typeof PLATFORM_INFO].label} ${def.label.toLowerCase()}`;

    const db = await createUserClient();
    const { error } = await db.from("goals").insert({
      brand_id: brand.id,
      metric_key: def.key,
      platform,
      label,
      target,
      cadence,
      start_date: ctx.today,
      deadline: cadence === "deadline" ? deadline : null,
      created_by: ctx.viewer.id,
    });
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteGoal(id: string): Promise<ActionResult> {
  try {
    await admin();
    const db = await createUserClient();
    const { error } = await db.from("goals").delete().eq("id", id);
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
