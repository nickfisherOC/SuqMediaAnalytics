import { after, NextResponse, type NextRequest } from "next/server";
import { validShopifyHmac } from "@/lib/shopify-webhook";
import { loadAccounts } from "@/lib/sync/engine";
import { syncAll } from "@/lib/sync/run-all";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 300;

/**
 * Shopify calls this when a store order is paid, fulfilled or cancelled (the
 * Shopify sync subscribes to those). The request is checked against the app's
 * client secret, answered at once (Shopify waits 5 seconds at most), and then
 * the store's sync runs, which updates the print queue.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256") ?? "";
  const shop = (request.headers.get("x-shopify-shop-domain") ?? "").toLowerCase();

  const db = createServiceClient();
  const account = (await loadAccounts(db)).find((a) => a.platform === "shopify" && `${String(a.settings.store ?? "").toLowerCase()}.myshopify.com` === shop);
  if (!account) return NextResponse.json({ error: "Unknown shop" }, { status: 401 });

  const { data: secret } = await db.rpc("get_account_token", { p_account_id: account.id, p_kind: "access" });
  if (!secret || !validShopifyHmac(raw, hmac, secret as string)) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

  after(async () => {
    try {
      await syncAll("manual", [account.id]);
    } catch (e) {
      console.error("Shopify webhook sync failed:", e);
    }
  });
  return NextResponse.json({ ok: true });
}
