import "server-only";
import type { InventoryProduct, StockCell } from "@/lib/inventory";
import { createUserClient } from "@/lib/supabase/server";
import { getViewer } from "./source";

export const PHOTO_BUCKET = "inventory";

const COLUMNS =
  "id, name, brand, style_number, category, description, fabric, weight, fit, print_notes, cost, location, low_stock_at, photos, inventory_stock (id, colour, size, quantity)";

interface Row {
  id: string;
  name: string;
  brand: string | null;
  style_number: string | null;
  category: string | null;
  description: string | null;
  fabric: string | null;
  weight: string | null;
  fit: string | null;
  print_notes: string | null;
  cost: number | null;
  location: string | null;
  low_stock_at: number;
  photos: string[];
  inventory_stock: StockCell[];
}

const toProduct = (r: Row, photoUrls: string[]): InventoryProduct => ({
  id: r.id,
  name: r.name,
  brand: r.brand,
  styleNumber: r.style_number,
  category: r.category,
  description: r.description,
  fabric: r.fabric,
  weight: r.weight,
  fit: r.fit,
  printNotes: r.print_notes,
  cost: r.cost === null ? null : Number(r.cost),
  location: r.location,
  lowStockAt: r.low_stock_at,
  photos: r.photos,
  photoUrls,
  stock: r.inventory_stock,
});

const PREVIEW: InventoryProduct[] = [
  {
    id: "sample-hoodie",
    name: "Heavyweight pullover hoodie",
    brand: "Gildan",
    styleNumber: "18500",
    category: "Hoodies",
    description: "Classic crew hoodie, front pouch pocket.",
    fabric: "50% cotton / 50% polyester",
    weight: "8 oz",
    fit: "Classic",
    printNotes: "DTF and screen print both fine. Pre-press 5 s.",
    cost: 14.5,
    location: "Shelf A2",
    lowStockAt: 3,
    photos: [],
    photoUrls: [],
    stock: ["S", "M", "L", "XL", "2XL"].flatMap((size, i) => [
      { id: `b-${size}`, colour: "Black", size, quantity: [2, 9, 14, 8, 3][i] },
      { id: `g-${size}`, colour: "Sport Grey", size, quantity: [0, 4, 6, 5, 1][i] },
    ]),
  },
  {
    id: "sample-tee",
    name: "Soft-style tee",
    brand: "Bella+Canvas",
    styleNumber: "3001",
    category: "T-shirts",
    description: null,
    fabric: "100% Airlume cotton",
    weight: "4.2 oz",
    fit: "Retail",
    printNotes: null,
    cost: 6.25,
    location: "Shelf B1",
    lowStockAt: 0,
    photos: [],
    photoUrls: [],
    stock: ["S", "M", "L", "XL"].map((size, i) => ({ id: `w-${size}`, colour: "White", size, quantity: [6, 12, 12, 7][i] })),
  },
];

/** Signed links for a set of photo paths (private bucket), in the same order. */
async function signed(db: Awaited<ReturnType<typeof createUserClient>>, paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

/** Every product on the shelves, newest first, with a cover photo link. */
export async function listInventory(): Promise<{ mode: "preview" | "live"; products: InventoryProduct[] }> {
  const { mode } = await getViewer();
  if (mode === "preview") return { mode, products: PREVIEW };

  const db = await createUserClient();
  const { data, error } = await db.from("inventory_products").select(COLUMNS).is("archived_at", null).order("created_at", { ascending: false });
  if (error) throw error;
  const rows = data as unknown as Row[];
  const urls = await signed(db, rows.flatMap((r) => r.photos.slice(0, 1)));
  return { mode, products: rows.map((r) => toProduct(r, r.photos.slice(0, 1).map((p) => urls.get(p) ?? ""))) };
}

/** One product with all its photo links, or null if it doesn't exist (or was archived). */
export async function getInventoryProduct(id: string): Promise<{ mode: "preview" | "live"; product: InventoryProduct | null }> {
  const { mode } = await getViewer();
  if (mode === "preview") return { mode, product: PREVIEW.find((p) => p.id === id) ?? null };

  const db = await createUserClient();
  const { data, error } = await db.from("inventory_products").select(COLUMNS).eq("id", id).is("archived_at", null).maybeSingle();
  if (error && error.code !== "22P02") throw error; // 22P02: not a valid id
  if (!data) return { mode, product: null };
  const row = data as unknown as Row;
  const urls = await signed(db, row.photos);
  return { mode, product: toProduct(row, row.photos.map((p) => urls.get(p) ?? "")) };
}
