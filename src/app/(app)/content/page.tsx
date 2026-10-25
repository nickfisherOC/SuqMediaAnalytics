import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandSection } from "@/components/brand-section";
import { SeriesSummary, SeriesTable } from "@/components/content/series-tracker";
import { PageSkeleton } from "@/components/page-skeleton";
import { loadContentLab } from "@/lib/data/content-lab";
import { formatRange, addDays } from "@/lib/dates";

export const metadata: Metadata = { title: "Content Lab" };

async function ContentLab() {
  const { series } = await loadContentLab();
  return (
    <div className="flex flex-col gap-14">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">Content Lab</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Series tracker</h1>
      </header>

      {!series.length && <p className="text-ink-2">No content series set up yet.</p>}

      {series.map(({ brand, grid }) => (
        <BrandSection key={`${brand.slug}-${grid.series.start}`} brand={brand} title={grid.series.name}>
          <p className="-mt-3 text-sm text-ink-2">
            {brand.name} · {formatRange(grid.series.start, addDays(grid.series.start, grid.series.days - 1))}
          </p>
          <SeriesSummary grid={grid} />
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">Day by day</h3>
            <SeriesTable grid={grid} />
          </div>
        </BrandSection>
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ContentLab />
    </Suspense>
  );
}
