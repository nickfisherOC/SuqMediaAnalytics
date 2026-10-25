import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandSection } from "@/components/brand-section";
import { AddGoal, type MetricOption } from "@/components/goals/goal-forms";
import { GoalCard } from "@/components/goals/goal-views";
import { PageSkeleton } from "@/components/page-skeleton";
import type { BrandSettings } from "@/config/brands";
import { METRICS } from "@/config/metrics";
import { PLATFORM_INFO } from "@/config/platforms";
import { parseControls } from "@/lib/controls";
import { getGoalProgress } from "@/lib/data/goals";
import { getAppContext } from "@/lib/data/source";

export const metadata: Metadata = { title: "Goals" };

/** The numbers a brand can set a goal on: every metric it has a source for. */
function metricOptions(brand: BrandSettings): MetricOption[] {
  return METRICS.filter((m) => !m.key.endsWith("_weighted") && m.platforms.some((p) => brand.platforms.includes(p))).map((m) => {
    const sources = m.platforms.filter((p) => brand.platforms.includes(p));
    const platforms = [
      ...(m.aggregation === "ratio" || sources.length > 1 ? [{ value: "all", label: sources.length > 1 ? "All platforms" : PLATFORM_INFO[sources[0]].label }] : []),
      ...(m.aggregation === "ratio" ? [] : sources.map((p) => ({ value: p, label: PLATFORM_INFO[p].label }))),
    ];
    const direction = m.higherIsBetter === false ? "Lower is better, so the goal is to stay under the target." : "The goal is to reach at least the target.";
    return { key: m.key, label: m.label, platforms: platforms.length ? platforms : [{ value: "all", label: "All" }], hint: `${m.definition} ${direction}` };
  });
}

async function Goals({ searchParams }: { searchParams: PageProps<"/goals">["searchParams"] }) {
  const ctx = await getAppContext();
  const controls = parseControls(await searchParams, ctx.brands, ctx.today);
  const { all } = await getGoalProgress();
  const isAdmin = ctx.mode === "live" && ctx.viewer.role === "admin";

  return (
    <div className="flex flex-col gap-14">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">Goals · as of yesterday (data syncs nightly)</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">What we&apos;re aiming for</h1>
        <p className="max-w-2xl text-ink-2">
          Weekly goals run Monday to Sunday and monthly goals by calendar month, so they don&apos;t depend on the dates picked above. &quot;On track&quot; means
          you&apos;re where you&apos;d want to be by now.
        </p>
      </header>

      {controls.brands.map((brand) => {
        const goals = all.filter((p) => p.goal.brand === brand.slug);
        return (
          <BrandSection key={brand.slug} brand={brand}>
            {goals.length ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {goals.map((p) => (
                  <GoalCard key={p.goal.id} p={p} isAdmin={isAdmin} />
                ))}
              </div>
            ) : (
              <p className="text-ink-2">No goals for {brand.name} yet.{isAdmin ? " Add one below." : " An admin can add them."}</p>
            )}
            {isAdmin && <AddGoal brand={brand.slug} metrics={metricOptions(brand)} />}
          </BrandSection>
        );
      })}
    </div>
  );
}

export default function Page(props: PageProps<"/goals">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Goals searchParams={props.searchParams} />
    </Suspense>
  );
}
