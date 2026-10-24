import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandSection } from "@/components/brand-section";
import { PageSkeleton } from "@/components/page-skeleton";
import { PLATFORM_INFO } from "@/config/platforms";
import { getAccountStatuses, getAppContext, type AccountStatus } from "@/lib/data/source";
import { RefreshButton } from "./refresh-button";

export const metadata: Metadata = { title: "Connections" };

const STATUS: Record<AccountStatus["status"], { label: string; color: string }> = {
  connected: { label: "Connected", color: "var(--status-good)" },
  expiring: { label: "Token expiring", color: "var(--status-warning)" },
  broken: { label: "Broken", color: "var(--status-critical)" },
  not_connected: { label: "Not connected", color: "var(--muted)" },
  sample: { label: "Sample data", color: "var(--status-warning)" },
};

/** What's still to come for sources that aren't connected yet. */
const NEXT_UP: Partial<Record<string, string>> = {
  ga4: "Connect Google is coming next",
  search_console: "Connect Google is coming next",
  youtube: "Connect Google is coming next",
  tiktok: "Waiting on the TikTok developer app",
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Edmonton", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function Connections() {
  const ctx = await getAppContext();
  const statuses = await getAccountStatuses();

  return (
    <div className="flex flex-col gap-12">
      <header>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Connections</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          Every data source for every brand. Pulse saves a snapshot of each one nightly, so history builds up from the day
          it&apos;s connected. The sync runs every night around 4am.
        </p>
        {ctx.mode === "live" && ctx.viewer.role === "admin" && (
          <div className="mt-4">
            <RefreshButton />
          </div>
        )}
      </header>
      {ctx.brands.map((brand) => (
        <BrandSection key={brand.slug} brand={brand}>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {statuses
              .filter((s) => s.brand === brand.slug)
              .map((s) => {
                const st = STATUS[s.status];
                const info = PLATFORM_INFO[s.platform];
                return (
                  <li key={s.platform} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold">{info.label}</h3>
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2">
                        <span aria-hidden className="size-2.5 rounded-full" style={{ background: st.color }} />
                        {st.label}
                      </span>
                    </div>
                    <p className="text-sm text-ink-2">{info.description}</p>
                    <dl className="mt-auto grid grid-cols-2 gap-1 text-xs text-muted">
                      <dt>Last sync</dt>
                      <dd className="text-right">{s.lastSyncedAt ? fmtTime(s.lastSyncedAt) : "Never"}</dd>
                      {s.rowsLastSync !== null && (
                        <>
                          <dt>Rows pulled</dt>
                          <dd className="text-right tabular">{s.rowsLastSync.toLocaleString("en-CA")}</dd>
                        </>
                      )}
                      {s.displayName && (
                        <>
                          <dt>Account</dt>
                          <dd className="truncate text-right">{s.displayName}</dd>
                        </>
                      )}
                    </dl>
                    {s.lastError && <p className="text-sm text-bad">{s.lastError}</p>}
                    {s.status === "not_connected" && NEXT_UP[s.platform] && (
                      <p className="rounded-lg border border-dashed border-line px-3 py-2 text-sm text-muted">{NEXT_UP[s.platform]}</p>
                    )}
                  </li>
                );
              })}
          </ul>
        </BrandSection>
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Connections />
    </Suspense>
  );
}
