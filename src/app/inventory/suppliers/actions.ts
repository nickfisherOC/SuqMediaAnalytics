"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { PHOTO_BUCKET } from "@/lib/data/inventory";
import { getViewer } from "@/lib/data/source";
import { isISODate } from "@/lib/dates";
import { normalizeSize, sortSizes } from "@/lib/inventory";
import { cleanBreaks, splitList, type MoqPer, type SupplierKind } from "@/lib/suppliers";
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
const text = (fd: FormData, key: string, max = 500) => String(fd.get(key) ?? "").trim().slice(0, max) || null;
const now = () => new Date().toISOString();

async function run(fn: (db: Db) => PromiseLike<{ error: { message: string } | null }>): Promise<ActionResult> {
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

const KINDS: SupplierKind[] = ["dropship", "distributor", "manufacturer"];
const PERS: MoqPer[] = ["order", "style", "colour", "size"];
const kindOf = (v: unknown): SupplierKind => (KINDS.includes(v as SupplierKind) ? (v as SupplierKind) : "dropship");

// ─── Suppliers ────────────────────────────────────────────────────────────

export async function createSupplier(formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const { ctx, db } = await live();
    const name = text(formData, "name", 120);
    if (!name) return { ok: false, message: "Give the supplier a name." };
    const { data, error } = await db.from("suppliers").insert({ name, kind: kindOf(formData.get("kind")), created_by: ctx.viewer.id }).select("id").single();
    if (error) return { ok: false, message: error.message };
    id = data.id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/inventory/suppliers/${id}`);
}

export async function updateSupplier(id: string, formData: FormData): Promise<ActionResult> {
  const name = text(formData, "name", 120);
  if (!name) return { ok: false, message: "The supplier needs a name." };
  const website = text(formData, "website", 300);
  return run((db) =>
    db
      .from("suppliers")
      .update({
        name,
        kind: kindOf(formData.get("kind")),
        location: text(formData, "location", 120),
        website: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
        contact_name: text(formData, "contact_name", 120),
        contact_email: text(formData, "contact_email", 200),
        contact_phone: text(formData, "contact_phone", 60),
        lead_time: text(formData, "lead_time", 200),
        shipping_notes: text(formData, "shipping_notes", 1000),
        notes: text(formData, "notes", 2000),
        updated_at: now(),
      })
      .eq("id", id),
  );
}

/** Takes the supplier (and its products) off the list. Kept, not deleted. */
export async function archiveSupplier(id: string): Promise<ActionResult> {
  const r = await run((db) => db.from("suppliers").update({ archived_at: now() }).eq("id", id));
  if (!r.ok) return r;
  redirect("/inventory/suppliers");
}

/** Deletes the made-up example suppliers and their products. Admins only. */
export async function removeSampleSuppliers(): Promise<ActionResult> {
  try {
    const { ctx } = await live();
    if (ctx.viewer.role !== "admin") return { ok: false, message: "Only admins can remove the sample suppliers." };
  } catch (e) {
    return fail(e);
  }
  return run((db) => db.from("suppliers").delete().eq("is_sample", true));
}

// ─── Supplier products ────────────────────────────────────────────────────

export async function createSupplierProduct(supplierId: string, formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const { ctx, db } = await live();
    const name = text(formData, "name", 120);
    if (!name) return { ok: false, message: "Give the product a name." };
    const { data, error } = await db.from("supplier_products").insert({ supplier_id: supplierId, name, created_by: ctx.viewer.id }).select("id").single();
    if (error) return { ok: false, message: error.message };
    id = data.id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/inventory/suppliers/${supplierId}/${id}`);
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  return s === "" ? null : Number(s);
};

