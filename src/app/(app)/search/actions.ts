"use server";

import { refresh } from "next/cache";
import { getAppContext } from "@/lib/data/source";
import { createUserClient } from "@/lib/supabase/server";

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
