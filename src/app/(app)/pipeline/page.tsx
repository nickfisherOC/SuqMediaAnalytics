import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandSection } from "@/components/brand-section";
import { PageSkeleton } from "@/components/page-skeleton";
import { SourceTable, StageBars, WaitingList, WeeklyChart } from "@/components/pipeline/pipeline-views";
import { StatTile } from "@/components/stat-tile";
import { loadPipelinePage } from "@/lib/data/pipeline";
import { formatRange } from "@/lib/dates";

export const metadata: Metadata = { title: "Sales Pipeline" };

const H3 = ({ children, note }: { children: React.ReactNode; note?: string }) => (
  <div className="mb-3">
    <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">{children}</h3>
    {note && <p className="text-sm text-ink-2">{note}</p>}
  </div>
);

async function Pipeline({ searchParams }: { searchParams: PageProps<"/pipeline">["searchParams"] }) {
  const { ctx, controls, compareLabel, pipelines } = await loadPipelinePage(await searchParams);
  const range = formatRange(controls.period.from, controls.period.to);

  return (
    <div className="flex flex-col gap-14">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">
          Sales Pipeline · {range} vs {controls.compare.label.toLowerCase()}
        </p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Deals and leads</h1>
      </header>

      {!pipelines.length && <p className="text-ink-2">No brand has a CRM connected yet. Connect Lead Rescue on the Connections page.</p>}

      {pipelines.map((p) => (
        <BrandSection key={p.brand.slug} brand={p.brand}>
          <div>
            <H3>This period</H3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {p.tiles.map((f) => (
                <StatTile key={f.id} figure={f} compareLabel={compareLabel} sample={false} />
              ))}
            </div>
          </div>

          {ctx.mode === "preview" ? (
            <p className="text-ink-2">Deal stages appear on the live site.</p>
          ) : (
            <>
              <div>
                <H3 note="Every deal in Lead Rescue, by the stage it's in today.">Where deals are right now</H3>
                <StageBars stages={p.stages} />
              </div>
              <div>
                <H3 note="Open deals, the longest-waiting first. These are the ones to follow up.">Waiting the longest</H3>
                <WaitingList deals={p.waiting} firstSyncDate={p.firstSyncDate} />
              </div>
              <div>
                <H3>Where leads come from</H3>
                <SourceTable sources={p.sources} periodLabel={`between ${range}`} />
              </div>
              <div>
                <H3 note="Since October 1.">New leads and deals won, week by week</H3>
                <WeeklyChart weeks={p.weeks} />
              </div>
            </>
          )}
        </BrandSection>
      ))}
    </div>
  );
}

export default function Page(props: PageProps<"/pipeline">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Pipeline searchParams={props.searchParams} />
    </Suspense>
  );
}
