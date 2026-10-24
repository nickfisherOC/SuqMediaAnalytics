import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isPreviewMode } from "@/lib/env";
import { GoogleSignIn } from "./google-sign-in";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  not_invited: "That Google account hasn't been invited to Pulse. Ask Nick or Krzysztof for an invite.",
  auth_failed: "Sign-in didn't complete. Please try again.",
};

async function Message({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { error } = await searchParams;
  const text = typeof error === "string" ? (ERRORS[error] ?? ERRORS.auth_failed) : null;
  return text ? (
    <p role="alert" className="rounded-xl border border-[color:var(--status-critical)] p-3 text-sm text-ink">
      {text}
    </p>
  ) : null;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-3xl border border-line bg-surface p-8">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Pulse</h1>
          <p className="mt-2 text-ink-2">The weekly growth review for PeopleSuq and SUQ Media. Invite only.</p>
        </div>
        <Suspense>
          <Message searchParams={props.searchParams} />
        </Suspense>
        {isPreviewMode ? (
          <p className="text-sm text-ink-2">
            Preview mode: Supabase isn&apos;t configured, so sign-in is off. <Link className="underline" href="/">Open Pulse</Link>.
          </p>
        ) : (
          <Suspense>
            <GoogleSignIn />
          </Suspense>
        )}
      </div>
    </main>
  );
}
