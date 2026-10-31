"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { PHOTO_BUCKET } from "@/lib/data/inventory";
import { readSpecsForm } from "@/lib/data/product-types";
import { getViewer } from "@/lib/data/source";
import { normalizeSize } from "@/lib/inventory";
import { createUserClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

async function live() {
  const ctx = await getViewer();
  if (ctx.mode !== "live") throw new Error("Preview mode doesn't save anything.");
  return { ctx, db: await createUserClient() };
}

const fail = (e: unknown): ActionResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) });
const text = (fd: FormData, key: string, max = 500) => String(fd.get(key) ?? "").trim().slice(0, max) || null;

async function run(fn: (db: Awaited<ReturnType<typeof createUserClient>>) => PromiseLike<{ error: { message: string } | null }>): Promise<ActionResult> {
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

/** A new product with just a name; the rest is filled in on its page. */
export async function createProduct(formData: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const { ctx, db } = await live();
    const name = text(formData, "name", 120);
    if (!name) return { ok: false, message: "Give the product a name." };
    const { data, error } = await db.from("inventory_products").insert({ name, type_id: String(formData.get("type_id") ?? "") || null, created_by: ctx.viewer.id }).select("id").single();
    if (error) return { ok: false, message: error.message };
    id = data.id;
  } catch (e) {
    return fail(e);
  }
  redirect(`/inventory/${id}`);
}

export async function updateProduct(id: string, formData: FormData): Promise<ActionResult> {
  const name = text(formData, "name", 120);
  if (!name) return { ok: false, message: "The product needs a name." };
  const cost = Number(String(formData.get("cost") ?? "").replace(/[$,\s]/g, ""));
  const low = Number(formData.get("low_stock_at"));
  return run(async (db) => {
    const { data: prev } = await db.from("inventory_products").select("specs").eq("id", id).maybeSingle();
    const specs = await readSpecsForm(db, formData, prev?.specs ?? {});
    return db
      .from("inventory_products")
      .update({
        name,
        ...specs,
        brand: text(formData, "brand", 80),
        style_number: text(formData, "style_number", 60),
        description: text(formData, "description", 2000),
        print_notes: text(formData, "print_notes", 1000),
        cost: String(formData.get("cost") ?? "").trim() && Number.isFinite(cost) && cost >= 0 ? cost : null,
        location: text(formData, "location", 80),
        low_stock_at: Number.isInteger(low) && low >= 0 ? low : 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  });
}

/** Takes the product off the list. It's kept, not deleted. */
export async function archiveProduct(id: string): Promise<ActionResult> {
  const r = await run((db) => db.from("inventory_products").update({ archived_at: new Date().toISOString() }).eq("id", id));
  if (!r.ok) return r;
  redirect("/inventory");
}

async function photosOf(db: Awaited<ReturnType<typeof createUserClient>>, id: string): Promise<string[]> {
  const { data, error } = await db.from("inventory_products").select("photos").eq("id", id).single();
  if (error) throw error;
  return data.photos;
}

/** Record a photo the browser has just uploaded to `<product id>/…` in the photo bucket. */
export async function addPhoto(id: string, path: string): Promise<ActionResult> {
  if (!path.startsWith(`${id}/`)) return { ok: false, message: "That photo doesn't belong to this product." };
  return run(async (db) => db.from("inventory_products").update({ photos: [...(await photosOf(db, id)), path] }).eq("id", id));
}

export async function removePhoto(id: string, path: string): Promise<ActionResult> {
  return run(async (db) => {
    const res = await db.from("inventory_products").update({ photos: (await photosOf(db, id)).filter((p) => p !== path) }).eq("id", id);
    if (!res.error && path.startsWith(`${id}/`)) await db.storage.from(PHOTO_BUCKET).remove([path]);
    return res;
  });
}

/** Make a photo the cover (first). */
export async function makeCover(id: string, path: string): Promise<ActionResult> {
  return run(async (db) => {
    const photos = await photosOf(db, id);
    return db.from("inventory_products").update({ photos: [path, ...photos.filter((p) => p !== path)] }).eq("id", id);
  });
}

/** Add a colour in some sizes (or sizes to an existing colour). Existing counts are left alone. */
export async function addStock(productId: string, colour: string, sizes: string[]): Promise<ActionResult> {
  const c = colour.trim().slice(0, 60);
  const list = [...new Set(sizes.map(normalizeSize).filter(Boolean))].slice(0, 30);
  if (!list.length) return { ok: false, message: "Pick at least one size." };
  return run((db) =>
    db.from("inventory_stock").upsert(
      list.map((size) => ({ product_id: productId, colour: c, size })),
      { onConflict: "product_id,colour,size", ignoreDuplicates: true },
    ),
  );
}

/** + or − from the count buttons. */
export async function adjustStock(stockId: string, delta: number): Promise<ActionResult> {
  if (!Number.isInteger(delta) || Math.abs(delta) > 10000) return { ok: false, message: "That count didn't work." };
  return run((db) => db.rpc("adjust_stock", { stock_id: stockId, delta }));
}

/** A typed count. */
export async function setStock(stockId: string, quantity: number): Promise<ActionResult> {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) return { ok: false, message: "Counts are whole numbers, 0 or more." };
  return run((db) => db.from("inventory_stock").update({ quantity, updated_at: new Date().toISOString() }).eq("id", stockId));
}

export async function removeColour(productId: string, colour: string): Promise<ActionResult> {
  return run((db) => db.from("inventory_stock").delete().eq("product_id", productId).eq("colour", colour));
}

/** Remove one colour/size from the grid. */
export async function removeStockCell(stockId: string): Promise<ActionResult> {
  return run((db) => db.from("inventory_stock").delete().eq("id", stockId));
}
