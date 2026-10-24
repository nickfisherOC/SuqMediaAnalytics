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
  ga4: "Connects with the Connect Google button above",
  search_console: "Connects with the Connect Google button above",
  youtube: "Use Connect YouTube above and pick the PeopleSuq channel",
  tiktok: "Use Connect TikTok above",
};

const GOOGLE_PLATFORMS = ["ga4", "search_console", "youtube"];

/** What happened after Connect TikTok. */
function tiktokMessage(params: Record<string, string | string[] | undefined>): { tone: "good" | "bad"; lines: string[] } | null {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  switch (one("tiktok")) {
    case "":
      return null;
    case "connected": {
      const lines = [`TikTok connected: ${one("name")}${one("followers") ? ` (${one("followers")} followers)` : ""}. Daily views start tomorrow, once Pulse has two nights of snapshots.`];
      if (one("failed")) lines.push(`First sync had a problem: ${one("failed")}`);
      return { tone: one("failed") ? "bad" : "good", lines };
    }
    case "cancelled":
      return { tone: "bad", lines: ["TikTok sign-in was cancelled. Nothing changed."] };
    case "expired":
      return { tone: "bad", lines: ["That sign-in took too long or came from another tab. Please try Connect TikTok again."] };
    case "error":
      return { tone: "bad", lines: [`Connect TikTok hit a problem: ${one("detail") || "unknown error"}`] };
    default:
      return { tone: "bad", lines: ["Only admins can connect accounts."] };
  }
}

/** What happened after Connect Google, from the query string the callback sets. */
function googleMessage(params: Record<string, string | string[] | undefined>): { tone: "good" | "bad"; lines: string[] } | null {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const status = one("google");
  if (!status) return null;
  const split = (k: string) => one(k).split("|").filter(Boolean);
  switch (status) {
    case "connected": {
      const lines = [split("found").length ? `Connected: ${split("found").join(", ")}.` : "Google connected, but no matching accounts were found."];
      if (split("missing").length) lines.push(`Not found on that Google account: ${split("missing").join(", ")}.`);
      if (split("failed").length) lines.push(`First sync had problems: ${split("failed").join("; ")}`);
      return { tone: split("failed").length ? "bad" : "good", lines };
    }
    case "cancelled":
      return { tone: "bad", lines: ["Google sign-in was cancelled. Nothing changed."] };
    case "expired":
      return { tone: "bad", lines: ["That sign-in took too long or came from another tab. Please try Connect Google again."] };
    case "error":
      return { tone: "bad", lines: [`Connect Google hit a problem: ${one("detail") || "unknown error"}`] };
    case "no_refresh_token":
      return { tone: "bad", lines: ["Google didn't grant ongoing access. Try again and tick every box on Google's permission screen."] };
    default:
      return { tone: "bad", lines: ["Only admins can connect accounts."] };
  }
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", { timeZone: "America/Edmonton", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function Connections({ searchParams }: { searchParams: PageProps<"/connections">["searchParams"] }) {
  const ctx = await getAppContext();
  const statuses = await getAccountStatuses();
  const params = await searchParams;
  const message = googleMessage(params) ?? tiktokMessage(params);
  const googleConnected = statuses.some((s) => GOOGLE_PLATFORMS.includes(s.platform) && s.status !== "not_connected");

  return (
    <div className="flex flex-col gap-12">
      <header>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Connections</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          Every data source for every brand. Pulse saves a snapshot of each one nightly, so history builds up from the day
          it&apos;s connected. The sync runs every night around 4am.
        </p>
        {ctx.mode === "live" && ctx.viewer.role === "admin" && (
          <div className="mt-4 flex flex-wrap items-start gap-3">
            {/* A plain link: this starts a redirect to Google, not a page navigation. */}
            <a
              href="/api/connect/google"
              className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              {googleConnected ? "Reconnect Google" : "Connect Google"}
            </a>
            <a
              href="/api/connect/google?only=youtube"
              className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              Connect YouTube
            </a>
            <a
              href="/api/connect/tiktok"
              className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-2"
            >
              {statuses.some((s) => s.platform === "tiktok" && s.status !== "not_connected") ? "Reconnect TikTok" : "Connect TikTok"}
            </a>
            <RefreshButton />
          </div>
        )}
        {message && (
          <div
            role="status"
            className="mt-4 max-w-3xl rounded-xl border p-4 text-sm"
            style={{ borderColor: message.tone === "good" ? "var(--status-good)" : "var(--status-critical)" }}
          >
            {message.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
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

export default function Page(props: PageProps<"/connections">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Connections searchParams={props.searchParams} />
    </Suspense>
  );
}
