import Link from "next/link";
import { NAV } from "@/components/nav";
import { getAccountStatuses, getAppContext } from "@/lib/data/source";
import { ControlBar } from "./control-bar";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export async function Shell({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  const accounts = await getAccountStatuses();
  const usesSample = accounts.some((a) => a.status === "sample");

  const items = NAV.filter(
    (i) => (!i.adminOnly || ctx.viewer.role === "admin") && (!i.needs || ctx.brands.some((b) => b.platforms.includes(i.needs!))),
  );

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r border-line bg-surface lg:flex lg:flex-col lg:gap-6 lg:p-4">
        <Link href="/" className="px-3 pt-2 font-display text-2xl font-extrabold tracking-tight">
          Pulse
        </Link>
        <nav aria-label="Main">
          <NavLinks items={items} orientation="vertical" />
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-line pt-4 text-sm">
          <p className="truncate px-3 text-ink-2" title={ctx.viewer.email}>
            {ctx.viewer.name ?? ctx.viewer.email}
            <span className="block text-xs text-muted capitalize">{ctx.viewer.role}</span>
          </p>
          <ThemeToggle />
          {ctx.mode === "live" && (
            <form action="/auth/signout" method="post">
              <button className="w-full rounded-lg px-3 py-2 text-left text-ink-2 hover:bg-surface-2 hover:text-ink">Sign out</button>
            </form>
          )}
        </div>
      </aside>

      <div className="min-w-0">
        <header className="z-20 border-b border-line bg-page/95 backdrop-blur lg:sticky lg:top-0">
          <div className="flex items-center justify-between gap-3 px-4 pt-3 lg:hidden">
            <Link href="/" className="font-display text-xl font-extrabold">
              Pulse
            </Link>
            <ThemeToggle />
          </div>
          <nav aria-label="Main" className="pt-2 lg:hidden">
            <NavLinks items={items} orientation="horizontal" />
          </nav>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
            <ControlBar brands={ctx.brands} today={ctx.today} />
            {(usesSample || ctx.mode === "preview") && <SampleBadge preview={ctx.mode === "preview"} />}
          </div>
        </header>
        <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function SampleBadge({ preview }: { preview: boolean }) {
  return (
    <p
      className="flex items-center gap-2 rounded-full border border-[color:var(--status-warning)] px-3 py-1 text-xs font-semibold text-ink"
      title={
        preview
          ? "Preview mode: Supabase isn't connected, so every number is built-in sample data."
          : "Some numbers are sample data. They're replaced as each account is connected."
      }
    >
      <span aria-hidden className="size-2 rounded-full bg-[color:var(--status-warning)]" />
      {preview ? "Preview · sample data" : "Includes sample data"}
    </p>
  );
}

export function ShellFallback() {
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r border-line bg-surface lg:block" />
      <div className="p-8">
        <div className="h-9 w-80 animate-pulse rounded-lg bg-surface-2" />
      </div>
    </div>
  );
}
