import { PLATFORM_INFO, type Platform } from "@/config/platforms";
import type { ContentCard, ContentGroup } from "@/lib/content";
import { formatShort } from "@/lib/dates";
import { formatExact } from "@/lib/format";

const color = (p: Platform) => `var(--series-${PLATFORM_INFO[p].seriesSlot ?? 1})`;
const views = (n: number | null) => (n === null ? "—" : formatExact(n, "count"));

/**
 * Top content across platforms: the same day's video added up over Facebook,
 * Instagram, TikTok and YouTube, then the best post on each platform.
 */
export function WhatsWinning({ groups, best, top = 5 }: { groups: ContentGroup[]; best: ContentCard[]; top?: number }) {
  if (!groups.length) {
    return <p className="rounded-2xl border border-line bg-surface p-5 text-ink-2">No posts were published in this period.</p>;
  }
  const shown = groups.slice(0, top);
  const max = shown[0]?.totalViews || 1;
  const asOf = best.map((b) => b.capturedOn).filter(Boolean).sort().at(-1);

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
        {shown.map((g, i) => (
          <li key={g.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-5">
            <span className="w-6 shrink-0 text-2xl font-semibold text-muted tabular">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted">
                {g.dayLabel ? `${g.dayLabel} · ` : ""}
                {formatShort(g.date)}
              </p>
              <p className="truncate text-lg font-semibold" title={g.title}>
                {g.title}
              </p>
              {/* Views split by platform: thin stacked bar plus the numbers in words. */}
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-2" style={{ width: `${Math.max(8, (g.totalViews / max) * 100)}%` }} aria-hidden>
                {g.byPlatform.map((b) => (
                  <span key={b.platform} style={{ width: `${(b.views / (g.totalViews || 1)) * 100}%`, background: color(b.platform) }} className="h-full border-r-2 border-surface last:border-r-0" />
                ))}
              </div>
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
                {g.byPlatform.map((b) => {
                  const link = g.items.find((it) => it.platform === b.platform)?.url;
                  const text = (
                    <>
                      <span aria-hidden className="mr-1 inline-block size-2 rounded-full" style={{ background: color(b.platform) }} />
                      {PLATFORM_INFO[b.platform].label} {views(b.views)}
                    </>
                  );
                  return link ? (
                    <a key={b.platform} href={link} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
                      {text}
                    </a>
                  ) : (
                    <span key={b.platform}>{text}</span>
                  );
                })}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-3xl font-semibold tabular">{views(g.totalViews)}</p>
              <p className="text-xs text-muted">views, all platforms</p>
            </div>
          </li>
        ))}
      </ol>

      {best.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-ink-2">Best on each platform</h4>
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {best.map((c) => (
              <li key={c.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
                <a href={c.url ?? undefined} target="_blank" rel="noreferrer" className="block aspect-[9/12] bg-surface-2" style={{ borderTop: `4px solid ${color(c.platform)}` }}>
                  {c.thumbnailUrl ? (
                    // Platform thumbnails live on their CDNs and expire; a plain <img> keeps it simple.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                  ) : null}
                </a>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="text-xs font-medium text-muted">
                    {PLATFORM_INFO[c.platform].label} · {formatShort(c.publishedDate)}
                  </p>
                  <p className="line-clamp-2 text-sm font-semibold">{c.caption?.split("\n")[0] || "Untitled"}</p>
                  <p className="mt-auto text-xl font-semibold tabular">
                    {views(c.views)} <span className="text-xs font-normal text-muted">views</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted">
        Lifetime views per video{asOf ? ` as of ${formatShort(asOf)}` : ""}, so newer videos have had fewer days to collect them. Facebook counts
        Reel plays; Instagram, TikTok and YouTube count views. YouTube shows public numbers until the channel owner connects.
      </p>
    </div>
  );
}
