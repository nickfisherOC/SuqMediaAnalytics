import { diffDays, formatShort, type ISODate } from "@/lib/dates";

/** Dropshippers, distributors and manufacturers, and the products we can get from them. */

export type SupplierKind = "dropship" | "distributor" | "manufacturer";
export type MoqPer = "order" | "style" | "colour" | "size";

export const KIND_LABEL: Record<SupplierKind, string> = {
  dropship: "Dropship",
  distributor: "Distributor (blanks)",
  manufacturer: "Manufacturer",
};

export const MOQ_PER_LABEL: Record<MoqPer, string> = {
  order: "per order",
  style: "per style",
  colour: "per colour",
  size: "per size",
};

export interface PriceBreak {
  minQty: number;
  price: number;
}

export interface Supplier {
  id: string;
  name: string;
  kind: SupplierKind;
  location: string | null;
  website: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  leadTime: string | null;
  shippingNotes: string | null;
  notes: string | null;
  isSample: boolean;
}

export interface SupplierProduct {
  id: string;
  supplierId: string;
  name: string;
  brand: string | null;
  styleNumber: string | null;
  category: string | null;
  description: string | null;
  fabric: string | null;
  weight: string | null;
  fit: string | null;
  printNotes: string | null;
  photos: string[];
  photoUrls: string[];
  colours: string[];
  sizes: string[];
  moq: number | null;
  moqPer: MoqPer;
  priceBreaks: PriceBreak[];
  leadTime: string | null;
  sampleCost: number | null;
  lastChecked: ISODate | null;
  isSample: boolean;
}

/** Info older than this is flagged as worth re-checking with the supplier. */
export const STALE_AFTER_DAYS = 90;

/** Price breaks, smallest quantity first, one per quantity, only valid rows. */
export function cleanBreaks(breaks: PriceBreak[]): PriceBreak[] {
  const byQty = new Map<number, number>();
  for (const b of breaks) {
    if (Number.isInteger(b.minQty) && b.minQty >= 1 && Number.isFinite(b.price) && b.price >= 0) byQty.set(b.minQty, b.price);
  }
  return [...byQty].map(([minQty, price]) => ({ minQty, price })).sort((a, b) => a.minQty - b.minQty);
}

/** The unit price for ordering `qty`: the biggest break it reaches, or null if below the first. */
export function priceFor(qty: number, breaks: PriceBreak[]): number | null {
  let price: number | null = null;
  for (const b of cleanBreaks(breaks)) if (qty >= b.minQty) price = b.price;
  return price;
}

/** "Min 50 per colour", "No minimum" (a minimum of 1 per order), or "Minimum not set". */
export function moqLabel(moq: number | null, per: MoqPer): string {
  if (moq === null) return "Minimum not set";
  if (moq <= 1 && per === "order") return "No minimum";
  return `Min ${moq.toLocaleString("en-CA")} ${MOQ_PER_LABEL[per]}`;
}

/** "From $13.75" (the lowest unit price at any quantity), or null with no prices. */
export function fromPrice(breaks: PriceBreak[]): string | null {
  const clean = cleanBreaks(breaks);
  if (!clean.length) return null;
  return `From ${money(Math.min(...clean.map((b) => b.price)))}`;
}

export function money(n: number): string {
  return n.toLocaleString("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2 });
}

/** "Checked Oct 28", with a warning when it's been more than 90 days or never. */
export function checkedLabel(lastChecked: ISODate | null, today: ISODate): { text: string; stale: boolean } {
  if (!lastChecked) return { text: "Never checked", stale: true };
  const age = diffDays(lastChecked, today);
  return { text: `Checked ${formatShort(lastChecked)}${lastChecked.slice(0, 4) !== today.slice(0, 4) ? `, ${lastChecked.slice(0, 4)}` : ""}`, stale: age > STALE_AFTER_DAYS };
}

/** "Black, Navy , ,Grey" → ["Black", "Navy", "Grey"] (trimmed, no blanks, no repeats). */
export function splitList(text: string, max = 40): string[] {
  return [...new Set(text.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, max);
}
