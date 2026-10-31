"use server";

import { refresh } from "next/cache";
import { toType } from "@/lib/data/product-types";
import { getViewer } from "@/lib/data/source";
import { ICONS, keyFor, splitOptions, type CustomField, type SpecField, type SpecKind } from "@/lib/product-types";
import { createUserClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

type Db = Awaited<ReturnType<typeof createUserClient>>;

async function live() {
  const ctx = await getViewer();
  if (ctx.mode !== "live") throw new Error("Preview mode doesn't save anything.");
  return { ctx, db: await createUserClient() };
}

const fail = (e: unknown): ActionResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) });
const KINDS: SpecKind[] = ["text", "number", "choice", "yesno"];
const iconOf = (v: unknown) => ((ICONS as readonly string[]).includes(String(v)) ? String(v) : "box");

async function getType(db: Db, id: string) {
  const { data, error } = await db.from("product_types").select("id, slug, name, icon, fields").eq("id", id).single();
  if (error) throw error;
  return toType(data);
}

async function saveFields(db: Db, id: string, fields: SpecField[]) {
  return db.from("product_types").update({ fields, updated_at: new Date().toISOString() }).eq("id", id);
}

/** A key that isn't used yet in this type (or the common fields). */
function freshKey(label: string, fields: SpecField[]): string {
  const base = keyFor(label);
  const taken = new Set([...fields.map((f) => f.key), "season"]);
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
  return key;
}

async function wrap(fn: (db: Db) => Promise<{ error: { message: string } | null }>): Promise<ActionResult> {
  try {
    const { db } = await live();
    const { error } = await fn(db);
    if (error) return { ok: false, message: error.message };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Turns one product's custom field into a standard field of its type, so every
 * product of that type shows it. The product's value moves into its specs.
 */
export async function makeFieldStandard(table: "inventory" | "supplier", productId: string, label: string): Promise<ActionResult> {
  const tableName = table === "inventory" ? "inventory_products" : "supplier_products";
  return wrap(async (db) => {
    const { data: product, error } = await db.from(tableName).select("type_id, specs, custom_fields").eq("id", productId).single();
    if (error) return { error };
    if (!product.type_id) return { error: { message: "Pick a type for this product first." } };
    const type = await getType(db, product.type_id);
    const existing = type.fields.find((f) => f.label.toLowerCase() === label.trim().toLowerCase());
    const field: SpecField = existing ?? { key: freshKey(label, type.fields), label: label.trim().slice(0, 60), kind: "text" };
    if (!existing) {
      const res = await saveFields(db, type.id, [...type.fields, field]);
      if (res.error) return res;
    }
    const custom = (product.custom_fields ?? []) as CustomField[];
    const mine = custom.find((c) => c.label === label);
    return db
      .from(tableName)
      .update({
        specs: { ...(product.specs ?? {}), ...(mine?.value ? { [field.key]: mine.value } : {}) },
        custom_fields: custom.filter((c) => c.label !== label),
      })
      .eq("id", productId);
  });
}

export async function createType(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { ok: false, message: "Give the type a name." };
  return wrap(async (db) => {
    const { data: all } = await db.from("product_types").select("slug, position");
    const slugs = new Set((all ?? []).map((t) => t.slug));
    let slug = keyFor(name);
    for (let i = 2; slugs.has(slug); i++) slug = `${keyFor(name)}_${i}`;
    const position = Math.max(0, ...(all ?? []).map((t) => t.position)) + 10;
    return db.from("product_types").insert({ name, slug, icon: iconOf(formData.get("icon")), position });
  });
}

export async function updateType(id: string, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { ok: false, message: "The type needs a name." };
  return wrap(async (db) =>
    db.from("product_types").update({ name, icon: iconOf(formData.get("icon")), updated_at: new Date().toISOString() }).eq("id", id),
  );
}

/** Takes a type off the list. Its products keep their specs and show as "No type". */
export async function archiveType(id: string): Promise<ActionResult> {
  return wrap(async (db) => db.from("product_types").update({ archived_at: new Date().toISOString() }).eq("id", id));
}

export async function addField(typeId: string, formData: FormData): Promise<ActionResult> {
  const label = String(formData.get("label") ?? "").trim().slice(0, 60);
  if (!label) return { ok: false, message: "Give the field a name." };
  const kind = KINDS.includes(formData.get("kind") as SpecKind) ? (formData.get("kind") as SpecKind) : "text";
  const options = splitOptions(String(formData.get("options") ?? ""));
  if (kind === "choice" && options.length < 2) return { ok: false, message: "A pick-list needs at least two choices, separated by commas." };
  const unit = String(formData.get("unit") ?? "").trim().slice(0, 20);
  return wrap(async (db) => {
    const type = await getType(db, typeId);
    if (type.fields.some((f) => f.label.toLowerCase() === label.toLowerCase())) return { error: { message: `${type.name} already has a "${label}" field.` } };
    const field: SpecField = { key: freshKey(label, type.fields), label, kind, ...(kind === "choice" ? { options } : {}), ...(kind === "number" && unit ? { unit } : {}) };
    return saveFields(db, typeId, [...type.fields, field]);
  });
}

/** Removes a field from the type. Values already saved on products are kept, just not shown. */
export async function removeField(typeId: string, key: string): Promise<ActionResult> {
  return wrap(async (db) => {
    const type = await getType(db, typeId);
    return saveFields(db, typeId, type.fields.filter((f) => f.key !== key));
  });
}

/** Moves a field up or down within its type. */
export async function moveField(typeId: string, key: string, direction: -1 | 1): Promise<ActionResult> {
  return wrap(async (db) => {
    const fields = [...(await getType(db, typeId)).fields];
    const i = fields.findIndex((f) => f.key === key);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= fields.length) return { error: null };
    [fields[i], fields[j]] = [fields[j], fields[i]];
    return saveFields(db, typeId, fields);
  });
}
