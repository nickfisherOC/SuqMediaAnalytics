import { formatShort } from "@/lib/dates";
import { formatExact } from "@/lib/format";
import type { CityRank } from "@/lib/rank";
import { shortPage, type Badge, type Crossovers, type KeywordResult, type QueryStats } from "@/lib/search";
import type { Breakdown } from "@/lib/data/search-site";
import { AddKeyword, CheckRanksNow, RemoveKeyword } from "./keyword-editor";

const card = "rounded-2xl border border-line bg-surface p-5";
const pos = (p: number) => (p < 10 ? p.toFixed(1) : Math.round(p).toString());
const count = (n: number) => formatExact(n, "count");

const BADGE: Record<Badge, { label: string; className: string }> = {
  top3: { label: "Top 3", className: "bg-[color-mix(in_oklab,var(--status-good)_18%,transparent)] text-ink" },
  page1: { label: "Page 1", className: "bg-[color-mix(in_oklab,var(--status-good)_10%,transparent)] text-ink" },
  page2: { label: "Page 2 · close!", className: "bg-[color-mix(in_oklab,var(--status-warning)_18%,transparent)] text-ink" },
  deeper: { label: "", className: "bg-surface-2 text-ink-2" },
  none: { label: "Not showing up yet", className: "bg-surface-2 text-muted" },
};

function BadgeChip({ k }: { k: KeywordResult }) {
  const b = BADGE[k.badge];
  const label = k.badge === "deeper" && k.position !== null ? `Page ${Math.ceil(k.position / 10)}` : b.label;
  return <span className={`rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${b.className}`}>{label}</span>;
}

function Movement({ k }: { k: KeywordResult }) {
  if (k.movedUp === null) return <span className="text-xs text-muted">{k.position === null ? "" : "new"}</span>;
  const d = Math.round(k.movedUp * 10) / 10;
  if (Math.abs(d) < 0.5) return <span className="text-xs text-muted">no change</span>;
  return d > 0 ? <span className="text-xs font-semibold text-good">▲ up {pos(d)}</span> : <span className="text-xs font-semibold text-bad">▼ down {pos(-d)}</span>;
}

/** One city's exact position for a keyword: "#12", "100+", movement since the last check, and its Google Maps spot. */
function CityCell({ r }: { r: CityRank | undefined }) {
  if (!r) return <span className="text-muted">—</span>;
  const moved = r.previous === undefined ? null : (r.previous ?? 101) - (r.position ?? 101);
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="tabular font-semibold">{r.position === null ? <span className="text-muted">100+</span> : `#${r.position}`}</span>
      {moved !== null && moved !== 0 && (
        <span className={`text-xs font-semibold ${moved > 0 ? "text-good" : "text-bad"}`}>
          {moved > 0 ? "▲" : "▼"} {Math.abs(moved) > 100 ? "" : Math.abs(moved)}
        </span>
      )}
      {r.mapPack && <span className={`text-xs ${r.mapRank ? "font-semibold text-good" : "text-muted"}`}>{r.mapRank ? `Maps #${r.mapRank}` : "not in Maps"}</span>}
    </span>
  );
}

/** Who ranks above you, per city, behind a small toggle under the keyword. */
function AboveYou({ ranks }: { ranks: CityRank[] }) {
  if (!ranks.some((r) => r.above.length)) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs font-medium text-ink-2 hover:text-ink">Who&apos;s above you</summary>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {ranks.map((r) => (
          <div key={r.city}>
            <p className="text-xs font-semibold text-muted">{r.city}</p>
            <ol className="text-xs text-ink-2">
              {r.above.slice(0, 3).map((a) => (
                <li key={a.url} className="truncate" title={a.title}>
                  #{a.rank}{" "}
                  <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {a.domain.replace(/^www\./, "")}
                  </a>
                </li>
              ))}
              {!r.above.length && <li>Nobody: you&apos;re on top.</li>}
            </ol>
          </div>
        ))}
      </div>
    </details>
  );
}

