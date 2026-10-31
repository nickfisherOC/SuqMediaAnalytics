import { describe, expect, it } from "vitest";
import { addBusinessDays, itemsSummary, orderAdminUrl, orderDueDate, orderState, orderTitle, type ShopifyOrder } from "./production-orders";

const order = (over: Partial<ShopifyOrder> = {}): ShopifyOrder => ({
  id: "gid://shopify/Order/1",
  legacyResourceId: "555",
  name: "#1004",
  createdAt: "2026-10-30T22:15:00Z",
  test: false,
  cancelledAt: null,
  displayFinancialStatus: "PAID",
  displayFulfillmentStatus: "UNFULFILLED",
  lineItems: { nodes: [] },
  ...over,
});

describe("orderState", () => {
  it("queues paid orders that haven't shipped", () => {
    expect(orderState(order())).toBe("open");
    expect(orderState(order({ displayFulfillmentStatus: "PARTIALLY_FULFILLED" }))).toBe("open");
    expect(orderState(order({ displayFinancialStatus: "PARTIALLY_REFUNDED" }))).toBe("open");
  });

  it("knows shipped, cancelled, unpaid and test orders", () => {
    expect(orderState(order({ displayFulfillmentStatus: "FULFILLED" }))).toBe("shipped");
    expect(orderState(order({ cancelledAt: "2026-10-31T00:00:00Z" }))).toBe("cancelled");
    expect(orderState(order({ displayFinancialStatus: "PENDING" }))).toBe("skip");
    expect(orderState(order({ test: true }))).toBe("skip");
  });
});

describe("dates", () => {
  it("skips weekends", () => {
    expect(addBusinessDays("2026-10-29", 3)).toBe("2026-11-03"); // Thu → Tue
    expect(addBusinessDays("2026-10-31", 1)).toBe("2026-11-02"); // Sat → Mon
    expect(addBusinessDays("2026-11-02", 0)).toBe("2026-11-02");
  });

  it("counts from the order's day in Edmonton", () => {
    // 22:15 UTC on Oct 30 is 4:15 pm Friday in Edmonton → 3 business days = Wed Nov 4.
    expect(orderDueDate(order(), 3)).toBe("2026-11-04");
    // 03:00 UTC on Oct 31 is still Friday evening in Edmonton.
    expect(orderDueDate(order({ createdAt: "2026-10-31T03:00:00Z" }), 1)).toBe("2026-11-02");
  });
});

describe("card text", () => {
  it("lists items with quantities", () => {
    expect(
      itemsSummary([
        { name: "Black hoodie - M", quantity: 2 },
        { name: "White tee - L", quantity: 1 },
        { name: "Removed", quantity: 0 },
      ]),
    ).toBe("2× Black hoodie - M, White tee - L");
  });

  it("titles with the customer when Shopify shares it", () => {
    expect(orderTitle(order())).toBe("Order #1004");
    expect(orderTitle(order({ customer: { firstName: "Sarah", lastName: "Mitchell" } }))).toBe("#1004 · Sarah M.");
    expect(orderTitle(order({ customer: { firstName: null, lastName: null } }))).toBe("Order #1004");
  });

  it("links to the order in Shopify admin", () => {
    expect(orderAdminUrl("0i9uvm-p2", "555")).toBe("https://admin.shopify.com/store/0i9uvm-p2/orders/555");
  });
});
