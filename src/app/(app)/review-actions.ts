"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseControls } from "@/lib/controls";
import { getAppContext } from "@/lib/data/source";
import { loadWeek } from "@/lib/data/week";
import { addDays, isISODate, isoWeekday } from "@/lib/dates";
import { buildReview, REVIEW_VERSION } from "@/lib/review";
import { createUserClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const SHARE_DAYS = 14;

function validWeek(weekStart: string) {
  return isISODate(weekStart) && isoWeekday(weekStart) === 1;
}

/** The week's meeting row, created on first use. */
async function ensureMeeting(db: SupabaseClient, weekStart: string): Promise<{ id: string; locked_at: string | null }> {
  const { data: found } = await db.from("meetings").select("id, locked_at").eq("week_start", weekStart).maybeSingle();
  if (found) return found;
  await db.from("meetings").upsert({ week_start: weekStart }, { onConflict: "week_start", ignoreDuplicates: true });
  const { data, error } = await db.from("meetings").select("id, locked_at").eq("week_start", weekStart).single();
  if (error) throw error;
  return data;
}

async function liveMember() {
  const ctx = await getAppContext();
  if (ctx.mode !== "live") throw new Error("Preview mode doesn't save anything.");
  return ctx;
}

export async function saveNotes(weekStart: string, notes: string): Promise<ActionResult> {
  try {
    await liveMember();
    if (!validWeek(weekStart)) return { ok: false, message: "Notes belong to a Mon–Sun week." };
    const db = await createUserClient();
    const m = await ensureMeeting(db, weekStart);
    if (m.locked_at) return { ok: false, message: "This week is locked." };
    const { error } = await db.from("meetings").update({ notes: notes.slice(0, 20000) }).eq("id", m.id);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function addActionItem(weekStart: string, formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await liveMember();
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return { ok: false, message: "Give the action item a title." };
    if (!validWeek(weekStart)) return { ok: false, message: "Action items belong to a Mon–Sun week." };

    // Optional: the figure this item should move, as "brand.metric.platform", with its value now.
    const target = String(formData.get("target") ?? "");
    const [brandSlug, metric, platform] = target ? target.split(".") : [];
    const brand = ctx.brands.find((b) => b.slug === (brandSlug || String(formData.get("brand") ?? "")));
    const baseline = Number(formData.get("baseline"));
    const due = String(formData.get("due") ?? "");

    const db = await createUserClient();
    const m = await ensureMeeting(db, weekStart);
    const { error } = await db.from("action_items").insert({
      meeting_id: m.id,
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
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
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
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Freezes the week: every number, the summary, top content, flags and notes.
 * Rebuilt here on the server from live data rather than trusting the browser.
 */
export async function lockWeek(weekStart: string): Promise<ActionResult> {
  try {
    const ctx = await liveMember();
    if (ctx.viewer.role !== "admin") return { ok: false, message: "Only admins can lock a week." };
    if (!validWeek(weekStart)) return { ok: false, message: "Only a full Mon–Sun week can be locked." };
    if (addDays(weekStart, 6) >= ctx.today) return { ok: false, message: "This week isn't over yet." };

    const controls = parseControls({ brand: "all", period: "custom", from: weekStart, to: addDays(weekStart, 6), compare: "previous" }, ctx.brands, ctx.today);
    const weeks = await loadWeek(controls);
    const db = await createUserClient();
    const m = await ensureMeeting(db, weekStart);
    if (m.locked_at) return { ok: false, message: "This week is already locked." };

    // Snapshots are immutable, so insert-only; a retry after a half-finished lock keeps the first copy.
    const service = createServiceClient();
    const { error: sErr } = await service.from("week_snapshots").upsert(
      weeks.map((w) => ({
        meeting_id: m.id,
        brand_id: w.brand.id,
        pack: { ...buildReview(w, { compareKey: "previous", periodKey: "last_week" }), version: REVIEW_VERSION },
      })),
      { onConflict: "meeting_id,brand_id", ignoreDuplicates: true },
    );
    if (sErr) return { ok: false, message: sErr.message };

    const { error } = await db.from("meetings").update({ locked_at: new Date().toISOString(), locked_by: ctx.viewer.id }).eq("id", m.id);
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true, message: "Week locked." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** A read-only link to a locked week that stops working after two weeks. */
export async function createShareLink(weekStart: string): Promise<ActionResult & { url?: string }> {
  try {
    const ctx = await liveMember();
    if (ctx.viewer.role !== "admin") return { ok: false, message: "Only admins can share a week." };
    const db = await createUserClient();
    const { data: m } = await db.from("meetings").select("id, locked_at").eq("week_start", weekStart).maybeSingle();
    if (!m?.locked_at) return { ok: false, message: "Lock the week first, so the shared numbers can't change." };
    const token = randomBytes(24).toString("base64url");
    const expires = new Date(Date.now() + SHARE_DAYS * 86_400_000).toISOString();
    // Locked meetings refuse edits from browsers; sharing is set with the service role after the admin check above.
    const { error } = await createServiceClient().from("meetings").update({ share_token: token, share_expires_at: expires }).eq("id", m.id);
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true, url: `/share/${token}`, message: `Link works for ${SHARE_DAYS} days.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
