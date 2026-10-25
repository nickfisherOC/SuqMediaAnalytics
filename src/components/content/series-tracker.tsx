import { PLATFORM_INFO, type SocialPlatform } from "@/config/platforms";
import { formatShort } from "@/lib/dates";
import { formatExact } from "@/lib/format";
import type { SeriesDayRow, SeriesGrid } from "@/lib/series-grid";

const n = (v: number | null) => (v === null ? "—" : formatExact(v, "count"));
const dot = (p: SocialPlatform) => (
  <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ background: `var(--series-${PLATFORM_INFO[p].seriesSlot})` }} />
);
const card = "rounded-2xl border border-line bg-surface p-5";
const daysList = (days: number[]) => (days.length === 1 ? `Day ${days[0]}` : `Days ${days.join(", ")}`);

/** Where the series stands: progress, total views, best day, and any gaps per platform. */
export function SeriesSummary({ grid }: { grid: SeriesGrid }) {
  const ranked = grid.days.filter((d) => d.totalViews > 0).sort((a, b) => b.totalViews - a.totalViews);
  const best = ranked[0];
  const stat = (label: string, value: string, note?: string) => (
    <div className={card}>
      <p className="text-base font-medium text-ink-2">{label}</p>
      <p className="mt-2 text-4xl leading-none font-semibold tracking-tight">{value}</p>
      {note && <p className="mt-2 text-sm text-ink-2">{note}</p>}
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stat("Progress", `Day ${grid.daysSoFar} of ${grid.series.days}`, `${grid.series.days - grid.daysSoFar} days to go`)}
        {stat("Views so far", formatExact(grid.totalViews, "count"), "Every series video, all platforms")}
        {best && stat("Best day", `Day ${best.day}`, `${formatExact(best.totalViews, "count")} views · ${best.title ?? ""}`)}
      </div>
      <div className={card}>
        <p className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">Posted so far</p>
        <ul className="flex flex-col gap-1.5">
          {grid.coverage.map((c) => (
            <li key={c.platform} className="flex flex-wrap items-center gap-x-2">
              {dot(c.platform)}
              <span className="font-semibold">{PLATFORM_INFO[c.platform].label}</span>
              <span className="tabular text-ink-2">
                {c.posted} of {grid.daysSoFar}
              </span>
              {c.missed.length > 0 ? <span className="text-sm text-bad">· no post found for {daysList(c.missed)}</span> : <span className="text-sm text-good">· every day</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Row({ d, platforms, max, rank }: { d: SeriesDayRow; platforms: SocialPlatform[]; max: number; rank: number | null }) {
  const upcoming = d.status === "upcoming";
  return (
    <tr className={upcoming ? "text-muted" : ""}>
      <td className="py-2.5 pr-3 whitespace-nowrap">
        <span className="font-semibold">Day {d.day}</span>
        <span className="ml-2 text-xs text-muted">{formatShort(d.date)}</span>
        {rank !== null && <span className="ml-2 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-semibold text-ink">Top {rank}</span>}
      </td>
      <td className="max-w-72 truncate py-2.5 pr-3" title={d.title ?? undefined}>
        {d.title ?? (upcoming ? "Coming up" : d.status === "today" ? "Not posted yet" : <span className="text-muted">No posts found</span>)}
      </td>
      {platforms.map((p) => {
        const c = d.cells[p];
        return (
          <td key={p} className="tabular py-2.5 pr-3 text-right">
            {c ? (
              c.url ? (
                <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline" title={`Open on ${PLATFORM_INFO[p].label}`}>
                  {n(c.views)}
                </a>
              ) : (
                n(c.views)
              )
            ) : d.status === "posted" ? (
              <span className="text-xs text-bad">none</span>
            ) : (
              <span className="text-muted">·</span>
            )}
          </td>
        );
      })}
      <td className="py-2.5">
        {d.totalViews > 0 && (
          <div className="flex items-center gap-2" title={`Day ${d.day}: ${formatExact(d.totalViews, "count")} views`}>
            <div className="h-2 w-24 rounded-full bg-surface-2" aria-hidden>
              <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(4, (d.totalViews / max) * 100)}%` }} />
            </div>
            <span className="tabular font-semibold">{formatExact(d.totalViews, "count")}</span>
          </div>
        )}
      </td>
    </tr>
  );
}

/** Every day of the series: each platform's views (linked to the post) and the day's total. */
export function SeriesTable({ grid }: { grid: SeriesGrid }) {
  const max = Math.max(1, ...grid.days.map((d) => d.totalViews));
  const top = grid.days
    .filter((d) => d.totalViews > 0)
    .sort((a, b) => b.totalViews - a.totalViews)
    .slice(0, 3)
    .map((d) => d.day);
  return (
    <div className={card}>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="py-2 pr-3 font-semibold">Day</th>
              <th className="py-2 pr-3 font-semibold">Hook</th>
              {grid.platforms.map((p) => (
                <th key={p} className="py-2 pr-3 text-right font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    {dot(p)}
                    {PLATFORM_INFO[p].label}
                  </span>
                </th>
              ))}
              <th className="py-2 font-semibold">All platforms</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {grid.days.map((d) => (
              <Row key={d.day} d={d} platforms={grid.platforms} max={max} rank={top.includes(d.day) ? top.indexOf(d.day) + 1 : null} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        Views are each video&apos;s lifetime total{grid.asOf ? ` as of ${formatShort(grid.asOf)}` : ""}, so earlier days have had more time to collect them. Click a
        number to open that post. A post counts for a day when its caption says &quot;Day N&quot;.
      </p>
    </div>
  );
}
