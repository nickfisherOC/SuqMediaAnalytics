import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validShopifyHmac } from "./shopify-webhook";

describe("validShopifyHmac", () => {
  const body = '{"id":820982911946154500,"name":"#1004"}';
  const sign = (b: string, key: string) => createHmac("sha256", key).update(b, "utf8").digest("base64");

  it("accepts Shopify's signature and rejects anything else", () => {
    expect(validShopifyHmac(body, sign(body, "secret"), "secret")).toBe(true);
    expect(validShopifyHmac(body, sign(body, "other"), "secret")).toBe(false);
    expect(validShopifyHmac(`${body} `, sign(body, "secret"), "secret")).toBe(false);
    expect(validShopifyHmac(body, "", "secret")).toBe(false);
  });
});
