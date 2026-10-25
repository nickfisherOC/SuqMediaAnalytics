import { PLATFORM_INFO, type SocialPlatform } from "@/config/platforms";
import type { ContentGroup } from "@/lib/content";
import { formatShort } from "@/lib/dates";
import { formatExact } from "@/lib/format";

const n = (v: number | null) => (v === null ? "—" : formatExact(v, "count"));

/**
 * Every piece of content in the period, matched across platforms: each
 * platform's views (linked to the post), comments, and the total.
 */
export function AllPosts({ pieces, platforms, asOf }: { pieces: ContentGroup[]; platforms: SocialPlatform[]; asOf: string | null }) {
  if (!pieces.length) return <p className="rounded-2xl border border-line bg-surface p-5 text-ink-2">Nothing was posted in this period.</p>;
  const max = Math.max(1, ...pieces.map((p) => p.totalViews));
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="py-2 pr-3 font-semibold">Posted</th>
              <th className="py-2 pr-3 font-semibold">Post</th>
              {platforms.map((p) => (
                <th key={p} className="py-2 pr-3 text-right font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: `var(--series-${PLATFORM_INFO[p].seriesSlot})` }} />
                    {PLATFORM_INFO[p].label}
                  </span>
                </th>
              ))}
              <th className="py-2 pr-3 text-right font-semibold">Comments</th>
              <th className="py-2 font-semibold">All platforms</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pieces.map((g) => {
              const comments = g.items.reduce((t, i) => t + (i.comments ?? 0), 0);
              return (
                <tr key={g.key}>
                  <td className="py-2.5 pr-3 whitespace-nowrap text-ink-2">{formatShort(g.date)}</td>
                  <td className="max-w-80 py-2.5 pr-3">
                    <p className="truncate font-medium" title={g.title}>
                      {g.title}
                    </p>
                    {g.dayLabel && <p className="text-xs text-muted">Series · {g.dayLabel}</p>}
                  </td>
                  {platforms.map((p) => {
                    const posts = g.items.filter((i) => i.platform === p);
                    if (!posts.length) return <td key={p} className="py-2.5 pr-3 text-right text-muted">·</td>;
                    const views = posts.some((i) => i.views !== null) ? posts.reduce((t, i) => t + (i.views ?? 0), 0) : null;
                    const url = posts[0].url;
                    return (
                      <td key={p} className="tabular py-2.5 pr-3 text-right">
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer" className="hover:underline" title={`Open on ${PLATFORM_INFO[p].label}`}>
                            {n(views)}
                          </a>
                        ) : (
                          n(views)
                        )}
                      </td>
                    );
                  })}
                  <td className="tabular py-2.5 pr-3 text-right">{comments}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2" title={`${formatExact(g.totalViews, "count")} views`}>
                      <div className="h-2 w-24 rounded-full bg-surface-2" aria-hidden>
                        <div className="h-2 rounded-full bg-accent" style={{ width: `${g.totalViews ? Math.max(4, (g.totalViews / max) * 100) : 0}%` }} />
                      </div>
                      <span className="tabular font-semibold">{formatExact(g.totalViews, "count")}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        The same video on different platforms is one row. Views are each post&apos;s lifetime total{asOf ? ` as of ${formatShort(asOf)}` : ""}, so older posts have had
        more time. Click a number to open the post.
      </p>
    </div>
  );
}
