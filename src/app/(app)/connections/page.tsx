import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandSection } from "@/components/brand-section";
import { PageSkeleton } from "@/components/page-skeleton";
import { PLATFORM_INFO } from "@/config/platforms";
import { getAccountStatuses, getAppContext, type AccountStatus } from "@/lib/data/source";

export const metadata: Metadata = { title: "Connections" };

const STATUS: Record<AccountStatus["status"], { label: string; color: string }> = {
  connected: { label: "Connected", color: "var(--status-good)" },
  expiring: { label: "Token expiring", color: "var(--status-warning)" },
  broken: { label: "Broken", color: "var(--status-critical)" },
  not_connected: { label: "Not connected", color: "var(--muted)" },
  sample: { label: "Sample data", color: "var(--status-warning)" },
};

/** Which build phase brings each connector. */
const PHASE: Record<string, number> = {
  ga4: 3,
  search_console: 3,
  youtube: 3,
  shopify: 3,
  facebook: 4,
  instagram: 4,
  meta_ads: 4,
  tiktok: 4,
  lead_rescue: 4,
};

async function Connections() {
  const ctx = await getAppContext();
  const statuses = await getAccountStatuses();

  return (
    <div className="flex flex-col gap-12">
      <header>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Connections</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          Every data source for every brand. Pulse saves a snapshot of each one nightly, so history builds up from the day
          it&apos;s connected.
        </p>
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
                      <dd className="text-right">{s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleString("en-CA", { timeZone: "America/Edmonton" }) : "Never"}</dd>
                      {s.displayName && (
                        <>
                          <dt>Account</dt>
                          <dd className="truncate text-right">{s.displayName}</dd>
                        </>
                      )}
                    </dl>
                    {s.lastError && <p className="text-sm text-bad">{s.lastError}</p>}
                    <button
                      type="button"
                      disabled
                      className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-muted"
                      title={`Connecting ${info.label} arrives in phase ${PHASE[s.platform]}.`}
                    >
                      Connect · phase {PHASE[s.platform]}
                    </button>
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
