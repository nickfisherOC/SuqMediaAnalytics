import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandSection } from "@/components/brand-section";
import { PageSkeleton } from "@/components/page-skeleton";
import { BreakdownList, CrossoverNote, KeywordBoard, QueryList } from "@/components/search/search-views";
import { StatTile } from "@/components/stat-tile";
import { loadSearchSite } from "@/lib/data/search-site";
import { formatRange, formatShort } from "@/lib/dates";

export const metadata: Metadata = { title: "Search & Site" };

const H2 = ({ children, note }: { children: React.ReactNode; note?: string }) => (
  <div>
    <h3 className="font-display text-2xl font-extrabold tracking-tight">{children}</h3>
    {note && <p className="text-sm text-ink-2">{note}</p>}
  </div>
);
const H3 = ({ children, note }: { children: React.ReactNode; note?: string }) => (
  <div className="mb-3">
    <h4 className="text-sm font-semibold tracking-wide text-muted uppercase">{children}</h4>
    {note && <p className="text-sm text-ink-2">{note}</p>}
  </div>
);

async function SearchSite({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const { ctx, controls, compareLabel, brands } = await loadSearchSite(await searchParams);
  const isAdmin = ctx.mode === "live" && ctx.viewer.role === "admin";
  return (
    <div className="flex flex-col gap-14">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">
          Search &amp; Site · {formatRange(controls.period.from, controls.period.to)} vs {controls.compare.label.toLowerCase()}
        </p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">How people find you</h1>
      </header>

      {brands.map((b) => (
        <BrandSection key={b.brand.slug} brand={b.brand}>
          {b.hasSearch && (
            <section className="flex flex-col gap-6" aria-label={`${b.brand.name} Google search`}>
              <H2 note={`From Google Search Console${b.searchDataTo ? `, up to ${formatShort(b.searchDataTo)} (Google's numbers arrive 2–3 days late)` : ""}.`}>Search: finding you on Google</H2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {b.searchTiles.map((f) => (
                  <StatTile key={f.id} figure={f} compareLabel={compareLabel} sample={false} />
                ))}
              </div>
              {ctx.mode === "live" && (
                <>
                  <div>
                    <H3 note="The searches you want to show up for.">Keywords you track</H3>
                    <KeywordBoard brand={b.brand.slug} keywords={b.keywords} compareLabel={compareLabel} isAdmin={isAdmin} />
                  </div>
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <div>
                      <H3 note="On page 2 and seen by people: the easiest to push onto page 1.">Quick wins</H3>
                      <QueryList queries={b.quickWins} empty="Nothing sitting on page 2 right now." />
                    </div>
                    <div>
                      <H3 note="What Google showed you for most that isn't on your list. Worth tracking?">Searches you didn&apos;t know about</H3>
                      <QueryList queries={b.discovered} empty="No other searches yet." />
                    </div>
                  </div>
                  <CrossoverNote site={b.brand.website?.replace(/^https?:\/\//, "") ?? b.brand.name} crossovers={b.crossovers} />
                </>
              )}
            </section>
          )}

          {b.hasSite && (
            <section className="flex flex-col gap-6" aria-label={`${b.brand.name} website visits`}>
              <H2 note="From Google Analytics: what happens once people arrive.">Site: visits to the website</H2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {b.siteTiles.map((f) => (
                  <StatTile key={f.id} figure={f} compareLabel={compareLabel} sample={false} />
                ))}
              </div>
              {ctx.mode === "live" && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <BreakdownList title="Where visits came from" items={b.site.channels} note="Your own shop checkout and tag-testing tools aren't counted as visits." />
                  <BreakdownList title="Pages people landed on" items={b.site.pages} />
                  <BreakdownList title="Phone or computer" items={b.site.devices} format={(d) => d.charAt(0).toUpperCase() + d.slice(1)} />
                  <BreakdownList
                    title="Cities"
                    items={b.site.cities}
                    note={
                      b.site.botVisits
                        ? `Left out ${b.site.botVisits} likely bot visits (${b.site.botCities.slice(0, 4).join(", ")}${b.site.botCities.length > 4 ? "…" : ""}): data-centre towns and one-day spikes from outside Canada.`
                        : undefined
                    }
                  />
                </div>
              )}
            </section>
          )}
        </BrandSection>
      ))}
    </div>
  );
}

export default function Page(props: PageProps<"/search">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SearchSite searchParams={props.searchParams} />
    </Suspense>
  );
}
