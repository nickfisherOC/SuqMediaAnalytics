"use server";

import { refresh } from "next/cache";
import { getAppContext } from "@/lib/data/source";
import { isISODate } from "@/lib/dates";
import { generateForBrand } from "@/lib/ai/weekly";
import { parseControls } from "@/lib/controls";
import { createUserClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

async function liveMember() {
  const ctx = await getAppContext();
  if (ctx.mode !== "live") throw new Error("Preview mode doesn't save anything.");
  return ctx;
}

const fail = (e: unknown): ActionResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) });

export async function addActionItem(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await liveMember();
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return { ok: false, message: "Give the action item a title." };

    // Optional: the figure this item should move, as "brand.metric.platform", with its value now.
    const target = String(formData.get("target") ?? "");
    const [brandSlug, metric, platform] = target ? target.split(".") : [];
    const brand = ctx.brands.find((b) => b.slug === brandSlug);
    const baseline = Number(formData.get("baseline"));
    const due = String(formData.get("due") ?? "");
    const baselineFrom = String(formData.get("baseline_from") ?? "");
    const baselineTo = String(formData.get("baseline_to") ?? "");

    const db = await createUserClient();
    const { error } = await db.from("action_items").insert({
      brand_id: brand?.id ?? null,
      title: title.slice(0, 300),
      owner_name: String(formData.get("owner") ?? "").trim().slice(0, 100) || null,
      due_date: isISODate(due) ? due : null,
      target_metric: metric || null,
      target_platform: metric ? platform || "all" : null,
      baseline_value: metric && Number.isFinite(baseline) ? baseline : null,
      baseline_from: metric && isISODate(baselineFrom) ? baselineFrom : null,
      baseline_to: metric && isISODate(baselineTo) ? baselineTo : null,
      created_by: ctx.viewer.id,
    });
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setActionStatus(id: string, status: "open" | "done" | "dropped"): Promise<ActionResult> {
  try {
    await liveMember();
    const db = await createUserClient();
    const { error } = await db.from("action_items").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** A dated note. Stored as a timeline annotation, so it also marks the charts. */
export async function addNote(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await liveMember();
    const text = String(formData.get("text") ?? "").trim();
    if (!text) return { ok: false, message: "Write something first." };
    const date = String(formData.get("date") ?? "");
    const brand = ctx.brands.find((b) => b.slug === String(formData.get("brand") ?? ""));
    const [first, ...rest] = text.split("\n");
    const db = await createUserClient();
    const { error } = await db.from("annotations").insert({
      brand_id: brand?.id ?? null,
      date: isISODate(date) ? date : ctx.today,
      title: first.slice(0, 300),
      body: rest.join("\n").trim().slice(0, 5000) || null,
      created_by: ctx.viewer.id,
    });
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteNote(id: string): Promise<ActionResult> {
  try {
    await liveMember();
    const db = await createUserClient();
    // RLS lets people delete their own notes; admins can delete any.
    const { error } = await db.from("annotations").delete().eq("id", id);
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Turns an AI idea into an action item, recording the target number's value now as the baseline. */
export async function acceptRecommendation(id: string, owner: string): Promise<ActionResult> {
  try {
    const ctx = await liveMember();
    const db = await createUserClient();
    const { data: rec, error } = await db.from("recommendations").select("*").eq("id", id).maybeSingle();
    if (error || !rec) return { ok: false, message: error?.message ?? "That idea no longer exists. Refresh the page." };
    if (rec.status !== "proposed") return { ok: false, message: "Someone already decided on this one." };

    const brand = ctx.brands.find((b) => b.id === rec.brand_id);
    const { data: narrative } = await db.from("narratives").select("output").eq("brand_id", rec.brand_id).eq("week_start", rec.week_start).maybeSingle();
    const out = narrative?.output as { values?: Record<string, number | null>; period?: { from: string; to: string } } | undefined;
    const baseline = brand ? out?.values?.[`${brand.slug}.${rec.target_metric}.${rec.target_platform}`] : undefined;

    const { error: iErr } = await db.from("action_items").insert({
      brand_id: rec.brand_id,
      recommendation_id: rec.id,
      title: rec.what.slice(0, 300),
      owner_name: owner.trim().slice(0, 100) || null,
      target_metric: rec.target_metric,
      target_platform: rec.target_platform,
      expected_direction: rec.expected_direction,
      baseline_value: typeof baseline === "number" ? baseline : null,
      baseline_from: out?.period?.from ?? null,
      baseline_to: out?.period?.to ?? null,
      created_by: ctx.viewer.id,
    });
    if (iErr) return { ok: false, message: iErr.message };
    const { error: uErr } = await db
      .from("recommendations")
      .update({ status: "accepted", decided_by: ctx.viewer.id, decided_at: new Date().toISOString() })
      .eq("id", id);
    if (uErr) return { ok: false, message: uErr.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectRecommendation(id: string): Promise<ActionResult> {
  try {
    const ctx = await liveMember();
    const db = await createUserClient();
    const { error } = await db
      .from("recommendations")
      .update({ status: "rejected", decided_by: ctx.viewer.id, decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "proposed");
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Rewrites one brand's AI summary for the period on screen. Takes about a minute. */
export async function rewriteSummary(brandSlug: string, params: Record<string, string>): Promise<ActionResult> {
  try {
    const ctx = await liveMember();
    if (!process.env.ANTHROPIC_API_KEY?.trim()) return { ok: false, message: "The AI isn't set up (missing API key)." };
    const brand = ctx.brands.find((b) => b.slug === brandSlug);
    if (!brand) return { ok: false, message: "Unknown brand." };
    const controls = parseControls(params, ctx.brands, ctx.today);
    const r = await generateForBrand(createServiceClient(), ctx.brands, controls, brand, ctx.today, ctx.viewer.email);
    refresh();
    return { ok: r.ok, message: r.message };
  } catch (e) {
    return fail(e);
  }
}
