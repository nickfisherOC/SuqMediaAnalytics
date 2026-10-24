import { randomBytes } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { GOOGLE_SCOPES, googleClient } from "@/lib/connectors/google";
import { getAppContext } from "@/lib/data/source";

/**
 * Starts "Connect Google": admins only. Google sends the person back to
 * /api/connect/google/callback. `?only=youtube` asks for YouTube alone, so the
 * person can pick the channel's own (brand) account without touching Analytics.
 */
export async function GET(request: NextRequest) {
  try {
    return await handle(request);
  } catch (e) {
    // Let Next.js handle its own signals (redirects, build-time bail-outs).
    unstable_rethrow(e);
    // Show what went wrong on the Connections page instead of a blank 500.
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Connect Google failed:", e);
    return NextResponse.redirect(new URL(`/connections?${new URLSearchParams({ google: "error", detail: detail.slice(0, 300) })}`, request.nextUrl.origin));
  }
}

async function handle(request: NextRequest) {
  const ctx = await getAppContext();
  if (ctx.mode !== "live" || ctx.viewer.role !== "admin") {
    return NextResponse.redirect(new URL("/connections?google=admins_only", request.nextUrl.origin));
  }

  const state = randomBytes(24).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: googleClient().id,
    redirect_uri: new URL("/api/connect/google/callback", request.nextUrl.origin).toString(),
    response_type: "code",
    scope: (request.nextUrl.searchParams.get("only") === "youtube" ? GOOGLE_SCOPES.filter((sc) => sc.includes("youtube") || sc.includes("yt-analytics")) : GOOGLE_SCOPES).join(" "),
    // Offline + consent so Google always returns a refresh token for the nightly sync.
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set("pulse_google_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/connect/google", maxAge: 600 });
  return res;
}
