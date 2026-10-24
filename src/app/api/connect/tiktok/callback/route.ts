import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { tiktokToken, tiktokUser } from "@/lib/connectors/tiktok";
import { getAppContext } from "@/lib/data/source";
import { todayInEdmonton, addDays } from "@/lib/dates";
import { loadAccounts, syncAccount } from "@/lib/sync/engine";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 120;

/** TikTok sends people back here after they approve Pulse. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (params: Record<string, string>) => {
    const res = NextResponse.redirect(new URL(`/connections?${new URLSearchParams(params)}`, origin));
    res.cookies.delete({ name: "pulse_tiktok_state", path: "/api/connect/tiktok" });
    return res;
  };

  try {
    const ctx = await getAppContext();
    if (ctx.mode !== "live" || ctx.viewer.role !== "admin") return back({ tiktok: "admins_only" });

    const q = request.nextUrl.searchParams;
    if (q.get("error")) return back({ tiktok: "cancelled" });
    if (!q.get("state") || q.get("state") !== request.cookies.get("pulse_tiktok_state")?.value) return back({ tiktok: "expired" });

    const tokens = await tiktokToken({
      grant_type: "authorization_code",
      code: q.get("code") ?? "",
      redirect_uri: new URL("/api/connect/tiktok/callback", origin).toString(),
    });
    const missingScopes = ["user.info.stats", "video.list"].filter((s) => !tokens.scope.includes(s));
    if (missingScopes.length) return back({ tiktok: "error", detail: `TikTok didn't grant ${missingScopes.join(" and ")}. Try again and allow everything.` });

    const user = await tiktokUser(null, tokens.access_token);
    const brand = ctx.brands.find((b) => b.slug === "peoplesuq");
    if (!brand?.id) return back({ tiktok: "error", detail: "PeopleSuq brand not found." });

    const db = createServiceClient();
    const { data, error } = await db
      .from("accounts")
      .upsert(
        { brand_id: brand.id, platform: "tiktok", external_id: tokens.open_id, display_name: user.display_name, status: "connected", is_sample: false, last_error: null, consecutive_failures: 0 },
        { onConflict: "brand_id,platform,external_id" },
      )
      .select("id")
      .single();
    if (error) throw error;
    const { error: vErr } = await db.rpc("set_account_token", { p_account_id: data.id, p_kind: "refresh", p_secret: tokens.refresh_token });
    if (vErr) throw vErr;

    // First sync: today's video snapshot plus posting history.
    const [account] = await loadAccounts(db, { ids: [data.id] });
    const today = todayInEdmonton();
    const r = account ? await syncAccount(db, account, addDays(today, -60), today, "backfill") : null;
    return back({ tiktok: "connected", name: user.display_name, followers: String(user.follower_count ?? ""), failed: r && !r.ok ? (r.error ?? "") : "" });
  } catch (e) {
    // Let Next.js handle its own signals (redirects, build-time bail-outs).
    unstable_rethrow(e);
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Connect TikTok failed:", e);
    return back({ tiktok: "error", detail: detail.slice(0, 300) });
  }
}
