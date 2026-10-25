import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BrandSection } from "@/components/brand-section";
import { AllPosts } from "@/components/content/all-posts";
import { SeriesSummary, SeriesTable } from "@/components/content/series-tracker";
import { PageSkeleton } from "@/components/page-skeleton";
import { loadContentLab } from "@/lib/data/content-lab";
import { addDays, formatRange } from "@/lib/dates";

export const metadata: Metadata = { title: "Content Lab" };

const H3 = ({ children }: { children: React.ReactNode }) => <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">{children}</h3>;

async function ContentLab({ searchParams }: { searchParams: PageProps<"/content">["searchParams"] }) {
  const params = await searchParams;
  const { controls, sort, posts, series } = await loadContentLab(params);
  const range = formatRange(controls.period.from, controls.period.to);
  const sortHref = (s: string) => {
    const q = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (typeof v === "string" && k !== "sort" ? [[k, v]] : [])));
    if (s === "newest") q.set("sort", "newest");
    return `/content${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-14">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">Content Lab · {range}</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Every post, every platform</h1>
      </header>

      {posts.map(({ brand, platforms, pieces }) => (
        <BrandSection key={brand.slug} brand={brand}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <H3>
                All posts · {pieces.length} {pieces.length === 1 ? "piece" : "pieces"} of content
              </H3>
              <nav className="flex gap-1 text-sm" aria-label="Sort posts">
                {(["views", "newest"] as const).map((s) => (
                  <Link
                    key={s}
                    href={sortHref(s)}
                    scroll={false}
                    aria-current={sort === s ? "true" : undefined}
                    className={`rounded-md px-2.5 py-1 font-medium ${sort === s ? "bg-ink text-page" : "bg-surface-2 text-ink-2 hover:text-ink"}`}
                  >
                    {s === "views" ? "Most viewed" : "Newest first"}
                  </Link>
                ))}
              </nav>
            </div>
            <AllPosts pieces={pieces} platforms={platforms} asOf={pieces.flatMap((g) => g.items.map((i) => i.capturedOn)).filter((x): x is string => !!x).sort().at(-1) ?? null} />
          </div>

          {series
            .filter((s) => s.brand.slug === brand.slug)
            .map(({ grid }) => (
              <div key={grid.series.start} className="flex flex-col gap-4">
                <div>
                  <H3>Series tracker</H3>
                  <p className="mt-1 font-display text-2xl font-extrabold tracking-tight">{grid.series.name}</p>
                  <p className="text-sm text-ink-2">{formatRange(grid.series.start, addDays(grid.series.start, grid.series.days - 1))}</p>
                </div>
                <SeriesSummary grid={grid} />
                <SeriesTable grid={grid} />
              </div>
            ))}
        </BrandSection>
      ))}
    </div>
  );
}

export default function Page(props: PageProps<"/content">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ContentLab searchParams={props.searchParams} />
    </Suspense>
  );
}