export async function updateSupplierProduct(id: string, formData: FormData): Promise<ActionResult> {
  const name = text(formData, "name", 120);
  if (!name) return { ok: false, message: "The product needs a name." };
  const moq = num(formData.get("moq"));
  if (moq !== null && (!Number.isInteger(moq) || moq < 1)) return { ok: false, message: "The minimum order is a whole number, 1 or more." };
  const sampleCost = num(formData.get("sample_cost"));
  if (sampleCost !== null && !(sampleCost >= 0)) return { ok: false, message: "The sample cost isn't a valid amount." };
  const qtys = formData.getAll("break_qty");
  const prices = formData.getAll("break_price");
  const breaks = cleanBreaks(qtys.flatMap((q, i) => (String(q).trim() && String(prices[i] ?? "").trim() ? [{ minQty: num(q) ?? NaN, price: num(prices[i]) ?? NaN }] : [])));
  const sizes = sortSizes([...formData.getAll("size").map(String), ...splitList(String(formData.get("other_sizes") ?? ""))].map(normalizeSize).filter(Boolean)).slice(0, 30);
  const checked = String(formData.get("last_checked") ?? "");
  const per = String(formData.get("moq_per") ?? "order") as MoqPer;

  return run((db) =>
    db
      .from("supplier_products")
      .update({
        name,
        brand: text(formData, "brand", 80),
        style_number: text(formData, "style_number", 60),
        category: text(formData, "category", 60),
        description: text(formData, "description", 2000),
        fabric: text(formData, "fabric", 200),
        weight: text(formData, "weight", 60),
        fit: text(formData, "fit", 60),
        print_notes: text(formData, "print_notes", 1000),
        colours: splitList(String(formData.get("colours") ?? "")),
        sizes,
        moq,
        moq_per: PERS.includes(per) ? per : "order",
        price_breaks: breaks.map((b) => ({ min_qty: b.minQty, price: b.price })),
        lead_time: text(formData, "lead_time", 200),
        sample_cost: sampleCost,
        last_checked: isISODate(checked) ? checked : null,
        updated_at: now(),
      })
      .eq("id", id),
  );
}

/** "I just confirmed this with the supplier": last checked = today (Edmonton). */
export async function markChecked(id: string, today: string): Promise<ActionResult> {
  if (!isISODate(today)) return { ok: false, message: "That date didn't work." };
  return run((db) => db.from("supplier_products").update({ last_checked: today, updated_at: now() }).eq("id", id));
}

export async function archiveSupplierProduct(id: string, supplierId: string): Promise<ActionResult> {
  const r = await run((db) => db.from("supplier_products").update({ archived_at: now() }).eq("id", id));
  if (!r.ok) return r;
  redirect(`/inventory/suppliers/${supplierId}`);
}

// ─── Photos (uploaded by the browser to suppliers/<product id>/…) ──────────

async function photosOf(db: Db, id: string): Promise<string[]> {
  const { data, error } = await db.from("supplier_products").select("photos").eq("id", id).single();
  if (error) throw error;
  return data.photos;
}

export async function addSupplierPhoto(id: string, path: string): Promise<ActionResult> {
  if (!path.startsWith(`suppliers/${id}/`)) return { ok: false, message: "That photo doesn't belong to this product." };
  return run(async (db) => db.from("supplier_products").update({ photos: [...(await photosOf(db, id)), path] }).eq("id", id));
}

export async function removeSupplierPhoto(id: string, path: string): Promise<ActionResult> {
  return run(async (db) => {
    const res = await db.from("supplier_products").update({ photos: (await photosOf(db, id)).filter((p) => p !== path) }).eq("id", id);
    if (!res.error && path.startsWith(`suppliers/${id}/`)) await db.storage.from(PHOTO_BUCKET).remove([path]);
    return res;
  });
}

export async function makeSupplierCover(id: string, path: string): Promise<ActionResult> {
  return run(async (db) => {
    const photos = await photosOf(db, id);
    return db.from("supplier_products").update({ photos: [path, ...photos.filter((p) => p !== path)] }).eq("id", id);
  });
}
