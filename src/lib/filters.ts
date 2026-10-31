import { fieldsFor, type ProductType, type SpecField, type Specs } from "@/lib/product-types";

/**
 * Inventory filters: type, season, branding method, price, quantity, stock,
 * and spec filters for the chosen type (e.g. GSM 300 or more, waterproof).
 */

export interface SpecFilter {
  min?: number;
  max?: number;
  /** A choice that must match exactly. */
  equals?: string;
  /** Yes/no fields: only products marked Yes. */
  yes?: boolean;
}

export interface Filters {
  typeId: string;
  season: string;
  method: string;
  /** Highest acceptable unit price (CAD). */
  maxPrice: number | null;
  /** How many we'd order: prices use that quantity's break, and minimums must fit. */
  qty: number | null;
  inStock: boolean;
  lowOnly: boolean;
  specs: Record<string, SpecFilter>;
}

export const NO_FILTERS: Filters = { typeId: "", season: "", method: "", maxPrice: null, qty: null, inStock: false, lowOnly: false, specs: {} };

/** What a product needs to be filtered, whichever tab it's on. */
export interface Filterable {
  typeId: string | null;
  specs: Specs;
  brandingMethods: string[];
  /** Unit price for `qty` (or the cheapest price when no quantity is set); null when unknown. */
  priceAt: (qty: number | null) => number | null;
  /** Smallest order allowed, if any. */
  moq?: number | null;
  units?: number;
  isLow?: boolean;
}

export function activeCount(f: Filters): number {
  return (
    [f.typeId, f.season, f.method].filter(Boolean).length +
    [f.maxPrice, f.qty].filter((v) => v !== null).length +
    [f.inStock, f.lowOnly].filter(Boolean).length +
    Object.values(f.specs).filter(isSet).length
  );
}

const isSet = (s: SpecFilter) => s.min !== undefined || s.max !== undefined || Boolean(s.equals) || Boolean(s.yes);

function specMatches(field: SpecField, value: Specs[string] | undefined, filter: SpecFilter): boolean {
  if (!isSet(filter)) return true;
  if (value === undefined || value === "") return false;
  if (field.kind === "number") {
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return false;
    if (filter.min !== undefined && n < filter.min) return false;
    if (filter.max !== undefined && n > filter.max) return false;
    return true;
  }
  if (field.kind === "yesno") return !filter.yes || value === "Yes";
  if (filter.equals) return String(value) === filter.equals;
  return true;
}

export function matches(item: Filterable, f: Filters, types: ProductType[]): boolean {
  if (f.typeId && item.typeId !== f.typeId) return false;
  if (f.season && item.specs.season !== f.season && item.specs.season !== "All-season") return false;
  if (f.method && !item.brandingMethods.includes(f.method)) return false;
  if (f.qty !== null && item.moq != null && f.qty < item.moq) return false;
  if (f.maxPrice !== null) {
    const price = item.priceAt(f.qty);
    if (price === null || price > f.maxPrice) return false;
  }
  if (f.inStock && !(item.units && item.units > 0)) return false;
  if (f.lowOnly && !item.isLow) return false;
  const type = types.find((t) => t.id === f.typeId);
  if (type) {
    for (const field of fieldsFor(type)) {
      const filter = f.specs[field.key];
      if (filter && !specMatches(field, item.specs[field.key], filter)) return false;
    }
  }
  return true;
}

/** The spec fields worth filtering on for a type (numbers, pick-lists and yes/no; not free text). */
export function filterableFields(type: ProductType | null | undefined): SpecField[] {
  return fieldsFor(type).filter((f) => f.kind !== "text" && f.key !== "season");
}
