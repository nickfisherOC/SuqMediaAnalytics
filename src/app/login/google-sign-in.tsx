"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { allowedEmailDomain } from "@/lib/env";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function GoogleSignIn() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    const next = params.get("next");
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next?.startsWith("/")) redirectTo.searchParams.set("next", next);

    const { error } = await createBrowserSupabase().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
        // Steers Google's account picker to the work account; the invite list is what actually controls access.
        queryParams: { prompt: "select_account", ...(allowedEmailDomain ? { hd: allowedEmailDomain } : {}) },
      },
    });
    if (error) setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={busy}
      className="flex h-12 items-center justify-center gap-3 rounded-xl bg-ink px-4 font-semibold text-page disabled:opacity-60"
    >
      <svg viewBox="0 0 18 18" className="size-5" aria-hidden>
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 009 18z" />
        <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 013.69 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 000 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 00.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
      </svg>
      {busy ? "Opening Google…" : "Sign in with Google"}
    </button>
  );
}
