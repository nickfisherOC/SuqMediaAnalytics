import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { googleClient } from "@/lib/connectors/google";
import { getAppContext } from "@/lib/data/source";
import { todayInEdmonton } from "@/lib/dates";
import { loadAccounts, syncAccount } from "@/lib/sync/engine";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 300;

/** Google history to pull on first connect. */
const BACKFILL_FROM = "2026-09-01";

/** Which brand a website or channel belongs to. */
function brandFor(text: string): "peoplesuq" | "suq-media" | null {
  const t = text.toLowerCase().replace(/\s+/g, "");
  if (t.includes("suqmedia")) return "suq-media";
  if (t.includes("peoplesuq")) return "peoplesuq";
  return null;
}

async function google<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(`${url.split("?")[0]}: ${body?.error?.message ?? res.status}`);
  return body as T;
}

export async function GET(request: NextRequest) {
  try {
    return await handle(request);
  } catch (e) {
    // Show what went wrong on the Connections page instead of a blank 500.
    const detail = e instanceof Error ? e.message : String(e);
    if (detail === "NEXT_REDIRECT" || (e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    console.error("Connect Google failed:", e);
    return NextResponse.redirect(new URL(`/connections?${new URLSearchParams({ google: "error", detail: detail.slice(0, 300) })}`, request.nextUrl.origin));
  }
}

async function handle(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (params: Record<string, string>) => NextResponse.redirect(new URL(`/connections?${new URLSearchParams(params)}`, origin));

  const ctx = await getAppContext();
  if (ctx.mode !== "live" || ctx.viewer.role !== "admin") return back({ google: "admins_only" });

  const q = request.nextUrl.searchParams;
  if (q.get("error")) return back({ google: "cancelled" });
  const state = request.cookies.get("pulse_google_state")?.value;
  if (!state || state !== q.get("state")) return back({ google: "expired" });

  // Code → tokens.
  const { id, secret } = googleClient();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: q.get("code") ?? "",
      client_id: id,
      client_secret: secret,
      redirect_uri: new URL("/api/connect/google/callback", origin).toString(),
      grant_type: "authorization_code",
    }),
  });
  const tokens = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; scope?: string };
  if (!tokens.access_token || !tokens.refresh_token) return back({ google: "no_refresh_token" });
  const access = tokens.access_token;
  const granted = tokens.scope ?? "";

  const db = createServiceClient();
  const found: string[] = [];
  const missing: string[] = [];

  const save = async (brand: string, platform: string, externalId: string, displayName: string, settings: Record<string, unknown> = {}) => {
    const b = ctx.brands.find((x) => x.slug === brand);
    if (!b?.id) return;
    const { data, error } = await db
      .from("accounts")
      .upsert(
        { brand_id: b.id, platform, external_id: externalId, display_name: displayName, settings, status: "connected", is_sample: false, last_error: null, consecutive_failures: 0 },
        { onConflict: "brand_id,platform,external_id" },
      )
      .select("id")
      .single();
    if (error) throw error;
    const { error: vErr } = await db.rpc("set_account_token", { p_account_id: data.id, p_kind: "refresh", p_secret: tokens.refresh_token });
    if (vErr) throw vErr;
    found.push(`${b.shortName} ${displayName}`);
    return data.id as string;
  };

  const newIds: string[] = [];

  // Google Analytics 4: match properties to brands by their website.
  if (granted.includes("analytics.readonly")) {
    const sums = await google<{ accountSummaries?: { propertySummaries?: { property: string; displayName: string }[] }[] }>(
      access,
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
    );
    const matched = new Set<string>();
    for (const p of (sums.accountSummaries ?? []).flatMap((a) => a.propertySummaries ?? [])) {
      const streams = await google<{ dataStreams?: { webStreamData?: { defaultUri?: string } }[] }>(
        access,
        `https://analyticsadmin.googleapis.com/v1beta/${p.property}/dataStreams`,
      ).catch(() => ({ dataStreams: [] }));
      const site = streams.dataStreams?.map((s) => s.webStreamData?.defaultUri ?? "").join(" ") ?? "";
      const brand = brandFor(`${site} ${p.displayName}`);
      if (!brand || matched.has(brand)) continue;
      matched.add(brand);
      const id = await save(brand, "ga4", p.property, `${p.displayName} (${site || "GA4"})`);
      if (id) newIds.push(id);
    }
    for (const b of ["peoplesuq", "suq-media"]) if (!matched.has(b)) missing.push(`Google Analytics for ${b === "peoplesuq" ? "peoplesuq.com" : "suqmedia.com"}`);
  }

  // Search Console: domain properties win over URL-prefix ones.
  if (granted.includes("webmasters.readonly")) {
    const sites = await google<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(access, "https://www.googleapis.com/webmasters/v3/sites");
    const usable = (sites.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser");
    usable.sort((a, b) => Number(b.siteUrl.startsWith("sc-domain:")) - Number(a.siteUrl.startsWith("sc-domain:")));
    const matched = new Set<string>();
    for (const s of usable) {
      const brand = brandFor(s.siteUrl);
      if (!brand || matched.has(brand)) continue;
      matched.add(brand);
      const id = await save(brand, "search_console", s.siteUrl, s.siteUrl.replace("sc-domain:", ""));
      if (id) newIds.push(id);
    }
    for (const b of ["peoplesuq", "suq-media"]) if (!matched.has(b)) missing.push(`Search Console for ${b === "peoplesuq" ? "peoplesuq.com" : "suqmedia.com"}`);
  }

  // YouTube: the channel(s) this Google account owns.
  if (granted.includes("youtube.readonly")) {
    const ch = await google<{ items?: { id: string; snippet: { title: string; customUrl?: string } }[] }>(
      access,
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    );
    const item = (ch.items ?? []).find((c) => brandFor(`${c.snippet.title} ${c.snippet.customUrl ?? ""}`) === "peoplesuq") ?? ch.items?.[0];
    if (item) {
      const id = await save("peoplesuq", "youtube", item.id, item.snippet.customUrl ?? item.snippet.title);
      if (id) newIds.push(id);
    } else missing.push("a YouTube channel on this Google account");
  }

  // First backfill straight away, so the dashboard fills in now rather than tonight.
  const accounts = await loadAccounts(db, { ids: newIds });
  const failed: string[] = [];
  for (const a of accounts) {
    const r = await syncAccount(db as SupabaseClient, a, BACKFILL_FROM, todayInEdmonton(), "backfill");
    if (!r.ok) failed.push(`${r.account}: ${r.error}`);
  }

  const res = back({ google: "connected", found: found.join("|"), missing: missing.join("|"), failed: failed.join("|") });
  res.cookies.delete({ name: "pulse_google_state", path: "/api/connect/google" });
  return res;
}
