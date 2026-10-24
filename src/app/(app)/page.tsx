import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandSection } from "@/components/brand-section";
import { FlagList } from "@/components/flag-list";
import { PageSkeleton } from "@/components/page-skeleton";
import { StatTile } from "@/components/stat-tile";
import { parseControls, type Controls } from "@/lib/controls";
import { getAppContext } from "@/lib/data/source";
import { loadWeek } from "@/lib/data/week";
import { formatRange } from "@/lib/dates";

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

      {weeks.map(({ brand, pack, flags }) => (
        <BrandSection key={brand.slug} brand={brand}>
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Scoreboard</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {pack.scoreboard.map((id) => (
                <StatTile key={id} figure={pack.figures[id]} compareLabel={label} sample={pack.isSample} />
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Still to fix</h3>
            <FlagList flags={flags} />
          </div>
        </BrandSection>
      ))}

      <aside className="rounded-2xl border border-dashed border-line p-5 text-sm text-ink-2">
        <p className="font-semibold text-ink">Coming in the next build</p>
        <p className="mt-1">
          The headline, what improved, what needs work, what&apos;s winning, the funnel, recommendations, last week&apos;s
          action items, meeting notes, presentation mode, locking the week and PDF export.
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
