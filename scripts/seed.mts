/**
 * Seeds a Supabase project.
 *
 *   npm run seed                  brands + invites (safe to re-run; never overwrites edits)
 *   npm run seed -- --sample      …plus sample data from Sep 27 to yesterday, badged "Sample data"
 *   npm run seed -- --clear-sample   removes every sample row
 *
 * Reads .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
 * PULSE_ADMIN_EMAILS, PULSE_VIEWER_EMAILS (comma-separated).
 */
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_BRANDS } from "@/config/brands";
import { addDays, todayInEdmonton } from "@/lib/dates";
import { generateSampleData } from "@/lib/sample/generate";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const args = new Set(process.argv.slice(2));

function emails(v: string | undefined) {
  return (v ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as T;
}

async function seedBrands() {
  const rows = DEFAULT_BRANDS.map((b, i) => ({
    slug: b.slug,
    name: b.name,
    short_name: b.shortName,
    website: b.website,
    accent_light: b.accent.light,
    accent_dark: b.accent.dark,
    platforms: b.platforms,
    cadence_posts_per_week: b.cadence.postsPerWeek,
    scoreboard: b.scoreboard,
    funnel: b.funnel,
    active: b.active,
    sort_order: i,
  }));
  await must(db.from("brands").upsert(rows, { onConflict: "slug", ignoreDuplicates: true }), "brands");
  console.log(`Brands: ${rows.map((r) => r.name).join(", ")} (existing brands left as they are)`);
}

async function seedInvites() {
  const invites = [
    ...emails(process.env.PULSE_ADMIN_EMAILS).map((email) => ({ email, role: "admin" })),
    ...emails(process.env.PULSE_VIEWER_EMAILS).map((email) => ({ email, role: "viewer" })),
  ];
  if (!invites.length) {
    console.log("Invites: none (set PULSE_ADMIN_EMAILS / PULSE_VIEWER_EMAILS)");
    return;
  }
  await must(db.from("invites").upsert(invites, { onConflict: "email" }), "invites");
  console.log(`Invites: ${invites.map((i) => `${i.email} (${i.role})`).join(", ")}`);
}

async function clearSample() {
  // Deleting the sample accounts cascades to every fact row they own.
  await must(db.from("accounts").delete().eq("is_sample", true), "sample accounts");
  await must(db.from("data_flags").delete().eq("is_sample", true), "sample flags");
  console.log("Sample data removed.");
}

async function seedSample() {
  await clearSample();
  const brands = await must(db.from("brands").select("id, slug, platforms"), "brands");
  const until = addDays(todayInEdmonton(), -1);
  const { rows, flags } = generateSampleData(until);

  const accountId = new Map<string, string>();
  for (const b of brands) {
    const accounts = (b.platforms as string[]).map((platform) => ({
      brand_id: b.id,
      platform,
      external_id: "sample",
      display_name: "Sample data",
      status: "sample",
      is_sample: true,
    }));
    const created = await must(db.from("accounts").insert(accounts).select("id, platform"), "sample accounts");
    created.forEach((a) => accountId.set(`${b.slug}|${a.platform}`, a.id));
  }
  const brandId = new Map(brands.map((b) => [b.slug, b.id]));

  const facts = rows
    .filter((r) => accountId.has(`${r.brand}|${r.platform}`))
    .map((r) => ({
      account_id: accountId.get(`${r.brand}|${r.platform}`)!,
      brand_id: brandId.get(r.brand)!,
      platform: r.platform,
      date: r.date,
      metric_key: r.metric,
      value: r.value,
      is_sample: true,
    }));
  for (let i = 0; i < facts.length; i += 1000) {
    await must(db.from("metric_daily").upsert(facts.slice(i, i + 1000)), "metric_daily");
  }

  await must(
    db.from("data_flags").insert(
      flags.map((f) => ({
        brand_id: brandId.get(f.brand),
        platform: f.platform,
        kind: f.kind,
        severity: f.severity,
        date_from: f.dateFrom,
        date_to: f.dateTo,
        title: f.title,
        detail: f.detail,
        is_sample: true,
      })),
    ),
    "sample flags",
  );
  console.log(`Sample data: ${facts.length} daily rows and ${flags.length} flags, Sep 27 to ${until}.`);
}

async function main() {
  if (args.has("--clear-sample")) return clearSample();
  await seedBrands();
  await seedInvites();
  if (args.has("--sample")) await seedSample();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
