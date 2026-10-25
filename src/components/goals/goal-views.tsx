import { getMetric } from "@/config/metrics";
import { formatExact } from "@/lib/format";
import { GOAL_STATE_LABEL, goalText, isGrowthGoal, type GoalProgress, type GoalState } from "@/lib/goals";
import { DeleteGoal } from "./goal-forms";

const STATE_STYLE: Record<GoalState, string> = {
  hit: "bg-[color-mix(in_oklab,var(--status-good)_20%,transparent)] text-ink",
  on_track: "bg-[color-mix(in_oklab,var(--status-good)_12%,transparent)] text-ink",
  behind: "bg-[color-mix(in_oklab,var(--status-warning)_22%,transparent)] text-ink",
  missed: "bg-[color-mix(in_oklab,var(--status-serious)_20%,transparent)] text-ink",
  no_data: "bg-surface-2 text-muted",
};

export function GoalState({ state }: { state: GoalState }) {
  return <span className={`rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STATE_STYLE[state]}`}>{GOAL_STATE_LABEL[state]}</span>;
}

export { goalText };

function paceText(p: GoalProgress): string {
  const unit = getMetric(p.goal.metric).unit;
  const f = (v: number) => formatExact(v, unit);
  if (p.value === null) return "No numbers for this period yet.";
  const span = p.goal.cadence === "week" ? "this week" : p.goal.cadence === "month" ? "this month" : "so far";
  if (p.direction === "at_most") return `Now ${f(p.value)} ${span}. ${p.state === "hit" ? "Under the target." : `Needs to come down to ${f(p.goal.target)}.`}`;
  if (p.state === "hit") return `${f(p.value)} ${span}: target reached.`;
  if (p.state === "missed") return `Finished at ${f(p.value)} of ${f(p.goal.target)}.`;
  const days = p.daysLeft === 1 ? "1 day" : `${p.daysLeft} days`;
  return `${f(p.value)} of ${f(p.goal.target)} ${span} · ${f(p.remaining ?? 0)} more needed in ${days}.`;
}

/** One goal: what it is, the number so far, a bar, its status, and last period's result. */
export function GoalCard({ p, isAdmin }: { p: GoalProgress; isAdmin: boolean }) {
  const unit = getMetric(p.goal.metric).unit;
  const share = p.direction === "at_least" && p.value !== null && p.goal.target > 0 ? Math.min(1, p.value / p.goal.target) : null;
  const pace = p.direction === "at_least" && p.expected !== null && p.goal.target > 0 ? Math.min(1, p.expected / p.goal.target) : null;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
      <header className="flex items-start justify-between gap-3">
        <h3 className="font-semibold">{goalText(p)}</h3>
        <span className="flex items-center gap-1">
          <GoalState state={p.state} />
          {isAdmin && <DeleteGoal id={p.goal.id} label={goalText(p)} />}
        </span>
      </header>
      <p className="text-4xl leading-none font-semibold tracking-tight">
        {p.value === null ? "—" : `${isGrowthGoal(p.goal) && p.value > 0 ? "+" : ""}${formatExact(p.value, unit)}`}
      </p>
      {share !== null && (
        <div className="relative h-2 rounded-full bg-surface-2" aria-hidden>
          <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(2, share * 100)}%` }} />
          {/* Where you'd want to be by now. */}
          {pace !== null && pace < 1 && <div className="absolute -top-1 h-4 w-0.5 bg-ink-2" style={{ left: `${pace * 100}%` }} title="Where you'd want to be by now" />}
        </div>
      )}
      <p className="text-sm text-ink-2">{paceText(p)}</p>
      {p.previous && (
        <p className="text-xs text-muted">
          Last {p.goal.cadence === "week" ? "week" : "month"}: {p.previous.value === null ? "no data" : formatExact(p.previous.value, unit)}
          {p.previous.met === true && " ✓ hit"}
          {p.previous.met === false && " · missed"}
        </p>
      )}
    </article>
  );
}

/** The small goal line under a stat tile. */
export function GoalLine({ p }: { p: GoalProgress }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
      <span>Goal: {goalText(p)}</span>
      <GoalState state={p.state} />
    </p>
  );
}
