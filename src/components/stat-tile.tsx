import { Sparkline } from "@/components/charts/sparkline";
import { GoalLine } from "@/components/goals/goal-views";
import { InfoTip } from "@/components/info-tip";
import type { GoalProgress } from "@/lib/goals";
import { PLATFORM_INFO } from "@/config/platforms";
import { formatDelta, formatPct, formatValue } from "@/lib/format";
import type { Figure } from "@/lib/pack";

function list(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function StatTile({ figure, compareLabel, sample, goal }: { figure: Figure; compareLabel: string; sample: boolean; goal?: GoalProgress }) {
  const { change } = figure;
  const used = figure.platformsUsed.map((p) => PLATFORM_INFO[p].label);
  const missing = figure.platformsMissing.map((p) => PLATFORM_INFO[p].label);

  return (
    <article className="flex min-h-52 flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-base font-medium text-ink-2">{figure.label}</h3>
        <InfoTip title={figure.label}>
          <span className="block text-ink">{figure.definition}</span>
          {used.length > 0 && <span className="mt-2 block">Source: {list(used)}{sample ? " (sample data)" : ""}.</span>}
          {figure.caveats.map((c) => (
            <span key={c} className="mt-2 block">
              {c}
            </span>
          ))}
        </InfoTip>
      </header>

      {figure.value === null ? (
        <EmptyValue missing={missing} />
      ) : (
        <>
          <p className="text-5xl leading-none font-semibold tracking-tight">{formatValue(figure.value, figure.unit)}</p>
          <Delta change={change} figure={figure} compareLabel={compareLabel} />
          <div className="mt-auto">
            <Sparkline points={figure.trend} unit={figure.unit} label={figure.label} />
          </div>
          {missing.length > 0 && (
            <p className="text-xs text-muted">
              Not counted yet: {list(missing)}.
            </p>
          )}
        </>
      )}
      {goal && <GoalLine p={goal} />}
    </article>
  );
}

function Delta({ change, figure, compareLabel }: { change: Figure["change"]; figure: Figure; compareLabel: string }) {
  const base = <span className="text-muted">vs {formatValue(figure.base, figure.unit)} {compareLabel}</span>;
  if (change.direction === null) {
    return <p className="text-sm text-muted">No {compareLabel} figure to compare with.</p>;
  }
  if (change.direction === "flat") {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-semibold text-ink-2">No change</span>
        {base}
      </p>
    );
  }

  const good = change.sentiment === "good";
  const tone = change.sentiment === "neutral" ? "text-ink-2" : good ? "text-good" : "text-bad";
  // On small counts a percentage misleads (1 → 34 is "+3300%"), so show the actual change instead.
  const smallBase = figure.unit === "count" && Math.abs(figure.base ?? 0) < 10;
  const amount = change.pct !== null && !smallBase ? formatPct(change.pct) : formatDelta(change.delta!, figure.unit);
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm">
      <span className={`inline-flex items-center gap-1 font-semibold ${tone}`}>
        <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
          <path d={change.direction === "up" ? "M6 2l4 6H2z" : "M6 10L2 4h8z"} fill="currentColor" />
        </svg>
        <span className="sr-only">{change.direction === "up" ? "Up" : "Down"} </span>
        {amount}
        {change.sentiment !== "neutral" && <span className="sr-only">{good ? ", good" : ", needs attention"}</span>}
      </span>
      {base}
    </p>
  );
}

function EmptyValue({ missing }: { missing: string[] }) {
  return (
    <div className="flex flex-1 flex-col justify-center gap-1">
      <p className="text-2xl font-semibold text-muted">No data yet</p>
      {missing.length > 0 && <p className="text-sm text-muted">Connect {list(missing)} to see this.</p>}
    </div>
  );
}
