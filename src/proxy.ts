import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPreviewMode, isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/env";

/** Paths reachable without signing in. (/api/cron/ checks its own secret.) */
const PUBLIC_PATHS = ["/login", "/auth/", "/share/", "/api/cron/"];

function withNoIndex(res: NextResponse) {
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return res;
}

/**
 * Refreshes the Supabase session cookie on every request and sends anyone
 * who isn't signed in to /login. Pages still check membership themselves;
 * this is the optimistic first gate.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));

  if (isPreviewMode) return withNoIndex(NextResponse.next());
  if (!isSupabaseConfigured) {
    return withNoIndex(new NextResponse("Pulse isn't configured: set the Supabase environment variables.", { status: 503 }));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims verifies the JWT; don't run code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return withNoIndex(NextResponse.redirect(url));
  }

  return withNoIndex(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|icon.svg).*)"],
};
