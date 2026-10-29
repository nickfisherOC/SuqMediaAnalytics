"use server";

import { refresh } from "next/cache";
import { getViewer } from "@/lib/data/source";
import { isISODate } from "@/lib/dates";
import { createUserClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

async function live() {
  const ctx = await getViewer();
  if (ctx.mode !== "live") throw new Error("Preview mode doesn't save anything.");
  return ctx;
}

const fail = (e: unknown): ActionResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) });

async function update(id: string, fields: Record<string, unknown>): Promise<ActionResult> {
  try {
    await live();
    const db = await createUserClient();
    const { error } = await db
      .from("production_jobs")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Move a job to a step and a place within it. */
export async function moveJob(id: string, stepId: string, sortOrder: number, stepChanged: boolean): Promise<ActionResult> {
  if (!Number.isFinite(sortOrder)) return { ok: false, message: "That move didn't work. Try again." };
  return update(id, { step_id: stepId, sort_order: sortOrder, ...(stepChanged ? { step_changed_at: new Date().toISOString() } : {}) });
}

export async function setRush(id: string, rush: boolean): Promise<ActionResult> {
  return update(id, { rush });
}

export async function setDueDate(id: string, due: string): Promise<ActionResult> {
  return update(id, { due_date: isISODate(due) ? due : null });
}

/** Take a job off the board. It's kept, so a won deal isn't added again. */
export async function removeJob(id: string): Promise<ActionResult> {
  return update(id, { removed_at: new Date().toISOString() });
}

/** A job that isn't a Lead Rescue deal, e.g. merch. Goes to the bottom of the first step. */
export async function addJob(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await live();
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return { ok: false, message: "Give the job a name." };
    const due = String(formData.get("due") ?? "");
    const db = await createUserClient();
    const { data: first } = await db.from("production_steps").select("id").order("position").limit(1).maybeSingle();
    if (!first) return { ok: false, message: "There are no production steps set up." };
    const { error } = await db.from("production_jobs").insert({
      title: title.slice(0, 120),
      due_date: isISODate(due) ? due : null,
      rush: formData.get("rush") === "on",
      step_id: first.id,
      created_by: ctx.viewer.id,
    });
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
