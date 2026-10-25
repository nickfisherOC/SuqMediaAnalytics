"use server";

import { refresh } from "next/cache";
import type { FunnelStepSpec, TileSpec } from "@/config/brands";
import { getMetric } from "@/config/metrics";
import { isPlatform, type Platform } from "@/config/platforms";
import { cleanSpecs, defaultTiles, HEX, slugify } from "@/lib/brand-settings";
import { getAppContext } from "@/lib/data/source";
import { isISODate } from "@/lib/dates";
import { createUserClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

async function admin() {
  const ctx = await getAppContext();
  if (ctx.mode !== "live") throw new Error("Preview mode doesn't save anything.");
  if (ctx.viewer.role !== "admin") throw new Error("Only admins can change settings.");
  return ctx;
}

const fail = (e: unknown): ActionResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) });
const done = (message?: string): ActionResult => {
  refresh();
  return { ok: true, message };
};
const role = (v: unknown) => (v === "admin" ? "admin" : "viewer");

// ── People ──────────────────────────────────────────────────────────────────

export async function inviteUser(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await admin();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "That doesn't look like an email address." };
    const db = await createUserClient();
    const { data: existing } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    if (existing) return { ok: false, message: "That person already has access." };
    const { error } = await db.from("invites").upsert({ email, role: role(formData.get("role")), invited_by: ctx.viewer.id, accepted_at: null }, { onConflict: "email" });
    if (error) return { ok: false, message: error.message };
    return done(`Invited. Send ${email} the link https://reports.peoplesuq.com and ask them to sign in with that Google account.`);
  } catch (e) {
    return fail(e);
  }
}

export async function cancelInvite(email: string): Promise<ActionResult> {
  try {
    await admin();
    const db = await createUserClient();
    const { error } = await db.from("invites").delete().eq("email", email).is("accepted_at", null);
    if (error) return { ok: false, message: error.message };
    return done();
  } catch (e) {
    return fail(e);
  }
}

