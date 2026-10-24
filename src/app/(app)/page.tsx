import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandSection } from "@/components/brand-section";
import { Funnel } from "@/components/charts/funnel";
import { Headline, HighlightList } from "@/components/highlights";
import { FlagList } from "@/components/flag-list";
import { PageSkeleton } from "@/components/page-skeleton";
import { StatTile } from "@/components/stat-tile";
import { WhatsWinning } from "@/components/whats-winning";
import { parseControls, type Controls } from "@/lib/controls";
import { getAppContext } from "@/lib/data/source";
import { loadWeek } from "@/lib/data/week";
import { formatRange } from "@/lib/dates";
import { buildHighlights } from "@/lib/highlights";

export const metadata: Metadata = { title: "Weekly Review" };

function compareLabel(c: Controls) {
  if (c.compareKey === "avg_4w") return "4-period avg";
  if (c.compareKey === "last_month") return "last month";
  return c.periodKey === "last_week" || c.periodKey === "this_week" ? "last week" : "previous period";
}

async function WeeklyReview({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const ctx = await getAppContext();
  const controls = parseControls(await searchParams, ctx.brands, ctx.today);
  const weeks = await loadWeek(controls);
  const label = compareLabel(controls);

  return (
    <div className="flex flex-col gap-14">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">
          Weekly Review · {formatRange(controls.period.from, controls.period.to)}
          {controls.period.partial && " · still in progress"}
        </p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">How the week went</h1>
      </header>

      {weeks.map(({ brand, pack, flags, groups, best }) => {
        const h = buildHighlights(pack);
        return (
          <BrandSection key={brand.slug} brand={brand}>
            <Headline text={h.headline} />
  
            <div>
              <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Scoreboard</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {pack.scoreboard.map((id) => (
                  <StatTile key={id} figure={pack.figures[id]} compareLabel={label} sample={pack.isSample} />
                ))}
              </div>
            </div>
  
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <HighlightList items={h.improved} tone="good" />
              <HighlightList items={h.needsWork} tone="bad" />
            </div>
  
            <div>
              <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">What&apos;s winning</h3>
              <WhatsWinning groups={groups} best={best} />
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">The funnel</h3>
              <Funnel steps={pack.funnel.map((s) => ({ label: s.label, figure: pack.figures[s.figureId] }))} />
            </div>
  
            <div>
              <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Still to fix</h3>
              <FlagList flags={flags} />
            </div>
          </BrandSection>
        );
      })}

      <aside className="rounded-2xl border border-dashed border-line p-5 text-sm text-ink-2">
        <p className="font-semibold text-ink">Coming next</p>
        <p className="mt-1">
          Meeting notes, action items, presentation mode, locking the week and PDF export. Recommendations and the
          &quot;what the winners share&quot; read come with the AI layer.
        </p>
      </aside>
    </div>
  );
}

export default function Page(props: PageProps<"/">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WeeklyReview searchParams={props.searchParams} />
    </Suspense>
  );
}
