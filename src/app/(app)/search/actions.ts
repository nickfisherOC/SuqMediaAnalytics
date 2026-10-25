"use server";

import { refresh } from "next/cache";
import { getAppContext } from "@/lib/data/source";
import { createUserClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { postRankChecks, rankCheckerConfigured } from "@/lib/sync/rank-checks";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

async function admin() {
  const ctx = await getAppContext();
  if (ctx.mode !== "live") throw new Error("Preview mode doesn't save anything.");
  if (ctx.viewer.role !== "admin") throw new Error("Only admins can change the keyword list.");
  return ctx;
}

export async function addKeyword(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await admin();
    const brand = ctx.brands.find((b) => b.slug === String(formData.get("brand") ?? ""));
    const keyword = String(formData.get("keyword") ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    const group = String(formData.get("group") ?? "").trim().slice(0, 60) || "Other";
    if (!brand) return { ok: false, message: "Unknown brand." };
    if (keyword.length < 2) return { ok: false, message: "Type a search first." };
    const db = await createUserClient();
    const { error } = await db.from("search_keywords").insert({ brand_id: brand.id, keyword, group_name: group, created_by: ctx.viewer.id });
    if (error) return { ok: false, message: error.code === "23505" ? "That keyword is already on the list." : error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeKeyword(id: string): Promise<ActionResult> {
  try {
    await admin();
    const db = await createUserClient();
    const { error } = await db.from("search_keywords").delete().eq("id", id);
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Queues an exact-position check of this brand's keywords from Edmonton and Calgary. Results arrive in a few minutes. */
export async function checkRanksNow(brandSlug: string): Promise<ActionResult> {
  try {
    const ctx = await admin();
    if (!rankCheckerConfigured()) return { ok: false, message: "The rank checker isn't set up yet (missing DATAFORSEO_AUTH)." };
    const brand = ctx.brands.find((b) => b.slug === brandSlug);
    if (!brand) return { ok: false, message: "Unknown brand." };
    const db = createServiceClient();
    const { count } = await db.from("rank_checks").select("*", { count: "exact", head: true }).eq("brand_id", brand.id).eq("checked_on", ctx.today);
    if (count) return { ok: false, message: "Already checked today. Results show here once Google has been searched." };
    const posted = await postRankChecks(db, [brand], ctx.today);
    refresh();
    return { ok: true, message: `Checking ${posted} searches. Results show up here in a few minutes.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
