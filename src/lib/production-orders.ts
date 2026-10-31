import { addDays, edmontonDateOf, isoWeekday, type ISODate } from "@/lib/dates";

/**
 * Turning Shopify orders into print-queue jobs. Pure functions here; the
 * Shopify connector fetches the orders and saves the jobs.
 */

export interface ShopifyOrder {
  id: string;
  legacyResourceId: string;
  name: string;
  createdAt: string;
  test: boolean;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string;
  lineItems: { nodes: { name: string; quantity: number }[] };
  customer?: { firstName: string | null; lastName: string | null } | null;
}

/** Paid enough to make: fully paid, partly paid or partly refunded. */
const PAID = new Set(["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"]);

export type OrderState = "open" | "shipped" | "cancelled" | "skip";

/** Where an order stands for the print queue. */
export function orderState(o: ShopifyOrder): OrderState {
  if (o.test) return "skip";
  if (o.cancelledAt) return "cancelled";
  if (o.displayFulfillmentStatus === "FULFILLED") return "shipped";
  if (!PAID.has(o.displayFinancialStatus ?? "")) return "skip";
  return "open";
}

/** `n` business days (Mon–Fri) after `date`. */
export function addBusinessDays(date: ISODate, n: number): ISODate {
  let d = date;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isoWeekday(d) <= 5) left--;
  }
  return d;
}

/** "2× Black hoodie - M, White tee - L" (quantities only when more than one). */
export function itemsSummary(items: { name: string; quantity: number }[]): string {
  return items
    .filter((i) => i.quantity > 0)
    .map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name))
    .join(", ")
    .slice(0, 500);
}

/** "#1004 · Sarah M." when Shopify shares the name, otherwise "Order #1004". */
export function orderTitle(o: Pick<ShopifyOrder, "name" | "customer">): string {
  const first = o.customer?.firstName?.trim();
  const last = o.customer?.lastName?.trim();
  if (!first && !last) return `Order ${o.name}`;
  return `${o.name} · ${[first, last ? `${last[0]}.` : null].filter(Boolean).join(" ")}`;
}

export function orderAdminUrl(store: string, legacyResourceId: string): string {
  return `https://admin.shopify.com/store/${store}/orders/${legacyResourceId}`;
}

/** Due date for a new store order. */
export function orderDueDate(o: Pick<ShopifyOrder, "createdAt">, dueDays: number): ISODate {
  return addBusinessDays(edmontonDateOf(o.createdAt), dueDays);
}
