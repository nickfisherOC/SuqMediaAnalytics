import { createHmac, timingSafeEqual } from "node:crypto";

/** Shopify signs a webhook's raw body: base64 HMAC-SHA256 keyed with the app's client secret. */
export function validShopifyHmac(body: string, header: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body, "utf8").digest();
  const given = Buffer.from(header, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
