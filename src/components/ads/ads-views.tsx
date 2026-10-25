import type { AdStats, ResultKind } from "@/lib/ads";
import type { AdRow } from "@/lib/data/ads";
import { formatShort } from "@/lib/dates";
import { formatExact } from "@/lib/format";

const card = "rounded-2xl border border-line bg-surface p-5";
const money = (v: number | null) => (v === null ? "—" : formatExact(v, "currency"));
const count = (v: number) => formatExact(v, "count");
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

const STATUS: Record<string, string> = {
  ACTIVE: "Running",
  PAUSED: "Paused",
  CAMPAIGN_PAUSED: "Campaign paused",
  ADSET_PAUSED: "Ad set paused",
  ARCHIVED: "Archived",
  DELETED: "Deleted",
  DISAPPROVED: "Rejected by Meta",
  PENDING_REVIEW: "In review",
  WITH_ISSUES: "Has issues",
};

function Status({ status }: { status: string | null }) {
  if (!status) return null;
  const running = status === "ACTIVE";
  return <span className={`text-xs ${running ? "text-good" : "text-muted"}`}>{STATUS[status] ?? status.toLowerCase().replace(/_/g, " ")}</span>;
}

/** Every ad with its picture: spend, reach, clicks and what each result cost. Best, worst and tiring ads are marked. */
export function AdsTable({ ads, result }: { ads: AdRow[]; result: ResultKind }) {
  if (!ads.length) return <p className={`${card} text-ink-2`}>No ads ran in this period.</p>;
  const leads = result === "leads";
  return (
    <div className={card}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left">
          <thead className="text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="py-2 pr-3 font-semibold">Ad</th>
              <th className="py-2 pr-3 text-right font-semibold">Spend</th>
              <th className="py-2 pr-3 text-right font-semibold">Shown</th>
              <th className="py-2 pr-3 text-right font-semibold">Link clicks</th>
              <th className="py-2 pr-3 text-right font-semibold">Click rate</th>
              <th className="py-2 pr-3 text-right font-semibold">Cost per click</th>
              {leads && <th className="py-2 pr-3 text-right font-semibold">Leads</th>}
              {leads && <th className="py-2 text-right font-semibold">Cost per lead</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ads.map((a) => (
              <tr key={a.id}>
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-3">
                    {a.thumbnail ? (
                      // Meta's picture links expire and change, so a plain img rather than Next's image optimizer.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.thumbnail} alt="" referrerPolicy="no-referrer" className="size-12 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="size-12 shrink-0 rounded-lg bg-surface-2" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {a.name}
                        {a.badge === "best" && <span className="rounded-md bg-[color-mix(in_oklab,var(--status-good)_18%,transparent)] px-1.5 py-0.5 text-xs">Best value</span>}
                        {a.badge === "worst" && <span className="rounded-md bg-[color-mix(in_oklab,var(--status-serious)_18%,transparent)] px-1.5 py-0.5 text-xs">Most expensive</span>}
                        {a.tiring && <span className="rounded-md bg-[color-mix(in_oklab,var(--status-warning)_18%,transparent)] px-1.5 py-0.5 text-xs">Getting tired</span>}
                      </p>
                      <p className="flex flex-wrap gap-x-2 text-xs text-muted">
                        <Status status={a.status} />
                        {a.campaign && <span className="truncate">· {a.campaign}</span>}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="tabular py-3 pr-3 text-right font-semibold">{money(a.spend)}</td>
                <td className="tabular py-3 pr-3 text-right">{count(a.impressions)}</td>
                <td className="tabular py-3 pr-3 text-right">{count(a.linkClicks)}</td>
                <td className="tabular py-3 pr-3 text-right">{pct(a.ctr)}</td>
                <td className="tabular py-3 pr-3 text-right">{money(a.cpc)}</td>
                {leads && <td className="tabular py-3 pr-3 text-right">{count(a.leads)}</td>}
                {leads && <td className="tabular py-3 text-right font-semibold">{money(a.costPerResult)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        &quot;Best value&quot; and &quot;Most expensive&quot; compare {leads ? "cost per lead" : "cost per click"} among ads that spent at least $10. &quot;Getting tired&quot;
        means people have seen the ad 2.5+ times on average and its click rate dropped by a quarter or more. Leads here are Meta&apos;s count.
      </p>
    </div>
  );
}

/** Campaign totals. */
export function CampaignList({ campaigns, result }: { campaigns: AdStats[]; result: ResultKind }) {
  if (!campaigns.length) return null;
  const leads = result === "leads";
  return (
    <div className={card}>
      <table className="w-full text-left">
        <thead className="text-xs tracking-wide text-muted uppercase">
          <tr>
            <th className="py-2 pr-3 font-semibold">Campaign</th>
            <th className="py-2 pr-3 text-right font-semibold">Spend</th>
            <th className="py-2 pr-3 text-right font-semibold">Link clicks</th>
            <th className="py-2 text-right font-semibold">{leads ? "Cost per lead" : "Cost per click"}</th>
          </tr>
        </thead>
        <tbody className="tabular divide-y divide-line">
          {campaigns.map((c) => (
            <tr key={c.id}>
              <td className="py-2 pr-3 font-sans">{c.name}</td>
              <td className="py-2 pr-3 text-right font-semibold">{money(c.spend)}</td>
              <td className="py-2 pr-3 text-right">{count(c.linkClicks)}</td>
              <td className="py-2 text-right">{money(c.costPerResult)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One measure per day as thin bars, with the value on hover and the total printed. */
export function DailyBars({ title, days, value, format }: { title: string; days: { date: string }[]; value: (i: number) => number; format: (v: number) => string }) {
  const values = days.map((_, i) => value(i));
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div className={card}>
      <p className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-ink-2">{title}</span>
        <span className="tabular text-sm text-muted">total {format(total)}</span>
      </p>
      <div className="flex h-28 items-end gap-[2px]" role="img" aria-label={`${title}: ${days.map((d, i) => `${formatShort(d.date)} ${format(values[i])}`).join(", ")}`}>
        {days.map((d, i) => (
          <div key={d.date} className="group flex h-full flex-1 items-end" title={`${formatShort(d.date)}: ${format(values[i])}`}>
            <div className="w-full rounded-t-[4px] bg-accent group-hover:opacity-80" style={{ height: values[i] ? `${Math.max(3, (values[i] / max) * 100)}%` : 0 }} />
          </div>
        ))}
      </div>
      <p className="mt-1 flex justify-between text-xs text-muted">
        <span>{days[0] ? formatShort(days[0].date) : ""}</span>
        <span>{days.at(-1) ? formatShort(days.at(-1)!.date) : ""}</span>
      </p>
    </div>
  );
}
