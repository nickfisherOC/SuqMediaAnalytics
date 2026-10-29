import Link from "next/link";
import { Suspense } from "react";
import { Shell, ShellFallback } from "@/components/shell/shell";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { getViewer } from "@/lib/data/source";

/**
 * Production sits outside the (app) group so production-only users get a
 * plain frame with just the queue; everyone else gets the usual shell.
 */
async function Frame({ children }: { children: React.ReactNode }) {
  const { mode, viewer } = await getViewer();
  if (viewer.role !== "production") return <Shell>{children}</Shell>;

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 lg:px-8">
        <Link href="/production" className="font-display text-xl font-extrabold tracking-tight">
          Pulse <span className="font-semibold text-muted">· Production</span>
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden text-ink-2 sm:inline">{viewer.name ?? viewer.email}</span>
          <ThemeToggle />
          {mode === "live" && (
            <form action="/auth/signout" method="post">
              <button className="rounded-lg px-3 py-2 text-ink-2 hover:bg-surface-2 hover:text-ink">Sign out</button>
            </form>
          )}
        </div>
      </header>
      <main className="px-4 py-6 pb-24 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

export default function ProductionLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <Frame>{children}</Frame>
    </Suspense>
  );
}
