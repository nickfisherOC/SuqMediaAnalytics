import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { TIKTOK_SCOPES, tiktokClient } from "@/lib/connectors/tiktok";
import { getAppContext } from "@/lib/data/source";

/** Starts "Connect TikTok": admins only. TikTok sends the person back to /api/connect/tiktok/callback. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  try {
    const ctx = await getAppContext();
    if (ctx.mode !== "live" || ctx.viewer.role !== "admin") return NextResponse.redirect(new URL("/connections?tiktok=admins_only", origin));

    const state = randomBytes(24).toString("hex");
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.search = new URLSearchParams({
      client_key: tiktokClient().key,
      scope: TIKTOK_SCOPES.join(","),
      response_type: "code",
      redirect_uri: new URL("/api/connect/tiktok/callback", origin).toString(),
      state,
    }).toString();
    const res = NextResponse.redirect(url);
    res.cookies.set("pulse_tiktok_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/connect/tiktok", maxAge: 600 });
    return res;
  } catch (e) {
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.redirect(new URL(`/connections?${new URLSearchParams({ tiktok: "error", detail: detail.slice(0, 300) })}`, origin));
  }
}
