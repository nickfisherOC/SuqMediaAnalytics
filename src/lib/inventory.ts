/** Calgary stock: products with photos and specs, counted by colour × size. */

export interface StockCell {
  id: string;
  colour: string;
  size: string;
  quantity: number;
}

export interface InventoryProduct {
  id: string;
  name: string;
  brand: string | null;
  styleNumber: string | null;
  category: string | null;
  description: string | null;
  fabric: string | null;
  weight: string | null;
  fit: string | null;
  printNotes: string | null;
  cost: number | null;
  location: string | null;
  lowStockAt: number;
  /** Storage paths, cover first. */
  photos: string[];
  /** Signed links for `photos`, same order. */
  photoUrls: string[];
  stock: StockCell[];
}

/** The usual apparel sizes, smallest first. Anything else sorts after these. */
export const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

const ALIASES: Record<string, string> = { XXL: "2XL", XXXL: "3XL", XXXXL: "4XL", XXXXXL: "5XL", SM: "S", MD: "M", MED: "M", LG: "L", SMALL: "S", MEDIUM: "M", LARGE: "L" };

/** "xxl" → "2XL", " m " → "M"; other sizes are kept as typed (trimmed). */
export function normalizeSize(size: string): string {
  const s = size.trim().toUpperCase().replace(/\s+/g, "");
  if (STANDARD_SIZES.includes(s)) return s;
  return ALIASES[s] ?? size.trim();
}

/** Sizes in wearing order: XS…5XL, then numbers ascending, then the rest alphabetically. */
export function sortSizes(sizes: string[]): string[] {
  const rank = (s: string) => {
    const i = STANDARD_SIZES.indexOf(s.toUpperCase());
    if (i >= 0) return [0, i] as const;
    const n = Number.parseFloat(s);
    if (Number.isFinite(n)) return [1, n] as const;
    return [2, 0] as const;
  };
  return [...new Set(sizes)].sort((a, b) => {
    const [ga, va] = rank(a);
    const [gb, vb] = rank(b);
    return ga - gb || va - vb || a.localeCompare(b);
  });
}

/** Colours in the order they were added (first seen), sizes in wearing order. */
export function stockGrid(stock: StockCell[]): { colours: string[]; sizes: string[]; cell: (colour: string, size: string) => StockCell | undefined } {
  const colours = [...new Set(stock.map((s) => s.colour))];
  const sizes = sortSizes(stock.map((s) => s.size));
  const byKey = new Map(stock.map((s) => [`${s.colour}\u0000${s.size}`, s]));
  return { colours, sizes, cell: (colour, size) => byKey.get(`${colour}\u0000${size}`) };
}

export function totalUnits(stock: StockCell[]): number {
  return stock.reduce((n, s) => n + s.quantity, 0);
}

/** Sizes/colours at or below the product's low-stock level (0 means the warning is off). */
export function lowCells(stock: StockCell[], lowStockAt: number): StockCell[] {
  return lowStockAt > 0 ? stock.filter((s) => s.quantity <= lowStockAt) : [];
}
