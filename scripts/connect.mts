/**
 * Connects accounts from credentials in .env.local and stores the secrets in
 * Supabase Vault. Safe to re-run: it updates existing accounts.
 *
 *   npm run connect
 *
 * Reads META_PEOPLESUQ_TOKEN, SHOPIFY_STORE / SHOPIFY_CLIENT_ID /
 * SHOPIFY_CLIENT_SECRET and LEAD_RESCUE_API_KEY. Once this has run, those
 * lines can be deleted from .env.local: Pulse reads them from the Vault.
 */
import { createServiceClient } from "@/lib/supabase/service";

const db = createServiceClient();
const GRAPH = "https://graph.facebook.com/v26.0";

interface MetaAsset {
  id: string;
  name: string;
  currency?: string;
  instagram_business_account?: { id: string; username: string };
}

/** Meta asset names → Pulse brand slugs. */
const BRAND_BY_META_NAME: Record<string, string> = { "people suq": "peoplesuq", "suq media": "suq-media" };

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as T;
}

const brands = await must(db.from("brands").select("id, slug, platforms"), "brands");
const brandId = (slug: string) => {
  const b = brands.find((x) => x.slug === slug);
  if (!b) throw new Error(`Brand ${slug} not found. Run npm run seed first.`);
  return b.id;
};

async function upsertAccount(a: {
  brand: string;
  platform: string;
  externalId: string;
  displayName: string;
  settings?: Record<string, unknown>;
  secret: string;
}) {
  const row: { id: string } = await must(
    db
      .from("accounts")
      .upsert(
        {
          brand_id: brandId(a.brand),
          platform: a.platform,
          external_id: a.externalId,
          display_name: a.displayName,
          settings: a.settings ?? {},
          status: "connected",
          is_sample: false,
          last_error: null,
          consecutive_failures: 0,
        },
        { onConflict: "brand_id,platform,external_id" },
      )
      .select("id")
      .single(),
    `account ${a.brand}/${a.platform}`,
  );
  await must(db.rpc("set_account_token", { p_account_id: row.id, p_kind: "access", p_secret: a.secret }), "vault");
  // Make sure the brand lists the platform.
  const b = brands.find((x) => x.slug === a.brand)!;
  if (!b.platforms.includes(a.platform)) {
    b.platforms.push(a.platform);
    await must(db.from("brands").update({ platforms: b.platforms }).eq("id", b.id), "brand platforms");
  }
  console.log(`  ✓ ${a.brand} / ${a.platform}: ${a.displayName}`);
}

// ── Meta ─────────────────────────────────────────────────────────────────
const metaToken = process.env.META_PEOPLESUQ_TOKEN;
if (metaToken) {
  console.log("Meta");
  const get = async (path: string, params: Record<string, string>) => {
    const u = new URL(GRAPH + path);
    for (const [k, v] of Object.entries({ ...params, access_token: metaToken })) u.searchParams.set(k, v);
    const body = await (await fetch(u)).json();
    if (body.error) throw new Error(`Meta: ${body.error.message}`);
    return body.data as MetaAsset[];
  };
  for (const page of await get("/me/accounts", { fields: "id,name,instagram_business_account{id,username}" })) {
    const brand = BRAND_BY_META_NAME[page.name.toLowerCase()];
    if (!brand) {
      console.log(`  – skipping Page "${page.name}" (no matching brand)`);
      continue;
    }
    await upsertAccount({ brand, platform: "facebook", externalId: page.id, displayName: page.name, secret: metaToken });
    const ig = page.instagram_business_account;
    if (ig) await upsertAccount({ brand, platform: "instagram", externalId: ig.id, displayName: `@${ig.username}`, secret: metaToken });
  }
  for (const act of await get("/me/adaccounts", { fields: "id,name,currency" })) {
    const brand = BRAND_BY_META_NAME[act.name.toLowerCase()];
    if (!brand) continue;
    await upsertAccount({ brand, platform: "meta_ads", externalId: act.id, displayName: `${act.name} (${act.currency})`, secret: metaToken });
  }
}

// ── Shopify ──────────────────────────────────────────────────────────────
const store = process.env.SHOPIFY_STORE?.replace(/\.myshopify\.com$/, "");
if (store && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
  console.log("Shopify");
  await upsertAccount({
    brand: "peoplesuq",
    platform: "shopify",
    externalId: store,
    displayName: "PeopleSuq store",
    settings: { store, client_id: process.env.SHOPIFY_CLIENT_ID, excluded_cities: ["Haverhill"], excluded_orders: [] },
    secret: process.env.SHOPIFY_CLIENT_SECRET,
  });
}

// ── Lead Rescue ──────────────────────────────────────────────────────────
const lrKey = process.env.LEAD_RESCUE_API_KEY;
if (lrKey) {
  console.log("Lead Rescue");
  const res = await fetch("https://api.workspaceconnector.com/v1/pipelines", { headers: { "x-api-key": lrKey } });
  const body = await res.json();
  if (!body.success) throw new Error(`Lead Rescue: ${body.error ?? res.status}`);
  const workspace = body.data[0]?.business_id ?? "workspace";
  await upsertAccount({ brand: "suq-media", platform: "lead_rescue", externalId: workspace, displayName: "SUQ Media workspace", secret: lrKey });
}

console.log("Done. Run `npm run sync -- --from 2026-10-01` to backfill.");