async function adminCount(db: Awaited<ReturnType<typeof createUserClient>>) {
  const { count } = await db.from("profiles").select("*", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}

export async function setRole(userId: string, newRole: string): Promise<ActionResult> {
  try {
    await admin();
    const db = await createUserClient();
    const { data: person } = await db.from("profiles").select("id, email, role").eq("id", userId).maybeSingle();
    if (!person) return { ok: false, message: "That person no longer exists." };
    const next = role(newRole);
    if (person.role === "admin" && next !== "admin" && (await adminCount(db)) <= 1) return { ok: false, message: "Pulse needs at least one admin." };
    const { error } = await db.from("profiles").update({ role: next }).eq("id", userId);
    if (error) return { ok: false, message: error.message };
    await db.from("invites").update({ role: next }).eq("email", person.email);
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function removeUser(userId: string): Promise<ActionResult> {
  try {
    const ctx = await admin();
    if (userId === ctx.viewer.id) return { ok: false, message: "You can't remove yourself." };
    const db = await createUserClient();
    const { data: person } = await db.from("profiles").select("email, role").eq("id", userId).maybeSingle();
    if (!person) return { ok: false, message: "That person no longer exists." };
    if (person.role === "admin" && (await adminCount(db)) <= 1) return { ok: false, message: "Pulse needs at least one admin." };
    // Deleting the sign-in account removes the profile too; without the invite they can't come back.
    const service = createServiceClient();
    await service.from("invites").delete().eq("email", person.email);
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) return { ok: false, message: error.message };
    return done();
  } catch (e) {
    return fail(e);
  }
}

// ── Brands ──────────────────────────────────────────────────────────────────

function readPlatforms(formData: FormData): Platform[] {
  return formData.getAll("platforms").map(String).filter(isPlatform);
}

function readBrandBasics(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const shortName = String(formData.get("short_name") ?? "").trim().slice(0, 30) || name;
  const websiteRaw = String(formData.get("website") ?? "").trim();
  const website = websiteRaw ? (/^https?:\/\//.test(websiteRaw) ? websiteRaw : `https://${websiteRaw}`) : null;
  const light = String(formData.get("accent_light") ?? "");
  const dark = String(formData.get("accent_dark") ?? "");
  const cadence = Number(formData.get("cadence") ?? 0);
  if (name.length < 2) throw new Error("Give the brand a name.");
  if (!HEX.test(light) || !HEX.test(dark)) throw new Error("Pick both colours.");
  if (website) {
    try {
      new URL(website);
    } catch {
      throw new Error("The website doesn't look right, e.g. https://example.com");
    }
  }
  return { name, short_name: shortName, website, accent_light: light, accent_dark: dark, cadence_posts_per_week: Number.isFinite(cadence) && cadence >= 0 ? Math.min(cadence, 50) : 0 };
}

const withLabels = (specs: TileSpec[]): FunnelStepSpec[] => specs.map((s) => ({ ...s, label: s.label ?? getMetric(s.metric).label }));

export async function saveBrand(formData: FormData): Promise<ActionResult> {
  try {
    await admin();
    const id = String(formData.get("id") ?? "");
    const basics = readBrandBasics(formData);
    const platforms = readPlatforms(formData);
    const parse = (key: string) => {
      try {
        return JSON.parse(String(formData.get(key) ?? "[]"));
      } catch {
        return [];
      }
    };
    const scoreboard = cleanSpecs<TileSpec>(parse("scoreboard"), platforms, 8);
    const funnel = withLabels(cleanSpecs<TileSpec>(parse("funnel"), platforms, 8));
    const db = await createUserClient();
    const { error } = await db.from("brands").update({ ...basics, platforms, scoreboard, funnel }).eq("id", id);
    if (error) return { ok: false, message: error.message };
    return done("Saved.");
  } catch (e) {
    return fail(e);
  }
}

export async function addBrand(formData: FormData): Promise<ActionResult> {
  try {
    await admin();
    const basics = readBrandBasics(formData);
    const platforms = readPlatforms(formData);
    const slug = slugify(basics.name);
    if (!slug) return { ok: false, message: "Use letters or numbers in the name." };
    const db = await createUserClient();
    const { data: all } = await db.from("brands").select("slug, sort_order");
    if ((all ?? []).some((b) => b.slug === slug)) return { ok: false, message: "A brand with that name already exists (it may be archived)." };
    const { scoreboard, funnel } = defaultTiles(platforms);
    const { error } = await db.from("brands").insert({
      ...basics,
      slug,
      platforms,
      scoreboard,
      funnel,
      active: true,
      sort_order: Math.max(0, ...(all ?? []).map((b) => b.sort_order ?? 0)) + 1,
    });
    if (error) return { ok: false, message: error.message };
    return done(`${basics.name} added. Connect its accounts on the Connections page.`);
  } catch (e) {
    return fail(e);
  }
}

export async function setBrandActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const ctx = await admin();
    if (!active && ctx.brands.filter((b) => b.id !== id).length === 0) return { ok: false, message: "Pulse needs at least one active brand." };
    const db = await createUserClient();
    const { error } = await db.from("brands").update({ active }).eq("id", id);
    if (error) return { ok: false, message: error.message };
    return done();
  } catch (e) {
    return fail(e);
  }
}

// ── Content series ──────────────────────────────────────────────────────────

export async function addSeries(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await admin();
    const brand = ctx.brands.find((b) => b.slug === String(formData.get("brand") ?? ""));
    const name = String(formData.get("name") ?? "").trim().slice(0, 120);
    const start = String(formData.get("start") ?? "");
    const days = Math.round(Number(formData.get("days") ?? 0));
    if (!brand) return { ok: false, message: "Pick a brand." };
    if (name.length < 2) return { ok: false, message: "Give the series a name." };
    if (!isISODate(start)) return { ok: false, message: "Pick a start date." };
    if (!(days >= 1 && days <= 366)) return { ok: false, message: "Days should be between 1 and 366." };
    const db = await createUserClient();
    const { error } = await db.from("content_series").insert({ brand_id: brand.id, name, start_date: start, days, created_by: ctx.viewer.id });
    if (error) return { ok: false, message: error.message };
    return done();
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSeries(id: string): Promise<ActionResult> {
  try {
    await admin();
    const db = await createUserClient();
    const { error } = await db.from("content_series").delete().eq("id", id);
    if (error) return { ok: false, message: error.message };
    return done();
  } catch (e) {
    return fail(e);
  }
}