/** The keywords a brand tracks, by group: Google position, movement, badge, exact city positions, and the page that shows up. */
export function KeywordBoard({
  brand,
  keywords,
  compareLabel,
  isAdmin,
  ranks,
  rankInfo,
}: {
  brand: string;
  keywords: KeywordResult[];
  compareLabel: string;
  isAdmin: boolean;
  ranks: Record<string, CityRank[]>;
  rankInfo: { configured: boolean; checkedOn: string | null; pending: number };
}) {
  const groups = [...new Set(keywords.map((k) => k.group))];
  const cities = rankInfo.configured ? ["Edmonton", "Calgary"] : [];
  return (
    <div className={card}>
      {rankInfo.configured && (
        <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>
            {rankInfo.checkedOn ? `Edmonton and Calgary positions checked ${formatShort(rankInfo.checkedOn)}. ` : "Edmonton and Calgary positions haven't been checked yet. "}
            {rankInfo.pending ? `${rankInfo.pending} checks in progress, back in a few minutes. ` : ""}
            Checked every Saturday.
          </span>
          {isAdmin && !rankInfo.pending && <CheckRanksNow brand={brand} />}
        </p>
      )}
      {!keywords.length && <p className="text-ink-2">No keywords tracked yet.{isAdmin ? " Add one below." : ""}</p>}
      {groups.map((g) => (
        <div key={g} className="mb-5 last:mb-0">
          <p className="mb-1 text-sm font-semibold text-ink-2">{g}</p>
          <div className="overflow-x-auto">
            {/* Fixed column widths so every group's columns line up. */}
            <table className="w-full min-w-[54rem] table-fixed text-left">
              <thead className="text-xs tracking-wide text-muted uppercase">
                <tr>
                  <th className="w-[26%] py-2 pr-3 font-semibold">Search</th>
                  <th className="w-[15%] py-2 pr-3 text-right font-semibold">Avg position</th>
                  <th className="w-[11%] py-2 pr-3 font-semibold">vs {compareLabel}</th>
                  {cities.map((c) => (
                    <th key={c} className="w-[9%] py-2 pr-3 text-right font-semibold">
                      {c}
                    </th>
                  ))}
                  <th className="w-[8%] py-2 pr-3 text-right font-semibold">Shown</th>
                  <th className="w-[8%] py-2 pr-3 text-right font-semibold">Clicks</th>
                  <th className="py-2 pr-3 font-semibold">Page that shows up</th>
                  {isAdmin && <th className="w-8 py-2" aria-label="Remove" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {keywords
                  .filter((k) => k.group === g)
                  .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
                  .map((k) => (
                    <tr key={k.id}>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium">{k.keyword}</p>
                        {k.variants.length > 0 && <p className="text-xs text-muted">also counts: {k.variants.slice(0, 3).join(", ")}</p>}
                        <AboveYou ranks={ranks[k.keyword.toLowerCase()] ?? []} />
                      </td>
                      <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                        <span className="flex items-center justify-end gap-2">
                          {k.position !== null && <span className="tabular text-lg font-semibold">{pos(k.position)}</span>}
                          <BadgeChip k={k} />
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        <Movement k={k} />
                      </td>
                      {cities.map((c) => (
                        <td key={c} className="py-2.5 pr-3 text-right align-top">
                          <CityCell r={ranks[k.keyword.toLowerCase()]?.find((r) => r.city === c)} />
                        </td>
                      ))}
                      <td className="tabular py-2.5 pr-3 text-right">{k.impressions ? count(k.impressions) : "—"}</td>
                      <td className="tabular py-2.5 pr-3 text-right">{k.impressions ? count(k.clicks) : "—"}</td>
                      <td className="max-w-56 truncate py-2.5 pr-3 text-sm text-ink-2" title={k.topPage ?? undefined}>
                        {k.topPage ? shortPage(k.topPage) : "—"}
                      </td>
                      {isAdmin && (
                        <td className="py-2.5 text-right">
                          <RemoveKeyword id={k.id} keyword={k.keyword} />
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {isAdmin && <AddKeyword brand={brand} groups={groups} />}
      <p className="mt-3 text-xs text-muted">
        Avg position is Google&apos;s average spot when your site was shown, everywhere people searched: 1 is the top, 11+ is page 2. &quot;Not showing up yet&quot;
        means Google didn&apos;t show the site for that search in this period.
        {cities.length > 0 &&
          " Edmonton and Calgary are exact positions from a Google search made in that city; 100+ means not in the top 100. “Maps” is your spot in the Google Maps box when Google shows one."}
      </p>
    </div>
  );
}

/** Searches as a simple list: search, position, times shown, clicks. */
export function QueryList({ queries, empty, note }: { queries: QueryStats[]; empty: string; note?: string }) {
  if (!queries.length) return <p className={`${card} text-ink-2`}>{empty}</p>;
  return (
    <div className={card}>
      <table className="w-full text-left">
        <thead className="text-xs tracking-wide text-muted uppercase">
          <tr>
            <th className="py-2 pr-3 font-semibold">Search</th>
            <th className="py-2 pr-3 text-right font-semibold">Position</th>
            <th className="py-2 pr-3 text-right font-semibold">Shown</th>
            <th className="py-2 text-right font-semibold">Clicks</th>
          </tr>
        </thead>
        <tbody className="tabular divide-y divide-line">
          {queries.map((q) => (
            <tr key={q.query}>
              <td className="py-2 pr-3 font-sans">
                {q.query}
                <span className="block truncate text-xs text-muted">{shortPage(q.topPage)}</span>
              </td>
              <td className="py-2 pr-3 text-right font-semibold">{pos(q.position)}</td>
              <td className="py-2 pr-3 text-right">{count(q.impressions)}</td>
              <td className="py-2 text-right">{count(q.clicks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="mt-3 text-xs text-muted">{note}</p>}
    </div>
  );
}

/** A ranked breakdown with thin bars (visits by channel, page, device or city). */
export function BreakdownList({ title, items, format = (s) => s, note }: { title: string; items: Breakdown[]; format?: (label: string) => string; note?: string }) {
  const total = items.reduce((t, i) => t + i.sessions, 0);
  const max = Math.max(1, ...items.map((i) => i.sessions));
  return (
    <div className={card}>
      <p className="mb-3 text-sm font-semibold text-ink-2">{title}</p>
      {!items.length ? (
        <p className="text-sm text-muted">No visits recorded.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={i.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1" title={`${format(i.label)}: ${count(i.sessions)} visits`}>
              <span className="truncate text-sm">{format(i.label)}</span>
              <span className="tabular text-sm font-semibold">
                {count(i.sessions)}
                <span className="font-normal text-muted"> · {Math.round((i.sessions / (total || 1)) * 100)}%</span>
              </span>
              <div className="col-span-2 h-1.5 rounded-full bg-surface-2" aria-hidden>
                <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(2, (i.sessions / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-3 text-xs text-muted">{note}</p>}
    </div>
  );
}

/** Searches for the other brand's name (or a name both share) that showed this site, kept apart from the lists above. */
export function CrossoverNote({ site, crossovers }: { site: string; crossovers: Crossovers }) {
  if (!crossovers.otherBrand.length && !crossovers.shared.length) return null;
  const list = (qs: QueryStats[]) => qs.slice(0, 4).map((q) => `"${q.query}" (shown ${count(q.impressions)}, ${count(q.clicks)} click${q.clicks === 1 ? "" : "s"})`).join(", ");
  return (
    <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-ink-2">
      <p className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">Name crossover</p>
      <ul className="flex flex-col gap-1.5">
        {crossovers.otherBrand.map((o) => (
          <li key={o.brand}>
            <span className="font-semibold text-ink">Looking for {o.brand}, found {site}:</span> {list(o.queries)}.
          </li>
        ))}
        {crossovers.shared.length > 0 && (
          <li>
            <span className="font-semibold text-ink">Shared name, could be either brand:</span> {list(crossovers.shared)}.
          </li>
        )}
      </ul>
      <p className="mt-2 text-xs text-muted">These are kept out of Quick wins and Searches you didn&apos;t know about, so those only show searches meant for this brand.</p>
    </div>
  );
}
