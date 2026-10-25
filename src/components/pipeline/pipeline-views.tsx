import { formatShort } from "@/lib/dates";
import { needsNudge, WAITING_DAYS, type SourceSummary, type StageSummary, type WaitingDeal, type WeekSummary } from "@/lib/pipeline";

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

function DealRow({ d }: { d: WaitingDeal }) {
  const stuck = d.daysInStage >= WAITING_DAYS * 2;
  const who = d.contact?.name || d.contact?.company;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0">
        <p className="font-semibold">
          {who ?? d.stage}
          {who && d.contact?.company && d.contact.name && <span className="font-normal text-ink-2"> · {d.contact.company}</span>}
          <span className="tabular ml-2 font-normal text-ink-2">{d.value ? money(d.value) : "no value set"}</span>
        </p>
        <p className="text-sm text-ink-2">
          {who ? `${d.stage} · ` : ""}
          <span className={stuck ? "font-semibold text-bad" : ""}>
            {d.estimated ? "≈" : ""}
            {d.daysInStage} days without moving{stuck ? " (stuck)" : ""}
          </span>
          {" · "}came in {formatShort(d.createdDate)} from {d.source}
        </p>
      </div>
      {d.contact?.url && (
        <a
          href={d.contact.url}
          target="_blank"
          rel="noopener noreferrer"
          className="no-print shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface-2"
        >
          Open in Lead Rescue ↗
        </a>
      )}
    </li>
  );
}

/**
 * The follow-up list: deals that haven't moved in a week, the most valuable
 * first, capped at five. Everything else open sits behind "Show all".
 */
export function NudgeList({ waiting, firstSyncDate, isAdmin }: { waiting: WaitingDeal[]; firstSyncDate: string | null; isAdmin: boolean }) {
  if (!waiting.length) return <p className={`${card} text-ink-2`}>No open deals right now.</p>;
  const nudge = needsNudge(waiting);
  const anyEstimated = waiting.some((d) => d.estimated);
  return (
    <div className={card}>
      {nudge.count ? (
        <>
          <p className="text-lg">
            <span className="font-semibold">
              {nudge.count} deal{nudge.count === 1 ? " hasn't" : "s haven't"} moved in {WAITING_DAYS}+ days
            </span>
            <span className="text-ink-2">, worth {money(nudge.value)}.</span>
            {nudge.count > nudge.top.length && <span className="text-ink-2"> The {nudge.top.length} most valuable:</span>}
          </p>
          <ul className="divide-y divide-line">
            {nudge.top.map((d) => (
              <DealRow key={d.id} d={d} />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-lg font-semibold">Every open deal has moved in the last {WAITING_DAYS} days. Nice.</p>
      )}

      <details className="no-print mt-3 border-t border-line pt-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink-2 hover:text-ink">Show all {waiting.length} open deals, longest waiting first</summary>
        <ul className="mt-2 divide-y divide-line">
          {waiting.map((d) => (
            <DealRow key={d.id} d={d} />
          ))}
        </ul>
      </details>

      <p className="mt-3 text-xs text-muted">
        {isAdmin ? "Names are only shown to admins." : "Names are only shown to admins; open Lead Rescue to see who a deal is."}
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
