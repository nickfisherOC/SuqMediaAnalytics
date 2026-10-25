import type { Metadata } from "next";
import { Suspense } from "react";
import { AdsTable, CampaignList, DailyBars } from "@/components/ads/ads-views";
import { BrandSection } from "@/components/brand-section";
import { Funnel } from "@/components/charts/funnel";
import { PageSkeleton } from "@/components/page-skeleton";
import { StatTile } from "@/components/stat-tile";
import { loadAdsPage } from "@/lib/data/ads";
import { getGoalProgress } from "@/lib/data/goals";
import { formatRange } from "@/lib/dates";
import { formatExact } from "@/lib/format";

export const metadata: Metadata = { title: "Ads" };

const H3 = ({ children, note }: { children: React.ReactNode; note?: string }) => (
  <div className="mb-3">
    <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">{children}</h3>
    {note && <p className="text-sm text-ink-2">{note}</p>}
  </div>
);

async function Ads({ searchParams }: { searchParams: PageProps<"/ads">["searchParams"] }) {
  const [{ ctx, controls, compareLabel, brands }, { byFigure: goals }] = await Promise.all([loadAdsPage(await searchParams), getGoalProgress()]);
  return (
    <div className="flex flex-col gap-14">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">
          Ads · {formatRange(controls.period.from, controls.period.to)} vs {controls.compare.label.toLowerCase()}
        </p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">What the ads are doing</h1>
      </header>

      {!brands.length && <p className="text-ink-2">No brand in view runs Meta ads.</p>}

      {brands.map((b) => {
        const leads = b.result === "leads";
        return (
          <BrandSection key={b.brand.slug} brand={b.brand}>
            <div>
              <H3>Spend and reach</H3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {b.spendTiles.map((f) => (
                  <StatTile key={f.id} figure={f} compareLabel={compareLabel} sample={false} goal={goals[f.id]} />
                ))}
              </div>
            </div>

            <div>
              <H3 note={leads ? "Leads from the ads, and what each one cost." : "What happened in the store. These include visits from regular social posts too, not just ads."}>
                {leads ? "Results: leads" : "Results: the store"}
              </H3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {b.resultTiles.map((f) => (
                  <StatTile key={f.id} figure={f} compareLabel={compareLabel} sample={false} goal={goals[f.id]} />
                ))}
              </div>
              {b.noPixelSales && (
                <p className="mt-3 rounded-xl border border-dashed border-line p-4 text-sm text-ink-2">
                  Meta hasn&apos;t recorded any sales from these ads, so it can&apos;t tell which ad sells best. That usually means the Meta pixel isn&apos;t set up on the
                  store&apos;s checkout yet. Once it is, Pulse shows a true cost per sale for each ad.
                </p>
              )}
            </div>

            <div>
              <H3 note="From someone seeing an ad to the end result.">The ad funnel</H3>
              <Funnel steps={b.funnel} />
            </div>

            {ctx.mode === "live" && (
              <>
                <div>
                  <H3 note="Every ad that ran, the biggest spenders first.">Every ad</H3>
                  <AdsTable ads={b.ads} result={b.result} />
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <DailyBars title="Spend per day" days={b.days} value={(i) => b.days[i].spend} format={(v) => formatExact(v, "currency")} />
                  <DailyBars
                    title={leads ? "Leads per day (Meta's count)" : "Link clicks per day"}
                    days={b.days}
                    value={(i) => b.days[i].results}
                    format={(v) => formatExact(v, "count")}
                  />
                </div>
                <div>
                  <H3>Campaigns</H3>
                  <CampaignList campaigns={b.campaigns} result={b.result} />
                </div>
              </>
            )}
          </BrandSection>
        );
      })}
    </div>
  );
}

export default function Page(props: PageProps<"/ads">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Ads searchParams={props.searchParams} />
    </Suspense>
  );
}
