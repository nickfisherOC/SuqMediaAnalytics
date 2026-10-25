import { formatShort } from "@/lib/dates";
import { WAITING_DAYS, type SourceSummary, type StageSummary, type WaitingDeal, type WeekSummary } from "@/lib/pipeline";

const dollars = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 });
const money = (v: number) => dollars.format(v);
const card = "rounded-2xl border border-line bg-surface p-5";

/** How many deals sit in each stage right now, in pipeline order. Linear bars; the counts and dollars are printed. */
export function StageBars({ stages }: { stages: StageSummary[] }) {
  const max = Math.max(1, ...stages.map((s) => s.deals));
  const open = stages.filter((s) => s.kind === "open");
  const openDeals = open.reduce((t, s) => t + s.deals, 0);
  const openValue = open.reduce((t, s) => t + s.value, 0);
  return (
    <div className={card}>
      <p className="mb-4 text-ink-2">
        <span className="font-semibold text-ink">{openDeals} open deals</span> worth <span className="font-semibold text-ink">{money(openValue)}</span>
      </p>
      <ol className="flex flex-col gap-2">
        {stages.map((s) => (
          <li
            key={s.name}
            className={`grid grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-3 ${s.kind !== "open" ? "border-t border-line pt-2" : ""}`}
            title={`${s.name}: ${s.deals} deal${s.deals === 1 ? "" : "s"}, ${money(s.value)}`}
          >
            <span className="text-sm text-ink-2">{s.name}</span>
            <div className="h-6 rounded-md bg-surface-2" aria-hidden>
              {s.deals > 0 && (
                <div
                  className="h-6 rounded-md"
                  style={{ width: `${Math.max(3, (s.deals / max) * 100)}%`, background: s.kind === "lost" ? "var(--series-muted)" : "var(--accent)" }}
                />
              )}
            </div>
            <span className="tabular min-w-28 text-right">
              <span className="text-lg font-semibold">{s.deals}</span>
              <span className="text-sm text-muted"> · {money(s.value)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Open deals, longest in their stage first. No names: stage, days, value, form. */
export function WaitingList({ deals, firstSyncDate }: { deals: WaitingDeal[]; firstSyncDate: string | null }) {
  if (!deals.length) return <p className={`${card} text-ink-2`}>No open deals right now.</p>;
  const anyEstimated = deals.some((d) => d.estimated);
  return (
    <div className={card}>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="py-2 pr-4 font-semibold">In stage</th>
              <th className="py-2 pr-4 font-semibold">Stage</th>
              <th className="py-2 pr-4 text-right font-semibold">Value</th>
              <th className="py-2 pr-4 font-semibold">Came from</th>
              <th className="py-2 font-semibold">Lead came in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {deals.map((d) => {
              const level = d.daysInStage >= WAITING_DAYS * 2 ? "stuck" : d.daysInStage >= WAITING_DAYS ? "waiting" : "fresh";
              return (
                <tr key={d.id}>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <span className={`tabular font-semibold ${level === "stuck" ? "text-bad" : level === "waiting" ? "text-ink" : "text-ink-2"}`}>
                      {d.estimated ? "≈" : ""}
                      {d.daysInStage} day{d.daysInStage === 1 ? "" : "s"}
                    </span>
                    {level === "stuck" && <span className="ml-2 text-xs font-semibold text-bad">stuck</span>}
                  </td>
                  <td className="py-2.5 pr-4">{d.stage}</td>
                  <td className="tabular py-2.5 pr-4 text-right">{d.value ? money(d.value) : <span className="text-muted">no value</span>}</td>
                  <td className="py-2.5 pr-4 text-ink-2">{d.source}</td>
                  <td className="py-2.5 whitespace-nowrap text-ink-2">{formatShort(d.createdDate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        {WAITING_DAYS}+ days is shown darker; {WAITING_DAYS * 2}+ days is marked stuck. To see who a deal is, open Lead Rescue.
        {anyEstimated &&
          ` "≈" means Pulse started watching on ${firstSyncDate ? formatShort(firstSyncDate) : "connection"}, so the days count from the deal's last change in Lead Rescue.`}
      </p>
    </div>
  );
}

/** Leads created in the period by form or source, and how far they got. */
export function SourceTable({ sources, periodLabel }: { sources: SourceSummary[]; periodLabel: string }) {
  if (!sources.length) return <p className={`${card} text-ink-2`}>No new leads {periodLabel}.</p>;
  return (
    <div className={card}>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="py-2 pr-4 font-semibold">Came from</th>
              <th className="py-2 pr-4 text-right font-semibold">New leads</th>
              <th className="py-2 pr-4 text-right font-semibold">Got a quote</th>
              <th className="py-2 pr-4 text-right font-semibold">Won</th>
              <th className="py-2 text-right font-semibold">Revenue won</th>
            </tr>
          </thead>
          <tbody className="tabular divide-y divide-line">
            {sources.map((s) => (
              <tr key={s.source}>
                <td className="py-2.5 pr-4 font-sans">{s.source}</td>
                <td className="py-2.5 pr-4 text-right font-semibold">{s.leads}</td>
                <td className="py-2.5 pr-4 text-right">{s.quotes}</td>
                <td className="py-2.5 pr-4 text-right">{s.won}</td>
                <td className="py-2.5 text-right">{money(s.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">Counts leads that came in {periodLabel}, and what has happened to them since.</p>
    </div>
  );
}

/** New leads (grey) and deals won (brand colour) per week. One scale: both are counts of deals. */
export function WeeklyChart({ weeks }: { weeks: WeekSummary[] }) {
  if (!weeks.length) return null;
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.leads, w.won)));
  const H = 160;
  return (
    <div className={card}>
      <div className="mb-4 flex items-center gap-5 text-sm text-ink-2" aria-hidden>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm" style={{ background: "var(--series-muted)" }} /> New leads
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-accent" /> Deals won
        </span>
      </div>
      <div className="flex items-end gap-4 overflow-x-auto pb-1" role="img" aria-label={`Weekly new leads and deals won: ${weeks.map((w) => `week of ${formatShort(w.weekStart)}, ${w.leads} leads, ${w.won} won`).join("; ")}`}>
        {weeks.map((w) => (
          <div key={w.weekStart} className="flex min-w-16 flex-1 flex-col items-center gap-2" title={`Week of ${formatShort(w.weekStart)}: ${w.leads} new leads, ${w.won} won`}>
            <div className="flex items-end gap-0.5" style={{ height: H }}>
              {[
                { v: w.leads, color: "var(--series-muted)" },
                { v: w.won, color: "var(--accent)" },
              ].map((b, i) => (
                <div key={i} className="flex w-6 flex-col items-center justify-end" style={{ height: H }}>
                  <span className="tabular text-xs text-ink-2">{b.v}</span>
                  <div className="w-full rounded-t-[4px]" style={{ height: b.v ? Math.max(3, (b.v / max) * (H - 18)) : 0, background: b.color }} />
                </div>
              ))}
            </div>
            <span className="text-xs whitespace-nowrap text-muted">{formatShort(w.weekStart)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Weeks run Monday to Sunday; each label is the Monday. The latest week is still in progress.</p>
    </div>
  );
}
