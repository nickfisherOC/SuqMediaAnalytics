"use server";

import { refresh } from "next/cache";
import { getAppContext } from "@/lib/data/source";
import { isISODate } from "@/lib/dates";
import { createUserClient } from "@/lib/supabase/server";

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

    const db = await createUserClient();
    const { error } = await db.from("action_items").insert({
      brand_id: brand?.id ?? null,
      title: title.slice(0, 300),
      owner_name: String(formData.get("owner") ?? "").trim().slice(0, 100) || null,
      due_date: isISODate(due) ? due : null,
      target_metric: metric || null,
      target_platform: metric ? platform || "all" : null,
      baseline_value: metric && Number.isFinite(baseline) ? baseline : null,
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
