import { NextResponse, type NextRequest } from "next/server";
import { createUserClient } from "@/lib/supabase/server";

/** Google sends people back here; swap the code for a session. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

  // Supabase reports a refused sign-up (our invite check) as an error on the redirect.
  const errorDescription = url.searchParams.get("error_description") ?? "";
  if (!code) {
    const reason = /not_invited|Database error saving new user/i.test(errorDescription) ? "not_invited" : "auth_failed";
    return NextResponse.redirect(new URL(`/login?error=${reason}`, url.origin));
  }

  const supabase = await createUserClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=auth_failed", url.origin));

  return NextResponse.redirect(new URL(safeNext, url.origin));
}
