import "server-only";
import { readAreas } from "@/lib/branding";
import type { ISODate } from "@/lib/dates";
import type { MoqPer, PriceBreak, Supplier, SupplierKind, SupplierProduct } from "@/lib/suppliers";
import { createUserClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET } from "./inventory";
import { getViewer } from "./source";

type Db = Awaited<ReturnType<typeof createUserClient>>;

const SUPPLIER_COLUMNS = "id, name, kind, location, website, contact_name, contact_email, contact_phone, lead_time, shipping_notes, notes, is_sample";
const PRODUCT_COLUMNS =
  "id, supplier_id, name, brand, style_number, type_id, specs, custom_fields, description, print_notes, branding_methods, imprint_areas, photos, colours, sizes, moq, moq_per, price_breaks, lead_time, sample_cost, last_checked, is_sample";

/* eslint-disable @typescript-eslint/no-explicit-any -- rows straight from PostgREST */
const toSupplier = (r: any): Supplier => ({
  id: r.id,
  name: r.name,
  kind: r.kind as SupplierKind,
  location: r.location,
  website: r.website,
  contactName: r.contact_name,
  contactEmail: r.contact_email,
  contactPhone: r.contact_phone,
  leadTime: r.lead_time,
  shippingNotes: r.shipping_notes,
  notes: r.notes,
  isSample: r.is_sample,
});

