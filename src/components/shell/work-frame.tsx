import Link from "next/link";
import { Suspense } from "react";
import { Shell, ShellFallback } from "@/components/shell/shell";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { getViewer } from "@/lib/data/source";

/** The pages production-only users can open. */
export const WORK_PAGES = [
  { href: "/production", label: "Production" },
  { href: "/inventory", label: "Inventory" },
];

/**
 * Production and Inventory sit outside the (app) group so production-only
 * users get a plain frame with just those pages; everyone else gets the
 * usual shell.
 */
async function Frame({ children }: { children: React.ReactNode }) {
  const { mode, viewer } = await getViewer();
  if (viewer.role !== "production") return <Shell>{children}</Shell>;

  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 lg:px-8">
        <div className="flex items-center gap-4">
          <span className="font-display text-xl font-extrabold tracking-tight">Pulse</span>
          <nav aria-label="Main" className="flex gap-1">
            {WORK_PAGES.map((p) => (
              <Link key={p.href} href={p.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
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

export function WorkFrame({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <Frame>{children}</Frame>
    </Suspense>
  );
}