const toProduct = (r: any, photoUrls: string[]): SupplierProduct => ({
  id: r.id,
  supplierId: r.supplier_id,
  name: r.name,
  brand: r.brand,
  styleNumber: r.style_number,
  typeId: r.type_id,
  specs: r.specs ?? {},
  customFields: r.custom_fields ?? [],
  description: r.description,
  printNotes: r.print_notes,
  brandingMethods: r.branding_methods ?? [],
  imprintAreas: readAreas(r.imprint_areas),
  photos: r.photos,
  photoUrls,
  colours: r.colours,
  sizes: r.sizes,
  moq: r.moq,
  moqPer: r.moq_per as MoqPer,
  priceBreaks: ((r.price_breaks ?? []) as { min_qty: number; price: number }[]).map((b) => ({ minQty: Number(b.min_qty), price: Number(b.price) })),
  leadTime: r.lead_time,
  sampleCost: r.sample_cost === null ? null : Number(r.sample_cost),
  lastChecked: r.last_checked as ISODate | null,
  isSample: r.is_sample,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

async function signed(db: Db, paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

// ─── Preview (local dev without Supabase) ─────────────────────────────────

const pb = (...pairs: [number, number][]): PriceBreak[] => pairs.map(([minQty, price]) => ({ minQty, price }));

const PREVIEW_SUPPLIERS: Supplier[] = [
  { id: "sup-print", name: "Example Print Co.", kind: "dropship", location: "Edmonton, AB", website: "https://example.com/print", contactName: "Jordan (sample)", contactEmail: "orders@example.com", contactPhone: null, leadTime: "3–5 business days to print, plus 2–4 days shipping", shippingNotes: "Ships blind to the customer anywhere in Canada.", notes: "Print on demand: no stock to hold.", isSample: true },
  { id: "sup-factory", name: "Example Garment Factory", kind: "manufacturer", location: "Overseas", website: null, contactName: "Lee (sample)", contactEmail: "factory@example.com", contactPhone: null, leadTime: "30–40 days to make, plus 10–14 days sea freight", shippingNotes: null, notes: "Custom cut-and-sew with our own labels.", isSample: true },
];

const base = { brand: "Example", styleNumber: null, description: null, customFields: [], printNotes: null, brandingMethods: ["Embroidery"], imprintAreas: [{ location: "Left chest", maxSize: "4 × 4 in", method: "" }], photos: [], photoUrls: [], leadTime: null, sampleCost: null, isSample: true };
const PREVIEW_PRODUCTS: SupplierProduct[] = [
  { ...base, id: "sp-hoodie", supplierId: "sup-print", name: "Premium pullover hoodie (printed)", typeId: "type-hoodie", specs: { fabric: "80% cotton / 20% polyester", gsm: 305, pilling: "4 – Slight pilling", season: "All-season" }, colours: ["Black", "Charcoal", "Navy"], sizes: ["S", "M", "L", "XL", "2XL", "3XL"], moq: 1, moqPer: "order", priceBreaks: pb([1, 42], [10, 38.5], [25, 35]), lastChecked: "2026-10-28" },
  { ...base, id: "sp-cap", supplierId: "sup-print", name: "Embroidered snapback", typeId: "type-hat", specs: { style: "Snapback", fabric: "Cotton twill", panels: 6 }, colours: ["Black", "Khaki"], sizes: ["One size"], moq: 6, moqPer: "order", priceBreaks: pb([6, 24], [24, 20]), lastChecked: "2026-06-20" },
  { ...base, id: "sp-custom", supplierId: "sup-factory", name: "Custom crew hoodie (cut and sew)", typeId: "type-hoodie", specs: { gsm: 400, knit: "French terry", pilling: "5 – No pilling", season: "Winter" }, colours: ["Any (Pantone match)"], sizes: ["S", "M", "L", "XL", "2XL"], moq: 50, moqPer: "colour", priceBreaks: pb([50, 28], [200, 22.5], [500, 19]), sampleCost: 85, lastChecked: "2026-10-15" },
];

// ─── Queries ──────────────────────────────────────────────────────────────

export interface SupplierWithProducts {
  supplier: Supplier;
  products: SupplierProduct[];
}

/** Every supplier and its products (cover photo only), suppliers A–Z. */
export async function listSuppliers(): Promise<{ mode: "preview" | "live"; today: ISODate; suppliers: SupplierWithProducts[] }> {
  const { mode, today } = await getViewer();
  if (mode === "preview") {
    return { mode, today, suppliers: PREVIEW_SUPPLIERS.map((supplier) => ({ supplier, products: PREVIEW_PRODUCTS.filter((p) => p.supplierId === supplier.id) })) };
  }
  const db = await createUserClient();
  const [{ data: sups, error: sErr }, { data: prods, error: pErr }] = await Promise.all([
    db.from("suppliers").select(SUPPLIER_COLUMNS).is("archived_at", null).order("name"),
    db.from("supplier_products").select(PRODUCT_COLUMNS).is("archived_at", null).order("name"),
  ]);
  if (sErr) throw sErr;
  if (pErr) throw pErr;
  const urls = await signed(db, prods.flatMap((p) => (p.photos as string[]).slice(0, 1)));
  const products = prods.map((p) => toProduct(p, (p.photos as string[]).slice(0, 1).map((x) => urls.get(x) ?? "")));
  return { mode, today, suppliers: sups.map((s) => ({ supplier: toSupplier(s), products: products.filter((p) => p.supplierId === s.id) })) };
}

/** One supplier with its products (cover photos), or null. */
export async function getSupplier(id: string): Promise<{ mode: "preview" | "live"; today: ISODate; found: SupplierWithProducts | null }> {
  const { mode, today } = await getViewer();
  if (mode === "preview") {
    const supplier = PREVIEW_SUPPLIERS.find((s) => s.id === id);
    return { mode, today, found: supplier ? { supplier, products: PREVIEW_PRODUCTS.filter((p) => p.supplierId === id) } : null };
  }
  const db = await createUserClient();
  const { data: s, error } = await db.from("suppliers").select(SUPPLIER_COLUMNS).eq("id", id).is("archived_at", null).maybeSingle();
  if (error && error.code !== "22P02") throw error; // 22P02: not a valid id
  if (!s) return { mode, today, found: null };
  const { data: prods, error: pErr } = await db.from("supplier_products").select(PRODUCT_COLUMNS).eq("supplier_id", id).is("archived_at", null).order("name");
  if (pErr) throw pErr;
  const urls = await signed(db, prods.flatMap((p) => (p.photos as string[]).slice(0, 1)));
  return {
    mode,
    today,
    found: { supplier: toSupplier(s), products: prods.map((p) => toProduct(p, (p.photos as string[]).slice(0, 1).map((x) => urls.get(x) ?? ""))) },
  };
}

/** One supplier product with all its photo links, plus its supplier, or null. */
export async function getSupplierProduct(
  supplierId: string,
  productId: string,
): Promise<{ mode: "preview" | "live"; today: ISODate; supplier: Supplier | null; product: SupplierProduct | null }> {
  const { mode, today } = await getViewer();
  if (mode === "preview") {
    return {
      mode,
      today,
      supplier: PREVIEW_SUPPLIERS.find((s) => s.id === supplierId) ?? null,
      product: PREVIEW_PRODUCTS.find((p) => p.id === productId && p.supplierId === supplierId) ?? null,
    };
  }
  const db = await createUserClient();
  const [{ data: s, error: sErr }, { data: p, error: pErr }] = await Promise.all([
    db.from("suppliers").select(SUPPLIER_COLUMNS).eq("id", supplierId).is("archived_at", null).maybeSingle(),
    db.from("supplier_products").select(PRODUCT_COLUMNS).eq("id", productId).eq("supplier_id", supplierId).is("archived_at", null).maybeSingle(),
  ]);
  for (const e of [sErr, pErr]) if (e && e.code !== "22P02") throw e;
  if (!s || !p) return { mode, today, supplier: s ? toSupplier(s) : null, product: null };
  const urls = await signed(db, p.photos as string[]);
  return { mode, today, supplier: toSupplier(s), product: toProduct(p, (p.photos as string[]).map((x) => urls.get(x) ?? "")) };
}
